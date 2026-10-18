use std::time::Duration;

use crate::config::DataSource;
use super::indicators::compute_kline_indicators;
use super::sina;
use super::tencent;
use super::types::*;
use super::yahoo::{global_code_to_yahoo_symbol, parse_yahoo_chart, parse_yahoo_trend};

pub const QUOTE_CHUNK_SIZE: usize = 50;

#[derive(Clone)]
pub struct Fetcher {
    /// Domestic client: configured with `.no_proxy()` to bypass local dev proxies
    /// and connect directly to Chinese domestic CDN endpoints (Tencent, Sina).
    client: reqwest::Client,
    /// Global client: respects system proxy / environment proxy (`HTTP_PROXY`,
    /// `HTTPS_PROXY`, `ALL_PROXY`) so overseas endpoints (Yahoo Finance) can
    /// resolve through the user's proxy without triggering regional 403 blocks.
    global_client: reqwest::Client,
}

impl Fetcher {
    pub fn new() -> Result<Self, FetchError> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(8))
            .connect_timeout(Duration::from_secs(5))
            .user_agent(USER_AGENT)
            .build()
            .map_err(net_err)?;

        let global_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(6))
            .user_agent(USER_AGENT)
            .build()
            .map_err(net_err)?;

        Ok(Self { client, global_client })
    }

    /// One request for any number of codes — both providers accept a code list.
    ///
    /// When there are many codes, requests are chunked in batches of up to 50
    /// to avoid URL query length limits on CDN endpoints, fetched concurrently.
    ///
    /// If the primary provider fails due to a network or endpoint error,
    /// automatically fall back to the secondary provider before returning an error.
    pub async fn fetch_quotes(
        &self,
        source: DataSource,
        codes: &[String],
    ) -> Result<Vec<Quote>, FetchError> {
        if codes.is_empty() {
            return Ok(Vec::new());
        }

        if codes.len() <= QUOTE_CHUNK_SIZE {
            return self.fetch_quotes_chunk(source, codes).await;
        }

        let mut handles = Vec::new();
        for chunk in codes.chunks(QUOTE_CHUNK_SIZE) {
            let fetcher = self.clone();
            let chunk_codes = chunk.to_vec();
            handles.push(tokio::spawn(async move {
                fetcher.fetch_quotes_chunk(source, &chunk_codes).await
            }));
        }

        let mut all_quotes = Vec::with_capacity(codes.len());
        let mut first_err = None;
        for handle in handles {
            match handle.await {
                Ok(Ok(quotes)) => all_quotes.extend(quotes),
                Ok(Err(e)) => {
                    if first_err.is_none() {
                        first_err = Some(e);
                    }
                }
                Err(e) => {
                    if first_err.is_none() {
                        first_err = Some(net_err(e));
                    }
                }
            }
        }

        if all_quotes.is_empty() && first_err.is_some() {
            return Err(first_err.unwrap());
        }

        Ok(all_quotes)
    }

    async fn fetch_quotes_chunk(
        &self,
        source: DataSource,
        codes: &[String],
    ) -> Result<Vec<Quote>, FetchError> {
        match self.fetch_quotes_direct(source, codes).await {
            Ok(quotes) if !quotes.is_empty() => Ok(quotes),
            Ok(quotes) => Ok(quotes),
            Err(primary_err) => {
                let fallback = match source {
                    DataSource::Tencent => DataSource::Sina,
                    DataSource::Sina => DataSource::Tencent,
                };
                match self.fetch_quotes_direct(fallback, codes).await {
                    Ok(quotes) => Ok(quotes),
                    Err(_) => Err(primary_err),
                }
            }
        }
    }

    async fn fetch_quotes_direct(
        &self,
        source: DataSource,
        codes: &[String],
    ) -> Result<Vec<Quote>, FetchError> {
        let (url, referer) = match source {
            DataSource::Tencent => (tencent::quote_url(codes), None),
            DataSource::Sina => (sina::quote_url(codes), Some(sina::REFERER)),
        };
        let bytes = self.get_bytes(&url, referer).await?;
        Ok(match source {
            DataSource::Tencent => tencent::parse_quotes(&decode_gb18030(&bytes)),
            DataSource::Sina => sina::parse_quotes(&decode_gb18030(&bytes)),
        })
    }

    /// Intraday series for a single code. If the primary provider fails,
    /// automatically falls back to the secondary provider.
    pub async fn fetch_trend(
        &self,
        source: DataSource,
        code: &str,
        pre_close: f64,
    ) -> Result<Trend, FetchError> {
        match self.fetch_trend_direct(source, code, pre_close).await {
            Ok(trend) => Ok(trend),
            Err(primary_err) => {
                let fallback = match source {
                    DataSource::Tencent => DataSource::Sina,
                    DataSource::Sina => DataSource::Tencent,
                };
                match self.fetch_trend_direct(fallback, code, pre_close).await {
                    Ok(trend) => Ok(trend),
                    Err(_) => Err(primary_err),
                }
            }
        }
    }

    async fn fetch_trend_direct(
        &self,
        source: DataSource,
        code: &str,
        pre_close: f64,
    ) -> Result<Trend, FetchError> {
        let (url, referer) = match source {
            DataSource::Tencent => (tencent::trend_url(code), None),
            DataSource::Sina => (sina::trend_url(code), Some(sina::REFERER)),
        };
        let bytes = self.get_bytes(&url, referer).await?;
        let mut trend = match source {
            DataSource::Tencent => tencent::parse_trend(code, &bytes)?,
            DataSource::Sina => sina::parse_trend(code, &bytes)?,
        };
        if trend.pre_close <= 0.0 {
            trend.pre_close = pre_close;
        }
        Ok(trend)
    }

    async fn get_bytes(&self, url: &str, referer: Option<&str>) -> Result<Vec<u8>, FetchError> {
        let mut last_err = None;
        for attempt in 0..2 {
            if attempt > 0 {
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
            let mut req = self.client.get(url);
            if let Some(r) = referer {
                req = req.header(reqwest::header::REFERER, r);
            }
            match req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if !status.is_success() {
                        last_err = Some(FetchError {
                            kind: FetchErrorKind::Network,
                            message: format!("HTTP {status}"),
                        });
                        continue;
                    }
                    match resp.bytes().await {
                        Ok(b) => return Ok(b.to_vec()),
                        Err(e) => {
                            last_err = Some(net_err(e));
                        }
                    }
                }
                Err(e) => {
                    last_err = Some(net_err(e));
                }
            }
        }
        Err(last_err.unwrap_or_else(|| net_err("网络请求失败")))
    }

    async fn get_global_bytes(&self, url: &str, referer: Option<&str>) -> Result<Vec<u8>, FetchError> {
        let mut last_err = None;
        for attempt in 0..2 {
            if attempt > 0 {
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
            let mut req = self.global_client.get(url)
                .header(reqwest::header::ACCEPT, "*/*")
                .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7");
            if let Some(r) = referer {
                req = req.header(reqwest::header::REFERER, r);
            }
            match req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if !status.is_success() {
                        last_err = Some(FetchError {
                            kind: FetchErrorKind::Network,
                            message: format!("HTTP {status}"),
                        });
                        continue;
                    }
                    match resp.bytes().await {
                        Ok(b) => return Ok(b.to_vec()),
                        Err(e) => {
                            last_err = Some(net_err(e));
                        }
                    }
                }
                Err(e) => {
                    last_err = Some(net_err(e));
                }
            }
        }
        Err(last_err.unwrap_or_else(|| net_err("全球网络请求失败")))
    }

    /// Fetch daily candlestick series with forward adjustment (QFQ) and moving averages.
    ///
    /// Tries Tencent's forward-adjusted endpoint first, then falls back to Sina if unavailable.
    pub async fn fetch_kline(&self, code: &str) -> Result<KLineData, FetchError> {
        let tencent_url = tencent::kline_url(code);
        match self.get_bytes(&tencent_url, None).await {
            Ok(bytes) => {
                if let Ok(bars) = tencent::parse_kline(code, &bytes) {
                    return Ok(compute_kline_indicators(code, bars));
                }
            }
            Err(_) => {}
        }

        let sina_url = sina::kline_url(code);
        let bytes = self.get_bytes(&sina_url, Some(sina::REFERER)).await?;
        let bars = sina::parse_kline(code, &bytes)?;
        Ok(compute_kline_indicators(code, bars))
    }

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
            let encoded_symbol = if yahoo_symbol.starts_with('^') {
                format!("%5E{}", &yahoo_symbol[1..])
            } else {
                yahoo_symbol.to_string()
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
            let encoded_symbol = if yahoo_symbol.starts_with('^') {
                format!("%5E{}", &yahoo_symbol[1..])
            } else {
                yahoo_symbol.to_string()
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
