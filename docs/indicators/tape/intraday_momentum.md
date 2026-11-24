# 急速拉升与快速跳水 (Intraday Momentum) 需求与算法规范

> 模块分类：`tape`  
> 适用标的：`个股 | 指数 | 板块`  
> 核心标签：`分时异动 | VWAP偏离度 | 极值乖离 | 放量突破/破位 | 归因诊断`  
> 对应代码实现：  
> - 后端核心算法：[analyze.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/analyze.rs#L12-L289) · [patterns.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/patterns.rs#L49-L281) · [types.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/types.rs#L12-L138) · [fall_attribution.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/fall_attribution.rs#L24-L111) · [poller/trends.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/poller/trends.rs#L140-L208)  
> - 前端视图组件：[TrendBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/TrendBadge.tsx#L1-L2) · [StockBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StockBadge.tsx#L21-L126) · [stockDiagnosis.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/stockDiagnosis.ts#L40-L186) · [MicroTapePopover.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/tape/MicroTapePopover.tsx#L29-L229) · [StatusLine.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StatusLine.tsx#L18-L61)  
> 对应单元测试：  
> - 后端单元测试：[tests/mod.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/tests/mod.rs#L60-L208) · [tests/flow.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/tests/flow.rs#L8-L137)  
> - 前端单元测试：[stockDiagnosis.test.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/stockDiagnosis.test.ts#L45-L102) · [MicroTapePopover.test.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/tape/MicroTapePopover.test.tsx#L1-L70)  

---

## 1. 业务定位与看盘指引

### 1.1 业务定义与核心意图
- **定义**：急速拉升与快速跳水 (Intraday Momentum) 是专为 A 股日内分时级别打造的高频动量与均价线偏离度（VWAP Bias）监控体系。系统依托分时成交量加权均价（Volume Weighted Average Price, VWAP）为日内基准锚点，结合 15 分钟趋势线斜率、动态分钟量比（Volume Ratio）以及日内极值区间，实时研判个股或指数在分时级别的四类关键动量形态：
  1. **冲高乖离 (`VwapOverbought` / 超买)**：日内大涨且短线急拉脱离分时成本线过远；
  2. **探底乖离 (`VwapOversold` / 超跌)**：日内大跌且短线急杀脱离成本线过远；
  3. **放量拉升 (`VolumeSurge` / 放量涨)**：突破近期分时低点且伴随成倍放大成交量与多头均线支撑；
  4. **放量破位 (`Breakdown` / 放量跌)**：跌穿分时均价线支撑并伴随恐慌放量与空头形态恶化。
- **看盘痛点与价值**：
  - **杜绝追涨杀跌的情绪化损耗**：散户日内交易最大的亏损源于追逐脉冲急拉与在恐慌砸盘中割肉。传统软件无法直观提示“当前脉冲是否偏离成本过多”，导致交易者极易在日内高潮阶段无脑追高；
  - **VWAP 成本锚的引力规律**：分时均价线（VWAP 黄线）代表当日全体参与者的筹码持仓加权平均成本。当价格显著脱离均线时，物理上的均值回归引力急剧增加：上方获利盘有强烈的止盈兑现诉求（正向乖离过大），下方抄底资金有套利博弈动力（负向乖离过大）；
  - **桌面摸鱼看盘的极简低载**：交易者在办公场景无法长时间盯着全屏分时 K 线，需要仅凭 0.5 秒余光扫一眼桌面悬浮微标（Badge），即可确定当前是“放量真实突破可顺势持股”，还是“无量脉冲诱多乖离过大需防回踩”，亦或是“放量下破均线需执行止损纪律”。

### 1.2 关键信号解读
- **看多/买点信号**：
  - `🔥 放量拉升 (VolumeSurge)`：现价站稳均线之上，量比 \(\ge 1.7\)，近 15 分钟均线斜率维持稳定（\(\ge -0.05\%\)），现价脱离近 15 分钟最低价达 \(+0.2\%\)。操盘指引：【放量突破】，主力资金主动进攻扫盘，可顺势关注。
  - `▲ 触底反弹 (BottomRebound) / 极值破底翻 (SpringRebound)`：均线下方恐慌砸盘后量能显著衰竭（缩量超 40%）或跌破关键支撑后迅速放量被主动买盘收复，诱空失败反转。
- **看空/卖点信号**：
  - `❄️ 放量破位 (Breakdown)`：现价跌破均价线，量比 \(\ge 1.5\)，偏离度 \(\le -0.3\%\)，现价回落至近 15 分钟最高价的 \(0.998\) 以下。操盘指引：【防守止损】，短线抛压加剧，形态转弱，严格执行止损纪律。
  - `▼ 恐慌出逃 (PanicDumping)`：五档卖盘沉重压顶或主动抛盘砸穿买档（主动买盘 \(\le 35\%\) 且买卖失衡 \(\le -45\%\)），现价低于均线且偏离度 \(\le -0.35\%\)。
  - `⚡ 涨停炸板 (BrokenLimitUp / FallAttribution)`：冲击涨停后遭遇大单开板砸盘回落超过 2.5%，高位出货派发，防范天地针。
- **中性/警示信号**：
  - `⚡ 冲高乖离 (VwapOverbought)`：日内大涨（\(\ge 1.2\%\)）且相对均线正偏离 \(\ge 2.2\%\)。操盘指引：【慎盲追高】，短线正向乖离过大，远离日内成本线，谨防获利盘兑现冲高回落。
  - `⚡ 探底乖离 (VwapOversold)`：日内大跌（\(\le -1.2\%\)）且相对均线负偏离 \(\le -2.2\%\)。操盘指引：【超跌待反抽】，分时下探斜率过陡，负向偏离过大，短线有反抽修复均线需求，切勿盲目恐慌杀跌。

### 1.3 UI 呈现与防窥规范
- **宿主组件**：
  - 核心入口：[StockBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StockBadge.tsx#L21-L126)（别名 `TrendBadge`），挂载于自选股列表行尾（List 布局）与悬浮挂件顶部右侧（Mini 布局）；
  - 辅助透视：[StockBadgePopover.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StockBadgePopover.tsx) 悬浮穿透诊断面板，以及 [MicroTapePopover.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/tape/MicroTapePopover.tsx#L29-L229) 超短量价与多空对抗能量条。
- **极简防窥与尺寸约束**：
  - 迷你悬浮态（Mini 布局）或紧凑列表下使用缩微微标：字号收缩为 9px（`font-size: 9px; line-height: 13px;`），仅外露两字精简标签：`乖离(慎)`、`超跌(待)`、`放量(多)`、`破位(止)`；
  - 常规尺寸下采用完整态：如 `⚡ 冲高乖离 · 慎盲追高`、`🔥 放量拉升 · 顺势看多`、`❄️ 放量破位 · 严守止损`；
  - 在移动端或极窄视口（\(\le 390\text{px}\)）时，CSS 媒体查询自动隐藏完整标签 `.badge-full`，无缝降级切换为 `.badge-short`。
- **全主题自适应与语义化 CSS 绑定**：
  - 遵循 [AGENTS.md](file:///D:/Project/private/ai/ai-finance-moyu/AGENTS.md) §15 规范，严禁硬编码静态孤岛颜色，严格绑定全局主题语义化变量：
    - 多头/放量突破：`background: var(--color-up-bg); color: var(--color-up-subtle); border: 1px solid var(--color-up-border);`
    - 空头/放量破位：`background: var(--color-down-bg); color: var(--color-down-subtle); border: 1px solid var(--color-down-border);`
    - 警示/乖离风险：`background: var(--color-warning-bg); color: var(--color-warning-light); border: 1px solid var(--color-warning-border);`
    - 中性/均衡震荡：`background: rgba(255, 255, 255, 0.08); color: var(--text-muted); border: 1px solid var(--surface-border-subtle);`
  - **浅色模式金融红绿对比度红线**：
    - 在「办公浅色」主题下，多头红必须映射至饱满深红 `#dc2626`（次级 `#ef4444`），空头绿采用深翡翠绿 `#16a34a`，文字底色透明度严格控制在 0.10~0.25 之间，严禁纯白背景上出现浅荧光绿发飘、白底白字或黑底黑字现象。

---

## 2. 数学公式与算法细节

### 2.1 依赖基础数据
- **实时快照 (`Quote`)**：
  - 现价 \(P_t\) (`price`)、昨收价 \(P_{\text{pre}}\) (`pre_close`)、日内最高价 \(P_{\text{high}}\)、最低价 \(P_{\text{low}}\)；
  - 累计成交量 \(V_t\)（手，`volume`）、涨跌幅 \(\Delta \%\) (`change_pct`)；
  - 盘口微观结构数据：外盘量 \(V_{\text{outer}}\)、内盘量 \(V_{\text{inner}}\)、主动买盘占比 \(R_{\text{buy}}\) (`active_buy_ratio`)、五档买卖失衡度 \(I_{\text{imb}}\) (`bid_ask_imbalance`)。
- **分时逐分钟时序序列 (`TrendPoint`)**：
  - 时间戳 \(T_i\)（`HHMM` 数值，例如 `0930`、`1455`）；
  - 分时价格 \(P_i\)、累计成交量 \(\text{CumVol}_i\)（手）、累计成交额 \(\text{CumAmt}_i\)（元）；
  - 加权均价 \(\text{VWAP}_i\)（元/股，`avg_price`）。

### 2.2 核心数学公式与递推逻辑

#### 1. 分时均价线（VWAP）基准计算
对于个股，第 \(t\) 分钟的日内真实累积 VWAP 为：
\[
\text{VWAP}_t = \frac{\text{CumAmt}_t}{\text{CumVol}_t \times 100}
\]
> [!NOTE]
> A 股成交量单位为“手”（1手 = 100股），因此分母必须乘以 100。若 \(\text{CumVol}_t \le 0\)，则平滑降级取当期价格 \(P_t\)。

#### 2. 指数动态滚动均线（Rolling MA20 Benchmark）
大盘指数（如上证指数 `sh000001`、深证成指 `sz399001`）不具备单整个股的股本成交量加权逻辑，或当接口未提供有效 `avg_price` 时，基准线自动平滑切换为 20 分钟滚动价格均线：
\[
\text{Benchmark}_t = \frac{1}{\min(t, 20)} \sum_{k=\max(1, t-19)}^t P_k
\]

#### 3. 分时偏离度（Bias Percentage, `bias_pct`）
度量价格脱离日内加权基准线的瞬时拉升/跳水幅度：
\[
\text{bias\_pct} = \frac{P_t - \text{Benchmark}_t}{\text{Benchmark}_t} \times 100\%
\]
系统在向前端派发前执行两位小数四舍五入：
\[
\text{rounded\_bias} = \frac{\text{round}(\text{bias\_pct} \times 100)}{100}
\]

#### 4. 15 分钟趋势线斜率（Slope Percentage, `slope_pct`）
度量分时均价线自身在过去 15 分钟内的上行推升或下行加速斜率：
\[
W_{\text{slope}} = \min(t, 15)
\]
\[
\text{PastBenchmark} = \text{Benchmark}_{t - W_{\text{slope}}}
\]
\[
\text{slope\_pct} = \begin{cases} \frac{\text{Benchmark}_t - \text{PastBenchmark}}{\text{PastBenchmark}} \times 100\%, & \text{若 } \text{PastBenchmark} > 0 \\ 0.0, & \text{其他} \end{cases}
\]

#### 5. 分钟量比与开盘集合竞价脉冲平滑（Spike Smoothing & Volume Ratio）
- **单分钟成交量序列提取**：
  \[
  \text{MinuteVol}_i = \max(0, \text{CumVol}_i - \text{CumVol}_{i-1}) \quad (\text{其中 } \text{CumVol}_0 = 0)
  \]
- **09:30 早盘竞价脉冲平滑（Spike Smoothing）**：
  09:30 的第一个分时点包含了 09:15-09:25 集合竞价的所有撮合成交量，通常可达后续正常分钟的 5~10 倍。若直接参与滑动均值计算，会导致整个早盘 20 分钟的量比严重失真（使正常放量显得微不足道）。系统引入防畸变阻尼：
  \[
  \text{若 } len \ge 2 \land \text{MinuteVol}_1 > 0 \land \text{MinuteVol}_0 > 3 \times \text{MinuteVol}_1 \implies \text{MinuteVol}_0 = 2.0 \times \text{MinuteVol}_1
  \]
- **动态量比 (`vol_ratio`) 计算**：
  比较近 4 分钟均量与近 20 分钟基线均量：
  \[
  \text{BaseVol} = \frac{1}{\min(t, 20)} \sum_{k=t-\min(t, 20)+1}^t \text{MinuteVol}_k
  \]
  \[
  \text{RecentVol} = \frac{1}{\min(t, 4)} \sum_{k=t-\min(t, 4)+1}^t \text{MinuteVol}_k
  \]
  \[
  \text{vol\_ratio} = \begin{cases} \frac{\text{RecentVol}}{\text{BaseVol}}, & \text{若 } \text{BaseVol} > 0 \\ 1.0, & \text{若 } \text{BaseVol} \le 0 \end{cases}
  \]

#### 6. 核心动量形态精确判定式

##### ① 极端冲高乖离 (`TrendState::VwapOverbought` / 冲高乖离)
```rust
// GUARD: Overbought is ONLY valid on stocks that are genuinely up today!
if quote.change_pct >= 1.2 && bias_pct >= 2.2 && price > benchmark {
    return Some(make_signal(
        TrendState::VwapOverbought,
        25,
        format!("日内涨幅 +{:.2}% 且偏离均线 +{bias_pct:.2}%，分时乖离过大，谨防追高回踩", quote.change_pct),
    ));
}
```
- **门槛条件**：日内涨幅 \(\ge 1.2\%\) **且** 偏离度 \(\ge 2.2\%\) **且** 现价高于均线；
- **博弈评分**：`score = +25`（微弱多头但已呈现风险警示）；
- **核心护栏意图**：必须叠加 `quote.change_pct >= 1.2` 门禁。若无此护栏，昨收大幅下杀低开的股票即使日内反抽 1%，其偏离度虽然可能瞬间放大，但本质属于弱势反弹，严禁误报为“超买”。

##### ② 极端探底乖离 (`TrendState::VwapOversold` / 探底乖离)
```rust
// GUARD: Oversold is ONLY valid on stocks that are genuinely down today!
if quote.change_pct <= -1.2 && bias_pct <= -2.2 && price < benchmark {
    return Some(make_signal(
        TrendState::VwapOversold,
        -25,
        format!("日内跌幅 {:.2}% 且偏离均线 {bias_pct:.2}%，短线极度超跌，关注反抽修复", quote.change_pct),
    ));
}
```
- **门槛条件**：日内跌幅 \(\le -1.2\%\) **且** 偏离度 \(\le -2.2\%\) **且** 现价低于均线；
- **博弈评分**：`score = -25`（空头衰竭警示）；
- **核心护栏意图**：必须叠加 `quote.change_pct <= -1.2` 门禁，避免高开震荡微跌的股票被误判为“超跌”。

##### ③ 放量拉升 (`TrendState::VolumeSurge` / 放量拉升)
```rust
if vol_ratio >= 1.7 && price > benchmark && price >= recent_min_price * 1.002 && slope_pct >= -0.05 {
    let score = (55.0 + (vol_ratio * 10.0).min(30.0)) as i32;
    return Some(make_signal(
        TrendState::VolumeSurge,
        score,
        format!("短线放量异动（量比 {vol_ratio:.1}x），多头买盘推升价格走强"),
    ));
}
```
- **门槛条件**：
  1. 动态量比放大：\(\text{vol\_ratio} \ge 1.7\)；
  2. 处于均线上方：\(\text{price} > \text{benchmark}\)；
  3. 脱离低点反弹：\(\text{price} \ge \text{recent\_min\_price} \times 1.002\)（近 15 分钟最低价抬升超 0.2%）；
  4. 均线无恶化下行斜率：\(\text{slope\_pct} \ge -0.05\%\)。
- **动态博弈能量评分**：
  \[
  \text{score} = \lfloor 55.0 + \min(30.0, \text{vol\_ratio} \times 10.0) \rfloor \quad (\text{输出区间 } +72 \sim +85)
  \]

##### ④ 放量破位 (`TrendState::Breakdown` / 放量破位)
```rust
if vol_ratio >= 1.5 && price < benchmark && price <= recent_max_price * 0.998 && bias_pct <= -0.3 {
    return Some(make_signal(
        TrendState::Breakdown,
        -70,
        format!("放量跌破分时均线（量比 {vol_ratio:.1}x），短线抛压加剧，形态走弱"),
    ));
}
```
- **门槛条件**：
  1. 抛盘放量：\(\text{vol\_ratio} \ge 1.5\)；
  2. 跌破均线支撑：\(\text{price} < \text{benchmark}\)；
  3. 脱离高点破位：\(\text{price} \le \text{recent\_max\_price} \times 0.998\)（自近 15 分钟高点跌幅超 0.2%）；
  4. 负乖离加剧确认：\(\text{bias\_pct} \le -0.3\%\)。
- **博弈评分**：`score = -70`（强空头破位警示）。

### 2.3 边界情况与冷启动处理
1. **样本点不足 3 根时的兜底降级（Cold Start Fallback）**：
   在开盘初期（如 09:30~09:32）或网络重连导致分时序列点数不足 3 时（`trend.points.len() < 3`），系统自动回退至基于行情快照与昨收价的初级偏离度估算：
   \[
   \text{bias} = \begin{cases} \frac{\text{quote.price} - \text{quote.pre\_close}}{\text{quote.pre\_close}} \times 100\%, & \text{若 } \text{quote.pre\_close} > 0 \\ 0.0, & \text{其他} \end{cases}
   \]
   - 若 `quote.change_pct >= 3.0%`：降级判定为 `TrendState::VwapOverbought`，score = 25，摘要注明“日内涨幅偏大，远离昨收基准”；
   - 若 `quote.change_pct <= -3.0%`：降级判定为 `TrendState::VwapOversold`，score = -25，摘要注明“日内跌幅偏大，远离昨收基准”；
   - 其余情况判定为 `TrendState::Neutral`，score = 0，摘要注明“等待分时时序数据就绪...”。
2. **除零与极值保护**：
   - 价格或基准线无效：若 `price <= 0.0` 或 `benchmark <= 0.0`，直接安全返回 `None`；
   - 成交量为 0：当 `base_vol <= 0.0` 时，动态量比固定为 `1.0`；
   - 昨收价为 0：当 `pre_close <= 0.0` 时，`change_pct` 视为 0.0。

---

## 3. 数据契约与时段规则

### 3.1 上游数据链路
- **数据源通道与职责划分**：
  - **行情切片**：首选腾讯（`qt.gtimg.cn`）批量请求单接口获取多代码快照，轮询周期为 3 秒（由配置项 `poll_quotes_ms` 驱动）；
  - **分时时序**：通过腾讯或新浪分时时序接口拉取当日 1 分钟点流（`Trend`），轮询周期默认 30 秒（`poll_trend_ms = 30000ms`，限幅 5,000ms ~ 600,000ms）；
  - **计算收口于 Rust**：遵循 [AGENTS.md](file:///D:/Project/private/ai/ai-finance-moyu/AGENTS.md) §4 与 §11 规范，所有分时 VWAP 递推、滑动窗口量比平滑、斜率及模式匹配一律在 Rust 后端并发线程完成；前端 WebView 仅作为超轻量视图层消费 `TrendSignal`，严禁在前端运行重度金融计算。
- **并发控制防封禁**：
  - 后端拉取分时时序采用 `tokio::sync::Semaphore(3)` 严格限制最大并发任务数为 3，防止高频突发流量轰炸券商 CDN 导致 IP 被临时拉黑。

### 3.2 A 股交易时段门禁
指标在交易日各个时段的表现严格遵循以下状态机约束：

```mermaid
stateDiagram-v2
    [*] --> PreOpen: 09:15 前
    PreOpen --> CallAuction: 09:15-09:25 (竞价时段)
    CallAuction --> PreTrade: 09:25-09:30 (盘前静默)
    PreTrade --> Trading: 09:30-11:30 (早盘连续竞价)
    Trading --> LunchBreak: 11:30-13:00 (午间休市)
    LunchBreak --> Trading: 13:00-14:57 (午后连续竞价)
    Trading --> ClosingAuction: 14:57-15:00 (尾盘竞价)
    ClosingAuction --> Closed: 15:00 后 / 周末节假日

    state CallAuction {
        note right of CallAuction: 严禁系统弹窗桌面通知\n展示竞价撮合或保留前日收盘
    }
    state PreTrade {
        note right of PreTrade: 自动清理过期分时缓存\n清空 trend_signals 内存表
    }
    state Trading {
        note right of Trading: 3s 行情快照 + 30s 分时时序轮询\n全功能实时计算异动与偏离
    }
    state Closed {
        note right of Closed: 进入 IDLE_TICK (5s 节流睡眠)\n断开网络抓取，展示收盘定盘快照
    }
```

- **时段准入与重置逻辑**：
  1. `09:15 - 09:25`（集合竞价）：此阶段无分时时序数据，指标不生效或保持离线基准；遵循 AGENTS.md §3 红线，**默认禁止推送任何桌面级系统通知**；
  2. `09:25 - 09:30`（盘前静默期）：检测到时段切换为早盘盘前时，Rust 后端自动重置内部状态：
     - 清除昨日残留分时点：`t.points.clear()`；
     - 清空昨日残余趋势信号：`state.trend_signals.lock().clear()`，防止开盘前出现“昨日炸板/超买”虚假陈旧告警；
  3. `09:30 - 11:30` / `13:00 - 14:57`（连续竞价）：正常全速计算与状态转移派发；
  4. `14:57 - 15:00`（尾盘集合竞价）：尾盘锁定状态，不参与开盘区间突破（ORB）或放量拉升模式触发；
  5. 盘后及非交易时段：后端轮询转入 `IDLE_TICK`（5 秒睡眠，无网络请求），前端 [StatusLine.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StatusLine.tsx#L33-L39) 标记数据日期，静默展示最终收盘快照。
- **降级与平滑基准（Baseline Fallback Cache）**：
  - 网络异常、超时或接口 429 时，系统直接取用本地持久化缓存 `QuotesCache`（`config.json` 同目录），确保前端零白屏、零崩溃，维持上一有效判定呈现。

---

## 4. 告警阈值与防扰规范

### 4.1 触发判定规则
系统采用“双重门禁矩阵”防止假信号干扰：

| 异动形态 | 状态码 (`TrendState`) | 绝对门槛 | 动态量价比条件 | 评分 (`score`) |
| :--- | :--- | :--- | :--- | :--- |
| **冲高乖离** | `VwapOverbought` | 日内涨幅 \(\ge +1.2\%\) | 偏离度 \(\text{bias\_pct} \ge +2.2\%\) 且现价高于 VWAP | `+25` |
| **探底乖离** | `VwapOversold` | 日内跌幅 \(\le -1.2\%\) | 偏离度 \(\text{bias\_pct} \le -2.2\%\) 且现价低于 VWAP | `-25` |
| **放量拉升** | `VolumeSurge` | 现价脱离 15min 低点 \(+0.2\%\) | 动态量比 \(\text{vol\_ratio} \ge 1.7\) 且 \(\text{slope\_pct} \ge -0.05\%\) | `+72 ~ +85` |
| **放量破位** | `Breakdown` | 现价跌离 15min 高点 \(-0.2\%\) | 动态量比 \(\text{vol\_ratio} \ge 1.5\) 且 \(\text{bias\_pct} \le -0.3\%\) | `-70` |

### 4.2 节流防轰炸与静音机制
- **完全免打扰静音看盘**：
  - 动量异动仅在挂件界面的 Badge 颜色切换、双向能量条以及 Hover 浮层中呈现，**严禁使用任何系统原生弹窗通知或响铃**，保证摸鱼看盘的极高隐蔽性。
- **状态转移日志留痕 (Target: `ALERT`)**：
  - 遵循 [AGENTS.md](file:///D:/Project/private/ai/ai-finance-moyu/AGENTS.md) §7，严禁在高频轮询循环中重复无脑输出日志；
  - 仅在异动状态发生**状态跃迁（State Transition）**或**下杀归因诊断改变**时，才向日志记录留痕；
  - 日志 Target 严格归口为 `ALERT`，示例如下：
    ```text
    2026-11-23 10:15:32 INFO [ALERT] [归因诊断] 贵州茅台 (sh600519): 触发【❄️ 支撑破位】 - 放量跌穿早盘箱体下沿 (1750.00) 且均线失守，触发日内程序化止损盘
    2026-11-23 10:24:10 INFO [ALERT] [归因诊断] 贵州茅台 (sh600519): 跌势企稳，解除【❄️ 支撑破位】预警
    ```
- **连续异动去重与内存防抖**：
  - 同一标的在同一形态持续运行时仅更新 `updated_at` 时间戳，不会重复触发审计日志与前端微标重绘抖动。

---

## 5. 验收基准与测试对齐

### 5.1 黄金测试用例 (Golden Fixture)

#### 用例 1：冲高乖离红盘护栏判定 (Overbought Guard)
- **固定输入数据**：
  - 分时时序序列：前 15 根价格 10.00 元、成交量 100 手；第 16 根价格 10.30 元、成交量 100 手；
  - 累积计算：总金额 \(15 \times 10.0 \times 100 \times 100 + 10.3 \times 100 \times 100 = 1,603,000\) 元；总手数 1600 手；
  - 均价 \(\text{VWAP} = 1,603,000 / (1600 \times 100) = 10.01875\) 元；
  - 偏离度 \(\text{bias\_pct} = (10.30 - 10.01875) / 10.01875 \times 100\% = +2.807\% \ge 2.2\%\)；
  - **切片 A (真实上涨)**：`price = 10.30, pre_close = 10.00, change_pct = +3.0%`；
  - **切片 B (昨日大跌低开反弹)**：`price = 10.30, pre_close = 10.40, change_pct = -0.95%`。
- **预期确定性输出**：
  - 切片 A：触发 `TrendState::VwapOverbought`，`compact_label = "超买"`，`score = 25`；
  - 切片 B：`change_pct < 1.2%` 触发护栏阻断，**严禁返回 `VwapOverbought`**（断言 `assert_ne` 成立）。

#### 用例 2：放量拉升突破判定 (Volume Surge)
- **固定输入数据**：
  - 前 20 根基线分时点：价格 10.00 元，每分钟成交量 50 手；
  - 后续 3 根拉升分时点：第 21 分钟 (10.05元, 200手)，第 22 分钟 (10.10元, 250手)，第 23 分钟 (10.15元, 300手)；
  - 行情快照：`price = 10.15, pre_close = 10.00, change_pct = +1.5%`；
  - 动态量比推算：近 4 分钟均量为 \((50 + 200 + 250 + 300)/4 = 200\) 手；滚动 20 分钟基线均量约为 87.5 手；量比 \(\text{vol\_ratio} \approx 2.28 \ge 1.7\)；近 15 分钟最低价为 10.00 元，\(10.15 \ge 10.00 \times 1.002\)。
- **预期确定性输出**：
  - 触发 `TrendState::VolumeSurge`；
  - `compact_label = "放量涨"`；
  - `score = 55 + min(30, 22.8) = 77`（\(\ge 60\)）。

#### 用例 3：放量破位下杀判定 (Breakdown)
- **固定输入数据**：
  - 前 20 根基线分时点：价格 10.00 元，每分钟 50 手；
  - 后续 3 根破位分时点：第 21 分钟 (9.95元, 150手)，第 22 分钟 (9.90元, 200手)，第 23 分钟 (9.85元, 250手)；
  - 行情快照：`price = 9.85, pre_close = 10.00, change_pct = -1.5%`；
  - 偏离度：基准线 \(\text{VWAP} \approx 9.97\) 元，\(\text{bias\_pct} \approx -1.2\% \le -0.3\%\)；量比 \(\ge 1.5\)；现价低于近 15 分钟最高价 10.00 元的 0.998。
- **预期确定性输出**：
  - 触发 `TrendState::Breakdown`；
  - `compact_label = "放量跌"`；
  - `score = -70`。

### 5.2 代码与测试映射 (Traceability Matrix)

| 逻辑层次 | 对应代码/资源文件路径 | 关键定义/行号区间 | 职责描述 |
| :--- | :--- | :--- | :--- |
| **后端核心算法** | [analyze.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/analyze.rs#L12-L289) | `analyze_trend` | 分时时序解析、VWAP 与 MA20 基准计算、偏离度与量比推导、冷启动降级 |
| **后端模式匹配** | [patterns.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/patterns.rs#L49-L69) | `early_patterns` Pattern 1 | 极端乖离护栏判定（超买 `VwapOverbought` 与超跌 `VwapOversold`） |
| **后端模式匹配** | [patterns.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/patterns.rs#L260-L281) | `early_patterns` Pattern 6 & 7 | 放量拉升（`VolumeSurge`）与放量破位（`Breakdown`）精确判定式 |
| **后端类型契约** | [types.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/types.rs#L12-L138) | `TrendState`, `TrendSignal` | 异动形态枚举定义、中英文长短标签绑定及跨进程 IPC 数据契约 |
| **下杀归因诊断** | [fall_attribution.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/fall_attribution.rs#L24-L111) | `evaluate_fall_attribution` | 日内下杀多维原因穿透诊断（炸板派发、主力砸盘、关键支撑破位等） |
| **后台轮询调度** | [trends.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/poller/trends.rs#L140-L208) | `update_trend_signals` | 信号状态更新、并发通道控制、状态跃迁与 `ALERT` 日志持久化留痕 |
| **前端微标容器** | [TrendBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/TrendBadge.tsx#L1-L2) | `TrendBadge` | 向后兼容的实战操盘微标统一导出入口 |
| **前端操盘微标** | [StockBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StockBadge.tsx#L21-L126) | `StockBadge` | 实战穿透诊断微标渲染、AI 决断叠加与 Hover 浮层呼出 |
| **前端诊断引擎** | [stockDiagnosis.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/stockDiagnosis.ts#L40-L64) | `PATTERN_RULES` | 前端 23 种模式大白话操盘指引、色调映射与 VWAP 状态文字装配 |
| **超短核心盘口** | [MicroTapePopover.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/tape/MicroTapePopover.tsx#L29-L229) | `MicroTapePopover` | 换手率、量比、振幅、均价及多空对抗能量条超短透视浮窗 |
| **时段状态栏** | [StatusLine.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StatusLine.tsx#L18-L61) | `StatusLine` | A 股交易时段门禁、最后更新时间与网络连接健康度指示器 |
| **主题色彩样式** | [StockBadge.css](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StockBadge.css#L34-L37) | `.stock-badge.*` | 绑定全局 `--color-up-*` / `--color-down-*` / `--color-warning-*` 变量 |
| **后端单元测试** | [tests/mod.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/tests/mod.rs#L60-L102) | `detects_overbought_only_on_green_day`, `detects_oversold_only_on_red_day` | 超买仅在实质大涨触发、超跌仅在实质大跌触发的双向护栏单元测试 |
| **后端单元测试** | [tests/mod.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/tests/mod.rs#L150-L208) | `detects_volume_surge`, `detects_breakdown` | 放量拉升与放量破位判定式的确定性断言单元测试 |
| **后端指数测试** | [tests/mod.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/tests/mod.rs#L134-L148) | `index_uses_ma20_and_does_not_false_divergence` | 大盘指数平滑切换滚动 MA20 基准测试 |
| **前端单元测试** | [stockDiagnosis.test.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/stockDiagnosis.test.ts#L62-L88) | `diagnoses vwapOverbought`, `diagnoses breakdown` | 前端超买与放量破位标签文本、指引及色调映射双向契约单元测试 |
