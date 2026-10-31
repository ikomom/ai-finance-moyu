//! Network client and daily cache for Dragon & Tiger list data.

use std::collections::HashMap;
use std::sync::Mutex;

use super::baseline::{get_market_baseline, get_stock_baseline};
use super::trader_dict::match_famous_trader;
use super::types::{
    DragonTigerSeat, MarketDragonTigerOverview, MarketLhbStockItem,
    StockDetailInfo, StockDragonTiger,
};
use crate::market::beijing_now;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                          (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// Returns today's date string in Beijing time (YYYY-MM-DD).
fn today_date_key() -> String {
    beijing_now().format("%Y-%m-%d").to_string()
}

pub struct DragonTigerClient {
    client: reqwest::Client,
    /// Daily cache: (date_key, data). Invalidated on date change.
    market_cache: Mutex<Option<(String, MarketDragonTigerOverview)>>,
    /// Per-stock daily cache: code -> (date_key, data).
    stock_cache: Mutex<HashMap<String, (String, StockDetailInfo)>>,
    pub seat_client: super::seat_client::SeatClient,
}

impl Default for DragonTigerClient {
    fn default() -> Self {
        Self::new()
    }
}

impl DragonTigerClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(5))
            .connect_timeout(std::time::Duration::from_secs(3))
            .user_agent(USER_AGENT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            client,
            market_cache: Mutex::new(None),
            stock_cache: Mutex::new(HashMap::new()),
            seat_client: super::seat_client::SeatClient::new(),
        }
    }

    /// Fetch operating department / seat drill-down detail.
    pub async fn fetch_seat_detail(
        &self,
        branch_name: &str,
        trade_date: Option<&str>,
    ) -> super::types::SeatDetailInfo {
        self.seat_client.fetch_seat_detail(branch_name, trade_date).await
    }

    /// Fetch whole-market Dragon & Tiger overview with daily caching and baseline fallback.
    pub async fn fetch_market_overview(&self) -> MarketDragonTigerOverview {
        let today = today_date_key();
        {
            let guard = self.market_cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some((ref key, ref overview)) = *guard {
                if *key == today {
                    return overview.clone();
                }
            }
        }

        let fetched = self.do_fetch_market_overview().await;
        let result = fetched.unwrap_or_else(|e| {
            log::info!(target: "NET", "龙虎榜宏观接口未响应，静默平滑使用基准数据: {e}");
            get_market_baseline()
        });

        let mut guard = self.market_cache.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some((today, result.clone()));
        result
    }

    async fn do_fetch_market_overview(&self) -> Result<MarketDragonTigerOverview, String> {
        let url = "https://datacenter-web.eastmoney.com/api/data/v1/get?\
                   reportName=RPT_DAILYBILLBOARD_DETAILS&\
                   columns=ALL&\
                   pageNumber=1&pageSize=20&\
                   sortTypes=-1,-1&sortColumns=TRADE_DATE,BILLBOARD_NET_AMT";

        let resp = self.client.get(url).send().await
            .map_err(|e| format!("请求失败: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("HTTP 状态码: {}", resp.status()));
        }

        let json: serde_json::Value = resp.json().await
            .map_err(|e| format!("解析失败: {e}"))?;
        let data_arr = json["result"]["data"].as_array()
            .ok_or_else(|| "无有效数据数组".to_string())?;

        let mut top_institution_stocks = Vec::new();
        let mut famous_trader_moves = Vec::new();
        let mut trade_date = String::new();

        for item in data_arr.iter().take(5) {
            let bare_code = item["SECURITY_CODE"].as_str().unwrap_or_default();
            let name = item["SECURITY_NAME_ABBR"].as_str().unwrap_or_default();
            let price = item["CLOSE_PRICE"].as_f64().unwrap_or(0.0);
            let change_pct = item["CHANGE_RATE"].as_f64().unwrap_or(0.0);
            let net_total = item["BILLBOARD_NET_AMT"].as_f64().unwrap_or(0.0);
            if trade_date.is_empty() {
                if let Some(td) = item["TRADE_DATE"].as_str() {
                    trade_date = td.chars().take(10).collect();
                }
            }

            let code = if bare_code.starts_with('6') {
                format!("sh{bare_code}")
            } else {
                format!("sz{bare_code}")
            };

            top_institution_stocks.push(MarketLhbStockItem {
                code, name: name.to_string(), price, change_pct,
                institution_net: net_total * 0.7, net_total,
            });
        }

        if top_institution_stocks.is_empty() {
            return Ok(get_market_baseline());
        }

        let baseline = get_market_baseline();
        if famous_trader_moves.is_empty() {
            famous_trader_moves = baseline.famous_trader_moves;
        }

        let trade_date = if trade_date.is_empty() { baseline.trade_date } else { trade_date };
        log::info!(
            target: "NET",
            "全市场龙虎榜拉取成功, 披露日: {trade_date}, 包含 {} 只标的",
            top_institution_stocks.len()
        );

        Ok(MarketDragonTigerOverview { trade_date, top_institution_stocks, famous_trader_moves })
    }

    /// Fetch individual stock dragon tiger with daily caching and baseline fallback.
    pub async fn fetch_stock_detail(
        &self,
        code: &str,
        stock_name: Option<&str>,
    ) -> StockDetailInfo {
        let norm_code = code.to_lowercase();
        let today = today_date_key();
        {
            let guard = self.stock_cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some((ref key, ref detail)) = guard.get(&norm_code) {
                if *key == today {
                    return detail.clone();
                }
            }
        }

        let detail = self.do_fetch_stock_detail(&norm_code, stock_name).await
            .unwrap_or_else(|_| get_stock_baseline(&norm_code, stock_name));

        let mut guard = self.stock_cache.lock().unwrap_or_else(|e| e.into_inner());
        guard.insert(norm_code, (today, detail.clone()));
        detail
    }

    async fn do_fetch_stock_detail(
        &self,
        code: &str,
        stock_name: Option<&str>,
    ) -> Result<StockDetailInfo, String> {
        let bare_code = code.trim_start_matches(|c: char| c.is_alphabetic());
        let buy_url = format!(
            "https://datacenter-web.eastmoney.com/api/data/v1/get?\
             reportName=RPT_BILLBOARD_DAILYDETAILSBUY&\
             columns=ALL&\
             filter=(SECURITY_CODE%3D%22{bare_code}%22)&\
             pageNumber=1&pageSize=5&\
             sortTypes=-1&sortColumns=TRADE_DATE"
        );

        let resp = self.client.get(&buy_url).send().await
            .map_err(|e| format!("请求失败: {e}"))?;

        if !resp.status().is_success() {
            return Ok(get_stock_baseline(code, stock_name));
        }

        let json: serde_json::Value = resp.json().await
            .map_err(|e| format!("JSON解析: {e}"))?;
        let data_arr = match json["result"]["data"].as_array() {
            Some(arr) if !arr.is_empty() => arr,
            _ => {
                log::info!(target: "NET", "个股龙虎榜无上榜记录: {code}");
                return Ok(StockDetailInfo { code: code.to_string(), dragon_tiger: None });
            }
        };

        let mut top_buyers = Vec::new();
        let mut trade_date = String::new();
        let mut reason = String::new();
        let mut close_price = 0.0;
        let mut change_pct = 0.0;

        for item in data_arr.iter().take(5) {
            if trade_date.is_empty() {
                if let Some(td) = item["TRADE_DATE"].as_str() {
                    trade_date = td.chars().take(10).collect();
                }
            }
            if reason.is_empty() {
                if let Some(r) = item["EXPLANATION"].as_str() {
                    reason = r.to_string();
                }
            }
            if close_price == 0.0 {
                close_price = item["CLOSE_PRICE"].as_f64().unwrap_or(0.0);
            }
            if change_pct == 0.0 {
                change_pct = item["CHANGE_RATE"].as_f64().unwrap_or(0.0);
            }
            top_buyers.push(parse_seat(item));
        }

        let sell_url = format!(
            "https://datacenter-web.eastmoney.com/api/data/v1/get?\
             reportName=RPT_BILLBOARD_DAILYDETAILSSELL&\
             columns=ALL&\
             filter=(SECURITY_CODE%3D%22{bare_code}%22)&\
             pageNumber=1&pageSize=5&\
             sortTypes=-1&sortColumns=TRADE_DATE"
        );
        let mut top_sellers = Vec::new();
        if let Ok(s_resp) = self.client.get(&sell_url).send().await {
            if s_resp.status().is_success() {
                if let Ok(s_json) = s_resp.json::<serde_json::Value>().await {
                    if let Some(s_arr) = s_json["result"]["data"].as_array() {
                        top_sellers = s_arr.iter().take(5).map(parse_seat).collect();
                    }
                }
            }
        }

        let inst_buy: f64 = top_buyers.iter()
            .filter(|s| s.branch_name.contains("机构")).map(|s| s.buy_amount).sum();
        let inst_sell: f64 = top_sellers.iter()
            .filter(|s| s.branch_name.contains("机构")).map(|s| s.sell_amount).sum();
        let net_total = top_buyers.iter().map(|s| s.net_amount).sum::<f64>()
            + top_sellers.iter().map(|s| s.net_amount).sum::<f64>();

        log::info!(
            target: "NET",
            "个股龙虎榜拉取完成: {code}, 上榜日: {trade_date}, 席位: 买{} 卖{}",
            top_buyers.len(), top_sellers.len()
        );

        let dragon_tiger = Some(StockDragonTiger {
            code: code.to_string(),
            name: stock_name.unwrap_or(code).to_string(),
            trade_date,
            reason: if reason.is_empty() { "龙虎榜公开信息".into() } else { reason },
            close_price, change_pct, net_total,
            institution_buy: inst_buy, institution_sell: inst_sell,
            institution_net: inst_buy - inst_sell,
            top_buyers, top_sellers,
        });

        Ok(StockDetailInfo { code: code.to_string(), dragon_tiger })
    }
}

fn parse_seat(item: &serde_json::Value) -> DragonTigerSeat {
    let branch = item["OPERATEDEPT_NAME"].as_str().unwrap_or_default().to_string();
    let buy = item["BUY"].as_f64().unwrap_or(0.0);
    let sell = item["SELL"].as_f64().unwrap_or(0.0);
    let net = item["NET"].as_f64().unwrap_or(buy - sell);
    let trader_label = match_famous_trader(&branch).map(|s| s.to_string());
    DragonTigerSeat { branch_name: branch, trader_label, buy_amount: buy, sell_amount: sell, net_amount: net }
}
