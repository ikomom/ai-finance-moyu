# 日内新高新低突破与双顶双底背离 (Price Extremes & Divergence) 需求与算法规范

> 模块分类：`tape`  
> 适用标的：`个股`  
> 核心标签：`高频异动 | 分时极值 | 顶底背离 | ORB突破 | 盘口微观结构`  
> 对应代码实现：  
> - 分时形态与背离引擎：[patterns.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/patterns.rs#L71-L183) & [analyze.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/analyze.rs#L124-L138)  
> - Tick 级极值突破检测：[anomaly.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/crossing/anomaly.rs#L155-L213)  
> - 前端穿透诊断与微标：[stockDiagnosis.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/stockDiagnosis.ts#L40-L130) & [StockBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StockBadge.tsx#L21-L126)  
> 对应单元测试：  
> - 后端分时背离测试：[tests/mod.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/tests/mod.rs#L104-L133)  
> - 后端 ORB 突破测试：[tests/flow.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/tests/flow.rs#L36-L59)  
> - 后端极值防抖测试：[crossing/tests/anomaly.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/crossing/tests/anomaly.rs#L144-L166)  
> - 前端诊断用例：[stockDiagnosis.test.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/stockDiagnosis.test.ts#L104-L129)  

---

## 1. 业务定位与看盘指引

### 1.1 业务定义与核心意图
- **定义**：日内新高新低突破与双顶双底背离指标（`Price Extremes & Divergence`）是本项目分时异动监控体系中的**核心空间维度与动量背离判定引擎**。它由三个紧密协同的子维度构成：
  1. **开盘15分钟区间突破 (Opening Range Breakout, ORB)**：追踪 `09:30 - 09:45` 早盘最剧烈的多空多空博弈箱体高点（`ORB High`）与低点（`ORB Low`），并作为全天趋势行情的空间突破基准；
  2. **分时多峰/多谷量价背离 (Dual-Peak / Dual-Trough Divergence)**：识别价格二次冲高却量能衰竭的“假突破顶背离诱多”，以及二次探底抛压枯竭的“缩量双底企稳反弹”；
  3. **实时 Tick 级极值突破监控 (Intraday Extreme Tick Monitoring)**：以动态锚点过滤 1 分钱微幅噪音，捕捉日内涨跌幅超过 $\pm 1.5\%$ 且突破幅度 $\ge 0.8\%$ 的高置信度实质创新高/新低异动。
- **看盘痛点与业务价值**：
  - **摸鱼与极小视觉成本**：在桌面极小化悬浮挂件场景下，交易者无法时刻盯着分时走势图。该指标通过紧凑微标直接传达操盘决断，杜绝“刚追进就买在分时天花板”、“恐慌割肉割在分时地板价”的散户经典亏损陷阱；
  - **识破主力诱多/诱空**：开盘冲高回落常常是主力资金利用早盘高流动性对倒出货。顶背离算法捕捉“二次冲击高位但量能暴跌逾 40%”的虚假繁荣，发出卖出避险预警；
  - **ORB 箱体空间定势**：根据经典的机构 ORB 日内交易理论，开盘 15 分钟形成的振幅确立了日内价值区（Value Area），9:45 后的放量上破或下破往往代表日内单边趋势的形成。

### 1.2 关键信号解读

| 信号名称 | 对应状态/事件 | 外露战术标签 | 紧凑防窥标 | 调性色彩 | 实战看盘与操盘指引 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ORB 放量向上突破** | `TrendState::OrbBreakoutUp` | `▲ ORB突破 · 顺势做多` | `突破(追)` | `bull` (多头翡翠绿/红) | 9:45 之后价格有效冲破早盘 15 分钟区间高点，且伴随局部量比 $\ge 1.25$ 与均线上方偏离。表明早盘阻力已被主力大单扫平，日内单边多头主升波段开启，顺势跟进。 |
| **ORB 放量向下破位** | `TrendState::OrbBreakdownDown` | `▼ ORB跌破 · 跌破箱体` | `跌破(减)` | `bear` (空头深红/绿) | 9:45 之后价格放量砸穿早盘 15 分钟箱体下沿（量比 $\ge 1.20$，偏离 $\le -0.15\%$），早盘所有抄底筹码全部陷入被套，短线防御为上，逢高减仓或离场。 |
| **双顶分时顶背离** | `TrendState::TopDivergence` | `▼ 顶背离 · 谨防回落` | `背离(防)` | `warn` (警示亮橙黄) | 股价二次冲击盘中高点或微创新高，但峰值区间成交量相较前高暴跌逾 40%，且现价滞涨回落。量价严重背离，主力拉高诱多对倒出货特征显著，切忌追高，持仓者逢高止盈。 |
| **双底分时底背离** | `TrendState::BottomRebound` | `▲ 触底反弹 · 企稳反弹` | `反弹(察)` | `bull` (多头翡翠绿/红) | 绿盘环境下二次下探前低，但砸盘成交量枯竭缩量逾 40%，且现价自低位企稳反抽站上第二低点，空头砸盘动能衰竭，呈现超跌金坑修复特征，密切观察能否收复分时均线。 |
| **Tick 创日内新高** | `CrossingEvent::IntradayExtreme(true)` | `📈 突破日内新高！` | `📈新高` | `bull` (系统通知/ALERT) | 盘中现价实质突破前次告警锚点 $\ge 0.8\%$ 且日内涨幅 $\ge +1.5\%$。代表多头持续拓宽日内涨幅空间。 |
| **Tick 创日内新低** | `CrossingEvent::IntradayExtreme(false)` | `📉 跌破日内新低！` | `📉新低` | `bear` (系统通知/ALERT) | 盘中现价实质下破前次告警锚点 $\ge 0.8\%$ 且日内跌幅 $\le -1.5\%$。代表空头持续打压下探日内价格下界。 |
| **早盘箱体内震荡** | `SpatialText: 早盘箱体内` | `● 趋势平衡 · 观望蓄势` | `平衡(看)` | `neutral` (中性次要色) | 价格处于 `ORB Low` 与 `ORB High` 之间窄幅纠缠，多空双方在早盘价值区内尚未分出胜负，多看少动。 |

### 1.3 UI 呈现与防窥规范
- **宿主组件体系**：
  - 核心微标外露组件：`StockBadge.tsx`（及向后兼容别名 `TrendBadge.tsx`），挂载于悬浮窗 Mini 模式顶栏、List 模式自选股列表行尾；
  - 战术研判弹出浮窗：`StockBadgePopover.tsx`（悬停于 Badge 时展开，固定宽度 304px）；
  - 桌面通知桥梁：`spawn_system_notification` 触发 Windows 原生 Toast 弹窗（仅限连续交易时段）。
- **颜色绑定与语义化变量（严禁硬编码静态孤岛色）**：
  - 多头突破 (`bull`)：背景 `var(--color-up-bg)`，文字 `var(--color-up-subtle)`，边框 `1px solid var(--color-up-border)`；
  - 空头破位 (`bear`)：背景 `var(--color-down-bg)`，文字 `var(--color-down-subtle)`，边框 `1px solid var(--color-down-border)`；
  - 警示背离 (`warn`)：背景 `var(--color-warning-bg)`，文字 `var(--color-warning-light)`，边框 `1px solid var(--color-warning-border)`；
  - 中性整理 (`neutral`)：背景 `rgba(255, 255, 255, 0.08)`，文字 `var(--text-muted)`，边框 `1px solid var(--surface-border-subtle)`。
- **全主题自适应保障（Dark & Light 交付红线）**：
  - 在「深邃暗黑」主题下，背景采用半透明磨砂玻璃 `backdrop-filter: blur(16px)`，微标文字呈现温和微光；
  - 在「办公浅色」主题下，根据 `:root[data-theme="light"]` 自动切换为正红 `#dc2626`、高饱和深翡翠绿 `#16a34a` 和深琥珀橙 `#d97706`，彻底杜绝浅荧光绿发飘、白底白字或反差硬伤。
- **极简防窥降噪要求**：
  - 紧凑模式（`compact: true`，用于迷你悬浮条宽度限制）：字号收缩至 `9px`，内边距 `0 4.5px`，外露文本严格压缩为 4~5 个字符的极简缩写（如 `突破(追)`、`背离(防)`、`反弹(察)`、`跌破(减)`）；
  - 战术 Popover 快判清单：
    - 「空间位置」行：若处于 ORB 区间外，直观高亮展示 `突破早盘高点 18.50` (`bull`) 或 `跌破早盘低点 18.10` (`bear`)；若在箱体内，展示 `早盘箱体内 (18.10~18.50)` (`neutral`)；
    - 「诱多风险」行：直观展示多空博弈能量分，如 `空头压制 (-65)`（顶背离）或 `多头主导 (+55)`（底背离）。

---

## 2. 数学公式与算法细节

### 2.1 依赖基础数据
- **输入数据结构**：
  - `Quote` 实时盘口：最新价 $P_{t}$ (`quote.price`)，昨日收盘价 $P_{pre}$ (`quote.pre_close`)，日内最高价 $H_{day}$ (`quote.high`)，日内最低价 $L_{day}$ (`quote.low`)，累计成交量 $Vol_{t}$ (`quote.volume`)，涨跌幅 $Pct_{t}$ (`quote.change_pct`)，时间戳字符串 `time`；
  - `Trend` 分时分钟切片数组：包含逐分钟采集的 `TrendPoint` 序列：
    $$Points = [p_0, p_1, \dots, p_{N-1}], \quad p_i = (time_i, price_i, cum\_vol_i, cum\_amt_i, avg\_price_i)$$
    其中 $time_i$ 为整型时间（如 `930` 代表 09:30，`945` 代表 09:45，`1030` 代表 10:30）。
- **衍生时序与平滑处理**：
  - **分钟独立成交量时序**：
    $$V_i = \max(cum\_vol_i - cum\_vol_{i-1}, 0), \quad i \in [0, N-1], \quad (\text{当 } i=0 \text{ 时 } cum\_vol_{-1}=0)$$
  - **开盘集合竞价脉冲平滑**：09:30 产生的第一根分时线 $p_0$ 包含早盘 09:15-09:25 集合竞价所有撮合成交量，若直接计算滚动均量会导致均值严重畸高。系统进行前置削峰平滑：
    $$\text{若 } N \ge 2 \land V_1 > 0 \land V_0 > 3 \times V_1, \quad \text{则修正 } V_0 = 2 \times V_1$$
  - **局部动态量比 (Dynamic Volume Ratio)**：
    对比最近 4 分钟的平均量与最近 20 分钟（或可用长度）的基准均量：
    $$BaseVol = \frac{1}{M}\sum_{k=N-M}^{N-1} V_k, \quad M = \min(N, 20)$$
    $$RecentVol = \frac{1}{K}\sum_{k=N-K}^{N-1} V_k, \quad K = \min(N, 4)$$
    $$vol\_ratio = \begin{cases} \frac{RecentVol}{BaseVol}, & \text{若 } BaseVol > 0 \\ 1.0, & \text{其他} \end{cases}$$
  - **分时均价线偏离度 (VWAP Bias %)**：
    $$bias\_pct = \frac{P_{t} - Benchmark_{t}}{Benchmark_{t}} \times 100\%$$
    （个股 $Benchmark$ 优先采用分时成交均价 $avg\_price$，大盘指数采用分时收盘价的 20 分钟移动平均 $MA20$）。

### 2.2 核心数学公式与递推逻辑

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     分时价格极值与背离全流程研判状态机                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
         【开盘 15 分钟区间】                      【分时时序长度】
          09:30 <= time <= 09:45                     len >= 18 根？
                    │                                 │
           构建 ORB 箱体边界:                          ├── 否: 维持常规均线形态扫描
           ORB_high = max(P)                          └── 是: 激活顶底双极值背离扫描
           ORB_low  = min(P)                                  │
                    │                                 ┌───────┴───────┐
                    ▼                                 ▼               ▼
           当前 time > 09:45？                  红盘/微涨?         绿盘/微跌?
           ├── 否: 仅输出箱体坐标                 (Pct >= 0.2%)      (Pct <= -0.2%)
           └── 是: 监控放量破位                       │               │
                    │                           ┌─────▼─────┐   ┌─────▼─────┐
          ┌─────────┴─────────┐                 │ 双顶 P1/P2│   │ 双底 T1/T2│
          ▼                   ▼                 │ 搜索与对比 │   │ 搜索与对比 │
     向上突破 ORB:       向下破位 ORB:            └─────┬─────┘   └─────┬─────┘
     P > ORB_high        P < ORB_low                    │               │
     vol_ratio >= 1.25   vol_ratio >= 1.20              ▼               ▼
     bias_pct >= +0.15%  bias_pct <= -0.15%       量能骤降 >40%   量能骤降 >40%
          │                   │                   现价滞涨回踩    现价缩量企稳
          ▼                   ▼                         │               │
     [OrbBreakoutUp]     [OrbBreakdownDown]             ▼               ▼
       (+60分)              (-60分)              [TopDivergence] [BottomRebound]
                                                    (-65分)         (+55分)
```

#### 2.2.1 算法 A: ORB 开盘 15 分钟区间突破与跌破 (Pattern 5)
1. **箱体采样与确立**：
   - 筛选时间满足 $time_i \le 945$ 的分时点子集 $S_{ORB} = \{ p \in Points \mid p.time \le 945 \}$；
   - **有效性门禁**：必须满足 $|S_{ORB}| \ge 3$；
   - 提取早盘极值边界：
     $$ORB_{high} = \max_{p \in S_{ORB}} (p.price), \quad ORB_{low} = \min_{p \in S_{ORB}} (p.price)$$
   - **防御校验**：必须满足 $ORB_{high} > 0 \land ORB_{low} > 0 \land ORB_{high} > ORB_{low}$，否则输出 `(None, None)`。
2. **突破判定（仅在 $time_{latest} > 945$ 时激活）**：
   - **向上突破 (OrbBreakoutUp)**：
     $$P_t > ORB_{high} \land vol\_ratio \ge 1.25 \land bias\_pct \ge +0.15\%$$
     - 判定结果：输出 `TrendState::OrbBreakoutUp`，赋予多头动能评分 $+60$；
     - 诊断文本：`format!("放量突破开盘15分钟区间高点 ({ORB_high:.2})，日内多头突破形态确立")`。
   - **向下破位 (OrbBreakdownDown)**：
     $$P_t < ORB_{low} \land vol\_ratio \ge 1.20 \land bias\_pct \le -0.15\%$$
     - 判定结果：输出 `TrendState::OrbBreakdownDown`，赋予空头破位评分 $-60$；
     - 诊断文本：`format!("跌破开盘15分钟区间低点 ({ORB_low:.2})，日内空头破位下行")`。

#### 2.2.2 算法 B: 双顶顶背离识别 (Dual-Peak Top Divergence, Pattern 2)
1. **准入门槛**：
   - 样本量门槛：$N = Points.len() \ge 18$；
   - 涨幅趋势门槛：当前处于红盘或微涨 $Pct_{t} \ge +0.2\% \lor P_{t} \ge P_{pre}$。
2. **双峰定位与几何分割**：
   - 将时序划分为早期历史区间与近期区间，分割点为 $p1\_end = N - 7$；
   - **第一峰 $P_1$ 寻峰**：在索引区间 $[0, p1\_end)$ 中寻找价格最大值：
     $$(p1\_idx, p1\_price) = \arg\max_{i \in [0, p1\_end)} (Points[i].price)$$
   - **第二峰 $P_2$ 寻峰**：在索引区间 $[p1\_end, N)$ 中寻找价格最大值：
     $$(p2\_idx, p2\_price) = \arg\max_{i \in [p1\_end, N)} (Points[i].price)$$
3. **顶背离几何形态验证**：
   - **峰间时间跨度**：
     $$p2\_idx - p1\_idx \ge 6 \quad (\text{双峰之间至少经历 6 个完整分时分钟})$$
   - **绝对高度要求**：第一峰必须高过昨日收盘价 $p1\_price > P_{pre}$；
   - **二次试探高度**：第二峰高度必须触及或逼近第一峰高点：
     $$p2\_price \ge p1\_price \times 0.997 \quad (\text{相差在 0.3\% 以内或更高})$$
   - **中间充分颈线回调**：两峰之间的最低价格 $Trough_{min}$ 必须经历充分回调：
     $$Trough_{min} = \min_{k \in [p1\_idx, p2\_idx]} (Points[k].price) \le p1\_price \times 0.993 \quad (\text{至少自前高回踩 0.7\%})$$
4. **量能骤降与滞涨衰竭判定**：
   - **$P_1$ 峰值窗口局部均量**：截取窗口 $[p1\_idx - 2, \min(p1\_idx + 3, p1\_end)]$，计算均量：
     $$p1\_avg\_vol = \frac{1}{|W_1|}\sum_{k \in W_1} V_k$$
   - **$P_2$ 峰值窗口局部均量**：截取窗口 $[p2\_idx - 2, \min(p2\_idx + 3, N)]$，计算均量：
     $$p2\_avg\_vol = \frac{1}{|W_2|}\sum_{k \in W_2} V_k$$
   - **衰竭与受阻条件**：
     $$p1\_avg\_vol > 0 \land p2\_avg\_vol \le p1\_avg\_vol \times 0.60 \land P_t \le p2\_price \times 0.999$$
     即：**冲高量能衰竭超 40%（当前量能不足前高量的 60%），且最新价已经自第二峰高点滞涨回踩 $\ge 0.1\%$**；
   - 判定结果：输出 `TrendState::TopDivergence`，赋予强风险防守分值 $-65$；
   - 诊断文本：`"二次冲击盘中高点但量能衰竭（量缩逾40%），短线顶背离风险显著"`。

#### 2.2.3 算法 C: 双底底背离识别 (Dual-Trough Bottom Divergence, Pattern 2)
1. **准入门槛**：
   - 样本量门槛：$N = Points.len() \ge 18$；
   - 跌幅趋势门槛：当前处于绿盘或跌破昨收 $Pct_{t} \le -0.2\% \lor P_{t} < P_{pre}$。
2. **双谷定位与几何分割**：
   - 分割点同样设为 $t1\_end = N - 7$；
   - **第一谷 $T_1$ 寻谷**：在索引区间 $[0, t1\_end)$ 中寻找价格最小值：
     $$(t1\_idx, t1\_price) = \arg\min_{i \in [0, t1\_end)} (Points[i].price)$$
   - **第二谷 $T_2$ 寻谷**：在索引区间 $[t1\_end, N)$ 中寻找价格最小值：
     $$(t2\_idx, t2\_price) = \arg\min_{i \in [t1\_end, N)} (Points[i].price)$$
3. **底背离几何形态验证**：
   - **谷间时间跨度**：$t2\_idx - t1\_idx \ge 6$；
   - **绝对低位要求**：第一谷必须跌破昨日收盘价 $t1\_price < P_{pre}$；
   - **二次探底深度**：第二谷深度接近或跌破第一谷：
     $$t2\_price \le t1\_price \times 1.003 \quad (\text{相差在 0.3\% 以内或略创新低})$$
   - **中间充分颈线反弹**：两谷之间的最高价格 $Crest_{max}$ 必须经历过有力反弹：
     $$Crest_{max} = \max_{k \in [t1\_idx, t2\_idx]} (Points[k].price) \ge t1\_price \times 1.007 \quad (\text{反抽幅度达到 0.7\% 以上})$$
4. **抛压衰竭与缩量企稳判定**：
   - **$T_1$ 窗口均量**：截取窗口 $[t1\_idx - 2, \min(t1\_idx + 3, t1\_end)]$ 计算均量 $t1\_avg\_vol$；
   - **$T_2$ 窗口均量**：截取窗口 $[t2\_idx - 2, \min(t2\_idx + 3, N)]$ 计算均量 $t2\_avg\_vol$；
   - **砸盘动能衰竭与企稳条件**：
     $$t1\_avg\_vol > 0 \land t2\_avg\_vol \le t1\_avg\_vol \times 0.60 \land P_t \ge t2\_price \times 1.001$$
     即：**空头抛压杀跌量能缩减超 40%，且最新价自第二谷底企稳反抽 $\ge 0.1\%$**；
   - 判定结果：输出 `TrendState::BottomRebound`，赋予超跌企稳分值 $+55$；
   - 诊断文本：`"二次探底抛压显著衰竭，均线下方缩量企稳，呈现底背离修复特征"`。

#### 2.2.4 算法 D: 盘中实时 Tick 级极值锚点突破 (Intraday Extremes, crossing/anomaly.rs)
为了在无分时完整时序的高频 Tick 轮询阶段捕捉突发极值，`CrossingTracker` 维护了轻量化的滑动窗口与动态基准锚点：
1. **状态初始化**：
   - 首个 Tick 到达时，以 `high` 或 `price` 初始化 `session_high` 与 `alert_high_anchor`；
   - 以 `low` 或 `price` 初始化 `session_low` 与 `alert_low_anchor`。
2. **创新高判定逻辑**：
   - 处于日内极高位：
     $$is\_at\_high = (H_{day} > 0 \land P_t \ge H_{day} \times 0.999) \lor (session\_high > 0 \land P_t \ge session\_high \times 0.999)$$
   - 即时价格处于上升动量中：$P_t \ge P_{prev\_tick}$；
   - **突破锚点门槛（过滤 1 分钱微动）**：
     $$breakout\_pct = \frac{P_t - alert\_high\_anchor}{alert\_high\_anchor} \times 100\% \ge 0.8\%$$
   - **大日内趋势过滤**：要求当日总体涨幅满足 $Pct_t \ge +1.5\%$；
   - **防轰炸冷却与锚点重置**：
     - 若通过 600 秒（10 分钟）冷却检查，生成 `CrossingEvent::IntradayExtreme { is_new_high: true, price: P_t, change_pct: Pct_t }`；
     - **更新告警锚点**：$alert\_high\_anchor = P_t$（下次告警必须在现价基础上再次上涨 $\ge 0.8\%$ 且越过冷却期）。
3. **创新低判定逻辑**：
   - 处于日内极低位：
     $$is\_at\_low = (L_{day} > 0 \land P_t \le L_{day} \times 1.001) \lor (session\_low > 0 \land P_t \le session\_low \times 1.001)$$
   - 即时价格处于下行中：$P_t \le P_{prev\_tick}$；
   - **跌破锚点门槛**：
     $$breakdown\_pct = \frac{alert\_low\_anchor - P_t}{alert\_low\_anchor} \times 100\% \ge 0.8\%$$
   - **大日内趋势过滤**：要求当日总体跌幅满足 $Pct_t \le -1.5\%$；
   - **冷却与锚点重置**：通过 600 秒冷却后触发 `CrossingEvent::IntradayExtreme { is_new_high: false }`，并重置 $alert\_low\_anchor = P_t$。

### 2.3 边界情况与冷启动处理
- **时序过短防御**：
  - 若分时数据未拉取或点数 $N < 3$ 时，回退至轻量降级：若涨跌幅 $\ge +3.0\%$ 标为 `VwapOverbought`，$\le -3.0\%$ 标为 `VwapOversold`，否则输出 `Neutral`（“等待分时时序数据就绪...”）；
  - 若 $N < 18$，双顶/双底背离识别逻辑静默跳过，避免因样本过少产生伪背离误报。
- **除零与极值保护**：
  - 均价为 0 或价格 $\le 0$ 时直接返回 `None`；
  - 若 $p1\_avg\_vol = 0$ 或 $t1\_avg\_vol = 0$，禁止执行除法与比值判断；
  - 采用 `f64::min` 和 `f64::max` 时分别以 `f64::INFINITY` 和 `f64::NEG_INFINITY` 赋初值，并结合 `saturating_sub` 规避无符号整型下溢。
- **指数标的自动适配**：
  - 对于大盘指数（如 `sh000001`、`sz399001`），由于无单一成交均价 $avg\_price$（或为 0），系统自动切换为滚动 $MA20$ 分时均线作为 Benchmark，且大盘指数严格抑制个股异动弹窗。

---

## 3. 数据契约与时段规则

### 3.1 上游数据链路
- **数据源通道**：
  - 盘口快照源：腾讯行情 CDN（`qt.gtimg.cn`）及新浪证券（`hq.sinajs.cn`），单请求拼接多标的代码拉取，轮询频率 2~3 秒；
  - 分时时序源：腾讯分钟分时线接口，按需轮询（15~30 秒）；通过 `Semaphore(3)` 严格限制最大并发网络拉取数为 3，防止触发远端 CDN 限流与 IP 封禁。
- **前后端职责收口（遵循 AGENTS.md §4 & §11）**：
  - **Rust 后端**：唯一承载时序清洗、09:30 脉冲平滑、双峰寻址、量能均值卷积、动态锚点更新与冷却判定；
  - **SolidJS 前端**：保持轻量呈现，仅消费后端的强类型结构体 `TrendSignal`，进行标签装配与 CSS 变量色彩映射，禁止在前端重复发起分时网络计算。

### 3.2 A 股交易时段门禁

```
09:15      09:20      09:25      09:30           09:45           11:30   13:00           14:56  14:57      15:00
  │          │          │          │               │               │       │               │      │          │
  ├──────────┴──────────┤          ├───────────────┼───────────────┤       ├───────────────┤      ├──────────┤
  │    早盘集合竞价      │  盘前静默 │  ORB 箱体构建  │  ORB 突破激活  │ 午休  │  连续竞价监控  │ 锁定 │ 尾盘集合 │
  │    (可撤) (不可撤)   │  (开盘价)│  (09:30-09:45)│ (09:45-11:30) │       │ (13:00-14:56) │ 缓冲 │ (不可撤) │
  └─────────────────────┴──────────┴───────────────┴───────────────┴───────┴───────────────┴──────┴──────────┘
```

- **时段执行细则**：
  - `09:15 - 09:25`（早盘集合竞价）：
    - 异动探测引擎强制注入 `empty_anomalies`（`intraday_extremes: false`），**绝对禁止推送任何新高新低桌面系统弹窗**；
    - 分时数据未就绪，指标维持休眠；
  - `09:25 - 09:30`（盘前静默期）：
    - 产生今日开盘价，检测数据日期：若发现缓存中的分时数据日期早于今日（`trend.date < today_str`），立即强制清空分时 points，防止昨日历史形态污染今日开盘研判；
  - `09:30 - 09:45`（ORB 箱体构建期）：
    - 逐分累计 $p_i$，动态刷新计算 $ORB_{high}$ 与 $ORB_{low}$；
    - ORB 突破判定保持非激活状态；
  - `09:45 - 11:30` / `13:00 - 14:56`（连续竞价与突破监控期）：
    - ORB 向上突破与向下破位判定全面激活；
    - 当分时累计达到 18 根线时，双顶顶背离与双底底背离扫描实时生效；
    - Tick 级创新高/新低异动根据 600 秒冷却与 0.8% 突破步长实时触发；
  - `14:57 - 15:00`（尾盘集合竞价）：
    - 不可撤单撮合期，关闭高频异动告警，微标保持收盘前形态锁定；
  - 非交易时段/周末：
    - 后端静默休眠，前端展示最后收盘快照。
- **降级与平滑基准缓存 (Baseline Fallback Cache)**：
  - 当外部网络波动或断网时，系统自动锁定上一次拉取成功的分时点与极值坐标；
  - 若分时数据彻底丢失，退化至基于 `quote.change_pct` 的基础乖离研判，保证应用进程绝不崩溃、无白屏异常。

---

## 4. 告警阈值与防扰规范

### 4.1 触发判定规则矩阵

| 异动/形态类型 | 核心数学判定条件 | 多空能量分 | 桌面弹窗支持 | 默认状态 |
| :--- | :--- | :--- | :--- | :--- |
| **ORB 向上突破** | $time > 945 \land P_t > ORB_{high} \land vol\_ratio \ge 1.25 \land bias\_pct \ge +0.15\%$ | `+60` | 卡片状态微标更新 | 开启 |
| **ORB 向下破位** | $time > 945 \land P_t < ORB_{low} \land vol\_ratio \ge 1.20 \land bias\_pct \le -0.15\%$ | `-60` | 卡片状态微标更新 | 开启 |
| **双顶顶背离** | $N \ge 18 \land Pct_t \ge 0.2\% \land p2\_idx - p1\_idx \ge 6 \land p2\_price \ge 0.997 p1 \land Trough_{min} \le 0.993 p1 \land p2\_vol \le 0.60 p1\_vol \land P_t \le 0.999 p2$ | `-65` | 卡片高危警示 + 战术浮窗 | 开启 |
| **双底底背离** | $N \ge 18 \land Pct_t \le -0.2\% \land t2\_idx - t1\_idx \ge 6 \land t2\_price \le 1.003 t1 \land Crest_{max} \ge 1.007 t1 \land t2\_vol \le 0.60 t1\_vol \land P_t \ge 1.001 t2$ | `+55` | 卡片底部企稳微标 | 开启 |
| **Tick 创日内新高** | $is\_at\_high \land is\_moving\_up \land \frac{P_t - anchor}{anchor} \ge 0.8\% \land Pct_t \ge +1.5\%$ | N/A (事件驱动) | 是 (Windows Toast 弹窗) | 可在设置开启/关闭 |
| **Tick 创日内新低** | $is\_at\_low \land is\_moving\_down \land \frac{anchor - P_t}{anchor} \ge 0.8\% \land Pct_t \le -1.5\%$ | N/A (事件驱动) | 是 (Windows Toast 弹窗) | 可在设置开启/关闭 |

### 4.2 节流防轰炸与静音机制
- **Tick 极值 10 分钟 (600s) 严格冷却**：
  - 针对同一标的，`{code}:new_high` 与 `{code}:new_low` 拥有独立的 600 秒冷却时间窗口；
  - 即使超过 600 秒，下一次触发仍必须满足现价相较于上次告警锚点上涨 $\ge 0.8\%$，彻底消除“股价在日内最高点每涨 1 分钱就狂轰滥炸弹窗”的恶劣体验；
- **免打扰守则（严格遵循 AGENTS.md §3）**：
  - 集合竞价时段（09:15-09:25，14:57-15:00）主力虚假申报撤单频繁，**默认绝对禁止推送任何系统桌面通知**；
- **分级日志分类与审计留痕（AGENTS.md §7）**：
  - 日内新高/新低异动事件统一注入标准 `ALERT` 日志 Target：
    - `log::info!(target: "ALERT", "[盘中异动] 贵州茅台 (sh600519): 贵州茅台 📈 突破日内新高！现价 1850.00 (+3.20%)");`
  - 分时形态状态迁移时统一归档，持久化至 `%APPDATA%/.../logs/app.log`，单文件 5MB 自动滚动，并同步进入前端可见的 200 条内存环形缓冲区。

---

## 5. 验收基准与测试对齐

### 5.1 黄金测试用例 (Golden Fixture)

#### 用例 1：ORB 向上放量突破确定性验证 (`detects_orb_breakout`)
- **前置时序条件**：
  - 昨收价 $P_{pre} = 10.00$；
  - 分时数据生成 16 根线覆盖 `09:30` 至 `09:45`（$p_i.time = 930 + i$）：
    - 价格逐级递增：$P_i = 10.00 + i \times 0.01$（$i \in [0, 15]$，因此 $ORB_{high} = 10.15$，$ORB_{low} = 10.00$）；
    - 每分钟成交量均为 $50.0$；
  - `09:46` 分时点：价格 $10.17$，成交量 $100.0$；
  - `09:47` 分时点：价格 $10.20$，成交量 $120.0$；
- **当前盘口行情**：
  - 当前现价 $10.20$，涨幅 $+2.0\%$，满足最新点 $time = 947 > 945$；
- **确定性断言输出**：
  - $ORB_{high} = 10.15$，$ORB_{low} = 10.00$；
  - 状态：`TrendState::OrbBreakoutUp`；
  - 紧凑微标：`"突破"`（前端外露标签 `"▲ ORB突破 · 顺势做多"`）；
  - 多空动能评分：`+60`。

#### 用例 2：双顶量能衰竭顶背离确定性验证 (`detects_top_divergence_dual_peak`)
- **前置时序条件**：
  - 昨收价 $P_{pre} = 10.00$；
  - 长度 $N = 22 \ge 18$；
  - $0 \sim 10$ 分钟：基准窄幅震荡，价格 $10.00$，量能 $50.0$；
  - 第 11~13 分钟形成第一峰 $P_1$：价格依次为 $10.15$、$10.25$、$10.20$，峰值量能暴增至 $300.0$（均量 $> 150.0$）；
  - 第 14~18 分钟颈线回调：价格回调至 $10.10$、$10.08$（回调深度 $10.08 \le 10.25 \times 0.993 = 10.178$）；
  - 第 19~22 分钟二次冲高形成第二峰 $P_2$：价格冲高至 $10.25$（达到前高高度 $10.25 \ge 10.25 \times 0.997$），但量能骤降至 $40.0$（相较 $P_1$ 衰竭超 $60\%$）；
  - 最新点价格回落至 $10.23$（$\le 10.25 \times 0.999 = 10.239$）；
- **当前盘口行情**：
  - 现价 $10.23$，日内涨幅 $+2.3\%$；
- **确定性断言输出**：
  - 状态：`TrendState::TopDivergence`；
  - 紧凑微标：`"背离"`（前端防窥标 `"背离(防)"`）；
  - 多空动能评分：$\le -60$（实际赋值 `-65`）；
  - 诊断说明：`"二次冲击盘中高点但量能衰竭（量缩逾40%），短线顶背离风险显著"`。

#### 用例 3：双底抛压衰竭底背离确定性验证
- **前置时序条件**：
  - 昨收价 $P_{pre} = 10.00$；
  - 长度 $N = 22 \ge 18$；
  - 第 10~13 分钟形成第一深谷 $T_1$：价格急跌至 $9.70$（$< 10.00$），放量恐慌砸盘，窗口均量 $250.0$；
  - 第 14~18 分钟反弹颈线：反抽触碰 $9.82$（反弹幅度 $\ge 9.70 \times 1.007 = 9.767$）；
  - 第 19~21 分钟二次探底 $T_2$：最低价试探 $9.71$（$\le 9.70 \times 1.003 = 9.729$），但量能严重枯竭，窗口均量萎缩至 $80.0$（$\le 250.0 \times 0.60 = 150.0$）；
  - 第 22 分钟企稳回升：现价反抽至 $9.73$（$\ge 9.71 \times 1.001 = 9.719$）；
- **当前盘口行情**：
  - 现价 $9.73$，日内跌幅 $-2.7\%$；
- **确定性断言输出**：
  - 状态：`TrendState::BottomRebound`；
  - 紧凑微标：`"反弹"`（前端防窥标 `"反弹(察)"`）；
  - 多空动能评分：`+55`；
  - 诊断说明：`"二次探底抛压显著衰竭，均线下方缩量企稳，呈现底背离修复特征"`。

#### 用例 4：Tick 级日内新高防抖与 0.8% 门槛验证 (`new_high_requires_0_8_pct_breakout_and_filters_micro_movements`)
- **测试步骤与断言**：
  - 初始状态 $t_0$：以现价 $10.00$ 播种，产生基准锚点 $alert\_high\_anchor = 10.00$；
  - 动作 1（$t_0 + 5s$）：价格微升至 $10.01$（涨幅 $+0.1\%$，涨幅 $0.1\%$ 未达到 $0.8\%$），断言**不触发** `CrossingEvent::IntradayExtreme`；
  - 动作 2（$t_0 + 10s$）：价格大幅拉升至 $10.20$（突破幅度 $2.0\% \ge 0.8\%$，当日涨幅 $+2.0\% \ge 1.5\%$），断言**成功触发**新高事件，锚点刷新为 $10.20$；
  - 动作 3（$t_0 + 30s$）：价格再次拉升至 $10.30$（突破幅度 $0.98\% \ge 0.8\%$），但距上次告警仅过去 20 秒，处于 600 秒冷却内，断言**被防轰炸机制静音抑制**，不产生弹窗。

---

### 5.2 代码与测试双向契约 (Traceability Matrix)

| 业务规范维度 | 模块角色 | 文件路径与代码行号 | 关键逻辑与契约对齐说明 |
| :--- | :--- | :--- | :--- |
| **ORB 箱体与突破** | 后端算法核心 | [patterns.rs#L236-L258](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/patterns.rs#L236-L258) | Pattern 5: 9:45 后的 `OrbBreakoutUp` (+60分) 与 `OrbBreakdownDown` (-60分) 判定。 |
| **ORB 极值点提取** | 后端时序分析 | [analyze.rs#L124-L138](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/analyze.rs#L124-L138) | 扫描 $time \le 945$ 切片，安全提取 `orb_high` 与 `orb_low` 坐标。 |
| **双顶/双底背离** | 后端算法核心 | [patterns.rs#L71-L183](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/patterns.rs#L71-L183) | Pattern 2: 双顶 P1/P2、双底 T1/T2 寻址、40% 量能衰竭、0.7% 回调反弹深度判定。 |
| **Tick 极值与防抖** | 后端异动监听 | [anomaly.rs#L155-L213](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/crossing/anomaly.rs#L155-L213) | `CrossingTracker`: 0.8% 突破步长、$\pm 1.5\%$ 日内涨跌幅门槛及 600 秒冷却防轰炸。 |
| **极值文本格式化** | 后端通知格式化 | [format.rs#L43-L49](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/crossing/format.rs#L43-L49) & [format.rs#L123-L129](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/crossing/format.rs#L123-L129) | 生成 `📈创日内新高` / `📉创日内新低` 微标及 Toast 提示文本。 |
| **时段静默门禁** | 后端轮询调度 | [poller/quotes.rs#L55-L80](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/poller/quotes.rs#L55-L80) | 仅连续交易时段激活 `anomaly_alerts`，早盘集合竞价完全静默。 |
| **前端状态诊断映射** | 前端业务引擎 | [stockDiagnosis.ts#L40-L130](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/stockDiagnosis.ts#L40-L130) | `PATTERN_RULES`: 映射 `orbBreakoutUp`, `topDivergence`, `bottomRebound` 的外露/紧凑标签与调性。 |
| **微标呈现与防窥** | 前端 UI 组件 | [StockBadge.tsx#L21-L126](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StockBadge.tsx#L21-L126) | BaseBadge 装配，支持 Mini 悬浮条 compact 压缩呈现与调性色彩渲染。 |
| **战术弹窗与清单** | 前端 Popover | [StockBadgePopover.tsx#L85-L100](file:///D:/Project/private/ai/ai-finance-moyu/src/components/StockBadgePopover.tsx#L85-L100) | 展示「诱多风险」能量分与「空间位置」早盘高低点突破行。 |
| **顶背离测试用例** | 后端单元测试 | [tests/mod.rs#L104-L133](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/tests/mod.rs#L104-L133) | `detects_top_divergence_dual_peak` 黄金测试。 |
| **ORB 突破测试用例** | 后端单元测试 | [tests/flow.rs#L36-L59](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/trend_engine/tests/flow.rs#L36-L59) | `detects_orb_breakout` 黄金测试。 |
| **极值防抖测试用例** | 后端单元测试 | [crossing/tests/anomaly.rs#L144-L166](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/crossing/tests/anomaly.rs#L144-L166) | `new_high_requires_0_8_pct_breakout_and_filters_micro_movements` 黄金测试。 |
| **前端空间诊断测试** | 前端单元测试 | [stockDiagnosis.test.ts#L104-L129](file:///D:/Project/private/ai/ai-finance-moyu/src/utils/stockDiagnosis.test.ts#L104-L129) | 验证 ORB 空间文本 `突破早盘高点 184.00` 与 `bull` 调性。 |
