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
