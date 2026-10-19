use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub const USER_CHAR_LIMIT: usize = 1500;
pub const MEMORY_CHAR_LIMIT: usize = 2500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryManifest {
    pub user_md: String,
    pub memory_md: String,
    pub soul_md: String,
    pub user_chars: usize,
    pub memory_chars: usize,
    pub user_limit: usize,
    pub memory_limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryMutation {
    pub target: String,      // "USER", "MEMORY", or "SOUL"
    pub action: String,      // "REPLACE_ALL", "ADD", "UPDATE", "DELETE"
    pub section: Option<String>,
    pub old_text: Option<String>,
    pub new_text: Option<String>,
}

#[derive(Clone)]
pub struct MemoryEngine {
    base_dir: PathBuf,
    manifest_cache: Arc<RwLock<Option<MemoryManifest>>>,
}

impl MemoryEngine {
    pub fn new(app_dir: &Path) -> Self {
        let base_dir = app_dir.join("agent_memories");
        if !base_dir.exists() {
            let _ = fs::create_dir_all(&base_dir);
        }
        let engine = Self {
            base_dir,
            manifest_cache: Arc::new(RwLock::new(None)),
        };
        engine.ensure_defaults();
        engine
    }

    pub fn soul_path(&self) -> PathBuf { self.base_dir.join("SOUL.md") }
    pub fn user_path(&self) -> PathBuf { self.base_dir.join("USER.md") }
    pub fn memory_path(&self) -> PathBuf { self.base_dir.join("MEMORY.md") }

    fn ensure_defaults(&self) {
        if !self.soul_path().exists() {
            let default_soul = "# Identity & Core Operating Principles (SOUL.md)\n\n\
- **核心定位**：你是 AI Finance Moyu 专属的 A 股量化与盘面逻辑副驾驶（Financial Copilot）。\n\
- **语言风格**：沉稳、干练、客观、惜字如金。严禁任何 AI 官腔套话（如“投资有风险”、“作为人工智能模型”）。\n\
- **逆人性风控**：面对用户在盘中的冲动追高或扛单不愿止损，共情其心理压力，但坚决用客观量价与既定交易纪律予以冷静唤醒。\n\
- **思维与输出分离**：在给出正式建议前，于 <thought> 标签内进行严密的微观盘口推演、买卖力道核算与多空推演；在正式回复中仅呈现最精炼的结论与关键点位。\n\
- **合规底线**：严守 2024-08 交易所新规，绝不讨论实时北向资金，聚焦两市总成交额环比放缩量。\n";
            let _ = self.atomic_write(&self.soul_path(), default_soul);
        }

        if !self.user_path().exists() {
            let default_user = "# User Profile & Trading Identity (USER.md)\n\n\
## Basic Profile\n\
- 风险偏好: 平衡稳健型 (日内可承受最大回撤 2.5%)\n\
- 交易周期: 短线波段 + 日内 T+0 防守\n\n\
## Trading Habits & Style\n\
- 核心纪律: 严守止损红线，拒绝盘中无脑追高超 5% 的标的\n\
- 仓位控制: 单票开仓不超过 30%，午后 14:00 后无板块共振绝不开新仓\n\
- 止损规则: 跌破 5 日均线无条件减半，跌破止损线坚决离场\n";
            let _ = self.atomic_write(&self.user_path(), default_user);
        }

        if !self.memory_path().exists() {
            let default_mem = "# Financial Memory Ledger (MEMORY.md)\n\n\
## Active Portfolio Commitments\n\
- 牢记 2024-08 北向停更红线，宏观聚焦两市总成交额及环比放缩量\n\
- 坚持确定性金融计算，拒绝模型在脑中做浮点心算\n";
            let _ = self.atomic_write(&self.memory_path(), default_mem);
        }
    }

    pub fn load_manifest(&self) -> MemoryManifest {
        let soul_md = fs::read_to_string(self.soul_path()).unwrap_or_default();
        let user_md = fs::read_to_string(self.user_path()).unwrap_or_default();
        let memory_md = fs::read_to_string(self.memory_path()).unwrap_or_default();
        
        let manifest = MemoryManifest {
            user_chars: user_md.chars().count(),
            memory_chars: memory_md.chars().count(),
            user_limit: USER_CHAR_LIMIT,
            memory_limit: MEMORY_CHAR_LIMIT,
            soul_md,
            user_md,
            memory_md,
        };

        if let Ok(mut cache) = self.manifest_cache.write() {
            *cache = Some(manifest.clone());
        }
        manifest
    }

    /// 原子写入文件：先写 .tmp，再做原子重命名，防止写入中途崩溃破损
    fn atomic_write(&self, target_path: &Path, content: &str) -> Result<(), String> {
        let tmp_path = target_path.with_extension("tmp");
        {
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&tmp_path)
                .map_err(|e| format!("创建临时记忆文件失败: {}", e))?;
            file.write_all(content.as_bytes())
                .map_err(|e| format!("写入记忆文件失败: {}", e))?;
            file.sync_all().map_err(|e| format!("刷盘失败: {}", e))?;
        }
        fs::rename(&tmp_path, target_path).map_err(|e| format!("原子更新记忆文件失败: {}", e))?;
        Ok(())
    }

    /// 应用外部或提取器的记忆变更指令
    pub fn apply_mutation(&self, m: &MemoryMutation, app: Option<&AppHandle>) -> Result<(), String> {
        let (file_path, limit) = match m.target.as_str() {
            "SOUL" | "SOUL.md" => (self.soul_path(), 4000),
            "USER" | "USER.md" => (self.user_path(), USER_CHAR_LIMIT),
            _ => (self.memory_path(), MEMORY_CHAR_LIMIT),
        };

        let mut current = fs::read_to_string(&file_path).unwrap_or_default();

        match m.action.as_str() {
            "REPLACE_ALL" => {
                if let Some(ref new_val) = m.new_text {
                    current = new_val.clone();
                }
            }
            "ADD" | "APPEND" => {
                if let (Some(ref sec), Some(ref text)) = (&m.section, &m.new_text) {
                    let needle = format!("## {}", sec);
                    if let Some(pos) = current.find(&needle) {
                        let insert_idx = pos + needle.len();
                        current.insert_str(insert_idx, &format!("\n- {}", text.trim()));
                    } else {
                        current.push_str(&format!("\n\n## {}\n- {}", sec, text.trim()));
                    }
                }
            }
            "UPDATE" => {
                if let (Some(ref old_t), Some(ref new_t)) = (&m.old_text, &m.new_text) {
                    if current.contains(old_t) {
                        current = current.replacen(old_t, new_t, 1);
                    }
                }
            }
            "DELETE" => {
                if let Some(ref old_t) = m.old_text {
                    current = current.replace(&format!("- {}", old_t), "");
                    current = current.replace(old_t, "");
                }
            }
            _ => return Err(format!("不支持的记忆变更动作: {}", m.action)),
        }

        if current.chars().count() > limit {
            return Err(format!(
                "记忆文件 [{}] 超出字符容量上限 ({} > {})，拒绝写入！请先精简合并。",
                m.target, current.chars().count(), limit
            ));
        }

        self.atomic_write(&file_path, &current)?;
        let _ = self.load_manifest();

        if let Some(h) = app {
            let _ = h.emit("memory-updated", ());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_engine_defaults_and_mutation() {
        let temp_dir = std::env::temp_dir().join(format!("ai_test_mem_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let engine = MemoryEngine::new(&temp_dir);
        let manifest = engine.load_manifest();

        assert!(manifest.user_md.contains("User Profile"));
        assert!(manifest.memory_md.contains("Financial Memory Ledger"));

        // Test APPEND
        let mutation = MemoryMutation {
            target: "USER.md".to_string(),
            action: "APPEND".to_string(),
            section: Some("Trading Habits & Style".to_string()),
            new_text: Some("单只标的最大仓位严格控制在 30% 以内。".to_string()),
            old_text: None,
        };
        engine.apply_mutation(&mutation, None).expect("mutation should succeed");
        let updated = engine.load_manifest();
        assert!(updated.user_md.contains("单只标的最大仓位严格控制在 30% 以内。"));

        // Clean up temp dir
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}


