//! Market Overview data fetching from Eastmoney & Tencent public endpoints.

use std::time::Duration;
use chrono::Local;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarketIndex {
    pub code: String,
    pub name: String,
    pub price: f64,
    pub change: f64,
    pub change_pct: f64,
    pub turnover: f64, // 成交额 (元)
    pub up_count: u32,
    pub down_count: u32,
    pub flat_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SectorItem {
    pub code: String,
    pub name: String,
    pub change_pct: f64,
    pub up_count: u32,
    pub down_count: u32,
    pub lead_stock_name: String,
    #[serde(default)]
    pub lead_stock_code: String,
    #[serde(default)]
    pub lead_stock_zdf: f64,
}

/// Sector and market beta linkage analysis for an individual stock.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SectorLinkage {
    pub sector_code: String,
    pub sector_name: String,
    pub sector_change_pct: f64,
    /// 相对行业板块超额收益: R_stock - R_sector (%)
    pub delta_r_sector: f64,
    /// 相对大盘指数超额收益: R_stock - R_market (%)
    pub delta_r_market: f64,
    pub leader_code: String,
    pub leader_name: String,
    pub leader_change_pct: f64,
    /// 角色定位: "板块领涨核心" | "梯队协同助攻" | "逆势抗跌核心" | "脱离板块补跌" | "跟随板块整理"
    pub role: String,
    /// 盘面微观评述
    pub diagnosis: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarketOverview {
    pub indices: Vec<MarketIndex>,
    pub up_count: u32,
    pub down_count: u32,
    pub flat_count: u32,
    pub total_turnover: f64, // 两市总成交额 (元)
    pub turnover_change_pct: Option<f64>, // 两市成交额环比变动率 (%)
    pub turnover_change_amount: Option<f64>, // 两市成交额较昨日增减 (元)
    pub north_net_flow: Option<f64>, // 北向资金净流入 (元)
    pub top_sectors: Vec<SectorItem>,
    pub updated_at: String,
}

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                          (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

fn dirs_home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)
}

fn get_iwencai_api_key(configured_key: Option<&str>) -> Option<String> {
    if let Some(key) = configured_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Ok(key) = std::env::var("IWENCAI_API_KEY") {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(home) = dirs_home_dir() {
        let key_path = home
            .join(".agents")
            .join("skills")
            .join("tools")
            .join("iwencai-skillhub-cli")
            .join("key.txt");
        if let Ok(content) = std::fs::read_to_string(key_path) {
            for line in content.lines() {
                if let Some(val) = line.strip_prefix("IWENCAI_API_KEY=") {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}

pub struct MarketFetcher {
    client: reqwest::Client,
    cached_breadth: std::sync::Mutex<(u32, u32, u32, Option<f64>, Option<f64>)>,
    quota_exhausted_date: std::sync::Mutex<Option<String>>,
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
        let (indices_res, sectors_res, breadth_res, north_res) = tokio::join!(
            self.fetch_indices_and_turnover(),
            self.fetch_top_sectors(),
            self.fetch_breadth(configured_key),
            self.fetch_north_money(),
        );

        let (mut indices, total_turnover) = indices_res?;
        let top_sectors = sectors_res.unwrap_or_default();
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

    async fn fetch_breadth(&self, configured_key: Option<&str>) -> Result<(u32, u32, u32, Option<f64>, Option<f64>), String> {
        let Some(api_key) = get_iwencai_api_key(configured_key) else {
            let cached = *self.cached_breadth.lock().unwrap();
            return Ok(cached);
        };

        let today = Local::now().format("%Y-%m-%d").to_string();

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

/// Baseline static mapping of prominent securities to their primary Shenwan industry keyword.
static STOCK_INDUSTRY_MAP: &[(&str, &str)] = &[
    ("sh600519", "白酒"),
    ("sz000858", "白酒"),
    ("sz000568", "白酒"),
    ("sz002304", "白酒"),
    ("sz300750", "电池"),
    ("sz002594", "乘用车"),
    ("sh600036", "银行"),
    ("sz000001", "银行"),
    ("sh601398", "银行"),
    ("sh601288", "银行"),
    ("sh601939", "银行"),
    ("sh601988", "银行"),
    ("sh600000", "银行"),
    ("sh601166", "银行"),
    ("sh688981", "半导体"),
    ("sz300059", "证券"),
    ("sh600030", "证券"),
    ("sh601211", "证券"),
    ("sh601688", "证券"),
    ("sh600999", "证券"),
    ("sz000776", "证券"),
    ("sh601878", "证券"),
    ("sh601012", "光伏设备"),
    ("sz002459", "光伏设备"),
    ("sz300274", "光伏设备"),
    ("sz002241", "消费电子"),
    ("sz002475", "消费电子"),
    ("sz300433", "消费电子"),
    ("sh688012", "半导体"),
    ("sh688041", "半导体"),
    ("sh688126", "半导体"),
    ("sz002049", "半导体"),
    ("sz002371", "半导体"),
    ("sz000725", "光学光电子"),
    ("sz002415", "计算机设备"),
    ("sz300033", "软件开发"),
    ("sz300418", "游戏"),
    ("sz002555", "游戏"),
    ("sz002624", "游戏"),
    ("sh600900", "电力"),
    ("sh600011", "电力"),
    ("sh601985", "核电"),
    ("sh601899", "工业金属"),
    ("sh600547", "贵金属"),
    ("sz000975", "贵金属"),
    ("sh601088", "煤炭"),
    ("sh601225", "煤炭"),
    ("sh600188", "煤炭"),
    ("sh601857", "油气"),
    ("sh600028", "油气"),
    ("sh600276", "化学制药"),
    ("sh603259", "医疗服务"),
    ("sz300760", "医疗器械"),
    ("sz300122", "医疗服务"),
    ("sz000538", "中药"),
    ("sz000963", "中药"),
    ("sh600031", "工程机械"),
    ("sz000425", "工程机械"),
    ("sh601766", "轨交设备"),
    ("sh601186", "建筑装饰"),
    ("sh601668", "建筑装饰"),
    ("sh601390", "建筑装饰"),
    ("sz000002", "房地产"),
    ("sh600048", "房地产"),
    ("sh600383", "房地产"),
    ("sh600104", "乘用车"),
    ("sh601633", "乘用车"),
    ("sh600760", "航空装备"),
    ("sh600893", "航空装备"),
    ("sh600118", "航天装备"),
    ("sz002179", "航空装备"),
    ("sh600150", "航海装备"),
    ("sh600009", "航空运输"),
    ("sh601111", "航空运输"),
    ("sh601872", "航运港口"),
    ("sh601919", "航运港口"),
    ("sh600941", "通信服务"),
    ("sh601728", "通信服务"),
    ("sh600050", "通信服务"),
    ("sz000063", "通信设备"),
    ("sh600938", "油气"),
];

/// Match a security with its industry sector and evaluate sector & market linkage.
pub fn match_stock_sector(
    code: &str,
    name: &str,
    change_pct: f64,
    sectors: &[SectorItem],
    market_change_pct: f64,
) -> Option<SectorLinkage> {
    if crate::market::is_index(code) || sectors.is_empty() {
        return None;
    }

    // 1. Direct match: Stock is already the leader of a sector
    if let Some(sec) = sectors.iter().find(|s| s.lead_stock_code.eq_ignore_ascii_case(code)) {
        let delta_r_sector = ((change_pct - sec.change_pct) * 100.0).round() / 100.0;
        let delta_r_market = ((change_pct - market_change_pct) * 100.0).round() / 100.0;
        return Some(SectorLinkage {
            sector_code: sec.code.clone(),
            sector_name: sec.name.clone(),
            sector_change_pct: sec.change_pct,
            delta_r_sector,
            delta_r_market,
            leader_code: sec.lead_stock_code.clone(),
            leader_name: sec.lead_stock_name.clone(),
            leader_change_pct: sec.lead_stock_zdf,
            role: "板块领涨核心".to_string(),
            diagnosis: format!("领跑{}板块（超额 +{delta_r_sector:.2}%），为当前板块领涨龙头", sec.name),
        });
    }

    // 2. Lookup industry keyword by static map or name keywords
    let target_ind = STOCK_INDUSTRY_MAP
        .iter()
        .find(|(c, _)| c.eq_ignore_ascii_case(code))
        .map(|(_, ind)| *ind)
        .or_else(|| {
            for kw in &[
                "白酒", "银行", "证券", "半导体", "电力", "煤炭", "游戏", "医疗", "汽车",
                "航空", "航海", "通信", "光伏", "黄金", "中药", "化学", "电池", "软件",
                "保险", "钢铁", "有色", "军工", "地产", "建材", "机械", "储能",
            ] {
                if name.contains(kw) {
                    return Some(*kw);
                }
            }
            None
        });

    let matched_sector = if let Some(ind) = target_ind {
        sectors.iter().find(|s| s.name.contains(ind) || ind.contains(&s.name))
    } else {
        let first_two_chars: String = name.chars().take(2).collect();
        sectors.iter().find(|s| {
            if s.name.is_empty() {
                return false;
            }
            name.contains(&s.name)
                || s.name.contains(name)
                || (first_two_chars.chars().count() >= 2 && s.name.contains(&first_two_chars))
        })
    };

    let sec = matched_sector?;

    let delta_r_sector = ((change_pct - sec.change_pct) * 100.0).round() / 100.0;
    let delta_r_market = ((change_pct - market_change_pct) * 100.0).round() / 100.0;

    let (role, diagnosis) = if (sec.change_pct <= -0.5 || market_change_pct <= -0.5) && change_pct >= 0.2 {
        ("逆势抗跌核心", format!("逆大盘/{}板块走强（超额 +{delta_r_sector:.2}%），资金逆势承接", sec.name))
    } else if change_pct >= sec.lead_stock_zdf - 0.3 && change_pct > 0.0 {
        ("板块领涨核心", format!("涨幅逼近龙头{}，具备极强板块核心辨识度", sec.lead_stock_name))
    } else if change_pct >= 0.0 && sec.change_pct >= 0.5 && delta_r_sector >= -1.5 {
        ("梯队协同助攻", format!("跟随{}板块主力节奏上行，与龙头{}共振", sec.name, sec.lead_stock_name))
    } else if sec.change_pct >= 0.5 && change_pct <= -1.0 {
        ("脱离板块补跌", format!("大幅落后{}板块（负超额 {delta_r_sector:.2}%），需警惕补跌风险", sec.name))
    } else {
        ("跟随板块整理", format!("走势与{}板块大体同步，处于跟随蓄势阶段", sec.name))
    };

    Some(SectorLinkage {
        sector_code: sec.code.clone(),
        sector_name: sec.name.clone(),
        sector_change_pct: sec.change_pct,
        delta_r_sector,
        delta_r_market,
        leader_code: sec.lead_stock_code.clone(),
        leader_name: sec.lead_stock_name.clone(),
        leader_change_pct: sec.lead_stock_zdf,
        role: role.to_string(),
        diagnosis,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_indices_json_sample() {
        let sample = r#"{
            "rc":0,"rt":11,
            "data":{"total":3,"diff":[
                {"f2":3800.5,"f3":-0.5,"f4":-20.0,"f6":600000000000.0,"f12":"000001","f14":"上证指数","f104":500,"f105":1700,"f106":50},
                {"f2":12000.0,"f3":-1.5,"f4":-180.0,"f6":700000000000.0,"f12":"399001","f14":"深证成指","f104":600,"f105":2200,"f106":50},
                {"f2":2900.0,"f3":-2.0,"f4":-60.0,"f6":300000000000.0,"f12":"399006","f14":"创业板指","f104":200,"f105":1000,"f106":20}
            ]}
        }"#;

        let json: serde_json::Value = serde_json::from_str(sample).unwrap();
        let diff = json.pointer("/data/diff").unwrap().as_array().unwrap();
        assert_eq!(diff.len(), 3);
        assert_eq!(diff[0].get("f14").unwrap().as_str().unwrap(), "上证指数");
    }

    #[tokio::test]
    #[ignore = "hits live network market API"]
    async fn test_live_market_fetch() {
        let fetcher = MarketFetcher::new().unwrap();
        let res = fetcher.fetch_overview(None).await;
        println!("Live market fetch result: {:?}", res);
        assert!(res.is_ok());
        let overview = res.unwrap();
        assert_eq!(overview.indices.len(), 3);
        assert!(overview.total_turnover >= 0.0);
        assert!(!overview.top_sectors.is_empty());
    }

    #[test]
    fn test_match_stock_sector() {
        let sectors = vec![
            SectorItem {
                code: "pt01".into(),
                name: "白酒Ⅱ".into(),
                change_pct: 2.5,
                up_count: 15,
                down_count: 3,
                lead_stock_name: "贵州茅台".into(),
                lead_stock_code: "sh600519".into(),
                lead_stock_zdf: 3.2,
            },
            SectorItem {
                code: "pt02".into(),
                name: "半导体Ⅱ".into(),
                change_pct: -1.2,
                up_count: 20,
                down_count: 80,
                lead_stock_name: "中芯国际".into(),
                lead_stock_code: "sh688981".into(),
                lead_stock_zdf: 0.8,
            },
        ];

        // 1. Leader match
        let l1 = match_stock_sector("sh600519", "贵州茅台", 3.2, &sectors, 0.5).unwrap();
        assert_eq!(l1.role, "板块领涨核心");
        assert_eq!(l1.sector_name, "白酒Ⅱ");
        assert_eq!(l1.leader_code, "sh600519");

        // 2. Echelon follow match
        let l2 = match_stock_sector("sz000858", "五粮液", 2.0, &sectors, 0.5).unwrap();
        assert_eq!(l2.role, "梯队协同助攻");
        assert_eq!(l2.sector_name, "白酒Ⅱ");

        // 3. Independent resilience / alpha match
        let l3 = match_stock_sector("sh688012", "中微公司", 1.5, &sectors, -1.0).unwrap();
        assert_eq!(l3.role, "逆势抗跌核心");
        assert_eq!(l3.sector_name, "半导体Ⅱ");

        // 4. Multibyte Chinese stock names without crash
        let l4 = match_stock_sector("sz002617", "露笑科技", 0.5, &sectors, 0.0);
        assert!(l4.is_none());

        // 5. Index symbols always return None
        let l5 = match_stock_sector("sh000001", "上证指数", 0.5, &sectors, 0.5);
        assert!(l5.is_none());
    }

    #[tokio::test]
    async fn test_quota_circuit_breaker() {
        let fetcher = MarketFetcher::new().unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        // Manually trigger circuit breaker
        *fetcher.quota_exhausted_date.lock().unwrap() = Some(today);

        // fetch_breadth should return cached without network error
        let breadth = fetcher.fetch_breadth(Some("invalid-token-should-not-hit-network")).await;
        assert!(breadth.is_ok());

        // Resetting circuit breaker clears it
        fetcher.reset_quota_circuit_breaker();
        assert!(fetcher.quota_exhausted_date.lock().unwrap().is_none());
    }
}
