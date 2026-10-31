//! Operating department / seat drill-down network client and daily cache.
//!
//! Complies with AGENTS.md §11 (isolated feature module, <=300 lines).

use std::collections::HashMap;
use std::sync::Mutex;

use super::baseline::get_seat_baseline;
use super::trader_dict::match_famous_trader;
use super::types::{SeatDetailInfo, SeatOperationItem};
use crate::market::beijing_now;
use crate::quote::{decode_gb18030, tencent};

pub struct SeatClient {
    client: reqwest::Client,
    cache: Mutex<HashMap<String, (String, SeatDetailInfo)>>,
}

impl Default for SeatClient {
    fn default() -> Self {
        Self::new()
    }
}

impl SeatClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(5))
            .connect_timeout(std::time::Duration::from_secs(3))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            client,
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// Fetch operating department / seat drill-down detail with daily caching and baseline fallback.
    pub async fn fetch_seat_detail(
        &self,
        branch_name: &str,
        trade_date: Option<&str>,
    ) -> SeatDetailInfo {
        let clean_name = branch_name.trim();
        let today = beijing_now().format("%Y-%m-%d").to_string();
        let cache_key = format!("{clean_name}:{}", trade_date.unwrap_or(""));
        {
            let guard = self.cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some((ref key, ref detail)) = guard.get(&cache_key) {
                if *key == today {
                    return detail.clone();
                }
            }
        }

        let detail = self.do_fetch_seat_detail(clean_name, trade_date).await
            .unwrap_or_else(|_| get_seat_baseline(clean_name, trade_date));

        let mut guard = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        guard.insert(cache_key, (today, detail.clone()));
        detail
    }

    async fn do_fetch_seat_detail(
        &self,
        branch_name: &str,
        trade_date: Option<&str>,
    ) -> Result<SeatDetailInfo, String> {
        let filter_str = format!(r#"(OPERATEDEPT_NAME="{}")"#, branch_name);
        let resp = self
            .client
            .get("https://datacenter-web.eastmoney.com/api/data/v1/get")
            .query(&[
                ("reportName", "RPT_BILLBOARD_DAILYDETAILSBUY"),
                ("columns", "ALL"),
                ("filter", &filter_str),
                ("pageNumber", "1"),
                ("pageSize", "20"),
                ("sortTypes", "-1"),
                ("sortColumns", "TRADE_DATE"),
            ])
            .send()
            .await
            .map_err(|e| format!("请求失败: {e}"))?;

        if !resp.status().is_success() {
            return Ok(get_seat_baseline(branch_name, trade_date));
        }

        let json: serde_json::Value = resp.json().await
            .map_err(|e| format!("JSON解析: {e}"))?;
        let data_arr = match json["result"]["data"].as_array() {
            Some(arr) if !arr.is_empty() => arr,
            _ => return Ok(get_seat_baseline(branch_name, trade_date)),
        };

        let mut all_ops: Vec<(bool, SeatOperationItem)> = Vec::new();
        let target_date = trade_date.unwrap_or("");

        for item in data_arr {
            let bare_code = item["SECURITY_CODE"].as_str().unwrap_or_default();
            let name = item["SECURITY_NAME_ABBR"].as_str().unwrap_or_default().to_string();
            let td = item["TRADE_DATE"].as_str().map(|s| s.chars().take(10).collect::<String>()).unwrap_or_default();
            let buy = item["BUY"].as_f64().unwrap_or(0.0);
            let sell = item["SELL"].as_f64().unwrap_or(0.0);
            let net = item["NET"].as_f64().unwrap_or(buy - sell);
            let price = item["CLOSE_PRICE"].as_f64().unwrap_or(0.0);
            let change = item["CHANGE_RATE"].as_f64().unwrap_or(0.0);
            let reason = item["EXPLANATION"].as_str().unwrap_or("龙虎榜公开信息").to_string();

            let code = if bare_code.starts_with('6') {
                format!("sh{bare_code}")
            } else {
                format!("sz{bare_code}")
            };

            let is_same_day = !target_date.is_empty() && td == target_date;
            all_ops.push((
                is_same_day,
                SeatOperationItem {
                    code,
                    name,
                    trade_date: td,
                    buy_amount: buy,
                    sell_amount: sell,
                    net_amount: net,
                    close_price: price,
                    change_pct: change,
                    reason,
                },
            ));
        }

        // 该报表只有 SECURITY_CODE，没有名称列，name 恒为空。
        // 统一按代码批量补中文名，失败时保留代码，不影响列表本身。
        let codes: Vec<String> = all_ops.iter().map(|(_, op)| op.code.clone()).collect();
        let names = self.resolve_names(&codes).await;

        let mut same_day_operations = Vec::new();
        let mut historical_operations = Vec::new();
        for (is_same_day, mut op) in all_ops {
            if op.name.trim().is_empty() {
                if let Some(n) = names.get(&op.code) {
                    op.name = n.clone();
                }
            }
            if is_same_day {
                same_day_operations.push(op);
            } else if historical_operations.len() < 10 {
                historical_operations.push(op);
            }
        }

        let trader_label = match_famous_trader(branch_name).map(|s| s.to_string());
        log::info!(
            target: "NET",
            "席位下钻数据拉取成功: {}, 同日{}笔, 历史{}笔",
            branch_name,
            same_day_operations.len(),
            historical_operations.len()
        );

        Ok(SeatDetailInfo {
            branch_name: branch_name.to_string(),
            trader_label,
            same_day_operations,
            historical_operations,
        })
    }

    /// Resolve stock names for a batch of prefixed codes in one quote request.
    /// Any failure degrades to an empty map — the rows still show their codes.
    async fn resolve_names(&self, codes: &[String]) -> HashMap<String, String> {
        let unique: Vec<String> = {
            let mut seen = std::collections::HashSet::new();
            codes.iter().filter(|c| seen.insert((*c).clone())).cloned().collect()
        };
        if unique.is_empty() {
            return HashMap::new();
        }

        let resp = match self.client.get(tencent::quote_url(&unique)).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => return HashMap::new(),
        };
        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(_) => return HashMap::new(),
        };

        tencent::parse_quotes(&decode_gb18030(&bytes))
            .into_iter()
            .filter(|q| !q.name.trim().is_empty())
            .map(|q| (q.code, q.name))
            .collect()
    }
}
