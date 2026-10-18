//! Sector and market beta linkage analysis: mapping individual stocks to Shenwan industries
//! and evaluating relative alpha against the benchmark.

use super::types::{SectorItem, SectorLinkage};

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
