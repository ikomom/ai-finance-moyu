//! Shared application state, reachable from commands and the poller.

use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::crossing::CrossingTracker;
use crate::market_overview::{MarketFetcher, MarketOverview};
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
    pub auctions: HashMap<String, crate::auction_engine::AuctionData>,
    pub status: PollStatus,
    pub dock: DockState,
    pub market_overview: Option<MarketOverview>,
    /// Whether an iWenCai key is stored. The key value itself is deliberately
    /// absent: `config` is stripped before it is serialized to the webview, so a
    /// single XSS can no longer exfiltrate the user's credentials.
    pub has_iwencai_key: bool,
}

#[derive(Debug, Clone, Default)]
pub struct HotkeyBindings {
    pub toggle: Option<tauri_plugin_global_shortcut::Shortcut>,
    pub bar: Option<tauri_plugin_global_shortcut::Shortcut>,
    pub mini: Option<tauri_plugin_global_shortcut::Shortcut>,
    pub list: Option<tauri_plugin_global_shortcut::Shortcut>,
    pub market: Option<tauri_plugin_global_shortcut::Shortcut>,
    pub global: Option<tauri_plugin_global_shortcut::Shortcut>,
}

/// The shared state container.
///
/// # Lock ordering (MUST hold for every path)
///
/// These are plain `std::sync::Mutex`es: no re-entrancy, no timeout, so a cycle
/// between two threads freezes the whole process permanently. Every acquisition
/// sequence in the codebase must respect this order:
///
/// ```text
/// config  ->  quotes  ->  trends  ->  trend_signals / market_overview / auction_tracker
/// ```
///
/// Reading a *single* value out of `config` is allowed at any point **only** as a
/// temporary (`state.config.lock().unwrap_or_else(|e| e.into_inner()).field`), which drops the guard at the
/// end of the statement. Holding the `config` guard while acquiring a data lock is
/// `config -> quotes`; holding a data lock while acquiring `config` is the reverse
/// and deadlocks against `poller::poll_quotes`.
///
/// When a function needs a value from `config` *after* reading quote/trend data,
/// it must clone what it needs out of that data, drop the data guard, and only
/// then take `config`.
pub struct AppState {
    pub config: Mutex<Config>,
    pub tracker: Mutex<CrossingTracker>,
    pub quotes: Mutex<HashMap<String, Quote>>,
    pub trends: Mutex<HashMap<String, Trend>>,
    pub trend_signals: Mutex<HashMap<String, TrendSignal>>,
    pub status: Mutex<PollStatus>,
    pub fetcher: Fetcher,
    /// Shared HTTP client for the security search endpoints. Building a fresh
    /// client per keystroke meant a fresh TLS handshake per keystroke.
    pub search: crate::search::SearchClient,
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
    /// Codes requested by active layout for intraday trend polling (on-demand loading).
    pub active_trend_targets: Mutex<Option<Vec<String>>>,
    pub market_fetcher: MarketFetcher,
    pub market_overview: Mutex<Option<MarketOverview>>,
    pub auction_tracker: Mutex<crate::auction_engine::AuctionTracker>,
    pub hotkey_bindings: Mutex<HotkeyBindings>,
}

impl AppState {
    pub fn new(config: Config, fetcher: Fetcher, cache: crate::config::QuotesCache) -> Self {
        let mut quotes_map = HashMap::new();
        for q in cache.quotes {
            quotes_map.insert(q.code.clone(), q);
        }
        let mut trends_map = HashMap::new();
        for (code, t) in cache.trends {
            trends_map.insert(code, t);
        }

        // A search client that fails to build (TLS init) must not take the app
        // down with it: the widget is still useful without the search box.
        let search = crate::search::SearchClient::new().unwrap_or_else(|e| {
            log::error!(target: "NET", "搜索客户端初始化失败，搜索功能不可用: {e}");
            crate::search::SearchClient::disabled()
        });

        Self {
            config: Mutex::new(config),
            tracker: Mutex::new(CrossingTracker::new()),
            quotes: Mutex::new(quotes_map),
            trends: Mutex::new(trends_map),
            trend_signals: Mutex::new(HashMap::new()),
            status: Mutex::new(PollStatus::default()),
            fetcher,
            search,
            suppress_resize_until: Mutex::new(None),
            resize_gen: AtomicU64::new(0),
            suppress_move_until: Mutex::new(None),
            move_gen: AtomicU64::new(0),
            dock_state: Mutex::new(DockState::default()),
            active_trend_targets: Mutex::new(None),
            market_fetcher: MarketFetcher::default(),
            market_overview: Mutex::new(None),
            auction_tracker: Mutex::new(crate::auction_engine::AuctionTracker::new()),
            hotkey_bindings: Mutex::new(HotkeyBindings::default()),
        }
    }

    /// Build a renderable snapshot. Keeps quotes ordered as the watchlist is.
    /// If a quote has not yet arrived or network is disconnected, fallback to
    /// cached/placeholder item so watchlist items NEVER vanish from the UI.
    pub fn snapshot(&self) -> Snapshot {
        let mut config = self.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let has_iwencai_key = config
            .iwencai_api_key
            .as_deref()
            .is_some_and(|k| !k.trim().is_empty());
        // Never ship the secret to the renderer; `has_iwencai_key` is enough for
        // the settings form to render its state.
        config.iwencai_api_key = None;

        let quotes = self.quotes.lock().unwrap_or_else(|e| e.into_inner());
        let trends = self.trends.lock().unwrap_or_else(|e| e.into_inner());
        let trend_signals = self.trend_signals.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let auctions = self.auction_tracker.lock().unwrap_or_else(|e| e.into_inner()).data.clone();
        let status = self.status.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let dock = *self.dock_state.lock().unwrap_or_else(|e| e.into_inner());
        let market_overview = self.market_overview.lock().unwrap_or_else(|e| e.into_inner()).clone();

        let ordered = config
            .watchlist
            .iter()
            .map(|w| {
                if let Some(q) = quotes.get(&w.code) {
                    q.clone()
                } else {
                    Quote {
                        code: w.code.clone(),
                        name: w.name.clone().unwrap_or_else(|| w.code.clone()),
                        ..Default::default()
                    }
                }
            })
            .collect();

        Snapshot {
            config,
            quotes: ordered,
            trends: trends.clone(),
            trend_signals,
            auctions,
            status,
            dock,
            market_overview,
            has_iwencai_key,
        }
    }
}
