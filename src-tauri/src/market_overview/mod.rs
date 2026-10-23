//! Market Overview data fetching from Eastmoney, Tencent, and iWenCai public endpoints.

pub mod breadth;
pub mod fetcher;
pub mod global;
pub mod sector_linkage;
pub mod types;
pub mod wencai;

pub use fetcher::*;
pub use global::*;
pub use sector_linkage::*;
pub use types::*;
pub use wencai::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_global_indices_samples() {
        let sample = r#"
v_s_usIXIC="200~纳斯达克~.IXIC~26713.03~20.16~0.08~9708091942~259332514398655~~";
v_s_usDJI="200~道琼斯~.DJI~52177.69~556.21~1.08~500690219~26064015150592~~";
v_s_usINX="200~标普500~.INX~7744.06~25.12~0.33~3428090891~26547341545357~~";
v_s_hkHSI="100~恒生指数~HSI~24186.830~124.110~0.52~17820724.5133~17820724.513~~0";
v_gzN225="N225~日经225指数~2026-10-16 14:30:01~65324.07~898.12~1.39~AP~";
v_gzKS11="KS11~韩国综合~2026-10-16 14:32:10~5668.05~113.83~2.05~AP~";
v_gzFTSE="FTSE~英国富时100指数~2026-10-16 16:16:59~10826.96~-13.39~-0.12~EU~";
"#;
        let list = parse_global_indices(sample);
        assert_eq!(list.len(), 7);
        assert_eq!(list[0].code, "usIXIC");
        assert_eq!(list[0].name, "纳斯达克");
        assert_eq!(list[0].price, 26713.03);
        assert_eq!(list[1].code, "usINX");
        assert_eq!(list[2].code, "usDJI");
        assert_eq!(list[3].code, "hkHSI");
        assert_eq!(list[4].code, "gzN225");
        assert_eq!(list[4].name, "日经225");
        assert_eq!(list[5].code, "gzKS11");
        assert_eq!(list[5].name, "韩国KOSPI");
        assert_eq!(list[6].code, "gzFTSE");
        assert_eq!(list[6].name, "富时100");
    }

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

        // 6. Defensive bank matching even when not in top sectors
        let empty_sectors: Vec<SectorItem> = vec![];
        let l6 = match_stock_sector("sh601398", "工商银行", -3.14, &empty_sectors, -0.5).unwrap();
        assert_eq!(l6.sector_name, "银行");
        assert_eq!(l6.role, "权重防御配置");
    }

    #[tokio::test]
    async fn test_quota_circuit_breaker() {
        let fetcher = MarketFetcher::new().unwrap();
        let today = crate::market::beijing_now().format("%Y-%m-%d").to_string();

        // Manually trigger circuit breaker
        *fetcher.quota_exhausted_date.lock().unwrap_or_else(|e| e.into_inner()) = Some(today);

        // fetch_breadth should return cached without network error
        let breadth = fetcher.fetch_breadth(Some("invalid-token-should-not-hit-network")).await;
        assert!(breadth.is_ok());

        // Resetting circuit breaker clears it
        fetcher.reset_quota_circuit_breaker();
        assert!(fetcher.quota_exhausted_date.lock().unwrap_or_else(|e| e.into_inner()).is_none());
    }
}
