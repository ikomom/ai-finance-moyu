//! Network fetcher for A-share indices, sector rankings, whole-market breadth (iWenCai),
//! and global indices.

use std::time::Duration;
use chrono::Local;

use super::types::{MarketIndex, MarketOverview, SectorItem};

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                          (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub(super) type BreadthSnapshot = (u32, u32, u32, Option<f64>, Option<f64>);

pub struct MarketFetcher {
    pub(super) client: reqwest::Client,
    pub(super) cached_breadth: std::sync::Mutex<BreadthSnapshot>,
    pub quota_exhausted_date: std::sync::Mutex<Option<String>>,
    pub(super) last_breadth_fetch: std::sync::Mutex<Option<std::time::Instant>>,
}

impl Default for MarketFetcher {
    fn default() -> Self {
        Self::new().unwrap_or_else(|e| {
            log::error!(target: "NET", "大盘全景客户端初始化失败，将展示基准缓存: {e}");
            Self {
                client: reqwest::Client::new(),
                cached_breadth: std::sync::Mutex::new((
                    1167,
                    4324,
                    69,
                    Some(-19.09),
                    Some(-365_890_000_000.0),
                )),
                quota_exhausted_date: std::sync::Mutex::new(None),
                last_breadth_fetch: std::sync::Mutex::new(None),
            }
        })
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
            last_breadth_fetch: std::sync::Mutex::new(None),
        })
    }

    /// Reset quota circuit breaker (e.g. after user updates API Key).
    pub fn reset_quota_circuit_breaker(&self) {
        *self.quota_exhausted_date.lock().unwrap_or_else(|e| e.into_inner()) = None;
        *self.last_breadth_fetch.lock().unwrap_or_else(|e| e.into_inner()) = None;
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
                log::debug!(target: "NET", "涨跌统计拉取成功: 涨={u}, 跌={d}, 平={f}, 环比={pct:?}");
                if u > 0 || d > 0 {
                    *self.cached_breadth.lock().unwrap_or_else(|e| e.into_inner()) = (u, d, f, pct, amt);
                }
                (u, d, f, pct, amt)
            }
            Err(ref e) => {
                log::info!(target: "NET", "全市场涨跌统计回退基准缓存: {e}");
                *self.cached_breadth.lock().unwrap_or_else(|e| e.into_inner())
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

    async fn fetch_north_money(&self) -> Result<f64, String> {
        Ok(0.0)
    }
}
