//! Unit tests for `logger`.
//!
//! Kept in their own file so the implementation stays inside the 300-line
//! budget mandated by AGENTS.md §11.

    use super::*;
    static TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn ring_buffer_respects_capacity() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_memory_entries();
        let logger = &LOGGER;
        use log::Log;

        for i in 0..250 {
            let msg = format!("test message {i}");
            let args = format_args!("{msg}");
            let record = Record::builder()
                .args(args)
                .level(Level::Info)
                .target("TEST")
                .build();
            logger.log(&record);
        }

        let entries = get_recent_entries(Some("TEST"), None);
        assert_eq!(entries.len(), MAX_MEMORY_ENTRIES);
        assert_eq!(entries.last().unwrap().message, "test message 249");
    }

    #[test]
    fn filtering_by_level_and_target() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_memory_entries();
        let logger = &LOGGER;
        use log::Log;

        let r1 = Record::builder().args(format_args!("m1")).level(Level::Info).target("ALERT").build();
        let r2 = Record::builder().args(format_args!("m2")).level(Level::Warn).target("NET").build();
        let r3 = Record::builder().args(format_args!("m3")).level(Level::Error).target("ALERT").build();
        logger.log(&r1);
        logger.log(&r2);
        logger.log(&r3);

        let alert_entries = get_recent_entries(Some("ALERT"), None);
        assert_eq!(alert_entries.len(), 2);

        let warn_entries = get_recent_entries(None, Some("WARN"));
        assert_eq!(warn_entries.len(), 1);
        assert_eq!(warn_entries[0].message, "m2");
    }
