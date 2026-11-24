//! Sector and market beta linkage analysis: mapping individual stocks to Shenwan industries
//! and evaluating relative alpha against the benchmark.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

use super::types::{SectorItem, SectorLinkage, SectorRankTag};

/// Build multi-concept sector tags for an individual stock.
pub fn build_sector_tags(
    code: &str,
    name: &str,
    change_pct: f64,
    sectors: &[SectorItem],
    market_change_pct: f64,
) -> Vec<SectorRankTag> {
    let concepts = super::concepts_db::lookup_stock_concepts(code, name);
    let mut tags = Vec::new();

    for concept in concepts {
        let matched = sectors.iter().enumerate().find(|(_, s)| {
            s.name.contains(concept) || concept.contains(&s.name)
        });

        if let Some((idx, sec)) = matched {
            let rank = (idx + 1) as u32;
            let delta_r = ((change_pct - sec.change_pct) * 100.0).round() / 100.0;
            let stage = if (rank <= 5 && sec.change_pct >= 2.0)
                || (sec.lead_stock_zdf >= 9.5 && sec.change_pct >= 1.5)
            {
                "surging"
            } else if sec.change_pct >= -0.5
                && sec.change_pct <= 1.8
                && (sec.change_pct - market_change_pct) >= 0.5
            {
                "accumulating"
            } else if rank >= 60 && sec.change_pct <= -1.5 {
                "cooling"
            } else {
                "normal"
            };
            let role = if change_pct >= sec.lead_stock_zdf - 0.3 && change_pct > 0.0 {
                "领涨核心"
            } else if change_pct >= 0.0 && sec.change_pct >= 0.5 {
                "协同助攻"
            } else if (sec.change_pct <= -0.5 || market_change_pct <= -0.5) && change_pct >= 0.2 {
                "逆势抗跌"
            } else if sec.change_pct >= 0.5 && change_pct <= -1.0 {
                "脱离补跌"
            } else {
                "跟随整理"
            };

            tags.push(SectorRankTag {
                name: concept.to_string(),
                code: sec.code.clone(),
                rank: Some(rank),
                change_pct: sec.change_pct,
                delta_r,
                leader_name: if sec.lead_stock_name.is_empty() {
                    None
                } else {
                    Some(sec.lead_stock_name.clone())
                },
                leader_change_pct: if sec.lead_stock_name.is_empty() {
                    None
                } else {
                    Some(sec.lead_stock_zdf)
                },
                role: role.to_string(),
                stage: stage.to_string(),
            });
        } else {
            tags.push(SectorRankTag {
                name: concept.to_string(),
                code: String::new(),
                rank: None,
                change_pct: 0.0,
                delta_r: change_pct,
                leader_name: None,
                leader_change_pct: None,
                role: "常规轮动".to_string(),
                stage: "normal".to_string(),
            });
        }
    }

    // Sort: surging (0) -> accumulating (1) -> normal (2) -> cooling (3), then by rank
    tags.sort_by_key(|t| match t.stage.as_str() {
        "surging" => (0, t.rank.unwrap_or(999)),
        "accumulating" => (1, t.rank.unwrap_or(999)),
        "normal" => (2, t.rank.unwrap_or(999)),
        "cooling" => (3, t.rank.unwrap_or(999)),
        _ => (4, 999),
    });

    tags
}

/// Match a security with its industry sector and evaluate sector & market linkage.
pub fn match_stock_sector(
    code: &str,
    name: &str,
    change_pct: f64,
    sectors: &[SectorItem],
    market_change_pct: f64,
) -> Option<SectorLinkage> {
    if crate::market::is_index(code) {
        return None;
    }

    let mut sector_tags = build_sector_tags(code, name, change_pct, sectors, market_change_pct);

    // 1. Direct match: Stock is already the leader of a sector
    if let Some(sec) = sectors.iter().find(|s| s.lead_stock_code.eq_ignore_ascii_case(code)) {
        let delta_r_sector = ((change_pct - sec.change_pct) * 100.0).round() / 100.0;
        let delta_r_market = ((change_pct - market_change_pct) * 100.0).round() / 100.0;
        if !sector_tags.iter().any(|t| t.name == sec.name) {
            let rank = sectors.iter().position(|s| s.code == sec.code).map(|i| (i + 1) as u32);
            sector_tags.insert(
                0,
                SectorRankTag {
                    name: sec.name.clone(),
                    code: sec.code.clone(),
                    rank,
                    change_pct: sec.change_pct,
                    delta_r: delta_r_sector,
                    leader_name: Some(sec.lead_stock_name.clone()),
                    leader_change_pct: Some(sec.lead_stock_zdf),
                    role: "领涨龙头".to_string(),
                    stage: if sec.change_pct >= 2.0 {
                        "surging".to_string()
                    } else {
                        "normal".to_string()
                    },
                },
            );
        }
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
            sectors: sector_tags,
        });
    }

    // 2. Lookup industry/concept: first try matched sector_tags
    let best_tag_sector = sector_tags
        .iter()
        .find(|t| !t.code.is_empty())
        .and_then(|t| sectors.iter().find(|s| s.code == t.code));

    let matched_sector = if let Some(sec) = best_tag_sector {
        Some(sec)
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

    let (sec_code, sec_name, sec_pct, leader_c, leader_n, leader_zdf, is_exact) =
        if let Some(sec) = matched_sector {
            (
                sec.code.clone(),
                sec.name.clone(),
                sec.change_pct,
                sec.lead_stock_code.clone(),
                sec.lead_stock_name.clone(),
                sec.lead_stock_zdf,
                true,
            )
        } else if !sector_tags.is_empty() {
            let primary = &sector_tags[0];
            (
                format!("ind_{}", primary.name),
                primary.name.clone(),
                0.0,
                String::new(),
                String::new(),
                0.0,
                false,
            )
        } else {
            return None;
        };

    let delta_r_sector = ((change_pct - sec_pct) * 100.0).round() / 100.0;
    let delta_r_market = ((change_pct - market_change_pct) * 100.0).round() / 100.0;

    let (role, diagnosis) = if !is_exact {
        if crate::trend_engine::classify_sector_style(code, &sec_name)
            == crate::trend_engine::SectorStyle::DefensiveBank
        {
            (
                "权重防御配置",
                format!("归属{sec_name}行业（大盘避险防御），未入领涨榜，受成长风格分流"),
            )
        } else {
            (
                "行业常规轮动",
                format!("归属{sec_name}行业，今日资金关注度有限，暂处跟随蓄势态"),
            )
        }
    } else if (sec_pct <= -0.5 || market_change_pct <= -0.5) && change_pct >= 0.2 {
        (
            "逆势抗跌核心",
            format!("逆大盘/{sec_name}板块走强（超额 +{delta_r_sector:.2}%），资金逆势承接"),
        )
    } else if change_pct >= leader_zdf - 0.3 && change_pct > 0.0 {
        (
            "板块领涨核心",
            format!("涨幅逼近龙头{leader_n}，具备极强板块核心辨识度"),
        )
    } else if change_pct >= 0.0 && sec_pct >= 0.5 && delta_r_sector >= -1.5 {
        (
            "梯队协同助攻",
            format!("跟随{sec_name}板块主力节奏上行，与龙头{leader_n}共振"),
        )
    } else if sec_pct >= 0.5 && change_pct <= -1.0 {
        (
            "脱离板块补跌",
            format!("大幅落后{sec_name}板块（负超额 {delta_r_sector:.2}%），需警惕补跌风险"),
        )
    } else {
        (
            "跟随板块整理",
            format!("走势与{sec_name}板块大体同步，处于跟随蓄势阶段"),
        )
    };

    Some(SectorLinkage {
        sector_code: sec_code,
        sector_name: sec_name,
        sector_change_pct: sec_pct,
        delta_r_sector,
        delta_r_market,
        leader_code: leader_c,
        leader_name: leader_n,
        leader_change_pct: leader_zdf,
        role: role.to_string(),
        diagnosis,
        sectors: sector_tags,
    })
}
