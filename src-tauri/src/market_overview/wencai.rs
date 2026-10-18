//! iWenCai (同花顺问财) OpenAPI credentials and key discovery.

fn dirs_home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)
}

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

    if let Some(home) = dirs_home_dir() {
        let key_path = home
            .join(".agents")
            .join("skills")
            .join("tools")
            .join("iwencai-skillhub-cli")
            .join("key.txt");
        if let Ok(content) = std::fs::read_to_string(key_path) {
            for line in content.lines() {
                if let Some(val) = line.strip_prefix("IWENCAI_API_KEY=") {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}
