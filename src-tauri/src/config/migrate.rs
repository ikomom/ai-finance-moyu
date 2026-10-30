//! Automated lossless migration pipeline for `config.json`.
//!
//! Upgrades older schema versions to current while maintaining backwards compatibility.

use serde_json::Value;

use super::groups::{default_groups, DEFAULT_GROUP_ID};
use super::types::CONFIG_SCHEMA_VERSION;

/// Attempt to migrate an arbitrary JSON value representing Config to the current schema.
/// Returns `(migrated_value, was_migrated)`.
pub fn migrate_config_value(mut root: Value) -> (Value, bool) {
    if !root.is_object() {
        return (root, false);
    }

    let mut migrated = false;
    let obj = root.as_object_mut().unwrap();

    let ver = obj
        .get("schemaVersion")
        .or_else(|| obj.get("schema_version"))
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as u32;

    if ver < 2 {
        // Migration v1 -> v2: Watchlist groups support
        migrated = true;

        // 1. Ensure "groups" exists with default group
        if !obj.contains_key("groups") || obj.get("groups").is_none_or(|g| !g.is_array()) {
            let def_groups = serde_json::to_value(default_groups()).unwrap_or(Value::Array(Vec::new()));
            obj.insert("groups".to_string(), def_groups);
        }

        // 2. Ensure every item in watchlist has "group": "default"
        if let Some(Value::Array(watchlist)) = obj.get_mut("watchlist") {
            for item in watchlist {
                if let Value::Object(item_obj) = item {
                    if !item_obj.contains_key("group") || item_obj.get("group").is_none_or(|g| g.is_null()) {
                        item_obj.insert("group".to_string(), Value::String(DEFAULT_GROUP_ID.to_string()));
                    }
                }
            }
        }

        // 3. Set schemaVersion = 2
        obj.insert("schemaVersion".to_string(), Value::Number(CONFIG_SCHEMA_VERSION.into()));
    }

    (root, migrated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_migrate_v1_legacy_config() {
        let legacy = json!({
            "watchlist": [
                { "code": "sh600000", "costPrice": 10.5 },
                { "code": "sz000001" }
            ],
            "alertPct": 3.0
        });

        let (migrated, was_migrated) = migrate_config_value(legacy);
        assert!(was_migrated);

        let obj = migrated.as_object().unwrap();
        assert_eq!(obj.get("schemaVersion").unwrap().as_u64(), Some(2));
        assert!(obj.get("groups").unwrap().is_array());

        let wl = obj.get("watchlist").unwrap().as_array().unwrap();
        assert_eq!(wl[0].get("group").unwrap().as_str(), Some("default"));
        assert_eq!(wl[1].get("group").unwrap().as_str(), Some("default"));
    }

    #[test]
    fn test_migrate_v2_already_current() {
        let current = json!({
            "schemaVersion": 2,
            "groups": [{ "id": "default", "name": "默认自选" }],
            "watchlist": [{ "code": "sh600000", "group": "default" }]
        });

        let (migrated, was_migrated) = migrate_config_value(current.clone());
        assert!(!was_migrated);
        assert_eq!(migrated, current);
    }
}
