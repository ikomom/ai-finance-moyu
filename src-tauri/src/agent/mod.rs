//! AI Financial Copilot Agent 核心子系统
//! 融合 Hermes Agent 3-Tier 提示词拼装、工具调用守卫熔断与 Inflection Pi 关系型长期记忆机制

pub mod client;
pub mod config;
pub mod extractor;
pub mod fallback;
pub mod finance_tools;
pub mod guardrails;
pub mod health;
pub mod history;
pub mod loop_engine;
pub mod memory;
pub mod profile;
pub mod prompts;

pub use client::{ChatMessage, LlmClient, LlmConfig, StreamEvent};
pub use config::TransportConfig;
pub use extractor::BackgroundMemoryExtractor;
pub use fallback::HeuristicFallbackEngine;
pub use finance_tools::FinanceTools;
pub use guardrails::{GuardrailDecision, ToolCallGuardrailController};
pub use health::HealthReport;
pub use history::{ChatMessageItem, ChatSession, ChatSessionSummary, SessionEngine};
pub use loop_engine::LoopEngine;
pub use memory::{MemoryEngine, MemoryManifest, MemoryMutation};
pub use profile::LlmProfile;
pub use prompts::PromptBuilder;
