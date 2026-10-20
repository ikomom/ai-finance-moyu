//! Global-index quote fetching (Yahoo Finance and Tencent fallbacks).
//!
//! A second `impl Fetcher` block rather than more methods on the domestic
//! path above, purely to keep each file inside the 300-line budget
//! (AGENTS.md §11).

use super::indicators::compute_kline_indicators;
use super::tencent;
use super::types::*;
use super::yahoo::{global_code_to_yahoo_symbol, parse_yahoo_chart, parse_yahoo_trend};
use super::Fetcher;

impl Fetcher {

    /// Fetch daily candlestick series for global indices.
    /// Supports US/HK indices (via Tencent fqkline or Yahoo Finance fallback)
    /// and Asia-Pacific / European indices (Nikkei 225, KOSPI, FTSE 100 via Yahoo Finance).
    pub async fn fetch_global_kline(&self, code: &str) -> Result<KLineData, FetchError> {
        let code_clean = code.trim();

        // 1. For US/HK indices, Tencent fqkline is fast and reliable
        let is_tencent_cand = code_clean.starts_with("us") || code_clean.starts_with("hk");
        if is_tencent_cand {
            let tencent_url = tencent::kline_url(code_clean);
            if let Ok(bytes) = self.get_bytes(&tencent_url, None).await {
                if let Ok(bars) = tencent::parse_kline(code_clean, &bytes) {
                    return Ok(compute_kline_indicators(code_clean, bars));
                }
            }
        }

        // 2. Fetch from Yahoo Finance
        if let Some(yahoo_symbol) = global_code_to_yahoo_symbol(code_clean) {
            let encoded_symbol = match yahoo_symbol.strip_prefix('^') {
                Some(rest) => format!("%5E{rest}"),
                None => yahoo_symbol.to_string(),
            };
            let yahoo_url = format!(
                "https://query1.finance.yahoo.com/v8/finance/chart/{encoded_symbol}?interval=1d&range=6mo"
            );
            let bytes = self.get_global_bytes(&yahoo_url, None).await?;
            let bars = parse_yahoo_chart(code_clean, &bytes)?;
            return Ok(compute_kline_indicators(code_clean, bars));
        }

        Err(parse_err(format!("不支持的全球指数代码: {code}")))
    }

    /// Fetch intraday minute trend (分时走势) for global indices.
    /// Supports US/HK indices (via Tencent minute query or Yahoo fallback)
    /// and Asia-Pacific / European indices (Nikkei 225, KOSPI, FTSE 100 via Yahoo 1m/5m chart).
    pub async fn fetch_global_trend(&self, code: &str) -> Result<Trend, FetchError> {
        let code_clean = code.trim();

        // 1. For US/HK indices, Tencent minute query has great domestic speed and no proxy need
        let is_tencent_cand = code_clean.starts_with("us") || code_clean.starts_with("hk");
        if is_tencent_cand {
            let tencent_url = tencent::trend_url(code_clean);
            if let Ok(bytes) = self.get_bytes(&tencent_url, None).await {
                if let Ok(trend) = tencent::parse_trend(code_clean, &bytes) {
                    if trend.points.len() > 1 {
                        return Ok(trend);
                    }
                }
            }
        }

        // 2. Fetch from Yahoo Finance 1m chart (or 5m chart fallback)
        if let Some(yahoo_symbol) = global_code_to_yahoo_symbol(code_clean) {
            let encoded_symbol = match yahoo_symbol.strip_prefix('^') {
                Some(rest) => format!("%5E{rest}"),
                None => yahoo_symbol.to_string(),
            };
            let yahoo_url = format!(
                "https://query1.finance.yahoo.com/v8/finance/chart/{encoded_symbol}?interval=1m&range=1d"
            );
            if let Ok(bytes) = self.get_global_bytes(&yahoo_url, None).await {
                if let Ok(trend) = parse_yahoo_trend(code_clean, &bytes) {
                    if !trend.points.is_empty() {
                        return Ok(trend);
                    }
                }
            }

            // Fallback: try 5m interval
            let yahoo_url_5m = format!(
                "https://query1.finance.yahoo.com/v8/finance/chart/{encoded_symbol}?interval=5m&range=1d"
            );
            if let Ok(bytes) = self.get_global_bytes(&yahoo_url_5m, None).await {
                if let Ok(trend) = parse_yahoo_trend(code_clean, &bytes) {
                    if !trend.points.is_empty() {
                        return Ok(trend);
                    }
                }
            }
        }

        Err(parse_err(format!("不支持或未能获取全球指数分时: {code}")))
    }
}
