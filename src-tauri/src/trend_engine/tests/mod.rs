//! Unit tests for `trend_engine`.
//!
//! Kept in their own file so the implementation stays inside the 300-line
//! budget mandated by AGENTS.md §11.

    use super::*;
    use crate::quote::{Quote, Trend};
    use crate::quote::TrendPoint;

    fn mock_quote(code: &str, price: f64, pre_close: f64, change_pct: f64) -> Quote {
        Quote {
            code: code.into(),
            name: "测试标的".into(),
            price,
            pre_close,
            open: pre_close,
            high: price.max(pre_close * 1.05),
            low: price.min(pre_close * 0.95),
            volume: 100000.0,
            change: price - pre_close,
            change_pct,
            date: "20261009".into(),
            time: "14:00:00".into(),
            ..Default::default()
        }
    }

    fn mock_trend(code: &str, prices_and_vols: &[(f64, f64)], pre_close: f64, force_zero_avg: bool) -> Trend {
        let mut points = Vec::new();
        let mut cum_vol = 0.0;
        let mut cum_amt = 0.0;

        for (i, &(p, v)) in prices_and_vols.iter().enumerate() {
            cum_vol += v;
            cum_amt += p * v * 100.0;
            let avg = if force_zero_avg {
                0.0
            } else if cum_vol > 0.0 {
                cum_amt / (cum_vol * 100.0)
            } else {
                p
            };
            points.push(TrendPoint {
                time: 930 + (i as u32),
                price: p,
                cum_volume: cum_vol,
                cum_amount: cum_amt,
                avg_price: avg,
            });
        }

        Trend {
            code: code.into(),
            date: "20261009".into(),
            pre_close,
            points,
        }
    }

    #[test]
    fn detects_overbought_only_on_green_day() {
        let mut pv = Vec::new();
        for _ in 0..15 {
            pv.push((10.0, 100.0));
        }
        pv.push((10.30, 100.0)); // > 2.2% bias

        let t = mock_trend("sh600000", &pv, 10.0, false);

        // Case A: Stock is up +3.0% today -> Overbought
        let q_up = mock_quote("sh600000", 10.30, 10.0, 3.0);
        let sig_up = analyze_trend(&q_up, Some(&t), None).unwrap();
        assert_eq!(sig_up.state, TrendState::VwapOverbought);
        assert_eq!(sig_up.compact_label, "超买");

        // Case B: Stock is down -0.95% today (like 中天科技) -> Must NOT trigger Overbought!
        let q_down = mock_quote("sh600000", 10.30, 10.40, -0.95);
        let sig_down = analyze_trend(&q_down, Some(&t), None).unwrap();
        assert_ne!(sig_down.state, TrendState::VwapOverbought);
    }

    #[test]
    fn detects_oversold_only_on_red_day() {
        let mut pv = Vec::new();
        for _ in 0..15 {
            pv.push((10.0, 100.0));
        }
        pv.push((9.70, 100.0)); // < -2.2% bias

        let t = mock_trend("sh600000", &pv, 10.0, false);

        // Case A: Down -3.0% today -> Oversold
        let q_down = mock_quote("sh600000", 9.70, 10.0, -3.0);
        let sig_down = analyze_trend(&q_down, Some(&t), None).unwrap();
        assert_eq!(sig_down.state, TrendState::VwapOversold);
        assert_eq!(sig_down.compact_label, "超跌");

        // Case B: Up +1.5% today -> Must NOT trigger Oversold!
        let q_up = mock_quote("sh600000", 9.70, 9.55, 1.57);
        let sig_up = analyze_trend(&q_up, Some(&t), None).unwrap();
        assert_ne!(sig_up.state, TrendState::VwapOversold);
    }

    #[test]
    fn detects_top_divergence_dual_peak() {
        let mut pv = Vec::new();
        // Baseline 0..10
        for _ in 0..10 {
            pv.push((10.0, 50.0));
        }
        // Peak 1 around minute 12 with huge volume (300)
        pv.push((10.15, 150.0));
        pv.push((10.25, 300.0)); // P1
        pv.push((10.20, 100.0));
        // Pullback minute 14..18
        pv.push((10.10, 40.0));
        pv.push((10.08, 30.0));
        pv.push((10.12, 35.0));
        // Peak 2 minute 19..22 tests P1 price (10.25) but volume dried up (40 vs 300)
        pv.push((10.20, 45.0));
        pv.push((10.25, 40.0)); // P2 with < 30% volume!
        pv.push((10.24, 30.0)); // stagnates/retreats
        pv.push((10.23, 25.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);
        let q = mock_quote("sh600000", 10.23, 10.0, 2.3);
        let sig = analyze_trend(&q, Some(&t), None).unwrap();

        assert_eq!(sig.state, TrendState::TopDivergence);
        assert_eq!(sig.compact_label, "背离");
        assert!(sig.score <= -60);
    }

    #[test]
    fn index_uses_ma20_and_does_not_false_divergence() {
        let mut pv = Vec::new();
        for _ in 0..25 {
            pv.push((3300.0, 5000.0));
        }
        // Index symbol sh000001 with avg_price = 0.0
        let t = mock_trend("sh000001", &pv, 3290.0, true);
        let q = mock_quote("sh000001", 3300.0, 3290.0, 0.3);
        let sig = analyze_trend(&q, Some(&t), None).unwrap();

        // Should calculate smoothly using MA20 and not falsely report divergence
        assert_ne!(sig.state, TrendState::TopDivergence);
    }

    #[test]
    fn detects_volume_surge() {
        let mut pv = Vec::new();
        for _ in 0..20 {
            pv.push((10.0, 50.0));
        }
        // Sudden surge with volume 250 (5x) and rising price
        pv.push((10.05, 200.0));
        pv.push((10.10, 250.0));
        pv.push((10.15, 300.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);
        let q = mock_quote("sh600000", 10.15, 10.0, 1.5);
        let sig = analyze_trend(&q, Some(&t), None).unwrap();

        assert_eq!(sig.state, TrendState::VolumeSurge);
        assert_eq!(sig.compact_label, "放量涨");
        assert!(sig.score >= 60);
    }

    #[test]
    fn detects_breakout_pullback() {
        let mut pv = Vec::new();
        // Base rally around 10.10 to 10.18
        for _ in 0..15 {
            pv.push((10.15, 100.0));
        }
        // Pullback towards VWAP (~10.15), dipping to 10.16 and bouncing to 10.18
        pv.push((10.16, 20.0)); // low volume dip
        pv.push((10.18, 25.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);
        let q = mock_quote("sh600000", 10.18, 10.0, 1.8);
        let sig = analyze_trend(&q, Some(&t), None).unwrap();

        assert_eq!(sig.state, TrendState::BreakoutPullback);
        assert_eq!(sig.compact_label, "回踩");
        assert!(sig.score >= 65);
    }

    #[test]
    fn detects_breakdown() {
        let mut pv = Vec::new();
        for _ in 0..20 {
            pv.push((10.0, 50.0));
        }
        // Heavy volume breaking down below VWAP
        pv.push((9.95, 150.0));
        pv.push((9.90, 200.0));
        pv.push((9.85, 250.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);
        let q = mock_quote("sh600000", 9.85, 10.0, -1.5);
        let sig = analyze_trend(&q, Some(&t), None).unwrap();

        assert_eq!(sig.state, TrendState::Breakdown);
        assert_eq!(sig.compact_label, "放量跌");
        assert!(sig.score <= -60);
    }

    #[test]
    fn detects_spring_rebound() {
        let mut pv = Vec::new();
        for _ in 0..10 {
            pv.push((10.0, 100.0));
        }
        // Dips below VWAP to 9.94 (trough), then quickly bounces back to 10.00
        pv.push((9.97, 80.0));
        pv.push((9.94, 90.0));
        pv.push((9.98, 110.0));
        pv.push((10.00, 120.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);
        let mut q = mock_quote("sh600000", 10.00, 10.0, 0.0);
        q.active_buy_ratio = 0.65;
        q.outer_vol = 3000.0;
        q.inner_vol = 1500.0;

        let sig = analyze_trend(&q, Some(&t), None).unwrap();
        assert_eq!(sig.state, TrendState::SpringRebound);
        assert_eq!(sig.compact_label, "破底翻");
        assert!(sig.score >= 70);
    }


    mod flow;
