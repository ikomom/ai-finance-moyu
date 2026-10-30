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

    /// Fetch candlestick series for global indices.
    /// Supports minute periods (15m, 30m, 60m, 120m) and day / week periods.
    pub async fn fetch_global_kline(&self, code: &str, period: Option<&str>) -> Result<KLineData, FetchError> {
        let code_clean = code.trim();
        let p = period.unwrap_or("day");
        let is_minute = matches!(p, "15m" | "30m" | "60m" | "120m");

        // 1. For US/HK indices, Tencent fqkline is fast and reliable for daily/weekly
        let is_tencent_cand = code_clean.starts_with("us") || code_clean.starts_with("hk");
        if is_tencent_cand && !is_minute {
            let tencent_url = tencent::kline_url(code_clean, period);
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
            let (interval, range, merge_120m) = match p {
                "15m" => ("15m", "30d", false),
                "30m" => ("30m", "60d", false),
                "60m" => ("60m", "3mo", false),
                "120m" => ("60m", "3mo", true),
                "week" => ("1wk", "2y", false),
                _ => ("1d", "6mo", false),
            };
            let yahoo_url = format!(
                "https://query1.finance.yahoo.com/v8/finance/chart/{encoded_symbol}?interval={interval}&range={range}"
            );
            let bytes = self.get_global_bytes(&yahoo_url, None).await?;
            let mut bars = parse_yahoo_chart(code_clean, &bytes, is_minute)?;
            if merge_120m {
                bars = merge_60m_to_120m(bars);
            }
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

pub fn merge_60m_to_120m(bars: Vec<KLineBar>) -> Vec<KLineBar> {
    if bars.is_empty() {
        return bars;
    }
    let mut merged = Vec::with_capacity(bars.len() / 2 + 1);
    let mut i = 0;
    while i < bars.len() {
        let day_prefix = if bars[i].date.len() >= 10 {
            &bars[i].date[..10]
        } else {
            ""
        };

        let mut j = i;
        while j < bars.len() {
            let next_prefix = if bars[j].date.len() >= 10 {
                &bars[j].date[..10]
            } else {
                ""
            };
            if next_prefix != day_prefix {
                break;
            }
            j += 1;
        }

        let day_bars = &bars[i..j];
        let mut chunks = day_bars.chunks_exact(2);
        for chunk in chunks.by_ref() {
            let b1 = &chunk[0];
            let b2 = &chunk[1];
            merged.push(KLineBar {
                date: b2.date.clone(),
                open: b1.open,
                close: b2.close,
                high: b1.high.max(b2.high),
                low: b1.low.min(b2.low),
                volume: b1.volume + b2.volume,
                ma5: None,
                ma10: None,
                ma20: None,
                dif: None,
                dea: None,
                macd: None,
                k: None,
                d: None,
                j: None,
            });
        }
        if let Some(last) = chunks.remainder().first() {
            merged.push(last.clone());
        }

        i = j;
    }
    merged
}
