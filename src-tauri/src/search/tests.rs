//! Unit tests for `search`.
//!
//! Kept in their own file so the implementation stays inside the 300-line
//! budget mandated by AGENTS.md §11.

    use super::*;

    #[test]
    fn parses_tencent_smartbox_chinese_and_escapes() {
        let body = r#"v_hint="sh~600519~\u8d35\u5dde\u8305\u53f0~gzmt~GP-A^sz~000001~\u5e73\u5b89\u94f6\u884c~payh~GP-A^sh~000001~\u4e0a\u8bc1\u6307\u6570~szzs~ZS";"#;
        let list = parse_tencent_smartbox(body);
        assert_eq!(list.len(), 3);

        assert_eq!(list[0].code, "sh600519");
        assert_eq!(list[0].name, "贵州茅台");
        assert_eq!(list[0].pinyin, "GZMT");
        assert_eq!(list[0].category, "A股");

        assert_eq!(list[1].code, "sz000001");
        assert_eq!(list[1].name, "平安银行");
        assert_eq!(list[1].pinyin, "PAYH");
        assert_eq!(list[1].category, "A股");

        assert_eq!(list[2].code, "sh000001");
        assert_eq!(list[2].name, "上证指数");
        assert_eq!(list[2].pinyin, "SZZS");
        assert_eq!(list[2].category, "指数");
    }

    #[test]
    fn parses_tencent_smartbox_empty_or_n() {
        assert!(parse_tencent_smartbox(r#"v_hint="N";"#).is_empty());
        assert!(parse_tencent_smartbox(r#""#).is_empty());
        assert!(parse_tencent_smartbox(r#"v_hint="";"#).is_empty());
    }

    #[test]
    fn parses_eastmoney_suggest_json() {
        let json = r#"{
            "QuotationCodeTable": {
                "Data": [
                    {
                        "Code": "920799",
                        "Name": "艾融软件",
                        "PinYin": "ARRJ",
                        "SecurityTypeName": "京A",
                        "QuoteID": "0.920799"
                    },
                    {
                        "Code": "510300",
                        "Name": "沪深300ETF",
                        "PinYin": "HS300ETF",
                        "SecurityTypeName": "ETF",
                        "QuoteID": "1.510300"
                    }
                ]
            }
        }"#;
        let list = parse_eastmoney_suggest(json.as_bytes());
        assert_eq!(list.len(), 2);

        assert_eq!(list[0].code, "bj920799");
        assert_eq!(list[0].name, "艾融软件");
        assert_eq!(list[0].category, "北交");

        assert_eq!(list[1].code, "sh510300");
        assert_eq!(list[1].name, "沪深300ETF");
        assert_eq!(list[1].category, "ETF");
    }

    #[test]
    fn parses_eastmoney_suggest_filters_non_a_share_and_alphanumeric_codes() {
        let json = r#"{
            "QuotationCodeTable": {
                "Data": [
                    {
                        "Code": "KOSPI200",
                        "Name": "韩国KOSPI200",
                        "PinYin": "HGKOSPI200",
                        "SecurityTypeName": "全球指数",
                        "QuoteID": "100.KOSPI200"
                    },
                    {
                        "Code": "HSI",
                        "Name": "恒生指数",
                        "PinYin": "HSZS",
                        "SecurityTypeName": "港股指数",
                        "QuoteID": "100.HSI"
                    },
                    {
                        "Code": "600519",
                        "Name": "贵州茅台",
                        "PinYin": "GZMT",
                        "SecurityTypeName": "沪A",
                        "QuoteID": "1.600519"
                    }
                ]
            }
        }"#;
        let list = parse_eastmoney_suggest(json.as_bytes());
        // Non-6-digit codes like KOSPI200 and HSI must be ignored
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].code, "sh600519");
        assert_eq!(list[0].name, "贵州茅台");
        assert_eq!(list[0].category, "A股");
    }
