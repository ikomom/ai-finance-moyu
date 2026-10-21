//! Limit-board state machine (涨停 / 跌停 / 炸板 / 封单松动).
//!
//! Extracted from `anomaly.rs`, which keeps the rapid-change / extreme / volume
//! detectors. The board logic needs a snapshot of the limit prices and the
//! level-1 book, which is also what the cold-start path needs, so that
//! computation lives here and is shared.

use std::time::Duration;

use crate::quote::Quote;

use super::types::{CrossingEvent, LimitBoardKind};
use super::BoardState;
use super::SecurityIntradayState;

/// Everything the board state machine needs about a single tick.
pub(super) struct LimitSnapshot {
    pub up_price: f64,
    pub down_price: f64,
    pub is_at_up_price: bool,
    pub is_at_down_price: bool,
    pub b1_vol: f64,
    pub a1_vol: f64,
    pub has_depth: bool,
    pub asks_empty: bool,
    pub bids_empty: bool,
}

impl LimitSnapshot {
    pub(super) fn is_sealed_up(&self) -> bool {
        if self.has_depth {
            self.is_at_up_price && self.asks_empty && self.b1_vol > 0.0
        } else {
            self.is_at_up_price
        }
    }

    pub(super) fn is_sealed_down(&self) -> bool {
        if self.has_depth {
            self.is_at_down_price && self.bids_empty && self.a1_vol > 0.0
        } else {
            self.is_at_down_price
        }
    }
}

/// Compute the limit prices and how the book sits against them.
///
/// Returns `None` for securities without a daily price limit (no usable
/// `pre_close`).
pub(super) fn limit_snapshot(quote: &Quote) -> Option<LimitSnapshot> {
    let (up_price, down_price) =
        crate::market::calculate_limit_prices(&quote.code, &quote.name, quote.pre_close)?;

    let is_at_up_price = (quote.price - up_price).abs() < 0.005 || quote.price > up_price;
    let is_at_down_price = (quote.price - down_price).abs() < 0.005 || quote.price < down_price;

    let b1_vol = quote.bids.first().map(|b| b.1).unwrap_or(0.0);
    let a1_vol = quote.asks.first().map(|a| a.1).unwrap_or(0.0);

    let has_depth = !quote.bids.is_empty() || !quote.asks.is_empty();
    let asks_empty = quote.asks.is_empty()
        || quote.asks[0].0 <= 0.0
        || quote.asks[0].1 <= 0.0
        || quote.asks[0].0 > up_price;
    let bids_empty = quote.bids.is_empty()
        || quote.bids[0].0 <= 0.0
        || quote.bids[0].1 <= 0.0
        || quote.bids[0].0 < down_price;

    Some(LimitSnapshot {
        up_price,
        down_price,
        is_at_up_price,
        is_at_down_price,
        b1_vol,
        a1_vol,
        has_depth,
        asks_empty,
        bids_empty,
    })
}

impl SecurityIntradayState {
    /// Four-state board machine: near → sealed → loosening → broken.
    pub(super) fn detect_limit_board(
        &mut self,
        code: &str,
        quote: &Quote,
        check_cooldown: &mut impl FnMut(&str, Duration) -> bool,
        events: &mut Vec<CrossingEvent>,
    ) {
        // Newly listed stocks (N/C prefix) have no daily limit to track.
        if quote.name.starts_with('N') || quote.name.starts_with('C') {
            return;
        }
        let Some(snapshot) = limit_snapshot(quote) else {
            return;
        };

        let up_price = snapshot.up_price;
        let down_price = snapshot.down_price;
        let is_at_up_price = snapshot.is_at_up_price;
        let is_at_down_price = snapshot.is_at_down_price;
        let b1_vol = snapshot.b1_vol;
        let a1_vol = snapshot.a1_vol;
        let has_depth = snapshot.has_depth;
        let asks_empty = snapshot.asks_empty;
        let bids_empty = snapshot.bids_empty;
        let is_sealed_up = snapshot.is_sealed_up();
        let is_sealed_down = snapshot.is_sealed_down();

        // --- 涨停侧处理 ---
        if is_sealed_up {
            if self.board_state != BoardState::SealedLimitUp {
                self.board_state = BoardState::SealedLimitUp;
                self.had_been_sealed_up = true;
                self.peak_seal_vol = b1_vol;
                self.seal_loosening_warned = false;

                let key = format!("{code}:sealed_limit_up");
                if check_cooldown(&key, Duration::from_secs(300)) {
                    events.push(CrossingEvent::LimitBoard {
                        code: code.to_string(),
                        board_kind: LimitBoardKind::SealedLimitUp { seal_hands: b1_vol },
                        price: quote.price,
                        change_pct: quote.change_pct,
                    });
                }
            } else if b1_vol > self.peak_seal_vol {
                self.peak_seal_vol = b1_vol;
                self.seal_loosening_warned = false;
            } else if snapshot.has_depth
                && self.peak_seal_vol >= 1000.0
                && b1_vol <= self.peak_seal_vol * 0.4
                && !self.seal_loosening_warned
            {
                self.seal_loosening_warned = true;
                let drop_pct = ((self.peak_seal_vol - b1_vol) / self.peak_seal_vol * 100.0).round();
                let key = format!("{code}:seal_loosening");
                if check_cooldown(&key, Duration::from_secs(180)) {
                    events.push(CrossingEvent::LimitBoard {
                        code: code.to_string(),
                        board_kind: LimitBoardKind::SealLoosening {
                            peak_hands: self.peak_seal_vol,
                            current_hands: b1_vol,
                            drop_pct,
                        },
                        price: quote.price,
                        change_pct: quote.change_pct,
                    });
                }
            } else if snapshot.has_depth && b1_vol >= self.peak_seal_vol * 0.9 {
                self.seal_loosening_warned = false;
            }
        } else if self.had_been_sealed_up && (!is_at_up_price || (has_depth && !asks_empty)) {
            self.had_been_sealed_up = false;
            self.board_state = BoardState::NearLimitUp;
            self.seal_loosening_warned = false;
            self.peak_seal_vol = 0.0;

            let key = format!("{code}:broken_limit_up");
            if check_cooldown(&key, Duration::from_secs(300)) {
                events.push(CrossingEvent::LimitBoard {
                    code: code.to_string(),
                    board_kind: LimitBoardKind::BrokenLimitUp,
                    price: quote.price,
                    change_pct: quote.change_pct,
                });
            }
        } else {
            let near_up_threshold = (up_price * 0.995).min(up_price - 0.02);
            if quote.price >= near_up_threshold && !is_at_up_price {
                if self.board_state == BoardState::Normal {
                    self.board_state = BoardState::NearLimitUp;
                    let key = format!("{code}:near_limit_up");
                    if check_cooldown(&key, Duration::from_secs(600)) {
                        events.push(CrossingEvent::LimitBoard {
                            code: code.to_string(),
                            board_kind: LimitBoardKind::NearLimitUp,
                            price: quote.price,
                            change_pct: quote.change_pct,
                        });
                    }
                }
            } else if quote.price < up_price * 0.97 && self.board_state == BoardState::NearLimitUp {
                self.board_state = BoardState::Normal;
            }
        }

        // --- 跌停侧处理 ---
        if is_sealed_down {
            if self.board_state != BoardState::SealedLimitDown {
                self.board_state = BoardState::SealedLimitDown;
                self.had_been_sealed_down = true;

                let key = format!("{code}:sealed_limit_down");
                if check_cooldown(&key, Duration::from_secs(300)) {
                    events.push(CrossingEvent::LimitBoard {
                        code: code.to_string(),
                        board_kind: LimitBoardKind::SealedLimitDown { seal_hands: a1_vol },
                        price: quote.price,
                        change_pct: quote.change_pct,
                    });
                }
            }
        } else if self.had_been_sealed_down && (!is_at_down_price || (has_depth && !bids_empty)) {
            self.had_been_sealed_down = false;
            self.board_state = BoardState::NearLimitDown;

            let key = format!("{code}:broken_limit_down");
            if check_cooldown(&key, Duration::from_secs(300)) {
                events.push(CrossingEvent::LimitBoard {
                    code: code.to_string(),
                    board_kind: LimitBoardKind::BrokenLimitDown,
                    price: quote.price,
                    change_pct: quote.change_pct,
                });
            }
        } else {
            let near_down_threshold = (down_price * 1.005).max(down_price + 0.02);
            if quote.price <= near_down_threshold && !is_at_down_price {
                if self.board_state == BoardState::Normal {
                    self.board_state = BoardState::NearLimitDown;
                    let key = format!("{code}:near_limit_down");
                    if check_cooldown(&key, Duration::from_secs(600)) {
                        events.push(CrossingEvent::LimitBoard {
                            code: code.to_string(),
                            board_kind: LimitBoardKind::NearLimitDown,
                            price: quote.price,
                            change_pct: quote.change_pct,
                        });
                    }
                }
            } else if quote.price > down_price * 1.03
                && self.board_state == BoardState::NearLimitDown
            {
                self.board_state = BoardState::Normal;
            }
        }
    }
}
impl SecurityIntradayState {
    /// Cold-start: derive the initial board state from the first tick, without
    /// emitting any events. Previous behaviour: read the same book fields here
    /// and again in `detect_limit_board`, with the copies free to drift.
    pub(super) fn seed_board_state(&mut self, quote: &Quote) {
        let Some(snapshot) = limit_snapshot(quote) else {
            return;
        };
        let up_price = snapshot.up_price;
        let down_price = snapshot.down_price;

        if snapshot.is_sealed_up() {
            self.board_state = BoardState::SealedLimitUp;
            self.had_been_sealed_up = true;
            self.peak_seal_vol = snapshot.b1_vol;
        } else if snapshot.is_at_up_price
            || quote.price >= (up_price * 0.995).min(up_price - 0.02)
        {
            self.board_state = BoardState::NearLimitUp;
        } else if snapshot.is_sealed_down() {
            self.board_state = BoardState::SealedLimitDown;
            self.had_been_sealed_down = true;
        } else if snapshot.is_at_down_price
            || quote.price <= (down_price * 1.005).max(down_price + 0.02)
        {
            self.board_state = BoardState::NearLimitDown;
        }
    }
}