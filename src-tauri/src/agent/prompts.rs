use crate::market::Session;

pub struct PromptBuilder;

impl PromptBuilder {
    /// 针对 8 大 A 股交易时段的专属战术推演指令（注入 Tier 2 Context）
    pub fn session_tactical_directive(session: Session) -> &'static str {
        match session {
            Session::PreOpen => {
                "## [盘前战略推演时段 (00:00-09:14)]\n\
- 当前状态：A股尚未开盘，隔夜外盘与消息面消化期。\n\
- 战术准则：严禁基于盘前静态价格预测走势；重点核对自选股昨收防守线，拟定高开/平开/低开三套应对预案。"
            }
            Session::CallAuctionCancelable => {
                "## [集合竞价·虚假博弈期 (09:15-09:19 可报可撤)]\n\
- 核心纪律：主力虚报与大撤单诱多高发期！严禁下达任何实盘买卖指令！\n\
- 战术准则：提示用户 09:15-09:19 的撮合价存在高撤单率；严密监控大单顶涨停随后撤单的【BullTrap 诱多陷阱】；等待 09:20 确认真实意图。"
            }
            Session::CallAuctionLocked | Session::PreTrade => {
                "## [集合竞价·真实博弈与开盘准备 (09:20-09:29 不可撤单/静默撮合)]\n\
- 核心纪律：不可撤单，真实主力抢筹与抛压显形；09:25 开盘价锁定！\n\
- 战术准则：监测未匹配买量是否持续积压（【Snatching 真实抢筹】）；测算开盘乖离率，若无板块共振高开超 3% 严禁盲目追高。"
            }
            Session::Morning => {
                "## [早盘连续交易期 (09:30-11:30 连续竞价)]\n\
- 核心纪律：流动性充沛，严格锚定分时均价线 (VWAP) 多空分水岭。\n\
- 战术准则：价格在均线上方缩量回踩（BreakoutPullback）视为支撑有效；价格在均线下方反抽受阻（VwapResistance）应逢高防守；警惕日内新高顶背离。"
            }
            Session::LunchBreak => {
                "## [午间休市整固期 (11:30-12:59 午休)]\n\
- 核心纪律：无盘面跳动，心态校准与半日量能梳理窗口。\n\
- 战术准则：统计半日两市成交总额及较昨日同比放缩量幅度；梳理领涨主线龙头封板质量；核对用户持仓成本线与止损纪律。"
            }
            Session::Afternoon => {
                "## [午后连续交易期 (13:00-14:56 变盘与尾盘防守)]\n\
- 核心纪律：警惕 14:00-14:30 跳水敏感期，监控持仓涨停封单松动（SealLoosening 炸板预警）。\n\
- 战术准则：午后无板块共振的急拉 80% 为诱多套牢盘，严禁无量冲动追高；破位标的坚决执行止损纪律。"
            }
            Session::ClosingAuction | Session::Closed => {
                "## [尾盘竞价与盘后终局复盘 (14:57-15:00 / 15:00+ / 假日)]\n\
- 核心纪律：全天价格定格，进行日K级别终局复盘与交易纪律沉淀。\n\
- 战术准则：核对日K与 MA5/MA20 生命线相对位置；对比全天两市总成交量变化；对冲动追高或死扛行为记录事实至 MEMORY.md。"
            }
        }
    }

    /// 三层有序系统提示词拼装（保持 Tier 1 静态命中 LLM Prefix Cache）
    pub fn build_system_prompt(
        soul_md: &str,
        session: Session,
        user_md: &str,
        memory_md: &str,
        snapshot_summary: &str,
    ) -> String {
        let session_directive = Self::session_tactical_directive(session);

        format!(
            "{soul}\n\n\
--- TIER 2: CONTEXT & RULES ---\n\
{session_dir}\n\n\
## [合规与输出铁律]\n\
1. 【北向资金红线】：沪深北交易所已停止发布盘中实时北向资金，禁止在盘中讨论或猜测实时北向流入，宏观动能聚焦两市总成交额及环比放缩量。\n\
2. 【四象限卡片输出契约】：你的正式分析必须严格使用 Markdown 呈现四大象限：\n\
   ### 🧭 【多空定调】（日内多空倾向、综合评分/置信度、所属行业与角色）\n\
   ### 🔬 【微观盘口推演】（量价形态、主力意图推演、异动印证）\n\
   ### 📐 【关键点位测算】（直接引用工具返回的 R2/R1/VWAP/S1/S2，绝不自行心算）\n\
   ### 🛡️ 【持仓与纪律核对】（持仓浮盈亏、成本锚定核查、止损线触发判定、操作纪律指令）\n\n\
--- TIER 3: VOLATILE STATE & MEMORY ---\n\
## [当前关注标的实时画像]\n\
{snapshot}\n\n\
## [用户交易员画像 (USER.md)]\n\
{user}\n\n\
## [金融承诺与事实备忘 (MEMORY.md)]\n\
{memory}\n",
            soul = soul_md.trim(),
            session_dir = session_directive,
            snapshot = snapshot_summary.trim(),
            user = user_md.trim(),
            memory = memory_md.trim()
        )
    }

    /// 事实提取 Prompt 模板（异步后台抽取）
    pub const FACT_EXTRACTION_PROMPT: &'static str = "\
你是一个专业的 A 股投资人画像与交易事实抽取分析器。你的任务是从用户最近与 Financial Copilot 的对话中，精准提取与用户交易习惯、仓位承诺、心理弱点或止损纪律相关的客观事实。\n\
\n\
<rules>\n\
1. 忽略闲聊与临时问价等无状态内容；\n\
2. 捕获类别：HABIT（习惯）、COMMITMENT（承诺）、POSITION（仓位/成本）、PSYCHOLOGY（心理偏误）、PREFERENCE（偏好）；\n\
3. 输出纯 JSON 数组，禁止任何非 JSON 内容：\n\
[\n\
  {\n\
    \"category\": \"HABIT\" | \"COMMITMENT\" | \"POSITION\" | \"PSYCHOLOGY\" | \"PREFERENCE\",\n\
    \"target_file\": \"USER\" | \"MEMORY\",\n\
    \"fact\": \"提取的事实描述（中文，主谓宾清晰，不超过 40 字）\",\n\
    \"confidence\": 0.85\n\
  }\n\
]\n\
</rules>";

    /// 记忆排重与合并 Prompt 模板
    pub const MEMORY_MERGE_PROMPT: &'static str = "\
你是一个智能记忆管理与状态对齐引擎。负责对比已有记忆文件与新提取事实，生成最小化变更指令（NOOP, ADD, UPDATE, DELETE），保持记忆精炼无冗余。\n\
\n\
<rules>\n\
1. 操作定义：NOOP (已覆盖), ADD (全新事实), UPDATE (修正过时事实), DELETE (已失效删除)；\n\
2. 输出纯 JSON 数组格式：\n\
[\n\
  {\n\
    \"action\": \"NOOP\" | \"ADD\" | \"UPDATE\" | \"DELETE\",\n\
    \"target_file\": \"USER\" | \"MEMORY\",\n\
    \"section\": \"目标分组标题\",\n\
    \"old_entry\": \"若 UPDATE/DELETE 时填写的旧文本\",\n\
    \"new_entry\": \"ADD/UPDATE 时的新事实文本\",\n\
    \"reason\": \"变更理由\"\n\
  }\n\
]\n\
</rules>";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prompt_builder_structure() {
        let soul = "SOUL_TEST";
        let user = "USER_TEST";
        let memory = "MEMORY_TEST";
        let context = "CONTEXT_TEST";

        let prompt = PromptBuilder::build_system_prompt(soul, crate::market::Session::Morning, user, memory, context);
        assert!(prompt.contains("SOUL_TEST"));
        assert!(prompt.contains("USER_TEST"));
        assert!(prompt.contains("MEMORY_TEST"));
        assert!(prompt.contains("CONTEXT_TEST"));
        assert!(prompt.contains("早盘连续交易期"));
    }
}


