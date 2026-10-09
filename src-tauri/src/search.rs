//! Security search and suggestion engine.
//!
//! Queries Tencent Smartbox and Eastmoney Suggest APIs to resolve Chinese names,
//! pinyin abbreviations, and 6-digit codes into canonical prefixed securities
//! (`sh600519`, `sz000001`, `bj920799`).

use std::collections::HashSet;
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// Canonical prefixed code, e.g. `sh600519`, `sz000001`, `bj920799`.
    pub code: String,
    /// Chinese security name, e.g. `贵州茅台`.
    pub name: String,
    /// Pinyin abbreviation in uppercase, e.g. `GZMT`.
    pub pinyin: String,
    /// Visual badge category: `A股` | `ETF` | `指数` | `北交`.
    pub category: String,
}

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                          (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// Client for searching securities, bypassing system proxy for fast domestic requests.
pub struct SearchClient {
    client: reqwest::Client,
}

impl SearchClient {
    pub fn new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(4))
            .connect_timeout(Duration::from_secs(3))
            .user_agent(USER_AGENT)
            .build()
            .map_err(|e| format!("初始化网络客户端失败: {e}"))?;
        Ok(Self { client })
    }

    /// Search across Tencent and Eastmoney feeds and return up to 10 unique results.
    pub async fn search(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }

        // Query Tencent Smartbox as primary.
        let mut results = self.query_tencent(q).await.unwrap_or_default();

        // If results are few, or query might be Beijing Stock Exchange, also query Eastmoney.
        if results.len() < 8 {
            let em_results = self.query_eastmoney(q).await.unwrap_or_default();
            let mut seen: HashSet<String> = results.iter().map(|r| r.code.clone()).collect();
            for r in em_results {
                if !seen.contains(&r.code) {
                    seen.insert(r.code.clone());
                    results.push(r);
                }
            }
        }

        results.truncate(10);
        Ok(results)
    }

    async fn query_tencent(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let encoded: String = form_urlencoded_encode(query);
        let url = format!("https://smartbox.gtimg.cn/s3/?q={encoded}&t=all");
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("请求腾讯搜索接口失败: {e}"))?;

        if !resp.status().is_success() {
            return Ok(Vec::new());
        }

        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&bytes);
        Ok(parse_tencent_smartbox(&text))
    }

    async fn query_eastmoney(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let encoded: String = form_urlencoded_encode(query);
        let url = format!(
            "https://searchapi.eastmoney.com/api/suggest/get?input={encoded}&type=14&token=D43BF722C8E33BDC457F84CB5138F9E6"
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("请求东财搜索接口失败: {e}"))?;

        if !resp.status().is_success() {
            return Ok(Vec::new());
        }

        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        Ok(parse_eastmoney_suggest(&bytes))
    }
}

/// Simple percent-encoding for query string parameter without adding extra crates.
fn form_urlencoded_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 3);
    for b in input.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

/// Parse Tencent Smartbox output:
/// `v_hint="sh~600519~\u8d35\u5dde\u8305\u53f0~gzmt~GP-A^sz~000001~\u5e73\u5b89\u94f6\u884c~payh~GP-A"`
pub fn parse_tencent_smartbox(text: &str) -> Vec<SearchResult> {
    let Some(first_quote) = text.find('"') else {
        return Vec::new();
    };
    let Some(last_quote) = text.rfind('"') else {
        return Vec::new();
    };
    if first_quote >= last_quote {
        return Vec::new();
    }

    let inner = &text[first_quote + 1..last_quote];
    if inner == "N" || inner.trim().is_empty() {
        return Vec::new();
    }

    // Unescape unicode `\uXXXX` via serde_json by wrapping as a JSON string
    let unescaped = match serde_json::from_str::<String>(&format!("\"{inner}\"")) {
        Ok(s) => s,
        Err(_) => inner.to_string(),
    };

    let mut list = Vec::new();
    for item in unescaped.split('^') {
        let parts: Vec<&str> = item.split('~').collect();
        if parts.len() < 4 {
            continue;
        }

        let market = parts[0].to_ascii_lowercase();
        let bare_code = parts[1].trim();
        let name = parts[2].trim();
        let pinyin = parts[3].trim().to_ascii_uppercase();
        let type_tag = if parts.len() >= 5 { parts[4].trim() } else { "" };

        // We focus on Shanghai (sh), Shenzhen (sz), Beijing (bj).
        if market != "sh" && market != "sz" && market != "bj" {
            continue;
        }

        let canonical_code = format!("{}{}", market, bare_code);
        let category = classify_tencent_security(&market, bare_code, type_tag);

        list.push(SearchResult {
            code: canonical_code,
            name: name.to_string(),
            pinyin,
            category,
        });
    }

    list
}

fn classify_tencent_security(market: &str, code: &str, tag: &str) -> String {
    if tag.eq_ignore_ascii_case("ZS") || tag.contains("指数") {
        return "指数".to_string();
    }
    if tag.eq_ignore_ascii_case("ETF") || tag.eq_ignore_ascii_case("LOF") || tag.contains("基金") {
        return "ETF".to_string();
    }
    if market == "bj"
        || code.starts_with("83")
        || code.starts_with("87")
        || code.starts_with("88")
        || code.starts_with("92")
        || code.starts_with("43")
    {
        return "北交".to_string();
    }
    if tag.eq_ignore_ascii_case("GP-A") || tag.starts_with("GP") {
        return "A股".to_string();
    }
    "A股".to_string()
}

#[derive(Deserialize)]
struct EastmoneyEnvelope {
    #[serde(rename = "QuotationCodeTable")]
    quotation_code_table: Option<EastmoneyTable>,
}

#[derive(Deserialize)]
struct EastmoneyTable {
    #[serde(rename = "Data")]
    data: Option<Vec<EastmoneyItem>>,
}

#[derive(Deserialize)]
struct EastmoneyItem {
    #[serde(rename = "Code")]
    code: Option<String>,
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "PinYin")]
    pinyin: Option<String>,
    #[serde(rename = "SecurityTypeName")]
    security_type_name: Option<String>,
    #[serde(rename = "QuoteID")]
    quote_id: Option<String>,
}

/// Parse Eastmoney Suggest JSON response.
pub fn parse_eastmoney_suggest(bytes: &[u8]) -> Vec<SearchResult> {
    let Ok(envelope) = serde_json::from_slice::<EastmoneyEnvelope>(bytes) else {
        return Vec::new();
    };

    let Some(data) = envelope.quotation_code_table.and_then(|t| t.data) else {
        return Vec::new();
    };

    let mut list = Vec::new();
    for item in data {
        let Some(bare_code) = item.code.map(|s| s.trim().to_string()) else { continue };
        let Some(name) = item.name.map(|s| s.trim().to_string()) else { continue };
        let pinyin = item.pinyin.unwrap_or_default().trim().to_ascii_uppercase();
        let type_name = item.security_type_name.unwrap_or_default();
        let quote_id = item.quote_id.unwrap_or_default();

        if bare_code.is_empty() || name.is_empty() {
            continue;
        }

        // Determine market prefix
        let prefix = if type_name.contains("京")
            || bare_code.starts_with("83")
            || bare_code.starts_with("87")
            || bare_code.starts_with("88")
            || bare_code.starts_with("92")
            || bare_code.starts_with("43")
        {
            "bj"
        } else if quote_id.starts_with("1.")
            || bare_code.starts_with("60")
            || bare_code.starts_with("68")
            || bare_code.starts_with("51")
            || bare_code.starts_with("56")
            || bare_code.starts_with("58")
        {
            "sh"
        } else {
            "sz"
        };

        let canonical_code = format!("{}{}", prefix, bare_code);
        let category = if type_name.contains("指数") {
            "指数".to_string()
        } else if type_name.contains("ETF") || type_name.contains("基金") {
            "ETF".to_string()
        } else if prefix == "bj" || type_name.contains("京") {
            "北交".to_string()
        } else {
            "A股".to_string()
        };

        list.push(SearchResult {
            code: canonical_code,
            name,
            pinyin,
            category,
        });
    }

    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tencent_smartbox_chinese_and_escapes() {
        let body = r#"v_hint="sh~600519~\u8d35\u5dde\u8305\u53f0~gzmt~GP-A^sz~000001~\u5e73\u5b89\u94f6\u884c~payh~GP-A^sh~000001~\u4e0a\u8bc1\u6307\u6570~szzs~ZS";"#;
        let list = parse_tencent_smartbox(body);
        assert_eq!(list.len(), 3);

        assert_eq!(list[0].code, "sh600519");
        assert_eq!(list[0].name, "贵州茅台");
        assert_eq!(list[0].pinyin, "GZMT");
        assert_eq!(list[0].category, "A股");

        assert_eq!(list[1].code, "sz000001");
        assert_eq!(list[1].name, "平安银行");
        assert_eq!(list[1].pinyin, "PAYH");
        assert_eq!(list[1].category, "A股");

        assert_eq!(list[2].code, "sh000001");
        assert_eq!(list[2].name, "上证指数");
        assert_eq!(list[2].pinyin, "SZZS");
        assert_eq!(list[2].category, "指数");
    }

    #[test]
    fn parses_tencent_smartbox_empty_or_n() {
        assert!(parse_tencent_smartbox(r#"v_hint="N";"#).is_empty());
        assert!(parse_tencent_smartbox(r#""#).is_empty());
        assert!(parse_tencent_smartbox(r#"v_hint="";"#).is_empty());
    }

    #[test]
    fn parses_eastmoney_suggest_json() {
        let json = r#"{
            "QuotationCodeTable": {
                "Data": [
                    {
                        "Code": "920799",
                        "Name": "艾融软件",
                        "PinYin": "ARRJ",
                        "SecurityTypeName": "京A",
                        "QuoteID": "0.920799"
                    },
                    {
                        "Code": "510300",
                        "Name": "沪深300ETF",
                        "PinYin": "HS300ETF",
                        "SecurityTypeName": "ETF",
                        "QuoteID": "1.510300"
                    }
                ]
            }
        }"#;
        let list = parse_eastmoney_suggest(json.as_bytes());
        assert_eq!(list.len(), 2);

        assert_eq!(list[0].code, "bj920799");
        assert_eq!(list[0].name, "艾融软件");
        assert_eq!(list[0].category, "北交");

        assert_eq!(list[1].code, "sh510300");
        assert_eq!(list[1].name, "沪深300ETF");
        assert_eq!(list[1].category, "ETF");
    }
}
