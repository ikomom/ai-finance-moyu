//! Milestone detection for market indices (psychological round numbers).

use std::time::Instant;
use super::types::CrossingEvent;

/// Determine the milestone step size for an index based on its code and price level.
///
/// Rules:
/// - 10,000-level indices (e.g. Shenzhen Component `sz399001` or prices >= 5000.0): 500.0 pt step
/// - 1,000-to-4,000-level indices (e.g. SSE Composite `sh000001`, ChiNext `sz399006`, CSI 300 `sh000300`): 100.0 pt step
pub fn index_milestone_step(code: &str, price: f64) -> f64 {
    let clean = code.trim().to_ascii_lowercase();
    if clean.starts_with("sz399001") || clean.starts_with("sz399106") || price >= 5000.0 {
        500.0
    } else {
        100.0
    }
}

/// Check if a price transition crosses an integer milestone of the given step.
///
/// Returns `Some((milestone, is_breakout))` if an integer milestone was crossed, where:
/// - `milestone`: the milestone price (e.g. 3300.0, 3400.0)
/// - `is_breakout`: `true` for upward breakout, `false` for downward breakdown
pub fn check_milestone_crossing(prev: f64, curr: f64, step: f64) -> Option<(f64, bool)> {
    if step <= 0.0 || prev <= 0.0 || curr <= 0.0 {
        return None;
    }

    if curr > prev {
        // Upward movement: check if an integer milestone was crossed
        let k = (curr / step).floor() * step;
        if prev < k && curr >= k {
            return Some((k, true));
        }
    } else if curr < prev {
        // Downward movement: check if an integer milestone was broken
        let k = (curr / step).ceil() * step;
        if prev > k && curr <= k {
            return Some((k, false));
        }
    }

    None
}

/// Evaluate whether an index price move crossed a psychological milestone and fire an event.
pub fn evaluate_milestone(
    code: &str,
    curr_price: f64,
    change_pct: f64,
    prev_price: Option<f64>,
    _now: Instant,
    mut check_cooldown: impl FnMut(&str) -> bool,
) -> Option<CrossingEvent> {
    let prev = prev_price?;
    let step = index_milestone_step(code, curr_price);
    let (milestone, is_breakout) = check_milestone_crossing(prev, curr_price, step)?;
    let dir_key = if is_breakout { "up" } else { "down" };
    let key = format!("{code}:milestone:{dir_key}:{milestone:.0}");
    if check_cooldown(&key) {
        Some(CrossingEvent::IndexMilestone {
            code: code.to_string(),
            milestone,
            is_breakout,
            price: curr_price,
            change_pct,
        })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_index_milestone_step() {
        assert_eq!(index_milestone_step("sh000001", 3350.0), 100.0);
        assert_eq!(index_milestone_step("sz399006", 2150.0), 100.0);
        assert_eq!(index_milestone_step("sh000300", 3900.0), 100.0);
        assert_eq!(index_milestone_step("sz399001", 10600.0), 500.0);
        assert_eq!(index_milestone_step("sh000001", 5200.0), 500.0);
    }

    #[test]
    fn test_check_milestone_crossing_upward() {
        assert_eq!(check_milestone_crossing(3398.5, 3402.1, 100.0), Some((3400.0, true)));
        assert_eq!(check_milestone_crossing(3402.0, 3405.0, 100.0), None);
        assert_eq!(check_milestone_crossing(3300.0, 3300.0, 100.0), None);
        assert_eq!(check_milestone_crossing(9950.0, 10050.0, 500.0), Some((10000.0, true)));
    }

    #[test]
    fn test_check_milestone_crossing_downward() {
        assert_eq!(check_milestone_crossing(3402.5, 3398.1, 100.0), Some((3400.0, false)));
        assert_eq!(check_milestone_crossing(3398.0, 3395.0, 100.0), None);
        assert_eq!(check_milestone_crossing(10050.0, 9950.0, 500.0), Some((10000.0, false)));
    }

    #[test]
    fn test_evaluate_milestone_event() {
        let now = Instant::now();
        // First tick: prev is None -> None
        assert!(evaluate_milestone("sh000001", 3398.0, 0.5, None, now, |_| true).is_none());

        // Second tick: crosses 3400 upward -> fires IndexMilestone
        let ev = evaluate_milestone("sh000001", 3402.0, 1.2, Some(3398.0), now, |_| true);
        assert!(ev.is_some());
        if let Some(CrossingEvent::IndexMilestone { milestone, is_breakout, price, change_pct, .. }) = ev {
            assert_eq!(milestone, 3400.0);
            assert!(is_breakout);
            assert_eq!(price, 3402.0);
            assert_eq!(change_pct, 1.2);
        } else {
            panic!("Expected IndexMilestone event");
        }

        // Third tick: cooldown blocks
        assert!(evaluate_milestone("sh000001", 3405.0, 1.3, Some(3398.0), now, |_| false).is_none());
    }
}
