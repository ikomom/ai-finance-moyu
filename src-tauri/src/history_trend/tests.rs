use super::types::*;
use crate::quote::types::{DayTrend, TrendPoint};

#[test]
fn test_point_to_row_and_back() {
    let p = TrendPoint {
        time: 930,
        price: 16.50,
        avg_price: 16.50,
        cum_volume: 1200.0,
        cum_amount: 1980000.0,
    };
    let row = point_to_row(&p);
    assert!(row.contains("0930"));
    assert!(row.contains("16.50"));

    let day = DayTrend {
        date: "20261109".into(),
        pre_close: 16.20,
        points: vec![p],
    };
    let stored = day_trend_to_stored(&day);
    assert!(!stored.complete); // 1 point is not complete
    assert_eq!(stored.point_count, 1);

    let restored = stored_to_day_trend("20261109", &stored);
    assert_eq!(restored.date, "20261109");
    assert_eq!(restored.pre_close, 16.20);
    assert_eq!(restored.points.len(), 1);
    assert_eq!(restored.points[0].time, 930);
    assert_eq!(restored.points[0].price, 16.50);
}

#[test]
fn test_complete_session_threshold() {
    let dummy_pts: Vec<TrendPoint> = (0..240)
        .map(|i| TrendPoint {
            time: 930 + i,
            price: 10.0,
            avg_price: 10.0,
            cum_volume: 100.0,
            cum_amount: 1000.0,
        })
        .collect();
    let day = DayTrend {
        date: "20261110".into(),
        pre_close: 9.8,
        points: dummy_pts,
    };
    let stored = day_trend_to_stored(&day);
    assert!(stored.complete);
    assert_eq!(stored.point_count, 240);
}
