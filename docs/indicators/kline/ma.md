# 移动平均线系统 (MA5, MA10, MA20) 需求与算法规范

> 模块分类：`kline`  
> 适用标的：`[个股 | 板块 | 大盘指数 | 全球指数]`  
> 核心标签：`[趋势动量 | 多周期量价 | 动态支撑阻力 | 极简防窥]`  
> 对应代码实现：[indicators.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/indicators.rs) (Rust 后端) / [indicators.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/indicators.ts) (TS 动态重算) / [KlineCanvas.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KlineCanvas.tsx) & [KLineBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KLineBadge.tsx) (前端呈现)  
> 对应单元测试：[kline_tests.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/tests/kline_tests.rs) (Rust 单元测试) / [indicators.test.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/indicators.test.ts) (Vitest 前端测试)  

---

## 1. 业务定位与看盘指引

### 1.1 业务定义与核心意图
- **定义**：移动平均线（Moving Average, 简称 MA）是将特定周期内的收盘价加以算术平均，并随着时间推移连续绘制而成的平滑成本曲线。本项目标准配置采用经典短中周期量价组合：
  - **MA5（5日攻击线 / 周均线）**：反映一周交易日内的多空博弈均价与进攻动能，对短线价格波动最敏感；
  - **MA10（10日操盘线 / 半月线）**：反映波段持仓成本，是短线回踩与趋势加速的强弱分界线；
  - **MA20（20日生命线 / 月均线）**：代表近一个月机构与主力资金的平均成本底线，是中线多空格局与趋势防守的核心分水岭。
- **看盘痛点与价值**：
  - **桌面防窥与摸鱼场景**：办公环境中交易者无法长时间铺满庞大的 K 线分析软件，频繁盯盘容易受到日内随机噪声干扰。
  - **双核快判决策**：本项目一方面在微型绘图区（`KlineCanvas.tsx`）以高对比度、自适应缩放的极简曲线展现均线走势；另一方面在挂件徽标（`KLineBadge.tsx`）及诊断卡片（`KLineBadgePopover.tsx`）中输出 3 秒直读的大白话结论（如 `▲ 站稳MA5 · 顺势看多`、`❄️ 承压MA20 · 防守控仓`、微缩态 `多头(看多)`），帮助用户以最低视觉成本迅速看清主力趋势。

### 1.2 关键信号解读
- **看多 / 买点信号**：
  - **均线多头排列 (`bull_aligned`)**：满足 \( \text{MA5} > \text{MA10} > \text{MA20} \)，且最新价格稳站于 MA5 之上（\( C \ge \text{MA5} \)）。说明不同周期持筹者普遍盈利，买盘共振上行，系统判定为「顺势看多」。
  - **均线黄金交叉 (Golden Cross)**：MA5 自下而上强力穿越 MA10 或 MA20，表明短线动能超越中长期平均成本，往往伴随买点确立。
  - **生命线承托与良性回踩 (`above_ma20`)**：价格处于 MA20 之上且 \( \text{MA5} \ge \text{MA20} \)。若价格短线跌破 MA5（\( C < \text{MA5} \)）但获得 MA20 强承托，判定为「良性回踩，观察支撑」；若重回 MA5 之上，判定为「持股待涨」。
- **看空 / 卖点信号**：
  - **均线空头排列 (`bear_aligned`)**：满足 \( \text{MA5} < \text{MA10} < \text{MA20} \)，且最新价格受制于 MA5（\( C \le \text{MA5} \)）。说明上方套牢盘沉重，空方占据主导，系统发出「严格止损」警示。
  - **均线死亡交叉 (Death Cross)**：MA5 自上而下跌破 MA10 或 MA20，短线动能衰竭转弱。
  - **跌破生命线 (`below_ma20`)**：收盘价或最新价破位 MA20（\( C < \text{MA20} \)），中期上升趋势遭到破坏，反抽阻力增强，系统提示「防守控仓」。
- **中性与警示信号**：
  - **均线纠缠与蓄势整理 (`neutral`)**：短期与中长期均线高度重合纠缠，价格在密集区震荡整理，系统判定为「均线蓄势，等待方向选择」。
  - **顶背离超买警示 (Combined with KDJ J)**：在均线呈现多头排列背景下，若日线 J 值超过 100（\( J > 100 \)），触发警示「日线多头但短线 J 严重超买，谨防冲高回落」，操盘动作切换为「逢高止盈」，徽标色阶升为警告黄（`warn`）。
  - **底背离超卖警示 (Combined with KDJ J)**：在均线呈现空头排列背景下，若日线 J 值低于 10（\( J < 10 \)），触发警示「空头承压但日线 J 极度超卖，严防地板盲目杀跌」，操盘动作切换为「谨防杀跌」，色阶转为中性灰（`neutral`）。

### 1.3 UI 呈现与防窥规范
- **宿主组件体系**：
  - 核心绘图画布：[KlineCanvas.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KlineCanvas.tsx) 与 [klineBarsOverlay.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/klineBarsOverlay.ts)；
  - 状态快判徽标：[KLineBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KLineBadge.tsx)；
  - 详尽诊断抽屉与气泡：[KLineBadgePopover.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KLineBadgePopover.tsx)。
- **图表与视觉规范**：
  - **曲线线宽**：统一为 `1.2px`，保障小分辨率下线条纤细锐利且无锯齿。
  - **标准色标绑定**：
    - MA5：`#f59e0b`（琥珀金黄，`COLOR_MA5`）；
    - MA10：`#c084fc`（薰衣草紫，`COLOR_MA10`）；
    - MA20：`#38bdf8`（天蓝/青蓝，`COLOR_MA20`）。
  - **图例展示 (Legend Overlay)**：位于画布左上方，格式为 `MA5:12.34  MA10:12.00  MA20:11.50`，文本颜色严格与对应均线颜色一致。十字光标移动时跟随展示悬浮柱线（Active Bar）对应的均线数值。
  - **自适应视口包容**：画布在计算价格极值区间时（`minP`, `maxP`），强制纳入视口内所有柱线的 `ma5`、`ma10`、`ma20` 有效数值（[klineDraw.ts#L112-L123](file:///D:/Project/private/ai/ai-finance-moyu/src/components/klineDraw.ts#L112-L123)），确保均线曲线绝不超出视口或产生切边破损。
- **全主题自适应 (Theme Adaptability Invariant)**：
  - **暗色主题（深邃暗黑 / Cyberpunk / Ocean）**：背景呈深黑/深蓝，三色均线采用中高明度色彩，与红涨绿跌的蜡烛柱体构成清晰的前后景层次；
  - **浅色主题（办公浅色）**：严格遵循红绿高对比度红线（正红 `#dc2626`、翡翠绿 `#16a34a`）。浅色背景下，黄色 MA5 (`#f59e0b`)、紫色 MA10 (`#c084fc`) 与天蓝 MA20 (`#38bdf8`) 维持清晰可视轮廓，消除视觉孤岛与发飘刺眼反差；
  - **全局样式规范**：严禁局部静态颜色孤岛，所有组件边框、背景及副文本均继承全局 CSS 变量（`var(--card-bg)`、`var(--text-color)`、`var(--border-color)`）。
- **极简防窥要求 (Stealth Mode)**：
  - 挂件收拢为迷你模式（Compact）时，徽标压缩为 4~6 字符极简文本，如 `多头(看多)`、`回踩(支撑)`、`生命线(持)`、`承压(控仓)`、`破位(止损)`、`整理(观察)`；
  - Popover 卡片中直观输出 `BIAS5` 与 `BIAS20` 乖离率百分比（如 `+1.20%` / `-2.50%`），帮助交易者在同事侧目时通过极小面积获悉核心位置，防止敏感资产金额外泄。

---

## 2. 数学公式与算法细节

### 2.1 依赖基础数据
- **输入序列字段**：
  - 收盘价 \( C_i \)（`close`）：计算均线唯一核心序列；
  - 日期 \( D_i \)（`date`）：格式为 `YYYY-MM-DD`；
  - 前复权（QFQ）除权因子：消除历史上送股、分红派息造成的假性除权裂口；
  - 实时快照价格 \( P_{\text{live}} \)（`quote.price`）：盘中与收盘价动态联动。
- **数据时间粒度**：标准日K（`scale=240`）、周K（`scale=1200`）、及分钟级K线（`15m`, `30m`, `60m`, `120m`）。
- **样本容量**：接口标准拉取 320 根前复权 K 线，滑动计算窗口 \( N \in \{5, 10, 20\} \)。

### 2.2 核心数学公式与递推逻辑
- **简单移动平均线 (SMA) 计算公式**：
  对于时间索引为 \( i \)（\( 0 \le i < M \)，\( M \) 为总K线根数）的数据点，周期为 \( N \) 的移动平均值定义为：
  \[
  \text{MA}_N(i) = \frac{1}{N} \sum_{k=i - N + 1}^{i} C_k \quad (\text{当 } i \ge N - 1)
  \]
- **乖离率 (BIAS) 计算公式**：
  衡量当前价格（实时价 \( P \) 或收盘价 \( C \)）偏离特定均线的百分比距离：
  \[
  \text{BIAS}_N = \frac{P - \text{MA}_N}{\text{MA}_N} \times 100\%
  \]
- **参数配置规范**：
  - 后端 Rust 采用工业标准固定三周期：\( N_1 = 5 \), \( N_2 = 10 \), \( N_3 = 20 \)；
  - 前端支持灵活重配置：`periods: [number, number, number] = [5, 10, 20]`，允许按需自定义参数。

### 2.3 边界情况与冷启动处理
- **冷启动与样本不足处理**：
  - 当 \( i < 4 \) 时，\( \text{MA5} = \text{None} \)（前端对应 `null`）；
  - 当 \( i < 9 \) 时，\( \text{MA10} = \text{None} \)；
  - 当 \( i < 19 \) 时，\( \text{MA20} = \text{None} \)。
  - **连续性绘制策略**：均线渲染引擎遍历柱线切片时，严格校验 `val != null && Number.isFinite(val)`。只有当数据点有效时才启动画笔 `moveTo` / `lineTo`，不会因前期空值发生断崖折断或报错。
- **形态研判降级规则**：
  - 若总K线数 \( M < 10 \)：直接判定为 `ma_signal = "neutral"`，文案给出 `"历史数据积累中，均线平稳观察"`，动作为 `"平稳观察"`；
  - 若 \( 10 \le M < 20 \)：MA20 尚未形成，降级依赖 MA5 与当前价格关系：
    - \( C \ge \text{MA5} \)：`ma_signal = "above_ma20"`，文案 `"站稳短线均线 MA5 ({:.2})"`，动作 `"顺势跟踪"`；
    - \( C < \text{MA5} \)：`ma_signal = "below_ma20"`，文案 `"跌破短线均线 MA5 ({:.2})"`，动作 `"防守控仓"`。
  - 若 K 线数据为空（停牌/新股）：输出 `ma_signal = "neutral"`，文案 `"暂无历史 K 线数据"`。
- **数值精度与舍入标准**：
  - 运算结果统一进行四舍五入并精确保留 2 位小数，前后端算法保证位级对齐：
    - **Rust 后端**：`((sum / N as f64) * 100.0).round() / 100.0`
    - **TypeScript 前端**：`Math.round((sum / N) * 100) / 100`

---

## 3. 数据契约与时段规则

### 3.1 上游数据链路
- **数据源获取通道**（遵循 AGENTS.md §1 & §4）：
  - **主通道（前复权日K）**：首选腾讯证券前复权日K接口（`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=<code_qfq>,day,,,320,qfq`）。腾讯数据天然支持 QFQ 前复权，准确消除历史送转配股造成的跳空；
  - **备选通道（容灾降级）**：新浪财经 K 线接口（`http://finance.sina.com.cn/realstock/company/<code_sina>/kl.js?d=...&scale=240`）。当腾讯接口超时或受阻时自动无缝切换，成交量自动按 `volume / 100` 折算为手；
  - **盘中实时 Tick 联动**：盘中通过腾讯（`qt.gtimg.cn`）与新浪（`hq.sinajs.cn`）单请求多代码拼接接口批量轮询最新分时快照（`Quote`）。
- **计算职责划分（Colocation & Thin UI）**：
  - **Rust 后端**（[indicators.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/indicators.rs)）：唯一承载全量历史数据解析、MA 计算、多空排列状态机判定、形态诊断文案生成以及 KDJ/支撑阻力联动综合判定。
  - **SolidJS 前端**（[KlineCanvas.tsx#L54-L107](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KlineCanvas.tsx#L54-L107)）：负责轻量级盘中动态响应。接收到 3 秒实时 Tick 报价时，前端无需向后端重新发起全图请求，而是通过 `effectiveBars` 机制动态将最新价格合并到当日 K 线的末端，并在本地轻量调用 `computeKLineMovingAverages`，实现毫秒级平滑跟随。
- **轮询周期**：
  - 日K历史序列：开盘前/切换自选时拉取 1 次，盘中 30~60 秒增量校准；
  - 实时快照 Quote：盘中交易时段 3 秒高频轮询；
  - 盘后（15:00 以后）：K 线数据固化，网络轮询进入静默休眠。

### 3.2 A 股交易时段门禁
严格遵循 A 股交易制度与 [AGENTS.md](file:///D:/Project/private/ai/ai-finance-moyu/AGENTS.md) §3：
- **09:15 - 09:25（早盘集合竞价时段）**：
  - 09:15 - 09:19（可撤单虚假申报）：正式日K线尚未生成，展示上一交易日固化的收盘均线，不更新日K；
  - 09:20 - 09:24（不可撤单撮合）：产生虚拟匹配价格，前端不更新日K线，避免被开盘博弈扰动；
  - 09:25 - 09:30（盘前静默期）：正式开盘价产生。前端可在日K线最后一根预览条中注入开盘价，作为初始均线参考；
  - **通知防轰炸红线**：集合竞价期间严禁推送桌面级系统弹窗通知！
- **09:30 - 11:30 / 13:00 - 14:57（连续竞价交易时段）**：
  - 随着盘中 3 秒 Tick 报价刷新，当日动态 K 线的 `close`、`high`、`low` 实时微调，MA5/10/20 曲线末端随之平滑呼吸波动。
- **14:57 - 15:00（尾盘集合竞价时段）**：
  - 不可撤单撮合，15:00 最终收盘价产生，当日日K线及均线数值正式盖戳固化。
- **休市期与周末处理**：
  - 盘后及节假日后台静默，前端冻结展示最终收盘快照，不发起多余轮询。
- **断网与熔断降级（Baseline Fallback Cache）**：
  - 若网络中断或遭遇接口 429 限流，系统自动回退至本地基准缓存（平滑基准数据），维持大盘与个股的均线呈现，杜绝白屏与闪退。

---

## 4. 告警阈值与防扰规范

### 4.1 触发判定规则
- **形态变迁告警 (State Transition)**：
  - **突破生命线**：价格自下而上有效突破并站稳 MA20（状态由 `below_ma20` 变为 `above_ma20`）；
  - **跌破生命线**：价格跌破 MA20（状态由 `above_ma20` 变为 `below_ma20`）；
  - **金叉 / 死叉**：MA5 上穿 MA10/MA20，或 MA5 下穿 MA10/MA20。
- **极限乖离率告警 (BIAS Extremes)**：
  - **短线严重超买**：\( \text{BIAS5} \ge +6.0\% \) 或 \( \text{BIAS20} \ge +12.0\% \)，且 \( J > 100 \)；
  - **短线极度超跌**：\( \text{BIAS5} \le -6.0\% \) 或 \( \text{BIAS20} \le -12.0\% \)，且 \( J < 10 \)。

### 4.2 节流防轰炸与静音机制
- **频次抑制窗口 (Cooldown)**：
  - 同一标的同类均线异动事件（如连续穿梭于 MA20 临界线）设置最小 300 秒（5 分钟）冷却时间，单日内同类异动不重复弹窗轰炸。
- **竞价时段免打扰**：
  - 09:15 - 09:25 早盘竞价时段全面静音，只在 Badge 徽标与卡片内部更新，禁止系统通知弹窗。
- **分级日志分类与审计留痕 (AGENTS.md §7)**：
  - 均线突破与多空形态切换统一使用 `log` Facade 输出，Target 规范标记为 `ALERT`：
    ```rust
    log::info!(target: "ALERT", "[均线形态] {} ({}) 站稳生命线 MA20: {:.2}, 当前价: {:.2}", name, code, ma20, price);
    ```
  - 日常数据计算与轮询记录归入 `NET` 或 `DEBUG`，杜绝在高频定时器中无节流调用 `println!` 或 `console.log`。
  - 持久化写入 `%APPDATA%/.../logs/app.log`（单文件 5MB，轮转保留 3 份），内存环形队列维护最近 200 条供前端诊断面板检索。

---

## 5. 验收基准与测试对齐

### 5.1 黄金测试用例 (Golden Fixture)

#### 用例 1：冷启动阶段（K 线不足 5 根）
- **输入数据**：3 根日K线，收盘价序列为 `[10.00, 10.50, 11.00]`
- **预期确定性输出**：
  - `bars[0..2].ma5 = None`
  - `bars[0..2].ma10 = None`
  - `bars[0..2].ma20 = None`
  - `ma_signal = "neutral"`
  - `ma_comment = "历史数据积累中，均线平稳观察"`
  - `kline_action = "平稳观察"`
  - `kline_tone = "neutral"`

#### 用例 2：MA5 临界窗口生成（恰好 5 根 K 线）
- **输入数据**：5 根日K线，收盘价为 `[10.00, 10.20, 10.40, 10.60, 10.80]`
- **数学推导**：
  - \( \text{sum} = 10.00 + 10.20 + 10.40 + 10.60 + 10.80 = 52.00 \)
  - \( \text{MA5} = 52.00 / 5 = 10.40 \)
- **预期确定性输出**：
  - `bars[0..3].ma5 = None`
  - `bars[4].ma5 = Some(10.40)`
  - `bars[4].ma10 = None, bars[4].ma20 = None`
  - 因总 K 线数 5 < 10，状态降级输出 `ma_signal = "neutral"`，`ma_comment = "历史数据积累中，均线平稳观察"`。

#### 用例 3：MA10 形成但 MA20 缺位（恰好 10 根 K 线）
- **输入数据**：10 根日K线，收盘价序列 `p = 10.0 + i * 0.2`（`i = 0..9`），即 `[10.00, 10.20, 10.40, 10.60, 10.80, 11.00, 11.20, 11.40, 11.60, 11.80]`
- **数学推导**（针对第 10 根 `bars[9]`, `close = 11.80`）：
  - \( \text{MA5} = (11.00 + 11.20 + 11.40 + 11.60 + 11.80) / 5 = 57.00 / 5 = 11.40 \)
  - \( \text{MA10} = (10.00 + 10.20 + \dots + 11.80) / 10 = 109.00 / 10 = 10.90 \)
  - \( \text{MA20} = \text{None} \)
- **预期确定性输出**：
  - `bars[9].ma5 = Some(11.40)`
  - `bars[9].ma10 = Some(10.90)`
  - `bars[9].ma20 = None`
  - 因 \( C (11.80) \ge \text{MA5} (11.40) \)，状态判定命中 `(Some(m5), Some(_m10), None)` 分支：
    - `ma_signal = "above_ma20"`
    - `ma_comment = "站稳短线均线 MA5 (11.40)"`
    - `kline_action = "顺势跟踪"`
    - `kline_tone = "bull"`

#### 用例 4：完整多头排列黄金用例（25 根递增序列，对齐 `kline_tests.rs#L76`）
- **输入数据**：25 根日K线，收盘价公式 \( p = 10.0 + i \times 0.5 \)（\( i = 1 \dots 25 \)），收盘价序列为 `[10.50, 11.00, ..., 22.50]`。
- **数学精确推导**（针对第 25 根 `bars[24]`, `close = 22.50`）：
  - 后 5 日收盘价：`[20.50, 21.00, 21.50, 22.00, 22.50]`，总和 107.50，\( \text{MA5} = 107.50 / 5 = 21.50 \)；
  - 后 10 日收盘价：`[18.00, 18.50, ..., 22.50]`，总和 202.50，\( \text{MA10} = 202.50 / 10 = 20.25 \)；
  - 后 20 日收盘价：`[13.00, 13.50, ..., 22.50]`，总和 355.00，\( \text{MA20} = 355.00 / 20 = 17.75 \)；
  - 排列校验：\( \text{MA5}(21.50) > \text{MA10}(20.25) > \text{MA20}(17.75) \) 且 \( C(22.50) \ge \text{MA5}(21.50) \)。
- **预期确定性输出**：
  - `last_bar.ma5 = Some(21.50)`
  - `last_bar.ma10 = Some(20.25)`
  - `last_bar.ma20 = Some(17.75)`
  - `kline.ma_signal = "bull_aligned"`
  - `kline.ma_comment = "站稳 MA5 (21.50) 均线多头排列，量价支撑坚挺"`
  - `kline.kline_action = Some("顺势看多")`
  - `kline.kline_tone = Some("bull")`

---

### 5.2 代码与测试映射 (Traceability Matrix)

| 架构层级 | 功能模块 | 对应源码路径与代码定位 |
| :--- | :--- | :--- |
| **后端计算引擎** | MA5/10/20 滑动窗口计算 | [src-tauri/src/quote/indicators.rs#L4-L19](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/indicators.rs#L4-L19) |
| **后端诊断状态机** | 多空排列与战术评语生成 | [src-tauri/src/quote/indicators.rs#L129-L170](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/indicators.rs#L129-L170) |
| **数据契约结构体** | `KLineBar` 与 `KLineData` 定义 | [src-tauri/src/quote/types.rs#L161-L208](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/types.rs#L161-L208) |
| **网络获取与解析** | 腾讯前复权日K获取与降级调度 | [src-tauri/src/quote/fetcher.rs#L254-L271](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/fetcher.rs#L254-L271) 与 [tencent.rs#L229-L260](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/tencent.rs#L229-L260) |
| **前端算法重算** | 纯函数式 MA 动态重算器 | [src/utils/indicators.ts#L13-L44](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/indicators.ts#L13-L44) |
| **盘中动态联动** | 盘中 Tick 融合当日 K 线与均线 | [src/components/KlineCanvas.tsx#L54-L107](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KlineCanvas.tsx#L54-L107) |
| **自适应视口缩放** | 均线极值自动扩缩容算法 | [src/components/klineDraw.ts#L104-L125](file:///D:/Project/private/ai/ai-finance-moyu/src/components/klineDraw.ts#L104-L125) |
| **Canvas 绘图与图例** | 均线平滑连线与顶部 Legend 渲染 | [src/components/klineBarsOverlay.ts#L48-L76](file:///D:/Project/private/ai/ai-finance-moyu/src/components/klineBarsOverlay.ts#L48-L76) 与 [klineBarsOverlay.ts#L115-L140](file:///D:/Project/private/ai/ai-finance-moyu/src/components/klineBarsOverlay.ts#L115-L140) |
| **色彩与主题契约** | `COLOR_MA5/10/20` 主题配色定义 | [src/chart/theme.ts#L67-L69](file:///D:/Project/private/ai/ai-finance-moyu/src/chart/theme.ts#L67-L69) |
| **战术快判 Badge** | 均线形态微标与 BIAS 乖离率 | [src/components/KLineBadge.tsx#L36-L157](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KLineBadge.tsx#L36-L157) |
| **3秒诊断卡片** | 生命线位置与实战快判 Popover | [src/components/KLineBadgePopover.tsx#L48-L121](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KLineBadgePopover.tsx#L48-L121) |
| **Rust 单元测试** | MA 黄金断言与信号测试用例 | [src-tauri/src/quote/tests/kline_tests.rs#L75-L113](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/tests/kline_tests.rs#L75-L113) |
| **前端单元测试** | Vitest 均线冷启动与周期测试 | [src/utils/indicators.test.ts#L39-L60](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/indicators.test.ts#L39-L60) |
