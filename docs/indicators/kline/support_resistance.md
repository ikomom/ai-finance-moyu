# 滚动 5 日支撑位与阻力位 (Support & Resistance) 需求与算法规范

> 模块分类：`kline`  
> 适用标的：`个股 | 板块 | 大盘全景`  
> 核心标签：`趋势动量 | 箱体震荡 | 破位预警 | 关键位研判`  
> 对应代码实现：`src-tauri/src/quote/indicators.rs` (Rust), `src/utils/indicators.ts` (TS), `src-tauri/src/commands/ai_decision/caller.rs` (AI 决断)  
> 对应单元测试：`src-tauri/src/quote/tests/kline_tests.rs` (Rust), `src/utils/indicators.test.ts` (Vitest)  

---

## 1. 业务定位与看盘指引

### 1.1 业务定义与核心意图
- **定义**：滚动 5 日支撑位与阻力位（Rolling 5-Day Support & Resistance Levels）是基于前复权日 K 线（QFQ Daily Bars）时序数据构建的短线波段极值通道。算法取过去 5 个已完成交易日（严格排除当日未定型 Bar）的最高价最大值作为**阻力位（Resistance / 压力位）**，最低价最小值作为**支撑位（Support / 强支撑）**。
- **金融工程定位**：在短线波段与日内交易体系中，过去 5 个交易日（恰为一个自然周交易周期）是场内浮动筹码换手、多空博弈成本沉淀的核心观察窗口。5 日最高价代表该周期内多头进攻的阻力极值与解套抛压带；5 日最低价代表空头砸盘的极限防线与主力护盘底线，本质上构成了微型的唐奇安通道（Donchian Channel）。
- **摸鱼看盘痛点与价值**：
  - **极小视觉成本**：在桌面极窄挂件（迷你悬浮态）中，交易者无法展开全屏日 K 线图进行画线分析。通过将支撑阻力位收敛为两个精确价位与实时距离百分比，配合状态微标与 3 秒战术 Popover，无需扫视复杂图表即可一眼看穿当前价格在周波段中所处的箱体位置。
  - **拒绝盘中漂移**：严格剔除当日盘中未走完的实时 Bar，避免盘中价格冲高或杀跌导致基准位动态变形，为操盘决策提供稳定、确定性的锚点。

### 1.2 关键信号解读
基于当前实时价格 \( P_{\text{cur}} \)、5 日支撑位 \( S \) 与阻力位 \( R \)，系统派生关键操盘信号与战术动作：

| 信号类型 | 触发条件 / 判据特征 | 操盘动作指引 | 业务意图与实战逻辑 |
| :--- | :--- | :--- | :--- |
| **考验支撑 / 企稳低吸** | \( 0.0\% \le \text{supportDistPct} \le 2.2\% \) 且盘口有承接 | **【考验支撑】/ 观察企稳** | 价格良性回踩至 5 日最低点附近，获得护盘买盘承托，属于高胜率、高盈亏比的逢低做多试仓点。 |
| **突破阻力 / 顺势追涨** | \( P_{\text{cur}} \ge R \) 且伴随放量突破 | **【顺势看多】/ 顺势做多** | 放量冲破过去一周的最高阻力位，上档解套抛压被多头资金全量消化，阻力位转化为新支撑，波段主升浪开启。 |
| **逼近阻力 / 逢高止盈** | \( 0.0\% \le \text{resistDistPct} \le 1.0\% \) 或日线 J 值 \( > 100 \) | **【逢高止盈】/ 冲高落袋** | 价格冲击周内阻力密集区，获利盘与解套盘叠加涌出，极易引发冲高回落，建议分批减仓兑现浮盈。 |
| **跌破支撑 / 破位止损** | \( \text{supportDistPct} < -1.0\% \) 且均线呈空头排列 | **【严格止损】/ 防守控仓** | 价格放量跌破 5 日防线，周内所有买入筹码全线套牢，触发破位下杀风险，必须严格执行防守纪律。 |
| **假摔破底翻 (Bear Trap)** | 盘中跌破 \( S \) 后迅速放量收回 \( S \) 与 VWAP 之上 | **【破底翻转】/ 假摔翻多** | 主力资金在关键支撑位下方制造破位恐慌诱空，随后快速回补大单扫盘收复失地，空头诱空失败，超跌修复反弹。 |
| **箱体震荡 / 高抛低吸** | \( S \times 0.99 \le P_{\text{cur}} < R \) 且处于均线密集区 | **【波段箱体震荡】/ 观望蓄势** | 价格在支撑与阻力之间来回拉锯，多空平衡对峙，宜以网格或波段下沿低吸、上沿高抛策略应对。 |

### 1.3 UI 呈现与防窥规范
- **宿主组件分布**：
  1. `src/components/KLineBadge.tsx`：日 K 线模式下的专属状态微标，在卡片顶栏展示操盘动向（如 `观察支撑`、`顺势看多`、`防守控仓` 等）。
  2. `src/components/KLineBadgePopover.tsx`：日 K 线 3 秒快判悬浮面板，在底部「三行快判清单」第三行常驻展示 `支撑阻力` 关键位（如 `阻力 18.00 (前5日高) · 支撑 12.00 (前5日低)`）。
  3. `src/components/StockBadge.tsx` & `StockBadgePopover.tsx`：个股实战操盘穿透微标，当触发 `support_test`（考验支撑）或破位时，展示对应的操作标签。
  4. `src/components/KlineCanvas.tsx` / `klineDraw.ts`：K 线画布支持通过 `props.priceLines` 绘制水平虚线标定阻力（红色半透明）与支撑（绿色半透明）。
- **图表与视觉规范**：
  - 严禁硬编码静态孤岛颜色值，所有边框、文字、背景严格绑定语义化 CSS 变量：
    - 多头/支撑/上涨：`var(--color-up-bg)`, `var(--color-up-subtle)`, `var(--color-up-border)`
    - 空头/破位/下跌：`var(--color-down-bg)`, `var(--color-down-subtle)`, `var(--color-down-border)`
    - 警示/超买/减仓：`var(--color-warning-bg)`, `var(--color-warning-light)`, `var(--color-warning-border)`
    - 中性/蓄势/弹窗：`var(--surface-popover-bg)`, `var(--text-muted)`, `var(--surface-border-subtle)`
- **全主题自适应保障**：
  - 「深邃暗黑」：微标背景采用低明度半透明毛玻璃底色，避免在暗色背景上眩目刺眼。
  - 「办公浅色」：涨跌指示采用饱满清晰的高对比度金融色彩（正红 `#dc2626`、深翡翠绿 `#16a34a`），弹窗背景 `var(--surface-popover-bg)` 自动映射为浅白/浅灰，杜绝黑底孤岛弹窗或白底浅绿发飘。
- **极简防窥要求**：
  - 在迷你挂件（`compact` 模式）下，微标字体紧凑收缩至 9px，行高 13px，字间距 -0.2px。
  - 文本采用极简双字/四字缩写（如 `回踩(支撑)`、`破位(止损)`、`多头(看多)`），最大宽度限制 150px 并带有 `ellipsis` 文本截断，鼠标悬浮（Hover）时才通过微型 Popover 展开完整详情与大白话研判。

---

## 2. 数学公式与算法细节

### 2.1 依赖基础数据
- **输入序列**：日 K 线数据序列 \( \mathcal{B} = [b_0, b_1, \dots, b_{n-1}] \)，其中每个 \( b_k \) 为一个已对齐的前复权日 K 棒（`KLineBar`）。
- **依赖字段**：
  - \( \text{high}_k \)：第 \( k \) 个交易日的最高价（`f64`）。
  - \( \text{low}_k \)：第 \( k \) 个交易日的最低价（`f64`）。
  - \( \text{close}_k \)：第 \( k \) 个交易日的收盘价（`f64`）。
  - \( P_{\text{cur}} \)：盘中实时最新成交价（由即时行情快照 `Quote.price` 提供；若未开盘则取最后收盘价 `last_bar.close`）。
- **时间周期**：前复权日 K 线（Day QFQ）。序列按交易日升序排列，索引 \( n - 1 \) 对应最新的当前交易日。

### 2.2 核心数学公式与递推逻辑

#### 2.2.1 滚动滑动窗口界定
为了避免当日盘中尚未定型的价格波动产生自指与未来函数，滚动 5 日支撑阻力窗口严格界定为**当前交易日之前、已定型的 5 个连续交易日**：
- 序列总长度为 \( n \)。
- 窗口左边界索引：
  \[
  \text{start} = \max(0, n - 6) \quad (\text{在 Rust 中表达为 } n.\text{saturating\_sub}(6))
  \]
- 窗口右边界索引：
  \[
  \text{end} = n - 1
  \]
- 切片覆盖范围为左闭右开区间 \( [\text{start}, \text{end}) \)，即集合 \( \{ i \in \mathbb{N} \mid \text{start} \le i < end \} \)。
- **切片包含元素**：
  - 当 \( n \ge 6 \) 时，切片包含恰好 5 个交易日：\( \{ n-6, n-5, n-4, n-3, n-2 \} \)。
  - 当 \( 2 \le n < 6 \) 时，切片包含可用的 \( n - 1 \) 个历史交易日：\( \{ 0, 1, \dots, n-2 \} \)。
  - 当 \( n < 2 \) 时，切片元素不足，无法形成历史前置极值通道。

#### 2.2.2 阻力位与支撑位极值提取
- **阻力位（Resistance）公式**：
  \[
  R = \max_{i \in [\text{start}, \text{end})} \text{high}_i
  \]
- **支撑位（Support）公式**：
  \[
  S = \min_{i \in [\text{start}, \text{end})} \text{low}_i
  \]

#### 2.2.3 价格距离百分比衍生公式
在 AI 操盘决断引擎与异动分析中，实时计算当前现价与支撑/阻力位的相对偏离距离：
- **支撑位距离百分比（Support Distance Pct）**：
  \[
  \text{supportDistPct} = \frac{P_{\text{cur}} - S}{S} \times 100\%
  \]
  - 正值表示现价运行在支撑位上方（如 \( +1.5\% \) 表示高于支撑位 1.5%）；
  - 负值表示现价跌破支撑位（如 \( -1.2\% \) 表示跌破支撑位 1.2%）。
- **阻力位距离百分比（Resistance Distance Pct）**：
  \[
  \text{resistDistPct} = \frac{R - P_{\text{cur}}}{P_{\text{cur}}} \times 100\%
  \]
  - 正值表示现价距离上方阻力位尚有上涨空间；
  - 负值表示现价已冲破阻力位上沿。

#### 2.2.4 数值舍入与精度契约
- 金融标准计价单位为人民币元（CNY），严格保留 2 位小数，采用标准四舍五入算法：
  - Rust 后端实现：
    ```rust
    let sup_rounded = (sup * 100.0).round() / 100.0;
    let res_rounded = (res * 100.0).round() / 100.0;
    ```
  - TypeScript 前端实现：
    ```typescript
    const support = Math.round(sup * 100) / 100;
    const resistance = Math.round(res * 100) / 100;
    ```

### 2.3 边界情况与冷启动处理
1. **样本严重不足（\( n < 2 \)）**：
   - 标的为新上市首日股票或仅有 1 根 K 线，无法提取前置对比日。
   - Rust 后端与 TS 均输出 `(None, None)` / `{ support: null, resistance: null }`。
   - 前端 Popover 呈现兜底占位文案：`正在计算关键位`，严禁抛出异常、崩溃或呈现 `NaN`。
2. **次新股冷启动阶段（\( 2 \le n < 6 \)）**：
   - 上市天数在 2 到 5 天之间的次新股，`start = 0`，`end = n - 1`。系统自动采用上市以来已有全部历史已完成交易日（1 ~ 4 根 Bar）的最高价与最低价进行保底计算，实现平滑降级，无需强制等待 5 天。
3. **极值哨兵与空切片防御**：
   - 算法初值设定：`res = f64::MIN`（TS 为 `-Infinity`），`sup = f64::MAX`（TS 为 `Infinity`）。
   - 遍历后校验：若 `sup == f64::MAX` 则返回 `None`；若 `res == f64::MIN` 则返回 `None`。
4. **一字板与价格静止无振幅（\( R = S \)）**：
   - 当股票连续无量一字涨停或停牌复牌后价格无波动时，5 日内最高价等于最低价，导致 \( R = S \)。
   - 距离计算中严格保护分母：`support > 0 && curPrice > 0` 方才进行除法计算，防止除以零产生 `NaN` 或 `Infinity`。

---

## 3. 数据契约与时段规则

### 3.1 上游数据链路
- **数据源通道与多级容灾**：
  1. **首选通道**：腾讯证券前复权日 K 接口（`qt.gtimg.cn`，参数 `code,day,,,320,qfq`）。该通道包含上市公司分红派息除权除息修复，且响应速度快、CDN 节点稳定。
  2. **备选通道**：新浪财经前复权日 K 接口（`hq.sinajs.cn`，参数 `scale=240`，需配置 `Referer: https://finance.sina.com.cn`）。当腾讯接口发生网络超时或解析异常时无缝回退。
  3. **保底通道**：本地时序基准缓存（Baseline Fallback Cache）。在离线或极端弱网环境下保证渲染。
- **计算职责收口**：
  - 遵循“系统调用、原生网络与金融时序计算一律收口于 Rust 后端”原则。
  - Rust 模块 `src-tauri/src/quote/indicators.rs` 中的 `compute_kline_indicators` 统一计算 `support` 与 `resistance`，并通过 Tauri IPC 强类型结构 `KLineData` 下发。
  - 前端 `src/utils/indicators.ts` 保持纯函数镜像逻辑 `computeKLineLevels`，用于前端离线演算、单元测试校验与数据兜底。
- **刷新频率与缓存生命周期**：
  - 日 K 线属于低频稳态数据，在前端视图切换到 `kline` 模式时触发按需懒加载（Lazy Load），并缓存在前端状态字典中。
  - 盘中实时 Tick 报价（3 秒轮询）在前端与本地 AI 决断引擎中与静态的 `support` / `resistance` 持续比对，动态派生即时预警。

### 3.2 A 股交易时段门禁
- **全时段行为矩阵**：

| 时段区间 | 时段属性 | 5日撑压位计算行为 | 实时价格联动与交互规则 |
| :--- | :--- | :--- | :--- |
| `09:15 - 09:25` | 早盘集合竞价 | 静态锁定（基于昨日及前4日） | 集合竞价申报价格产生虚拟匹配价，可参与距离预估；**默认严禁推送桌面系统通知**，仅在微标内静默更新。 |
| `09:25 - 09:30` | 盘前静默期 | 静态锁定 | 9:25 产生当日确定开盘价，系统完成当日开盘位置与撑压位的空间对齐。 |
| `09:30 - 11:30` | 连续竞价早盘 | 静态基准锁定，实时距离高频计算 | 盘中 Tick 轮询驱动 `supportDistPct` 刷新，触发逼近或破位事件时计入异常检测。 |
| `13:00 - 14:57` | 连续竞价午盘 | 静态基准锁定，实时距离高频计算 | 持续监控突破与回踩企稳信号。 |
| `14:57 - 15:00` | 尾盘集合竞价 | 静态基准锁定 | 不可撤单阶段，定格尾盘博弈结果，评估是否有效收复或站稳支撑位。 |
| 盘后 / 夜间 / 周末 | 非交易时段 | 结算归档，静默休眠 | 维持最后收盘快照呈现，轮询器降频休眠，节约能耗。 |

---

## 4. 告警阈值与防扰规范

### 4.1 触发判定规则
在个股穿透诊断（`StockBadge`）与 AI 操盘决断（`ai_decision/caller.rs`）中，系统定义了明确的撑压位告警特征矩阵：

1. **强支撑逼近提示**：
   - 条件：\( 0.0\% \le \text{supportDistPct} \le 2.2\% \)。
   - 战术解读：现价贴近 5 日强支撑线，未跌破且现价差在 2.2% 以内。
   - AI 战术文本注入：`"逼近5日强支撑(现价差{d:.1}%)，"`。若伴随盘口买盘承接（`bidAskImbalance >= 0.12`），生成重点关注企稳反抽指引。
2. **破位下杀预警**：
   - 条件：\( \text{supportDistPct} < -1.0\% \)。
   - 战术解读：现价有效跌破 5 日支撑位超过 1.0%，属于破位确认。
   - AI 战术文本注入：`"已破位5日支撑(跌破{d:.1}%)，"`。驱动动作归类为 `严格止损` 或 `防守控仓`。
3. **波段形态自动分类体系**：
   在 `src/services/useAiDecision.ts` 中，支撑阻力位与均线系统协同决定波段大趋势（`waveTrend`）：
   ```typescript
   if (ma20 && curPrice > 0) {
     if (curPrice >= ma20 * 0.99) {
       waveTrend = ma5 && curPrice < ma5 ? '波段多头回踩' : '波段多头向上'
     } else if (support && curPrice >= support * 0.99) {
       waveTrend = '波段箱体震荡'
     } else {
       waveTrend = '波段空头通道'
     }
   }
   ```

### 4.2 节流防轰炸与静音机制
- **频次节流（Cooldown Window）**：
  - 异动检测器（`CrossingTracker`）对同一标的的同类阈值事件维护滑动时间戳。当标的在支撑位附近微幅抖动、反复穿越触发线时，**强制执行 3 ~ 5 分钟冷却抑制**，严禁高频重复告警。
- **免打扰守则**：
  - 非连续竞价时段（如早盘竞价 `09:15-09:25`、盘后）严格静音，禁止向 Windows 系统托盘抛出 Toast 通知，杜绝诱多诱空阶段的弹窗轰炸。
- **分级日志分类与持久化契约**：
  - 统一使用标准 `log` Facade，严格归口至目标分类：
    - `ALERT`：盘中逼近支撑阻力、破位确认与放量突破；
    - `NET`：日 K 线拉取重试、接口降级与基准缓存加载；
    - `TRADE`：触发支撑买入或破位止损的账本模拟交易；
    - `USER`：用户在前端调整预警价位线（`priceLines`）。
  - 日志持久化按 `AGENTS.md` 规范滚动归档（单文件 5MB，保留 3 份历史，环比 200 条内存缓冲区供前端「运行日志」面板排查）。

---

## 5. 验收基准与测试对齐

### 5.1 黄金测试用例 (Golden Fixture)

#### 用例 1：标准 7 根日 K 棒足额滑动窗口计算 (与 `indicators.test.ts` 对齐)
- **输入序列**（收盘价代表该 Bar，`high = close`, `low = close`）：
  ```text
  bars = [
    Day 1 (2026-01-01): high: 10.0, low: 10.0, close: 10.0
    Day 2 (2026-01-02): high: 12.0, low: 12.0, close: 12.0
    Day 3 (2026-01-03): high: 14.0, low: 14.0, close: 14.0
    Day 4 (2026-01-04): high: 16.0, low: 16.0, close: 16.0
    Day 5 (2026-01-05): high: 18.0, low: 18.0, close: 18.0
    Day 6 (2026-01-06): high: 15.0, low: 15.0, close: 15.0
    Day 7 (2026-01-07): high: 17.0, low: 17.0, close: 17.0  <-- 当日 Bar (索引 6，排除)
  ]
  ```
- **算法计算过程**：
  - 序列总长度 \( n = 7 \)。
  - `start = max(0, 7 - 6) = 1`。
  - `end = 7 - 1 = 6`。
  - 切片包含索引：`[1, 2, 3, 4, 5]`（对应 Day 2 至 Day 6）。
  - 排除索引 0（Day 1，超期）与索引 6（Day 7，当日实时）。
  - 最高价集合：`[12.0, 14.0, 16.0, 18.0, 15.0]` \(\to \max = 18.00\)。
  - 最低价集合：`[12.0, 14.0, 16.0, 18.0, 15.0]` \(\to \min = 12.00\)。
- **预期确定性输出**：
  - `resistance = Some(18.00)`
  - `support = Some(12.00)`

#### 用例 2：次新股 2 根日 K 棒冷启动临界值计算
- **输入序列**：
  ```text
  bars = [
    Day 1 (2026-02-01): high: 20.50, low: 18.20, close: 19.80
    Day 2 (2026-02-02): high: 22.00, low: 19.50, close: 21.00  <-- 当日 Bar (索引 1，排除)
  ]
  ```
- **算法计算过程**：
  - \( n = 2 \)。
  - `start = max(0, 2 - 6) = 0`。
  - `end = 2 - 1 = 1`。
  - 切片仅包含索引 `[0]`（前 1 个交易日）。
- **预期确定性输出**：
  - `resistance = Some(20.50)`
  - `support = Some(18.20)`

#### 用例 3：样本严重不足边界用例 (\( n = 1 \))
- **输入序列**：
  ```text
  bars = [
    Day 1 (2026-03-01): high: 50.00, low: 45.00, close: 48.00
  ]
  ```
- **预期确定性输出**：
  - `resistance = None`
  - `support = None`

#### 用例 4：单调递增 25 根日 K 序列 (与 `kline_tests.rs` 黄金矩阵对齐)
- **输入规则**：
  \( p_k = 10.0 + k \times 0.5 \)（\( k = 1 \dots 25 \)），每个 Bar 的 `high = p_k + 0.3`，`low = p_k - 0.3`。
- **算法计算过程**：
  - \( n = 25 \)。
  - `start = 25 - 6 = 19`。
  - `end = 25 - 1 = 24`。
  - 窗口覆盖索引 19 到 23（即第 20 到 24 根 Bar）。
  - 第 20 根 Bar（\( k = 20 \)，索引 19）：\( p = 20.0 \)，\( \text{low} = 20.0 - 0.3 = 19.70 \)。
  - 第 24 根 Bar（\( k = 24 \)，索引 23）：\( p = 22.0 \)，\( \text{high} = 22.0 + 0.3 = 22.30 \)。
- **预期确定性输出**：
  - `resistance = Some(22.30)`
  - `support = Some(19.70)`

---

### 5.2 代码与测试映射 (Traceability Matrix)

| 架构层级 | 所属模块 / 文件路径 | 对应代码行号 | 核心职责说明 |
| :--- | :--- | :--- | :--- |
| **Rust 后端算法** | [indicators.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/indicators.rs#L90-L106) | L90-L106, L178-L179 | 5日撑压位核心极值切片算法、边界判定与保留两位小数四舍五入 |
| **Rust 数据结构** | [types.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/types.rs#L190-L207) | L190-L207 | `KLineData` 强类型契约中的 `support` 与 `resistance` 字段定义 |
| **Rust AI 决策** | [caller.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/commands/ai_decision/caller.rs#L75-L76) | L75-L76, L270-L274, L288-L298 | 支撑距离判定（`0.0..=2.2` 逼近，`<-1.0` 破位）与战术指引生成 |
| **前端 TS 镜像计算** | [indicators.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/indicators.ts#L174-L197) | L174-L197 | `computeKLineLevels` 纯函数算法实现与舍入 |
| **前端状态微标** | [KLineBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KLineBadge.tsx#L18-L214) | L18-L214 | 日K线卡片顶部战术微标、极简压缩态展示与 Popover 挂载 |
| **前端 3 秒快判浮窗** | [KLineBadgePopover.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/KLineBadgePopover.tsx#L38-L43) | L38-L43, L116-L120 | 浮窗清单中格式化渲染 `阻力 XX.XX (前5日高) · 支撑 XX.XX (前5日低)` |
| **前端 AI 特征提取** | [useAiDecision.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/services/useAiDecision.ts#L170-L192) | L170-L192, L217-L219 | 提取 `supportDistPct`、`resistDistPct` 并推导 `waveTrend`（箱体震荡/多头回踩） |
| **前端图表绘制** | [klineDraw.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/klineDraw.ts#L246-L260) | L246-L260 | 画布水平辅助虚线渲染（红阻力、绿支撑） |
| **前端自动化测试** | [indicators.test.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/indicators.test.ts#L106-L113) | L106-L113 | 验证 7 根日 K 序列滚动 5 日支撑阻力位精确计算（用例 1） |
| **后端自动化测试** | [kline_tests.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/quote/tests/kline_tests.rs#L76-L113) | L76-L113 | 25 根单调日 K 序列全量指标集成测试（用例 4） |
