//! Famous hot money / institutional seat dictionary for Chinese A-share markets.
//!
//! Maps brokerage branch names to well-known trader personas.

/// Match a brokerage branch name to a famous trader label.
pub fn match_famous_trader(branch_name: &str) -> Option<&'static str> {
    let name = branch_name.trim();

    if name.contains("机构专用") {
        return Some("机构专用");
    }
    if name.contains("深股通") || name.contains("沪股通") || name.contains("香港上海汇丰") {
        return Some("北向外资");
    }

    // Top famous traders & representative branches
    if name.contains("西安朱雀大街") {
        return Some("方新侠");
    }
    if name.contains("上海江苏路") || name.contains("杭州延安路") || name.contains("上海毛家弄") {
        return Some("章盟主");
    }
    if name.contains("北京呼家楼") || name.contains("北京东城分公司") {
        return Some("呼家楼");
    }
    if name.contains("绍兴") && (name.contains("银河") || name.contains("解放南路")) {
        return Some("赵老哥");
    }
    if name.contains("南京太平南路") {
        return Some("作手新一");
    }
    if name.contains("大连黄河路") {
        return Some("陈小群");
    }
    if name.contains("福州六一中路") {
        return Some("六一路");
    }
    if name.contains("上海宛平南路") || name.contains("上海茅台路") || name.contains("宁波大庆南路") {
        return Some("炒股养家");
    }
    if name.contains("厦门湖西路") {
        return Some("东北猛男");
    }
    if name.contains("杭州上塘路") {
        return Some("上塘路");
    }
    if name.contains("上海溧阳路") {
        return Some("孙哥");
    }
    if name.contains("宁波桑田路") {
        return Some("桑田路");
    }
    if name.contains("深圳益田路") {
        return Some("益田路");
    }
    if name.contains("华泰证券股份有限公司总部")
        || name.contains("中金公司上海分公司")
        || name.contains("中金公司北京建国门外大街")
    {
        return Some("量化打板");
    }

    None
}

/// Expand a trader pseudonym or branch alias into search keywords/branch fragments.
pub fn resolve_branch_pattern(input: &str) -> Vec<String> {
    let clean = input.trim();
    if clean.is_empty() {
        return vec![];
    }
    match clean {
        "方新侠" => vec![
            "中信证券股份有限公司西安朱雀大街证券营业部".into(),
            "西安朱雀大街".into(),
        ],
        "章盟主" => vec![
            "国泰君安证券股份有限公司上海江苏路证券营业部".into(),
            "国泰君安证券股份有限公司杭州延安路证券营业部".into(),
            "海通证券股份有限公司上海毛家弄证券营业部".into(),
        ],
        "呼家楼" => vec![
            "中信建投证券股份有限公司北京东城分公司".into(),
            "中信证券股份有限公司北京呼家楼证券营业部".into(),
        ],
        "赵老哥" => vec![
            "中国银河证券股份有限公司绍兴证券营业部".into(),
            "浙商证券股份有限公司绍兴解放南路证券营业部".into(),
        ],
        "作手新一" => vec![
            "国泰君安证券股份有限公司南京太平南路证券营业部".into(),
        ],
        "陈小群" => vec![
            "银泰证券有限责任公司大连黄河路证券营业部".into(),
            "中国银河证券股份有限公司大连黄河路证券营业部".into(),
        ],
        "六一路" => vec![
            "招商证券股份有限公司福州六一中路证券营业部".into(),
            "华泰证券股份有限公司福州六一中路证券营业部".into(),
        ],
        "炒股养家" => vec![
            "华鑫证券有限责任公司上海宛平南路证券营业部".into(),
            "华鑫证券有限责任公司上海茅台路证券营业部".into(),
            "华鑫证券有限责任公司宁波大庆南路证券营业部".into(),
        ],
        "上塘路" => vec![
            "财通证券股份有限公司杭州上塘路证券营业部".into(),
        ],
        "机构专用" => vec!["机构专用".into()],
        "北向外资" => vec!["深股通专用".into(), "沪股通专用".into()],
        other => vec![other.to_string()],
    }
}
