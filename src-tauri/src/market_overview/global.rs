//! Global index fetching and parsing.
//!
//! Split from `fetcher.rs` to stay inside the 300-line budget (AGENTS.md §11).

use super::types::MarketIndex;
use encoding_rs;
use super::MarketFetcher;

impl MarketFetcher {
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
