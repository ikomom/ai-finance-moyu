//! iWenCai (同花顺问财) and Tonghuashun Financial Data (同花顺金融数据) API credentials.
//!
//! Resolution order follows AGENTS.md §2 exactly:
//!   1. the key the user saved in the in-app settings (THS / Fuyao / iWenCai);
//!   2. environment variables (`FUYAO_API_KEY`, `HITHINK_FINANCE_API_KEY`, `IWENCAI_API_KEY`);
//!   3. no key → the caller falls back to its baseline cache.

pub fn get_iwencai_api_key(configured_key: Option<&str>) -> Option<String> {
    if let Some(key) = configured_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    for env_var in &["FUYAO_API_KEY", "HITHINK_FINANCE_API_KEY", "IWENCAI_API_KEY"] {
        if let Ok(key) = std::env::var(env_var) {
            let trimmed = key.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `std::env` is process-global and `cargo test` runs tests concurrently, so
    /// every test that touches the environment takes this lock (AGENTS.md §6).
    static TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn configured_key_wins_over_environment() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("IWENCAI_API_KEY", "from-env");
        assert_eq!(
            get_iwencai_api_key(Some(" from-settings ")).as_deref(),
            Some("from-settings")
        );
        std::env::remove_var("IWENCAI_API_KEY");
    }

    #[test]
    fn environment_is_the_second_tier() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var("FUYAO_API_KEY", "from-fuyao");
        assert_eq!(get_iwencai_api_key(None).as_deref(), Some("from-fuyao"));
        std::env::remove_var("FUYAO_API_KEY");

        std::env::set_var("IWENCAI_API_KEY", " from-env ");
        assert_eq!(get_iwencai_api_key(None).as_deref(), Some("from-env"));
        std::env::remove_var("IWENCAI_API_KEY");
        assert_eq!(get_iwencai_api_key(None), None);
    }

    #[test]
    fn blank_configured_key_falls_through() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::remove_var("IWENCAI_API_KEY");
        std::env::remove_var("FUYAO_API_KEY");
        std::env::remove_var("HITHINK_FINANCE_API_KEY");
        assert_eq!(get_iwencai_api_key(Some("   ")), None);
    }
}
