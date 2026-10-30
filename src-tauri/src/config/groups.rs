//! Watchlist group data structures and helpers.
//!
//! Split to keep files cleanly modular and strictly under 300 lines (AGENTS.md §11).

use serde::{Deserialize, Serialize};

pub const DEFAULT_GROUP_ID: &str = "default";
pub const DEFAULT_GROUP_NAME: &str = "默认自选";
pub const ALL_GROUP_ID: &str = "all";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchGroup {
    pub id: String,
    pub name: String,
}

impl WatchGroup {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
        }
    }
}

pub fn default_groups() -> Vec<WatchGroup> {
    vec![WatchGroup::new(DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME)]
}
