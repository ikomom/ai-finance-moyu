//! Unit tests for `config`.
//!
//! Kept in their own file so the implementation stays inside the 300-line
//! budget mandated by AGENTS.md §11.

    use super::*;
    use crate::crossing::{LineDirection, PriceLine};

    #[test]
    fn defaults_are_sane() {
        let c = Config::default();
        assert!(!c.watchlist.is_empty());
        assert_eq!(c.layout, Layout::Mini);
        assert!(c.opacity > 0.0 && c.opacity <= 1.0);
        assert!(c.poll_quotes_ms >= 1000);
        assert!(c.poll_trend_ms > c.poll_quotes_ms);
    }

    #[test]
    fn default_codes_are_all_canonically_prefixed() {
        for w in Config::default().watchlist {
            let n = crate::market::normalize_code(&w.code).expect("default code must normalize");
            assert_eq!(n, w.code, "默认自选股必须是规范前缀形式");
        }
    }

    #[test]
    fn round_trips_through_json() {
        let mut c = Config {
            layout: Layout::List,
            ..Default::default()
        };
        c.watchlist[3].cost_price = Some(9.8);
        c.watchlist[3].alert_pct = Some(5.0);
        c.watchlist[3].price_lines = vec![
            PriceLine { price: 10.5, label: Some("压力".into()), direction: LineDirection::Above },
            PriceLine { price: 9.5, label: None, direction: LineDirection::Below },
        ];

        let json = serde_json::to_string(&c).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(c, back);
    }

    /// The optional fields are omitted from the file when unset, so a
    /// hand-edited config stays readable.
    #[test]
    fn omits_empty_optional_fields() {
        let c = Config::default();
        let json = serde_json::to_string(&c).unwrap();
        assert!(!json.contains("costPrice"));
        assert!(!json.contains("priceLines"));
        // But the required ones are present.
        assert!(json.contains("watchlist"));
        assert!(json.contains("\"layout\""));
    }

    /// A config written by an older version (missing keys) still loads.
    #[test]
    fn missing_keys_fall_back_to_defaults() {
        let partial = r#"{"watchlist":[{"code":"sh600000"}]}"#;
        let c: Config = serde_json::from_str(partial).unwrap();
        assert_eq!(c.watchlist.len(), 1);
        assert_eq!(c.layout, Layout::Mini);
        assert_eq!(c.alert_pct, 3.0);
        assert!(c.watchlist[0].price_lines.is_empty());
    }

    /// A config written before `hotkeys` existed still loads, and picks up the
    /// IME-safe defaults.
    #[test]
    fn hotkeys_default_when_absent_from_file() {
        let partial = r#"{"watchlist":[{"code":"sh600000"}]}"#;
        let c: Config = serde_json::from_str(partial).unwrap();
        assert_eq!(c.hotkeys, Hotkeys::default());
        assert_eq!(c.hotkeys.toggle, "ctrl+alt+h");
    }

    #[test]
    fn hotkeys_are_overridable_from_the_file() {
        let custom = r#"{"hotkeys":{"toggle":"ctrl+alt+q"}}"#;
        let c: Config = serde_json::from_str(custom).unwrap();
        assert_eq!(c.hotkeys.toggle, "ctrl+alt+q");
        // Unspecified chords fall back rather than becoming empty.
        assert_eq!(c.hotkeys.layout_bar, "ctrl+alt+1");
    }

    #[test]
    fn layout_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&Layout::Bar).unwrap(), "\"bar\"");
        assert_eq!(serde_json::to_string(&Layout::Mini).unwrap(), "\"mini\"");
        assert_eq!(serde_json::to_string(&Layout::List).unwrap(), "\"list\"");
        assert_eq!(serde_json::to_string(&Layout::Market).unwrap(), "\"market\"");
        assert_eq!(serde_json::to_string(&Layout::Global).unwrap(), "\"global\"");
    }

    #[test]
    fn sanitize_clamps_out_of_range_values() {
        let mut c = Config {
            opacity: 5.0,
            alert_pct: 0.0,
            poll_quotes_ms: 5,
            poll_trend_ms: 1,
            ..Default::default()
        };
        c.window.width = 99999.0;
        c.sanitize();

        assert_eq!(c.opacity, 1.0);
        assert_eq!(c.alert_pct, 0.1);
        assert_eq!(c.poll_quotes_ms, 1000);
        assert_eq!(c.poll_trend_ms, 5000);
        assert_eq!(c.window.width, 1200.0);
    }


    /// Guards the IME decision: no default chord may use Ctrl+Shift, which is
    /// the Chinese IME switch chord on Windows.
    #[test]
    fn default_hotkeys_avoid_the_ime_switch_modifier() {
        let h = Hotkeys::default();
        for chord in [&h.toggle, &h.layout_bar, &h.layout_mini, &h.layout_list, &h.layout_market] {
            let lower = chord.to_ascii_lowercase();
            assert!(lower.contains("ctrl"), "{chord} should use Ctrl");
            assert!(lower.contains("alt"), "{chord} should use Alt");
            assert!(!lower.contains("shift"), "{chord} must not use Ctrl+Shift (IME switch)");
        }
        // And they must not collide with each other.
        let mut all = vec![&h.toggle, &h.layout_bar, &h.layout_mini, &h.layout_list, &h.layout_market];
        let n = all.len();
        all.sort();
        all.dedup();
        assert_eq!(all.len(), n, "default hotkeys must be distinct");
    }


    #[test]
    fn data_source_defaults_to_tencent_and_round_trips() {
        assert_eq!(Config::default().data_source, DataSource::Tencent);
        assert_eq!(serde_json::to_string(&DataSource::Sina).unwrap(), "\"sina\"");
        let back: DataSource = serde_json::from_str("\"sina\"").unwrap();
        assert_eq!(back, DataSource::Sina);
    }

    /// A config file written before data sources existed still loads.
    #[test]
    fn data_source_defaults_when_absent() {
        let c: Config = serde_json::from_str(r#"{"watchlist":[{"code":"sh600000"}]}"#).unwrap();
        assert_eq!(c.data_source, DataSource::Tencent);
    }

    #[test]
    fn layout_sizes_start_empty_and_remember_per_layout() {
        let mut s = LayoutSizes::default();
        assert_eq!(s.get(Layout::Mini), None);

        s.set(Layout::Mini, 400.0, 260.0);
        s.set(Layout::List, 360.0, 500.0);
        assert_eq!(s.get(Layout::Mini), Some((400.0, 260.0)));
        assert_eq!(s.get(Layout::List), Some((360.0, 500.0)));
        // Untouched layouts stay on auto.
        assert_eq!(s.get(Layout::Bar), None);

        s.clear(Layout::Mini);
        assert_eq!(s.get(Layout::Mini), None);
    }

    /// Unset sizes are omitted so the file stays readable.
    #[test]
    fn layout_sizes_omit_unset_entries() {
        let c = Config::default();
        let json = serde_json::to_string(&c).unwrap();
        assert!(!json.contains("layoutSizes"));
    }

    /// A nonsense size from a hand-edited file falls back to auto rather than
    /// producing an unusable window.
    #[test]
    fn sanitize_rejects_bogus_layout_sizes() {
        let mut c = Config::default();
        c.layout_sizes.set(Layout::Mini, 0.0, 0.0);
        c.layout_sizes.set(Layout::List, f64::NAN, 400.0);
        c.layout_sizes.set(Layout::Bar, 500.0, 200.0);
        c.sanitize();

        assert_eq!(c.layout_sizes.get(Layout::Mini), None, "zero size must fall back to auto");
        assert_eq!(c.layout_sizes.get(Layout::List), None, "NaN must fall back to auto");
        assert_eq!(c.layout_sizes.get(Layout::Bar), Some((500.0, 32.0)));
    }

    #[test]
    fn sanitize_clamps_oversized_layout_size() {
        let mut c = Config::default();
        c.layout_sizes.set(Layout::Mini, 99999.0, 99999.0);
        c.sanitize();
        assert_eq!(c.layout_sizes.get(Layout::Mini), None);
    }

    #[test]
    fn per_security_alert_overrides_global() {
        let mut w = WatchItem::new("sh600000");
        assert_eq!(w.spec(3.0).alert_pct, Some(3.0));
        w.alert_pct = Some(7.0);
        assert_eq!(w.spec(3.0).alert_pct, Some(7.0));
    }

    #[test]
    fn visibility_mode_defaults_and_round_trips() {
        assert_eq!(Config::default().visibility_mode, VisibilityMode::Always);
        assert_eq!(serde_json::to_string(&VisibilityMode::Hover).unwrap(), "\"hover\"");
        assert_eq!(serde_json::to_string(&VisibilityMode::DblClick).unwrap(), "\"dblclick\"");
        let back: VisibilityMode = serde_json::from_str("\"dblclick\"").unwrap();
        assert_eq!(back, VisibilityMode::DblClick);
    }

    #[test]
    fn indicator_config_defaults_and_sanitizes() {
        let mut c = Config::default();
        assert_eq!(c.indicator_config.preset, "classic");
        assert_eq!(c.indicator_config.ma, [5, 10, 20]);
        assert_eq!(c.indicator_config.macd, [12, 26, 9]);

        // Hand-edited invalid preset and out-of-range params
        c.indicator_config.preset = "invalid_preset".into();
        c.indicator_config.ma = [0, 999, 10];
        c.watchlist[0].indicator_mode = Some("unknown_mode".into());
        c.watchlist[0].custom_ma = Some([0, 1000, 5]);

        c.sanitize();

        assert_eq!(c.indicator_config.preset, "classic");
        assert_eq!(c.indicator_config.ma, [1, 250, 10]);
        assert_eq!(c.watchlist[0].indicator_mode, None);
        assert_eq!(c.watchlist[0].custom_ma, Some([1, 250, 5]));
    }

    #[test]
    fn theme_defaults_and_round_trips() {
        let mut c = Config::default();
        assert_eq!(c.theme, "dark");

        c.theme = "light".into();
        let json = serde_json::to_string(&c).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(back.theme, "light");

        // Invalid theme gets sanitized back to dark
        c.theme = "unknown_theme".into();
        c.sanitize();
        assert_eq!(c.theme, "dark");
    }
