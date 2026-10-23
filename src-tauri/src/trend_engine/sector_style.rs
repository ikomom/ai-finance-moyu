//! Sector Style and Macro Beta Routing.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SectorStyle {
    /// 四大行（工农中建）及特大国有行、核心高息中字头
    DefensiveBank,
    /// 半导体、芯片、算力、低空经济、新能源等双创高 Beta 资产
    GrowthTech,
    /// 证券、互金、有色周期
    CyclicalBroker,
    /// 其他常规题材与行业
    General,
}

impl SectorStyle {
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::DefensiveBank => "defensive_bank",
            Self::GrowthTech => "growth_tech",
            Self::CyclicalBroker => "cyclical_broker",
            Self::General => "general",
        }
    }

    pub fn label_zh(&self) -> &'static str {
        match self {
            Self::DefensiveBank => "避险对冲资产 (国有大行)",
            Self::GrowthTech => "双创科技成长 (高Beta)",
            Self::CyclicalBroker => "顺周期牛市旗手",
            Self::General => "行业常规轮动",
        }
    }
}

/// Classify stock sector style based on symbol and industry sector name.
pub fn classify_sector_style(code: &str, sector_name: &str) -> SectorStyle {
    let bare_code = code.trim_start_matches(|c: char| c.is_alphabetic());
    let is_major_bank = matches!(
        bare_code,
        "601398" // 工商银行
            | "601288" // 农业银行
            | "601988" // 中国银行
            | "601939" // 建设银行
            | "601328" // 交通银行
            | "601658" // 邮储银行
            | "600036" // 招商银行
            | "601166" // 兴业银行
            | "600000" // 浦发银行
    );

    if is_major_bank || (sector_name.contains("银行") && sector_name.contains("国有")) {
        return SectorStyle::DefensiveBank;
    }

    let tech_keywords = [
        "半导体", "芯片", "电子", "计算机", "软件", "通信",
        "算力", "人工智能", "机器人", "低空", "光刻", "光模块",
    ];
    if tech_keywords.iter().any(|&kw| sector_name.contains(kw)) {
        return SectorStyle::GrowthTech;
    }

    let cyclical_keywords = ["证券", "保险", "多元金融", "互联网金融", "有色金属", "贵金属"];
    if cyclical_keywords.iter().any(|&kw| sector_name.contains(kw)) {
        return SectorStyle::CyclicalBroker;
    }

    SectorStyle::General
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_sector_style() {
        assert_eq!(classify_sector_style("sh601398", "银行"), SectorStyle::DefensiveBank);
        assert_eq!(SectorStyle::DefensiveBank.as_str(), "defensive_bank");
        assert_eq!(SectorStyle::DefensiveBank.label_zh(), "避险对冲资产 (国有大行)");
        assert_eq!(classify_sector_style("sh601288", "国有大行"), SectorStyle::DefensiveBank);
        assert_eq!(classify_sector_style("sh600036", "银行"), SectorStyle::DefensiveBank);
        assert_eq!(classify_sector_style("sh688981", "半导体"), SectorStyle::GrowthTech);
        assert_eq!(classify_sector_style("sz300059", "互联网金融"), SectorStyle::CyclicalBroker);
        assert_eq!(classify_sector_style("sh600030", "证券"), SectorStyle::CyclicalBroker);
        assert_eq!(classify_sector_style("sh600519", "白酒"), SectorStyle::General);
        assert_eq!(classify_sector_style("sh600011", "电力"), SectorStyle::General);
    }
}
