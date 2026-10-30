//! Automated lossless migration pipeline for `portfolio.json`.
//!
//! Upgrades older portfolio ledger schema versions to current.

use serde_json::Value;

use super::types::PORTFOLIO_SCHEMA_VERSION;

/// Attempt to migrate an arbitrary JSON value representing PortfolioData to the current schema.
/// Returns `(migrated_value, was_migrated)`.
pub fn migrate_portfolio_value(mut root: Value) -> (Value, bool) {
    if !root.is_object() {
        return (root, false);
    }

    let mut migrated = false;
    let obj = root.as_object_mut().unwrap();

    let ver = obj
        .get("schemaVersion")
        .or_else(|| obj.get("schema_version"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    if ver < 1 {
        // v0 (unversioned legacy) -> v1
        migrated = true;

        if !obj.contains_key("strictMode") {
            obj.insert("strictMode".to_string(), Value::Bool(true));
        }
        if !obj.contains_key("pendingOrders") {
            obj.insert("pendingOrders".to_string(), Value::Array(Vec::new()));
        }
        obj.insert(
            "schemaVersion".to_string(),
            Value::Number(PORTFOLIO_SCHEMA_VERSION.into()),
        );
    }

    (root, migrated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_migrate_v0_legacy_portfolio() {
        let legacy = json!({
            "brokers": [{
                "id": "b1",
                "name": "测试券商",
                "initialCash": 100000.0,
                "availableCash": 100000.0,
                "feeConfig": {
                    "preset": "standard",
                    "stockRate": 0.00025,
                    "stockMinFee": 5.0,
                    "etfRate": 0.0001,
                    "etfMinFee": 5.0,
                    "bondRate": 0.0001,
                    "bondMinFee": 1.0,
                    "stampDutyRate": 0.0005
                },
                "createdAt": "2026-10-30"
            }]
        });

        let (migrated, was_migrated) = migrate_portfolio_value(legacy);
        assert!(was_migrated);

        let obj = migrated.as_object().unwrap();
        assert_eq!(obj.get("schemaVersion").unwrap().as_u64(), Some(1));
        assert_eq!(obj.get("strictMode").unwrap().as_bool(), Some(true));
        assert!(obj.get("pendingOrders").unwrap().is_array());
    }

    #[test]
    fn test_migrate_v1_already_current() {
        let current = json!({
            "schemaVersion": 1,
            "strictMode": true,
            "pendingOrders": [],
            "brokers": []
        });

        let (migrated, was_migrated) = migrate_portfolio_value(current.clone());
        assert!(!was_migrated);
        assert_eq!(migrated, current);
    }
}
