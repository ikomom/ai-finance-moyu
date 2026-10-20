//! iWenCai (同花顺问财) OpenAPI credentials.
//!
//! Resolution order follows AGENTS.md §2 exactly, and nothing else is consulted:
//!   1. the key the user saved in the in-app settings;
//!   2. the `IWENCAI_API_KEY` environment variable;
//!   3. no key → the caller falls back to its baseline cache.
//!
//! An earlier revision also read `~/.agents/skills/tools/iwencai-skillhub-cli/key.txt`,
//! i.e. a private credential file that belongs to an unrelated tool. Silently
//! harvesting another application's secret is both outside the documented chain
//! and a privacy surprise for anyone who happens to have that tool installed.

pub fn get_iwencai_api_key(configured_key: Option<&str>) -> Option<String> {
    if let Some(key) = configured_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Ok(key) = std::env::var("IWENCAI_API_KEY") {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
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
        std::env::set_var("IWENCAI_API_KEY", " from-env ");
        assert_eq!(get_iwencai_api_key(None).as_deref(), Some("from-env"));
        std::env::remove_var("IWENCAI_API_KEY");
        assert_eq!(get_iwencai_api_key(None), None);
    }

    #[test]
    fn blank_configured_key_falls_through() {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::remove_var("IWENCAI_API_KEY");
        assert_eq!(get_iwencai_api_key(Some("   ")), None);
    }
}
