//! Adaptive tiered threshold generation and direction evaluation.

/// Generate adaptive tiered thresholds for a security based on its market/board and user override.
pub fn adaptive_threshold_tiers(code: &str, user_threshold: Option<f64>) -> Vec<f64> {
    if crate::market::is_index(code) {
        // 大盘指数始终自适应为高敏感度梯度：1.0%, 1.5%, 2.0%, 3.0%
        return if let Some(t) = user_threshold.filter(|&t| (t - 3.0).abs() > 0.001) {
            let b = t.abs().max(0.1);
            vec![b, (b * 1.5).round().max(b + 0.5), (b * 2.0).round().max(b + 1.0)]
        } else {
            vec![1.0, 1.5, 2.0, 3.0]
        };
    }

    if let Some(user_t) = user_threshold.filter(|&t| (t - 3.0).abs() > 0.001) {
        let b = user_t.abs().max(0.1);
        let t1 = (b * 10.0).round() / 10.0;
        let t2 = ((b * 1.6) * 10.0).round() / 10.0;
        let t3 = ((b * 2.3) * 10.0).round() / 10.0;
        let mut list = vec![t1];
        if t2 > t1 && t2 <= 50.0 {
            list.push(t2);
        }
        if t3 > t2 && t3 <= 50.0 {
            list.push(t3);
        }
        return list;
    }

    let clean = code.trim().to_lowercase();
    let num = clean.trim_start_matches(|c: char| c.is_alphabetic());
    if clean.starts_with("bj") || num.starts_with('8') || num.starts_with('4') || num.starts_with("920") {
        // 北交所 30cm: 6.0%, 10.0%, 15.0%, 20.0%
        vec![6.0, 10.0, 15.0, 20.0]
    } else if clean.starts_with("sz300") || clean.starts_with("sz301") || clean.starts_with("sh688")
        || num.starts_with("300") || num.starts_with("301") || num.starts_with("688") {
        // 创业板 / 科创板 20cm: 4.0%, 7.0%, 10.0%, 15.0%
        vec![4.0, 7.0, 10.0, 15.0]
    } else {
        // 主板标准 10cm: 3.0%, 5.0%, 7.0%, 9.0%
        vec![3.0, 5.0, 7.0, 9.0]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adaptive_threshold_tiers() {
        // Index
        assert_eq!(adaptive_threshold_tiers("sh000001", None), vec![1.0, 1.5, 2.0, 3.0]);
        assert_eq!(adaptive_threshold_tiers("sh000001", Some(3.0)), vec![1.0, 1.5, 2.0, 3.0]);
        assert_eq!(adaptive_threshold_tiers("sz399001", None), vec![1.0, 1.5, 2.0, 3.0]);

        // 20cm ChiNext & STAR
        assert_eq!(adaptive_threshold_tiers("sz300750", None), vec![4.0, 7.0, 10.0, 15.0]);
        assert_eq!(adaptive_threshold_tiers("sh688981", None), vec![4.0, 7.0, 10.0, 15.0]);

        // 30cm BSE
        assert_eq!(adaptive_threshold_tiers("bj832000", None), vec![6.0, 10.0, 15.0, 20.0]);

        // 10cm Main board standard
        assert_eq!(adaptive_threshold_tiers("sh600519", None), vec![3.0, 5.0, 7.0, 9.0]);
        assert_eq!(adaptive_threshold_tiers("sh600519", Some(3.0)), vec![3.0, 5.0, 7.0, 9.0]);
        assert_eq!(adaptive_threshold_tiers("sz000001", None), vec![3.0, 5.0, 7.0, 9.0]);

        // User explicit override
        assert_eq!(adaptive_threshold_tiers("sh600519", Some(5.0)), vec![5.0, 8.0, 11.5]);
    }
}
