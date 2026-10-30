//! iWenCai-backed whole-market breadth.
//!
//! Split from `fetcher.rs` to stay inside the 300-line budget (AGENTS.md §11).

use super::fetcher::BreadthSnapshot;
use super::wencai::get_iwencai_api_key;
use super::MarketFetcher;

impl MarketFetcher {
    pub async fn fetch_breadth(&self, configured_key: Option<&str>) -> Result<BreadthSnapshot, String> {
        let Some(api_key) = get_iwencai_api_key(configured_key) else {
            let cached = *self.cached_breadth.lock().unwrap_or_else(|e| e.into_inner());
            return Ok(cached);
        };

        let today = crate::market::beijing_now().format("%Y-%m-%d").to_string();

        // Check if circuit breaker is active for today
        if let Some(ref date) = *self.quota_exhausted_date.lock().unwrap_or_else(|e| e.into_inner()) {
            if date == &today {
                let cached = *self.cached_breadth.lock().unwrap_or_else(|e| e.into_inner());
                return Ok(cached);
            }
        }

        // Only query during live trading sessions; outside market hours return cached
        let session = crate::market::session_at(crate::market::beijing_now());
        if !session.is_live() {
            let cached = *self.cached_breadth.lock().unwrap_or_else(|e| e.into_inner());
            return Ok(cached);
        }

        // Throttle queries: market breadth shifts gradually. Refresh at most once every 180s.
        {
            let mut last_guard = self.last_breadth_fetch.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(last) = *last_guard {
                if last.elapsed() < std::time::Duration::from_secs(180) {
                    let cached = *self.cached_breadth.lock().unwrap_or_else(|e| e.into_inner());
                    return Ok(cached);
                }
            }
            *last_guard = Some(std::time::Instant::now());
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
                *self.quota_exhausted_date.lock().unwrap_or_else(|e| e.into_inner()) = Some(today);
                log::info!(target: "NET", "问财接口配额耗尽/鉴权受限 (HTTP {status})，已启动今日熔断并平滑回退基准缓存");
                let cached = *self.cached_breadth.lock().unwrap_or_else(|e| e.into_inner());
                return Ok(cached);
            }
            return Err(format!("问财接口 HTTP {status}: {sample}"));
        }
        if trimmed.is_empty() {
            let cached = *self.cached_breadth.lock().unwrap_or_else(|e| e.into_inner());
            return Ok(cached);
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
            let cached = *self.cached_breadth.lock().unwrap_or_else(|e| e.into_inner());
            return Ok(cached);
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
}
