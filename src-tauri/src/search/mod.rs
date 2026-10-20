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
///
/// One instance lives in `AppState` and is reused: the client owns a connection
/// pool, so rebuilding it per query (the old behaviour) forced a TLS handshake
/// on every keystroke.
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

    /// Fallback used when the real client cannot be constructed: every search
    /// returns "no results" instead of aborting application startup.
    pub fn disabled() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
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


mod parsers;
pub use parsers::*;

#[cfg(test)]
mod tests;
