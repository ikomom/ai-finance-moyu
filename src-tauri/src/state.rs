//! Shared application state, reachable from commands and the poller.

use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::crossing::CrossingTracker;
use crate::quote::{Fetcher, Quote, Trend};
use crate::trend_engine::TrendSignal;

/// Which edge of the monitor the window is docked against.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum DockEdge {
    #[default]
    None,
    Left,
    Right,
    Top,
}

/// Dynamic docking status for auto-collapsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DockState {
    pub edge: DockEdge,
    pub collapsed: bool,
}

/// Health and timing info the UI shows in the status corner.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollStatus {
    /// `HH:MM:SS` of the last successful fetch.
    pub last_update: Option<String>,
    /// Last failure, cleared on the next success.
    pub error: Option<String>,
    /// Trading day the cached data belongs to (`YYYYMMDD`).
    pub feed_date: Option<String>,
    /// Whether `feed_date` is today — i.e. whether the market is open today.
    pub trading_today: bool,
    /// Which part of the trading day we're in.
    pub session: String,
}

/// Everything the frontend needs to render, in one payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub config: Config,
    pub quotes: Vec<Quote>,
    pub trends: HashMap<String, Trend>,
    pub trend_signals: HashMap<String, TrendSignal>,
    pub status: PollStatus,
    pub dock: DockState,
}

pub struct AppState {
    pub config: Mutex<Config>,
    pub tracker: Mutex<CrossingTracker>,
    pub quotes: Mutex<HashMap<String, Quote>>,
    pub trends: Mutex<HashMap<String, Trend>>,
    pub trend_signals: Mutex<HashMap<String, TrendSignal>>,
    pub status: Mutex<PollStatus>,
    pub fetcher: Fetcher,
    /// While set in the future, window-resize events are ignored. Used to keep
    /// our own programmatic resizes (layout switches) from being recorded as a
    /// size the user chose.
    pub suppress_resize_until: Mutex<Option<Instant>>,
    /// Incremented per resize event so a debounced write can tell whether a
    /// newer resize superseded it.
    pub resize_gen: AtomicU64,
    /// While set in the future, window-moved events are ignored.
    pub suppress_move_until: Mutex<Option<Instant>>,
    /// Incremented per moved event so a debounced write can tell whether a
    /// newer move superseded it.
    pub move_gen: AtomicU64,
    /// Dynamic docking status.
    pub dock_state: Mutex<DockState>,
}

impl AppState {
    pub fn new(config: Config, fetcher: Fetcher) -> Self {
        Self {
            config: Mutex::new(config),
            tracker: Mutex::new(CrossingTracker::new()),
            quotes: Mutex::new(HashMap::new()),
            trends: Mutex::new(HashMap::new()),
            trend_signals: Mutex::new(HashMap::new()),
            status: Mutex::new(PollStatus::default()),
            fetcher,
            suppress_resize_until: Mutex::new(None),
            resize_gen: AtomicU64::new(0),
            suppress_move_until: Mutex::new(None),
            move_gen: AtomicU64::new(0),
            dock_state: Mutex::new(DockState::default()),
        }
    }

    /// Build a renderable snapshot. Keeps quotes ordered as the watchlist is,
    /// so the UI never has to re-sort and rows don't jump around.
    pub fn snapshot(&self) -> Snapshot {
        let config = self.config.lock().unwrap().clone();
        let quotes = self.quotes.lock().unwrap();
        let trends = self.trends.lock().unwrap();
        let trend_signals = self.trend_signals.lock().unwrap().clone();
        let status = self.status.lock().unwrap().clone();
        let dock = *self.dock_state.lock().unwrap();

        let ordered = config
            .watchlist
            .iter()
            .filter_map(|w| quotes.get(&w.code).cloned())
            .collect();

        Snapshot { config, quotes: ordered, trends: trends.clone(), trend_signals, status, dock }
    }
}
