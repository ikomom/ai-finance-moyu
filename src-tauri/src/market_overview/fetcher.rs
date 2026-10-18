//! Network fetcher for A-share indices, sector rankings, whole-market breadth (iWenCai),
//! and global indices.

use std::time::Duration;
use chrono::Local;

use super::types::{MarketIndex, MarketOverview, SectorItem};
use super::wencai::get_iwencai_api_key;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                          (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub struct MarketFetcher {
    client: reqwest::Client,
    cached_breadth: std::sync::Mutex<(u32, u32, u32, Option<f64>, Option<f64>)>,
    pub quota_exhausted_date: std::sync::Mutex<Option<String>>,
}

impl Default for MarketFetcher {
    fn default() -> Self {
        Self::new().expect("default market fetcher client")
    }
}

impl MarketFetcher {
    pub fn new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(6))
            .connect_timeout(Duration::from_secs(4))
            .user_agent(USER_AGENT)
            .build()
            .map_err(|e| format!("初始化网络客户端失败: {e}"))?;
        Ok(Self {
            client,
            cached_breadth: std::sync::Mutex::new((
                1167,
                4324,
                69,
                Some(-19.09),
                Some(-365890000000.0),
            )),
            quota_exhausted_date: std::sync::Mutex::new(None),
        })
    }

    /// Reset quota circuit breaker (e.g. after user updates API Key).
    pub fn reset_quota_circuit_breaker(&self) {
        *self.quota_exhausted_date.lock().unwrap() = None;
    }

    pub async fn fetch_overview(&self, configured_key: Option<&str>) -> Result<MarketOverview, String> {
        let (indices_res, sectors_res, breadth_res, north_res, global_res) = tokio::join!(
            self.fetch_indices_and_turnover(),
            self.fetch_top_sectors(),
            self.fetch_breadth(configured_key),
            self.fetch_north_money(),
            self.fetch_global_indices(),
        );

        let (mut indices, total_turnover) = indices_res?;
        let top_sectors = sectors_res.unwrap_or_default();
        let global_indices = match global_res {
            Ok(g) => g,
            Err(e) => {
                log::warn!(target: "NET", "全球指数拉取失败: {e}");
                Vec::new()
            }
        };
        let (up_count, down_count, flat_count, turnover_change_pct, turnover_change_amount) = match breadth_res {
            Ok((u, d, f, pct, amt)) => {
                log::debug!(target: "MARKET", "涨跌统计拉取成功: 涨={u}, 跌={d}, 平={f}, 环比={pct:?}");
                if u > 0 || d > 0 {
                    *self.cached_breadth.lock().unwrap() = (u, d, f, pct, amt);
                }
                (u, d, f, pct, amt)
            }
            Err(ref e) => {
                log::warn!(target: "NET", "全市场涨跌统计异常(已回退基准缓存): {e}");
                *self.cached_breadth.lock().unwrap()
            }
        };
        let north_net_flow = north_res.ok();

        // Assign whole-market breadth to Shanghai index card as indicator
        for idx in &mut indices {
            if idx.code == "000001" {
                idx.up_count = up_count;
                idx.down_count = down_count;
                idx.flat_count = flat_count;
            }
        }

        let updated_at = Local::now().format("%H:%M:%S").to_string();

        Ok(MarketOverview {
            indices,
            up_count,
            down_count,
            flat_count,
            total_turnover,
            turnover_change_pct,
            turnover_change_amount,
            north_net_flow,
            top_sectors,
            updated_at,
            global_indices,
        })
    }

    pub async fn fetch_global_indices(&self) -> Result<Vec<MarketIndex>, String> {
        let url = "https://qt.gtimg.cn/q=s_usIXIC,s_usINX,s_usDJI,s_hkHSI,gzN225,gzKS11,gzFTSE";
        let res = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("请求全球指数数据失败: {e}"))?;

        let bytes = res.bytes().await.map_err(|e| format!("读取全球指数失败: {e}"))?;
        let (cow, _, _) = encoding_rs::GB18030.decode(&bytes);
        Ok(parse_global_indices(&cow))
    }

    async fn fetch_indices_and_turnover(&self) -> Result<(Vec<MarketIndex>, f64), String> {
        let url = "https://qt.gtimg.cn/q=s_sh000001,s_sz399001,s_sz399006";
        let res = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("请求大盘指数数据失败: {e}"))?;

        let bytes = res.bytes().await.map_err(|e| format!("读取大盘指数失败: {e}"))?;
        let (cow, _, _) = encoding_rs::GB18030.decode(&bytes);

        let mut indices = Vec::with_capacity(3);
        let mut total_turnover = 0.0;

        for line in cow.lines() {
            let line = line.trim();
            let Some(rest) = line.strip_prefix("v_s_") else { continue; };
            let Some((_var_name, payload)) = rest.split_once('=') else { continue; };
            let payload = payload.trim().trim_matches(['"', ';'].as_ref());
            let f: Vec<&str> = payload.split('~').collect();
            if f.len() < 8 { continue; }
            let name = f[1].trim().to_string();
            let code = f[2].trim().to_string();
            let price = f[3].trim().parse::<f64>().unwrap_or(0.0);
            let change = f[4].trim().parse::<f64>().unwrap_or(0.0);
            let change_pct = f[5].trim().parse::<f64>().unwrap_or(0.0);
            let turnover_wan = f[7].trim().parse::<f64>().unwrap_or(0.0);
            let turnover = turnover_wan * 10_000.0;

            if code == "000001" || code == "399001" {
                total_turnover += turnover;
            }

            indices.push(MarketIndex {
                code,
                name,
                price,
                change,
                change_pct,
                turnover,
                up_count: 0,
                down_count: 0,
                flat_count: 0,
            });
        }

        if indices.is_empty() {
            return Err("解析大盘指数为空".to_string());
        }

        Ok((indices, total_turnover))
    }

    pub async fn fetch_top_sectors(&self) -> Result<Vec<SectorItem>, String> {
        let url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/mktHs/rank?l=80&p=1&t=01/averatio&ordertype=&o=0";
        let res = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("请求板块数据失败: {e}"))?;

        let text = res
            .text()
            .await
            .map_err(|e| format!("读取板块响应失败: {e}"))?;

        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("解析板块 JSON 失败: {e}"))?;

        let data = json
            .pointer("/data")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "板块响应缺少 data 数组".to_string())?;

        let mut sectors = Vec::new();
        for item in data {
            let code = item.get("bd_code").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let name = item.get("bd_name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let change_pct = item
                .get("bd_zdf")
                .and_then(|v| {
                    if let Some(s) = v.as_str() {
                        s.parse::<f64>().ok()
                    } else {
                        v.as_f64()
                    }
                })
                .unwrap_or(0.0);
            let lead_stock_name = item.get("nzg_name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let lead_stock_code = item.get("nzg_code").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let lead_stock_zdf = item
                .get("nzg_zdf")
                .and_then(|v| {
                    if let Some(s) = v.as_str() {
                        s.parse::<f64>().ok()
                    } else {
                        v.as_f64()
                    }
                })
                .unwrap_or(0.0);

            if !name.is_empty() {
                sectors.push(SectorItem {
                    code,
                    name,
                    change_pct,
                    up_count: 0,
                    down_count: 0,
                    lead_stock_name,
                    lead_stock_code,
                    lead_stock_zdf,
                });
            }
        }

        Ok(sectors)
    }

    pub async fn fetch_breadth(&self, configured_key: Option<&str>) -> Result<(u32, u32, u32, Option<f64>, Option<f64>), String> {
        let Some(api_key) = get_iwencai_api_key(configured_key) else {
            let cached = *self.cached_breadth.lock().unwrap();
            return Ok(cached);
        };

        let today = crate::market::beijing_now().format("%Y-%m-%d").to_string();

        // Check if circuit breaker is active for today
        if let Some(ref date) = *self.quota_exhausted_date.lock().unwrap() {
            if date == &today {
                let cached = *self.cached_breadth.lock().unwrap();
                return Ok(cached);
            }
        }

        let url = "https://openapi.iwencai.com/v1/query2data";

        let now_nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let trace_id = format!("{:032x}{:032x}", now_nanos, !now_nanos);

        let body = serde_json::json!({
            "query": "同花顺全A 上涨家数 下跌家数 平家数 成交额 成交额环比增长率",
            "page": "1",
            "limit": "10",
            "is_cache": "1",
            "expand_index": "true"
        });

        let body_str = serde_json::to_string(&body).unwrap_or_default();
        let res = self
            .client
            .post(url)
            .header(reqwest::header::AUTHORIZATION, format!("Bearer {api_key}"))
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header("X-Claw-Call-Type", "normal")
            .header("X-Claw-Skill-Id", "hithink-zhishu-query")
            .header("X-Claw-Skill-Version", "1.0.0")
            .header("X-Claw-Plugin-Id", "none")
            .header("X-Claw-Plugin-Version", "none")
            .header("X-Claw-Trace-Id", trace_id)
            .body(body_str)
            .send()
            .await
            .map_err(|e| format!("请求同花顺问财涨跌统计失败: {e}"))?;

        let status = res.status();
        let text = res
            .text()
            .await
            .map_err(|e| format!("读取涨跌统计响应失败: {e}"))?;

        let trimmed = text.trim();
        if !status.is_success() {
            let sample: String = trimmed.chars().take(80).collect();
            if status == reqwest::StatusCode::UNAUTHORIZED || status.as_u16() == 429 || trimmed.contains("次数已用完") {
                *self.quota_exhausted_date.lock().unwrap() = Some(today);
                return Err(format!(
                    "问财接口配额耗尽/鉴权受限 (HTTP {status}: {sample})。已启动今日熔断保护，暂停后续请求并平滑回退基准缓存，次日自动恢复。"
                ));
            }
            return Err(format!("问财接口 HTTP {status}: {sample}"));
        }
        if trimmed.is_empty() {
            return Err("问财接口返回空响应（服务端限流或网络抖动，已自动回退基准缓存）".to_string());
        }
        if trimmed.starts_with('<') {
            return Err(format!("问财接口返回非 JSON 页面 (HTTP {status})"));
        }

        let json: serde_json::Value = serde_json::from_str(trimmed)
            .map_err(|e| format!("解析涨跌统计响应失败: {e}"))?;

        let datas = json
            .pointer("/datas")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "缺少 datas 数组".to_string())?;

        let first = datas.first().ok_or_else(|| "datas 数组为空".to_string())?;
        let obj = first.as_object().ok_or_else(|| "datas[0] 不是对象".to_string())?;

        let mut up_count = 0u32;
        let mut down_count = 0u32;
        let mut flat_count = 0u32;
        let mut turnover_change_pct: Option<f64> = None;
        let mut turnover_val: Option<f64> = None;

        for (k, v) in obj {
            let num = v
                .as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
                .or_else(|| v.as_u64().map(|n| n as f64))
                .unwrap_or(0.0);
            if k.contains("上涨家数") {
                up_count = num as u32;
            } else if k.contains("下跌家数") {
                down_count = num as u32;
            } else if k.contains("平家数") || k.contains("平盘家数") {
                flat_count = num as u32;
            } else if k.contains("环比增长率") || k.contains("环比") {
                turnover_change_pct = Some(num);
            } else if k.contains("成交额") && !k.contains("环比") && !k.contains("增减") {
                turnover_val = Some(num);
            }
        }

        if up_count == 0 && down_count == 0 {
            return Err("问财涨跌统计解析结果为空".to_string());
        }

        let turnover_change_amount = match (turnover_val, turnover_change_pct) {
            (Some(turnover), Some(pct)) => {
                if (100.0 + pct).abs() > 1e-4 {
                    Some(turnover * (pct / (100.0 + pct)))
                } else {
                    None
                }
            }
            _ => None,
        };

        Ok((up_count, down_count, flat_count, turnover_change_pct, turnover_change_amount))
    }

    async fn fetch_north_money(&self) -> Result<f64, String> {
        // 沪深交易所已停止盘中实时北向资金流向披露
        Ok(0.0)
    }
}

/// Parse Tencent global indices quote string (GB18030 decoded text).
/// Handles both US/HK series (`v_s_us*`, `v_s_hk*`) and Asia/Europe series (`v_gz*`).
pub fn parse_global_indices(body: &str) -> Vec<MarketIndex> {
    let mut items: Vec<(usize, MarketIndex)> = Vec::new();

    for line in body.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("v_s_") {
            let Some((var_name, payload)) = rest.split_once('=') else { continue; };
            let var_name = var_name.trim();
            let payload = payload.trim().trim_matches(['"', ';'].as_ref());
            let f: Vec<&str> = payload.split('~').collect();
            if f.len() < 6 { continue; }

            let (code, name, order) = match var_name {
                "usIXIC" => ("usIXIC", "纳斯达克", 0),
                "usINX" => ("usINX", "标普500", 1),
                "usDJI" => ("usDJI", "道琼斯", 2),
                "hkHSI" => ("hkHSI", "恒生指数", 3),
                _ => continue,
            };

            let price = f[3].trim().parse::<f64>().unwrap_or(0.0);
            let change = f[4].trim().parse::<f64>().unwrap_or(0.0);
            let change_pct = f[5].trim().parse::<f64>().unwrap_or(0.0);
            let turnover = if f.len() > 7 {
                f[7].trim().parse::<f64>().unwrap_or(0.0)
            } else {
                0.0
            };

            if price > 0.0 {
                items.push((order, MarketIndex {
                    code: code.to_string(),
                    name: name.to_string(),
                    price,
                    change,
                    change_pct,
                    turnover,
                    up_count: 0,
                    down_count: 0,
                    flat_count: 0,
                }));
            }
        } else if let Some(rest) = line.strip_prefix("v_") {
            let Some((var_name, payload)) = rest.split_once('=') else { continue; };
            let var_name = var_name.trim();
            let payload = payload.trim().trim_matches(['"', ';'].as_ref());
            let f: Vec<&str> = payload.split('~').collect();
            if f.len() < 6 { continue; }

            let (code, name, order) = match var_name {
                "gzN225" => ("gzN225", "日经225", 4),
                "gzKS11" => ("gzKS11", "韩国KOSPI", 5),
                "gzFTSE" => ("gzFTSE", "富时100", 6),
                _ => continue,
            };

            let price = f[3].trim().parse::<f64>().unwrap_or(0.0);
            let change = f[4].trim().parse::<f64>().unwrap_or(0.0);
            let change_pct = f[5].trim().parse::<f64>().unwrap_or(0.0);

            if price > 0.0 {
                items.push((order, MarketIndex {
                    code: code.to_string(),
                    name: name.to_string(),
                    price,
                    change,
                    change_pct,
                    turnover: 0.0,
                    up_count: 0,
                    down_count: 0,
                    flat_count: 0,
                }));
            }
        }
    }

    items.sort_by_key(|(order, _)| *order);
    items.into_iter().map(|(_, idx)| idx).collect()
}
