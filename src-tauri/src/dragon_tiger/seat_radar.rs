//! Operating department / seat radar query and daily cache.
//!
//! Complies with AGENTS.md §11 (isolated feature module, <=300 lines).

use std::collections::HashMap;
use std::sync::Mutex;

use super::baseline::get_seat_radar_baseline;
use super::trader_dict::{match_famous_trader, resolve_branch_pattern};
use super::types::{SeatRadarItem, SeatRadarResult};
use crate::market::beijing_now;
use crate::quote::{decode_gb18030, tencent};

pub struct SeatRadarClient {
    client: reqwest::Client,
    cache: Mutex<HashMap<String, (String, SeatRadarResult)>>,
}

impl Default for SeatRadarClient {
    fn default() -> Self {
        Self::new()
    }
}

impl SeatRadarClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(6))
            .connect_timeout(std::time::Duration::from_secs(3))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { client, cache: Mutex::new(HashMap::new()) }
    }

    /// Query seat radar filtered stocks across designated branches on a trade date.
    pub async fn fetch_seat_radar(&self, branches: &[String], trade_date: Option<&str>) -> SeatRadarResult {
        let valid_branches: Vec<String> = branches.iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
        if valid_branches.is_empty() {
            return SeatRadarResult { query_date: trade_date.unwrap_or("").to_string(), items: Vec::new() };
        }

        let today = beijing_now().format("%Y-%m-%d").to_string();
        let cache_key = format!("{}:{}", valid_branches.join("|"), trade_date.unwrap_or(""));

        {
            let guard = self.cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some((ref key, ref res)) = guard.get(&cache_key) {
                if *key == today { return res.clone(); }
            }
        }

        let result = match self.do_fetch_radar(&valid_branches, trade_date).await {
            Ok(res) => res,
            Err(_) => get_seat_radar_baseline(&valid_branches, trade_date),
        };

        let mut guard = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        guard.insert(cache_key, (today, result.clone()));
        result
    }

    async fn do_fetch_radar(&self, branches: &[String], trade_date: Option<&str>) -> Result<SeatRadarResult, String> {
        let mut all_patterns: Vec<String> = Vec::new();
        for b in branches {
            let expanded = resolve_branch_pattern(b);
            if expanded.is_empty() {
                all_patterns.push(b.clone());
            } else {
                for p in expanded {
                    if !all_patterns.contains(&p) { all_patterns.push(p); }
                }
            }
        }

        let mut raw_items: Vec<SeatRadarItem> = Vec::new();
        for pattern in &all_patterns {
            let buy_items = self.fetch_report_items(pattern, true, trade_date).await.unwrap_or_default();
            let sell_items = self.fetch_report_items(pattern, false, trade_date).await.unwrap_or_default();
            for item in buy_items.into_iter().chain(sell_items) { raw_items.push(item); }
        }

        // Deduplicate across patterns
        let mut seen = std::collections::HashSet::new();
        raw_items.retain(|it| seen.insert((it.code.clone(), it.branch_name.clone(), it.trade_date.clone(), it.is_buy)));

        let determined_date = if let Some(td) = trade_date {
            if !td.is_empty() { td.to_string() } else {
                raw_items.iter().map(|it| it.trade_date.as_str()).filter(|d| !d.is_empty()).max().unwrap_or("").to_string()
            }
        } else {
            raw_items.iter().map(|it| it.trade_date.as_str()).filter(|d| !d.is_empty()).max().unwrap_or("").to_string()
        };

        let final_date = if determined_date.is_empty() { beijing_now().format("%Y-%m-%d").to_string() } else { determined_date };
        let mut filtered: Vec<SeatRadarItem> = raw_items.into_iter().filter(|item| item.trade_date == final_date).collect();

        // Batch resolve stock names if empty
        let empty_name_codes: Vec<String> = filtered.iter().filter(|it| it.name.trim().is_empty()).map(|it| it.code.clone()).collect();
        if !empty_name_codes.is_empty() {
            let name_map = self.resolve_names(&empty_name_codes).await;
            for it in &mut filtered {
                if it.name.trim().is_empty() {
                    if let Some(n) = name_map.get(&it.code) { it.name = n.clone(); }
                }
            }
        }

        log::info!(target: "NET", "席位雷达筛选完成, 披露日: {}, 命中条数: {}", final_date, filtered.len());
        Ok(SeatRadarResult { query_date: final_date, items: filtered })
    }

    async fn fetch_report_items(
        &self,
        pattern: &str,
        is_buy: bool,
        trade_date: Option<&str>,
    ) -> Result<Vec<SeatRadarItem>, String> {
        let report_name = if is_buy {
            "RPT_BILLBOARD_DAILYDETAILSBUY"
        } else {
            "RPT_BILLBOARD_DAILYDETAILSSELL"
        };

        let filter_str = if let Some(td) = trade_date {
            if !td.is_empty() {
                format!(r#"(OPERATEDEPT_NAME="{}")(TRADE_DATE='{}')"#, pattern, td)
            } else {
                format!(r#"(OPERATEDEPT_NAME="{}")"#, pattern)
            }
        } else {
            format!(r#"(OPERATEDEPT_NAME="{}")"#, pattern)
        };

        let resp = self
            .client
            .get("https://datacenter-web.eastmoney.com/api/data/v1/get")
            .query(&[
                ("reportName", report_name),
                ("columns", "ALL"),
                ("filter", &filter_str),
                ("pageNumber", "1"),
                ("pageSize", "30"),
                ("sortTypes", "-1"),
                ("sortColumns", "TRADE_DATE"),
            ])
            .send()
            .await
            .map_err(|e| format!("请求失败: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp.json().await.map_err(|e| format!("JSON: {e}"))?;
        let data_arr = match json["result"]["data"].as_array() {
            Some(arr) => arr,
            None => return Ok(Vec::new()),
        };

        let mut items = Vec::new();
        for item in data_arr {
            let bare_code = item["SECURITY_CODE"].as_str().unwrap_or_default();
            if bare_code.is_empty() {
                continue;
            }
            let name = item["SECURITY_NAME_ABBR"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            let branch = item["OPERATEDEPT_NAME"]
                .as_str()
                .unwrap_or(pattern)
                .to_string();
            let td = item["TRADE_DATE"]
                .as_str()
                .map(|s| s.chars().take(10).collect::<String>())
                .unwrap_or_default();
            let buy = item["BUY"].as_f64().unwrap_or(0.0);
            let sell = item["SELL"].as_f64().unwrap_or(0.0);
            let net = item["NET"].as_f64().unwrap_or(buy - sell);
            let price = item["CLOSE_PRICE"].as_f64().unwrap_or(0.0);
            let change = item["CHANGE_RATE"].as_f64().unwrap_or(0.0);
            let reason = item["EXPLANATION"]
                .as_str()
                .unwrap_or("龙虎榜披露")
                .to_string();

            let code = super::canonical_stock_code(bare_code);

            if crate::market::is_index(&code) {
                continue;
            }

            let trader_label = match_famous_trader(&branch).map(|s| s.to_string());

            items.push(SeatRadarItem {
                code,
                name,
                trade_date: td,
                branch_name: branch,
                trader_label,
                is_buy,
                buy_amount: buy,
                sell_amount: sell,
                net_amount: net,
                close_price: price,
                change_pct: change,
                reason,
            });
        }

        Ok(items)
    }

    async fn resolve_names(&self, codes: &[String]) -> HashMap<String, String> {
        let unique: Vec<String> = {
            let mut seen = std::collections::HashSet::new();
            codes
                .iter()
                .filter(|c| seen.insert((*c).clone()))
                .cloned()
                .collect()
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
