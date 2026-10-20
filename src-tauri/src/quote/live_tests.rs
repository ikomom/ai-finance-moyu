//! Tests for `mod` (live_tests).
//!
//! Kept out of the implementation file so every source file stays inside
//! the 300-line budget mandated by AGENTS.md §11.

    use super::*;
    use crate::config::DataSource;

    fn fetcher() -> Fetcher {
        Fetcher::new().expect("client should build")
    }

    fn is_chinese(s: &str) -> bool {
        s.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
    }

    async fn check_quotes(source: DataSource) {
        let codes = vec!["sh600000".to_string(), "sz300750".to_string()];
        let quotes = fetcher()
            .fetch_quotes(source, &codes)
            .await
            .unwrap_or_else(|e| panic!("{source:?} quote fetch failed: {e}"));

        assert_eq!(quotes.len(), codes.len(), "{source:?}: every code should come back");
        for q in &quotes {
            assert!(q.price > 0.0, "{source:?} {} price not positive: {}", q.code, q.price);
            assert!(q.pre_close > 0.0, "{source:?} {} preClose not positive", q.code);
            assert!(
                q.code.starts_with("sh") || q.code.starts_with("sz"),
                "{source:?} code lost its market prefix: {}",
                q.code
            );
            assert_eq!(q.date.len(), 8, "{source:?} {} has a bad date {:?}", q.code, q.date);
            assert!(
                is_chinese(&q.name),
                "{source:?} {} name is not Chinese text: {:?} (GB18030 decode problem?)",
                q.code,
                q.name
            );
            assert!(
                q.change_pct.abs() < 25.0,
                "{source:?} {} absurd changePct {}",
                q.code,
                q.change_pct
            );
        }
    }

    async fn check_trend(source: DataSource) {
        let t = fetcher()
            .fetch_trend(source, "sh600000", 9.48)
            .await
            .unwrap_or_else(|e| panic!("{source:?} trend fetch failed: {e}"));

        assert_eq!(t.code, "sh600000");
        assert_eq!(t.date.len(), 8, "{source:?} bad date {:?}", t.date);
        assert!(t.pre_close > 0.0, "{source:?} preClose not positive");
        assert!(!t.points.is_empty(), "{source:?} no intraday points");
        assert!(t.points.len() <= 241, "{source:?} more points than a session holds");

        let mut prev = 0u32;
        for p in &t.points {
            assert!(
                p.time >= prev,
                "{source:?} timestamp went backwards: {} after {}",
                p.time,
                prev
            );
            prev = p.time;
            assert!(
                (930..=1500).contains(&p.time),
                "{source:?} timestamp outside session: {}",
                p.time
            );
            assert!(p.price > 0.0, "{source:?} non-positive price at {}", p.time);
            assert!(p.avg_price.is_finite() && p.avg_price > 0.0, "{source:?} bad 均价 at {}", p.time);
            let drift = (p.avg_price - p.price).abs() / p.price;
            assert!(drift < 0.25, "{source:?} 均价 drifted {:.0}% at {}", drift * 100.0, p.time);
        }
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_tencent_quotes() {
        check_quotes(DataSource::Tencent).await;
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_tencent_trend() {
        check_trend(DataSource::Tencent).await;
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_sina_quotes() {
        check_quotes(DataSource::Sina).await;
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_sina_trend() {
        check_trend(DataSource::Sina).await;
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_sources_agree_on_price() {
        let f = fetcher();
        let codes = vec!["sh600000".to_string()];
        let t = f.fetch_quotes(DataSource::Tencent, &codes).await.expect("tencent");
        let s = f.fetch_quotes(DataSource::Sina, &codes).await.expect("sina");

        let (tp, sp) = (t[0].price, s[0].price);
        let diff = (tp - sp).abs() / tp;
        assert!(diff < 0.02, "providers disagree by {:.2}%: tencent {tp} vs sina {sp}", diff * 100.0);
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_unknown_code_does_not_panic() {
        let f = fetcher();
        for source in [DataSource::Tencent, DataSource::Sina] {
            let r = f.fetch_quotes(source, &["sh999999".to_string()]).await;
            assert!(r.is_ok(), "{source:?}: an unknown code should yield an empty list");
            assert!(r.unwrap().is_empty(), "{source:?}: sh999999 unexpectedly resolved");
        }
    }
