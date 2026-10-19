//! Loop guard for the agent's tool-calling loop.
//!
//! Two distinct operations, deliberately separate:
//!
//! * [`ToolCallGuardrailController::precheck`] — read-only, decides whether this
//!   exact call is allowed to run.
//! * [`ToolCallGuardrailController::record_result`] — mutates the failure streak
//!   after the call actually ran.
//!
//! They used to be one `evaluate(.., is_error)` method called *before* execution
//! with `is_error = false`, which reset the very streak it was supposed to
//! accumulate: the counter could never climb past 1, so `HardHalt` was
//! unreachable and the "防死循环" guarantee did not exist.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

/// Consecutive identical failures tolerated before the call is blocked outright.
const BLOCK_AFTER: usize = 3;
/// Consecutive identical failures after which the model is warned.
const WARN_AFTER: usize = 2;

/// What the caller should do with a pending tool call.
#[derive(Debug, PartialEq, Eq, Clone)]
pub enum GuardrailDecision {
    /// Run it.
    Allow,
    /// Run it, but feed a warning back to the model alongside the result.
    Warning(String),
    /// Do not run it — the call has failed too many times in this turn.
    HardHalt(String),
}

/// Tracks tool calls by content hash to detect loops and repeated failures.
pub struct ToolCallGuardrailController {
    failure_streaks: HashMap<u64, usize>,
    exact_failure_block_after: usize,
    max_steps: usize,
    current_step: usize,
}

impl ToolCallGuardrailController {
    pub fn new(max_steps: usize, exact_failure_block_after: usize) -> Self {
        Self {
            failure_streaks: HashMap::new(),
            exact_failure_block_after,
            max_steps,
            current_step: 0,
        }
    }

    /// Reset per-turn counters. Failure streaks survive within a turn on purpose:
    /// they are what stops the model from retrying the same broken call.
    pub fn start_turn(&mut self) {
        self.current_step = 0;
        self.failure_streaks.clear();
    }

    /// Count one LLM round-trip and fail once the budget is exhausted.
    pub fn check_step_limit(&mut self) -> Result<(), String> {
        self.current_step += 1;
        if self.current_step > self.max_steps {
            return Err(format!(
                "达到单次对话最大工具执行步数 ({})，强制中止，防止死循环！",
                self.max_steps
            ));
        }
        Ok(())
    }

    fn call_hash(tool_name: &str, args_json: &str) -> u64 {
        let mut hasher = DefaultHasher::new();
        tool_name.hash(&mut hasher);
        args_json.hash(&mut hasher);
        hasher.finish()
    }

    fn streak(&self, tool_name: &str, args_json: &str) -> usize {
        self.failure_streaks
            .get(&Self::call_hash(tool_name, args_json))
            .copied()
            .unwrap_or(0)
    }

    /// Read-only: may this exact call run again?
    pub fn precheck(&self, tool_name: &str, args_json: &str) -> GuardrailDecision {
        let streak = self.streak(tool_name, args_json);
        if streak >= self.exact_failure_block_after {
            GuardrailDecision::HardHalt(format!(
                "工具 '{tool_name}' 同一参数已连续失败 {streak} 次，触发熔断保护，阻断重复无效调用！"
            ))
        } else if streak >= WARN_AFTER {
            GuardrailDecision::Warning(format!(
                "警告：工具 '{tool_name}' 同一参数已连续失败 {streak} 次，请调整参数策略或向用户请示。"
            ))
        } else {
            GuardrailDecision::Allow
        }
    }

    /// Mutating: account for the outcome of a call that actually executed.
    pub fn record_result(&mut self, tool_name: &str, args_json: &str, is_error: bool) {
        let hash = Self::call_hash(tool_name, args_json);
        if is_error {
            *self.failure_streaks.entry(hash).or_insert(0) += 1;
        } else {
            self.failure_streaks.remove(&hash);
        }
    }
}

impl Default for ToolCallGuardrailController {
    fn default() -> Self {
        Self::new(10, BLOCK_AFTER)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step_limit_enforcement() {
        let mut controller = ToolCallGuardrailController::new(2, 3);
        assert!(controller.check_step_limit().is_ok());
        assert!(controller.check_step_limit().is_ok());
        assert!(controller.check_step_limit().is_err());

        controller.start_turn();
        assert!(controller.check_step_limit().is_ok());
    }

    /// The regression that motivated the split: precheck must NOT clear the
    /// streak, otherwise the real execute-loop never reaches `HardHalt`.
    #[test]
    fn precheck_is_read_only_and_streak_accumulates() {
        let mut c = ToolCallGuardrailController::new(10, 3);
        let (tool, args) = ("get_security_snapshot", r#"{"symbol":"sh600519"}"#);

        // Attempt 1 & 2: clean. Attempt 3: warned (streak already 2). Attempt 4: blocked.
        assert_eq!(c.precheck(tool, args), GuardrailDecision::Allow);
        c.record_result(tool, args, true);
        assert_eq!(c.precheck(tool, args), GuardrailDecision::Allow);
        c.record_result(tool, args, true);
        assert_eq!(c.streak(tool, args), 2);

        assert!(matches!(c.precheck(tool, args), GuardrailDecision::Warning(_)));
        c.record_result(tool, args, true);
        assert_eq!(c.streak(tool, args), 3);

        match c.precheck(tool, args) {
            GuardrailDecision::HardHalt(msg) => assert!(msg.contains("熔断保护")),
            other => panic!("expected HardHalt, got {other:?}"),
        }
        // Precheck stayed read-only through all of that.
        assert_eq!(c.streak(tool, args), 3);
    }

    #[test]
    fn success_resets_the_streak() {
        let mut c = ToolCallGuardrailController::new(10, 3);
        let (tool, args) = ("calc_portfolio_risk", r#"{"symbol":"sh600000"}"#);
        c.record_result(tool, args, true);
        c.record_result(tool, args, true);
        assert_eq!(c.streak(tool, args), 2);

        c.record_result(tool, args, false);
        assert_eq!(c.streak(tool, args), 0);
        assert_eq!(c.precheck(tool, args), GuardrailDecision::Allow);
    }

    #[test]
    fn different_arguments_do_not_share_a_streak() {
        let mut c = ToolCallGuardrailController::new(10, 3);
        c.record_result("t", r#"{"a":1}"#, true);
        c.record_result("t", r#"{"a":1}"#, true);
        c.record_result("t", r#"{"a":1}"#, true);
        assert_eq!(c.streak("t", r#"{"a":1}"#), 3);
        assert_eq!(c.streak("t", r#"{"a":2}"#), 0);
        assert_eq!(c.precheck("t", r#"{"a":2}"#), GuardrailDecision::Allow);
    }
}
