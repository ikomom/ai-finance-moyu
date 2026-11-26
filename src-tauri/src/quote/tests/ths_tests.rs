//! THS index intraday trend parsing and staleness validation tests.
//!
//! Split from `ths.rs` to stay inside the 300-line budget (AGENTS.md §11).

use chrono::NaiveDate;

use super::*;

#[test]
fn test_index_trend_candidates() {
    let sh = ths::index_trend_candidates("sh000001");
    assert_eq!(sh.len(), 3);
    assert_eq!(sh[0].0, "hs_1A0001");
    assert_eq!(sh[1].0, "zs_1A0001");
    assert_eq!(ths::index_trend_candidates("000001").len(), 3);
    assert_eq!(ths::index_trend_candidates("sz399001")[0].0, "hs_399001");
    assert_eq!(ths::index_trend_candidates("sz399006")[0].0, "hs_399006");
    assert_eq!(ths::index_trend_candidates("sz399005")[0].0, "hs_399005");
    assert!(ths::index_trend_candidates("sh600000").is_empty());
    assert!(ths::index_trend_candidates("sz000001").is_empty());
}

#[test]
fn test_parse_index_trend_golden() {
    let sample = r#"quotebridge_v6_time_hs_1A0001_today({"hs_1A0001":{"name":"上证指数","open":0,"stop":0,"isTrading":0,"pre":"3533.79","date":"20261123","data":"0930,3503.52,8350370900,3486.0838,673493100;1049,3481.84,1792250000,3452.5128,116828000;1500,3538.95,9477030000,3616.4807,691033000"}})"#;
    let closed_now = NaiveDate::from_ymd_opt(2026, 11, 23)
        .unwrap()
        .and_hms_opt(15, 5, 0)
        .unwrap();
    let trend = ths::parse_validated_index_trend(
        "sh000001", "hs_1A0001", sample, 3533.79, "20261123", closed_now,
    )
    .expect("parse failed");

    assert_eq!(trend.code, "sh000001");
    assert_eq!(trend.date, "20261123");
    assert_eq!(trend.pre_close, 3533.79);
    assert_eq!(trend.points.len(), 3);
    assert_eq!(trend.points[0].time, 930);
    assert_eq!(trend.points[0].price, 3503.52);
    assert_eq!(trend.points[1].time, 1049);
    assert_eq!(trend.points[2].time, 1500);
    assert_eq!(trend.points[2].avg_price, 3616.4807);
}

#[test]
fn test_rejects_stale_hs_1a0001_poisoned_with_today_date() {
    let poisoned = r#"quotebridge_v6_time_hs_1A0001_today({"hs_1A0001":{"name":"上证指数","isTrading":0,"pre":"3548.37","date":"20261126","data":"0930,3522.59,6415154900,3516.43,457742400;1500,3476.47,9458100000,3428.43,668217000"}})"#;
    let now = NaiveDate::from_ymd_opt(2026, 11, 26)
        .unwrap()
        .and_hms_opt(9, 41, 0)
        .unwrap();
    assert!(ths::parse_validated_index_trend(
        "sh000001", "hs_1A0001", poisoned, 3476.47, "20261126", now
    )
    .is_err());

    let fresh = r#"quotebridge_v4_time_zs_1A0001_last({"zs_1A0001":{"name":"上证指数","isTrading":1,"pre":"3476.47","date":"20261126","data":"0930,3490.14,5408591900,3505.32,473097900;0941,3477.06,5574360000,3473.34,426442600"}})"#;
    let ok = ths::parse_validated_index_trend(
        "sh000001", "zs_1A0001", fresh, 3476.47, "20261126", now
    )
    .expect("fresh zs_1A0001 should pass");
    assert_eq!(ok.pre_close, 3476.47);
    assert_eq!(ok.points.len(), 2);
}
