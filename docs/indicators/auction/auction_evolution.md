# 集合竞价早盘演变与诱多诱空诊断 (Auction Evolution) 需求与算法规范

> 模块分类：`auction`  
> 适用标的：`个股`（跳过指数标的）  
> 核心标签：`竞价博弈 | 盘口微观结构 | 虚假申报识别 | 防窥看盘`  
> 对应代码实现：  
> - 后端计算与状态引擎：[heuristics.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/heuristics.rs)、[tracker.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/tracker.rs)、[types.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/types.rs)、[poller/quotes.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/poller/quotes.rs#L214-L245)  
> - 前端图表与组件：[AuctionBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/AuctionBadge.tsx)、[AuctionCanvas.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/AuctionCanvas.tsx)、[auctionDraw.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/auctionDraw.ts)、[auctionAxis.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/auctionAxis.ts)  
> 对应单元测试：[tests.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/tests.rs)  

---

## 1. 业务定位与看盘指引

### 1.1 业务定义与核心意图
- **定义**：集合竞价早盘演变与诱多诱空诊断（Auction Evolution）是针对 A 股交易日早盘开盘前 `09:15 - 09:25` 阶段，通过对申报委托与撮合微观盘口时序数据进行追踪与时段特征对比，自动识别主力资金“虚拉撤单诱多”、“恐吓撤单诱空”、“真金白银抢筹”与“真实抛压压制”的微观结构量化算法。
- **看盘痛点与价值**：
  1. **规则不对称与视觉盲区**：A 股集合竞价在 `09:15 - 09:19` 期间允许自由报单和撤单，主力极易利用该窗口通过数千手大买单将撮合价虚拉至涨停（诱多），或挂巨量假卖单恐吓散户在低位割肉（诱空），并在 `09:19:50` 临界点前瞬间全额撤单；散户若在 `09:20 - 09:24` 不可撤单阶段跟进，极易高位接盘或低位割肉。
  2. **摸鱼桌面场景下的极简决策**：上班族无法在开盘前持续盯盘 10 分钟。该指标将复杂的 10 分钟申报、撤单、撮合价变迁与未匹配量能，提炼为一个极简彩色状态微标（`AuctionBadge`）及双层量能微图（`AuctionCanvas`），使用户在 09:25 静默期前仅需一眼即可洞悉开盘真伪意图。

### 1.2 关键信号解读与实操应对

| 诊断标签 (`AuctionTag`) | 微标文案 (`label`) | 视觉色彩 (Tone) | 微观博弈本质 | 实操看盘应对指引 |
| :--- | :--- | :--- | :--- | :--- |
| **虚拉大撤单诱多**<br>`BullTrap` | `⚠️ 疑似诱多` | 警示黄<br>(`warn`) | 09:15-09:19 虚高申报拉升（\(\ge +2.0\%\)），09:20 锁定阶段主力大幅撤单，撮合价急速跳水且伴随巨额买单撤离（撤单率 \(\ge 50\%\)）或量能断崖缩水。 | **严禁开盘追高挂单接盘**。此类个股开盘通常低开或冲高回落，属于典型的主力借竞价虚势吸引散户跟风的出货行为。 |
| **恐吓大撤单诱空**<br>`BearTrap` | `🟢 疑似诱空` | 多头翡翠绿<br>(`bull`) | 09:15-09:19 恶意堆积巨量卖单砸盘恐吓（\(\le -2.0\%\) 甚至跌停），09:20 锁定后撤销恐慌卖单（撤单率 \(\ge 50\%\)），撮合价被真实买盘迅速拉起或直接翻红。 | **切忌恐慌割肉抛售**。虚晃一枪暗含主力低位暗中吃单意图，可关注开盘后承接企稳机会。 |
| **真实强势抢筹**<br>`Snatching` | `🔥 真实抢筹` | 动量正红<br>(`bull`) | 09:20 不可撤单后撮合涨幅坚挺维持在 \(\ge +1.5\%\)，且相比早盘峰值无明显回落（回落 \(< 0.8\%\)），不可撤单阶段成交量能扎实且未见撤单衰减。 | **日内多头动能强劲**。主力真金白银锁定开盘筹码，开盘后大概率有资金主动点火高开高走。 |
| **开盘真实抛压**<br>`Dumping` | `❄️ 真实抛压` | 空头深绿<br>(`bear`) | 09:20 锁定后撮合价持续承压在低位（\(\le -1.5\%\)），无实质性买盘反弹承接（反弹 \(< 0.6\%\)），且卖盘大量积压。 | **规避早盘低走风险**。开盘卖压沉重，下方承接乏力，日内容易延续跌势或破位。 |
| **竞价平稳 / 撮合中**<br>`Normal` | `竞价平稳`<br>`竞价试盘中`<br>`竞价撮合中` | 中性灰白<br>(`neutral`) | 价格在合理区间温和波动，未触及极端异常落差；或处于 09:15-09:19 试盘阶段/09:20 后冷启动阶段。 | 正常按日内分时均线与常规策略执行，无极端竞价异动干扰。 |

### 1.3 UI 呈现与防窥规范
- **宿主组件体系**：
  - **迷你微标 (`AuctionBadge.tsx`)**：置于个股行情卡片首行，紧凑模式下仅渲染纯文本微标（如 `⚠️ 疑似诱多`、`🔥 真实抢筹`、`高开 +1.20%`），字号控制在 9.5px，杜绝强光晕与桌面刺眼弹窗。
  - **悬停详情弹层 (`.auction-popover`)**：鼠标悬停微标呼出 304px 宽度的暗色玻璃态卡片。包含：
    1. 顶部状态与阶段标识（`阶段 异动捕捉`、`阶段 开盘撮合`、`阶段 等待申报`）；
    2. 主体完整展开的诊断文案（`.stock-popover-summary`，100% 完整展示，禁止截断省略）；
    3. 底部核心参数胶囊条（`.auction-param-strip`）：包括【撮合价】、【前段冲高/下探】、【定格涨幅】、【撤单降量】。
  - **竞价全景双层画布 (`AuctionCanvas.tsx` / `auctionDraw.ts`)**：
    - 分割比例：上方 68% 为撮合价变迁折线图，下方 28% 为双层堆叠柱状图。
    - 时序划分：横轴 0..10 槽位。09:15-09:20（槽位 0..5）底色带淡黄微光（`rgba(245, 158, 11, 0.035)`，可撤单区）；09:20-09:25（槽位 5..10）底色带淡蓝微光（`rgba(59, 130, 246, 0.035)`，不可撤单区）。中间以 09:20 金黄色虚线分界（`DIVIDER_LINE`）。
    - 柱状图双层堆叠设计：
      - **底层实心柱**：撮合量 `matched_volume`（价格高于昨收为正红 `UP`，低于昨收为翡翠绿 `DOWN`，不透明度 0.85）。
      - **顶层镂空框**：未匹配残留委托量 `unmatched_volume`（未匹配买单为红边框/浅红半透填充，未匹配卖单为绿边框/浅绿半透填充，填充不透明度 0.28，1px 锐利边框不透明度 0.85）。直观暴露虚托买单与压盘卖单的瞬时撤离。
- **全主题自适应准则**：
  - 严禁硬编码静态孤岛颜色，文字与边框全量绑定 CSS 语义变量（如 `var(--card-bg)`, `var(--text-color)`, `var(--border-color)`）。
  - 在「办公浅色」与「深邃暗黑」下，涨跌指示与柱状图均遵循饱和度强化标准（红 `#ef4444` / 绿 `#22c55e`），浅色模式下依然具备清晰可读的对比度。

---

## 2. 数学公式与算法细节

### 2.1 依赖基础数据
算法输入数据来自早盘集合竞价轮询的股票快照对象 `Quote` 与生成的时序切片 `AuctionPoint`：
- **基准价格**：昨收价 \(P_{\text{pre\_close}} > 0\)。
- **集合竞价数据点属性**：
  - \(t\)：时间戳，24 小时制整型 `HHMM`（如 918 代表 09:18）或 `HHMMSS`（如 91825 代表 09:18:25）；
  - \(P_t\)：该时刻的虚拟集合竞价撮合价格 `price`；
  - \(V_{\text{matched}, t}\)：该时刻虚拟撮合成交量 `matched_volume`（单位：手）；
  - \(V_{\text{unmatched}, t}\)：该时刻未匹配挂单剩余量 `unmatched_volume`（单位：手）；
  - \(S_{\text{unmatched}, t}\)：未匹配方向 `unmatched_side \in \{\text{Buy}, \text{Sell}, \text{None}\}\)；
  - \(V_{\text{total}, t} = V_{\text{matched}, t} + V_{\text{unmatched}, t}\)：申报总量 `volume`。

### 2.2 微观盘口量能推导
在 `09:15 - 09:24` 竞价期间，行情切片仅暴露撮合价格以及买一量 \(B_1\) 与卖一量 \(A_1\)（撮合挂单）：
1. 若 \(B_1 > 0\) 且 \(A_1 > 0\)：
   \[
   V_{\text{matched}} = \min(B_1, A_1), \quad V_{\text{unmatched}} = |B_1 - A_1|
   \]
   \[
   S_{\text{unmatched}} = \begin{cases} \text{Buy}, & B_1 > A_1 \\ \text{Sell}, & A_1 > B_1 \\ \text{None}, & B_1 = A_1 \end{cases}
   \]
2. 若 \(B_1 > 0\) 且 \(A_1 = 0\)（单纯买单虚托封盘）：
   \[
   V_{\text{matched}} = 0, \quad V_{\text{unmatched}} = B_1, \quad S_{\text{unmatched}} = \text{Buy}
   \]
3. 若 \(A_1 > 0\) 且 \(B_1 = 0\)（单纯卖单压制封盘）：
   \[
   V_{\text{matched}} = 0, \quad V_{\text{unmatched}} = A_1, \quad S_{\text{unmatched}} = \text{Sell}
   \]
4. 在 `09:25:00`（开盘定型时刻）：
   \[
   V_{\text{matched}} = \text{Quote.volume}, \quad V_{\text{unmatched}} = 0, \quad S_{\text{unmatched}} = \text{None}
   \]

### 2.3 核心指标与衍生统计量公式

将整个早盘时段分为两段：
- **试盘可撤单期**（Early Phase）：\(\mathcal{T}_{\text{early}} = \{p \in \text{Points} \mid p.time < 920\}\)（对应 09:15:00 - 09:19:59）
- **定格锁定承诺期**（Locked Phase）：\(\mathcal{T}_{\text{locked}} = \{p \in \text{Points} \mid p.time \ge 920\}\)（对应 09:20:00 - 09:24:59）

各统计衍生量定义如下：
1. **早盘试盘期极值涨跌幅**：
   \[
   R_{\text{early\_max}} = \frac{\max_{p \in \mathcal{T}_{\text{early}}} (p.price) - P_{\text{pre\_close}}}{P_{\text{pre\_close}}} \times 100\%
   \]
   \[
   R_{\text{early\_min}} = \frac{\min_{p \in \mathcal{T}_{\text{early}}} (p.price) - P_{\text{pre\_close}}}{P_{\text{pre\_close}}} \times 100\%
   \]
2. **锁定承诺期最终撮合涨跌幅与量能**：
   设 \(p_{\text{last\_locked}}\) 为 \(\mathcal{T}_{\text{locked}}\) 中的最新数据点：
   \[
   R_{\text{locked}} = \frac{p_{\text{last\_locked}}.price - P_{\text{pre\_close}}}{P_{\text{pre\_close}}} \times 100\%
   \]
   \[
   V_{\text{locked}} = p_{\text{last\_locked}}.volume
   \]
3. **申报成交总量萎缩率**：
   设 \(V_{\text{early\_max}} = \max_{p \in \mathcal{T}_{\text{early}}} (p.volume)\)，若 \(V_{\text{early\_max}} > 0\) 且 \(V_{\text{early\_max}} > V_{\text{locked}}\)：
   \[
   \Delta V_{\text{drop}} = \frac{V_{\text{early\_max}} - V_{\text{locked}}}{V_{\text{early\_max}}} \times 100\%
   \]
4. **未匹配大单撤单率**：
   - 虚托买单撤单率：
     设 \(U_{\text{early\_max\_buy}} = \max \{p.unmatched\_volume \mid p \in \mathcal{T}_{\text{early}}, p.unmatched\_side = \text{Buy}\}\)
     设 \(U_{\text{locked\_buy}} = \begin{cases} p_{\text{last\_locked}}.unmatched\_volume, & p_{\text{last\_locked}}.unmatched\_side = \text{Buy} \\ 0, & \text{otherwise} \end{cases}\)
     若 \(U_{\text{early\_max\_buy}} > 0\) 且 \(U_{\text{early\_max\_buy}} > U_{\text{locked\_buy}}\)：
     \[
     \Delta U_{\text{buy\_drop}} = \frac{U_{\text{early\_max\_buy}} - U_{\text{locked\_buy}}}{U_{\text{early\_max\_buy}}} \times 100\%
     \]
   - 恐吓卖单撤单率：
     设 \(U_{\text{early\_max\_sell}} = \max \{p.unmatched\_volume \mid p \in \mathcal{T}_{\text{early}}, p.unmatched\_side = \text{Sell}\}\)
     设 \(U_{\text{locked\_sell}} = \begin{cases} p_{\text{last\_locked}}.unmatched\_volume, & p_{\text{last\_locked}}.unmatched\_side = \text{Sell} \\ 0, & \text{otherwise} \end{cases}\)
     若 \(U_{\text{early\_max\_sell}} > 0\) 且 \(U_{\text{early\_max\_sell}} > U_{\text{locked\_sell}}\)：
     \[
     \Delta U_{\text{sell\_drop}} = \frac{U_{\text{early\_max\_sell}} - U_{\text{locked\_sell}}}{U_{\text{early\_max\_sell}}} \times 100\%
     \]

### 2.4 启发式诊断规则决策树 (`heuristics.rs`)

算法按优先级严格顺序执行以下分支判定：

```
evaluate_auction(pre_close, points)
│
├── [前置保护] points 为空 或 pre_close <= 0 -> return None
│
├── [阶段 1: 09:15-09:19 试盘期] locked_points 为空
│   └── return Normal ("竞价试盘中", "09:15-09:19 申报可撤单阶段...")
│
├── [防御 2: 09:20后冷启动接入] early_points 为空
│   └── return Normal ("竞价撮合中", "09:20后接入，缺少试盘阶段对比...")
│
├── [规则 1: 虚拉大撤单诱多 (BullTrap)]
│   ├── 前置条件 A: 早盘曾冲高 R_early_max >= 2.0%
│   ├── 前置条件 B: 锁定后落差 (R_early_max - R_locked >= 1.5%) 或 (R_locked <= 0.0% 且 R_early_max >= 1.5%)
│   └── 撤单确认 C: (总成交量萎缩 >= 30%) 或 (买单撤单率 >= 50%) 或 (冲高回落落差 >= 2.0%)
│       └── 命中 -> return BullTrap ("⚠️ 疑似诱多")
│
├── [规则 2: 恐吓大撤单诱空 (BearTrap)]
│   ├── 前置条件 A: 早盘曾砸盘 R_early_min <= -2.0%
│   ├── 前置条件 B: 锁定后拉升 (R_locked - R_early_min >= 1.5%) 或 (R_locked >= 0.0% 且 R_early_min <= -1.5%)
│   └── 撤单确认 C: (总成交量萎缩 >= 30%) 或 (卖单撤单率 >= 50%) 或 (反弹幅度 >= 2.0%) 或 (完全翻红 R_locked >= 0.0%)
│       └── 命中 -> return BearTrap ("🟢 疑似诱空")
│
├── [规则 3: 真金白银强势抢筹 (Snatching)]
│   ├── 强势维持: R_locked >= 1.5%
│   ├── 绝无明显回落: (R_early_max - R_locked) < 0.8%
│   └── 量能扎实未萎缩: (V_early_max == 0) 或 (V_locked >= V_early_max * 0.7)
│       └── 命中 -> return Snatching ("🔥 真实抢筹")
│
├── [规则 4: 开盘坚决真实抛压 (Dumping)]
│   ├── 持续低位承压: R_locked <= -1.5%
│   └── 绝无反弹承接: (R_locked - R_early_min) < 0.6%
│       └── 命中 -> return Dumping ("❄️ 真实抛压")
│
└── [规则 5: 默认基准平稳 (Normal)]
    └── return Normal ("竞价平稳", "09:20锁定撮合价 ...")
```

### 2.5 边界保护与冷启动机制
1. **除零与浮点安全**：
   - 昨收价 \(P_{\text{pre\_close}} \le 0.0\) 时立即熔断返回 `None`；
   - 萎缩率计算中分母 \(V_{\text{early\_max}} \le 0.0\) 时返回 `None`，不触发非法除法；
   - 涨跌幅除法中使用 `f64::is_finite()` 守卫，极值折叠使用 `f64::NEG_INFINITY` 与 `f64::INFINITY`。
2. **09:20 后中途接入防误判守则**：
   - 若用户在 `09:20 - 09:24` 中途启动客户端，缺少 `09:15 - 09:19` 试盘样本，算法直接返回 `Normal`（“竞价撮合中”），严禁误报 `BullTrap` 或 `BearTrap`。
3. **开盘后/盘中启动的基准锚点补全 (`ensure_cold_start_entry`)**：
   - 若用户在 `09:25` 以后或连续交易阶段启动，系统从快照中提取 `quote.open` 与 `quote.pre_close`，自动注入一个 `time = 92500`（"09:25:00"）的单点锚点，并计算开盘溢价百分比。
   - 既保证了 `AuctionBadge` 不会全空白屏，又能明确提示用户：“09:25 开盘撮合成交价 XX 元...如需监控 09:15-09:25 撤单异动流，请在早盘竞价时段保持软件在线采集”。
4. **指数标的自动豁免 (`is_index_symbol`)**：
   - 上证指数（`sh000*`）、深证成指/创业板指（`sz399*`）、北证50（`bj899*`）属于综合指数，无单股订单簿撮合与撤单诱多机制，直接在 `AuctionTracker::update_quote` 中跳过追踪，防止污染数据。

---

## 3. 数据契约与时段规则

### 3.1 上游数据链路与前后端职责
- **数据源通道**：通过腾讯行情 CDN（`qt.gtimg.cn`）批量多代码单请求聚合拉取，网络层强制配置 `.no_proxy()` 规避代理阻断。
- **架构职责边界**：
  - **Rust 后端**（唯一计算核心）：负责接收原始网络 Tick、清洗时间戳格式、判定 A 股交易时段、计算撮合/未匹配量、聚合更新时序、运行启发式诊断逻辑，并随全量快照推送到前端。
  - **SolidJS 前端**（极简轻量呈现）：仅接收强类型 `AuctionData`，负责驱动 `AuctionBadge` 的极简排版与 `AuctionCanvas` 的高性能离屏/Retina 2D Canvas 绘制，严禁在前端编写金融时序与诱多计算。
- **刷新频率**：盘中轮询周期严格保持在 3 秒，竞价时段（09:15-09:25）与连续交易时段保持高频采集。

### 3.2 A 股交易时段门禁矩阵

| 时段区间 | `Session` 枚举值 | 竞价引擎动作 | 告警与通知规则 | 状态说明 |
| :--- | :--- | :--- | :--- | :--- |
| **00:00 - 09:14** | `PreOpen` / `Closed` | 休眠等待；若有数据只执行冷启动补全 | 严禁任何告警与弹窗 | 盘前静默阶段 |
| **09:15 - 09:19** | `CallAuctionCancelable` | **实时采集更新** `points`；输出 `竞价试盘中` | **默认静音**，无系统弹窗，日志 Target `AUCTION` 记录 | 可自由撤单阶段 |
| **09:20 - 09:24** | `CallAuctionLocked` | **全量启发式诊断**，实时对比试盘期与锁定承诺期 | 诊断变更为异常时输出 `AUCTION` 分级日志，**严禁系统桌面弹窗** | 不可撤单阶段 |
| **09:25 - 09:29** | `PreTrade` | 写入 09:25 开盘撮合最终定型点，锁定诊断结果 | 保持状态微标静态呈现，静默等待开盘 | 开盘静默期 |
| **09:30 - 14:56** | `Morning` / `Afternoon` | 保持早盘竞价快照；盘中启动执行 `ensure_cold_start_entry` | 连续交易异动（急速拉升、日内新高等）按标准告警执行 | 连续竞价阶段 |
| **14:57 - 15:00** | `ClosingAuction` | 采集并推入 `closing_points`，记录尾盘不可撤单撮合与未匹配量 | 仅记录尾盘时序，不进行早盘诱多诊断 | 尾盘集合竞价 |
| **15:00 以后 / 周末** | `Closed` | 锁定收盘快照，停止时序更新，持久化写入本地缓存 | 停止所有轮询与告警 | 盘后休眠 |

### 3.3 跨日重置与持久化容灾
- **跨日重置机制**：在 `AuctionTracker::check_date_or_reset(&quote.date)` 中，一旦检测到行情快照的自然日期与记录的 `last_date` 不一致，系统自动清空内存中的所有历史个股竞价点位，杜绝上一交易日的残留诊断误报。
- **基准缓存与零崩溃兜底**：
  - 采集到的竞价时序数据随每次快照持久化保存于 `%APPDATA%/.../quotes_cache.json` 的 `auctions` 字段；
  - 当软件重启或网络短暂中断时，优先加载本地基准缓存，确保界面毫秒级首屏加载，绝不出现空白卡片或 `NaN` 异常。

---

## 4. 告警阈值与防扰规范

### 4.1 触发判定阈值汇总

| 规则名称 | 核心特征 1 (早盘幅值) | 核心特征 2 (锁定落差/反弹) | 核心特征 3 (量能或撤单异动) |
| :--- | :--- | :--- | :--- |
| **虚拉大撤单诱多** | 早盘峰值 \(R_{\text{early\_max}} \ge +2.0\%\) | 冲高回落落差 \(\ge 1.5\%\) 或 翻绿（\(R_{\text{locked}} \le 0\%\)） | 成交量萎缩 \(\ge 30\%\) 或 未匹配买单撤离 \(\ge 50\%\)（且大单 \(\ge 500\) 手） |
| **恐吓大撤单诱空** | 早盘深砸 \(R_{\text{early\_min}} \le -2.0\%\) | 快速拉升反弹 \(\ge 1.5\%\) 或 翻红（\(R_{\text{locked}} \ge 0\%\)） | 成交量萎缩 \(\ge 30\%\) 或 未匹配卖单撤离 \(\ge 50\%\)（且大单 \(\ge 500\) 手） |
| **真金白银抢筹** | 早盘保持稳健走势 | 锁定后维持强势 \(R_{\text{locked}} \ge +1.5\%\) 且 回落 \(< 0.8\%\) | 锁定后成交量不萎缩（\(V_{\text{locked}} \ge 0.7 \times V_{\text{early\_max}}\)） |
| **开盘真实抛压** | 早盘持续低迷压制 | 锁定后深度承压 \(R_{\text{locked}} \le -1.5\%\) 且 反弹 \(< 0.6\%\) | 卖盘持续堆积，无实质承接 |

### 4.2 节流防轰炸与桌面通知免打扰守则 (遵循 AGENTS.md §3 & §7)
- **通知防轰炸红线**：
  - 集合竞价阶段主力撤单与虚报极为频繁，根据项目最高准则 **AGENTS.md 第 3 条**，**默认绝对禁止向操作系统推送桌面级通知弹窗（OS Desktop Notification / Toast）**。
  - 在 `src-tauri/src/poller/quotes.rs` 的行 98-101 中明确执行门禁：
    ```rust
    // Silence all notifications (desktop OS and in-app toasts) outside continuous trading
    let notifications: Vec<AlertNotification> = if !is_continuous {
        Vec::new()
    } else {
        // ...
    };
    ```
- **微标与画布静默表达**：所有的竞价诱多诱空异动一律收口于悬浮挂件的 `AuctionBadge`（彩色微标）与详情弹窗中的 `AuctionCanvas`，以非侵入式的视觉元素呈现给交易者。
- **分级日志分类与降噪规范**：
  - 日志统一使用标准 `log` Facade，Target 严格收口为 `AUCTION`；
  - 仅在个股诊断标签发生实质性变化（`prev_tag != Some(diag.tag)`）且新标签非 `Normal` 时触发一条分级警示留痕：
    ```rust
    log::warn!(
        target: "AUCTION",
        "[集合竞价诊断] {} ({}): {} - {} (开盘试盘: {:.2}%)",
        q.name, q.code, diag.label, diag.detail, q.change_pct
    );
    ```
  - 严禁在高频 Tick 中重复输出相同日志，日志自动归档于 `%APPDATA%/.../logs/app.log`，并同步推入 200 条内存环形缓冲区供前端「运行日志」面板筛选。

---

## 5. 验收基准与测试对齐

### 5.1 黄金测试用例 (Golden Fixture Matrix)

以下用例完全对齐 `src-tauri/src/auction_engine/tests.rs` 中的确定性断言逻辑：

#### 用例 1：虚拉冲高与大撤单诱多 (Bull Trap via Fake Spike & Volume Drop)
- **昨收基准**：\(P_{\text{pre\_close}} = 10.00\) 元
- **输入序列**：
  - `09:15`: 价格 10.20 元 (+2.0%), 总量 500 手
  - `09:18`: 价格 10.80 元 (+8.0%), 总量 5000 手（早盘峰值）
  - `09:19`: 价格 10.70 元 (+7.0%), 总量 4800 手
  - `09:20`: 价格 10.10 元 (+1.0%), 总量 800 手（09:20 锁定临界撤单，落差 7.0%，量能断崖萎缩 84%）
  - `09:24`: 价格 10.05 元 (+0.5%), 总量 900 手
- **预期计算输出**：
  - `early_peak_pct` = `+8.0%`
  - `locked_pct` = `+0.5%`
  - `volume_drop_pct` = `Some(82.0%)`
  - `diagnosis.tag` = `AuctionTag::BullTrap`
  - `diagnosis.label` = `"⚠️ 疑似诱多"`
  - `diagnosis.detail` = `"早盘虚拉冲高至 +8.0%，09:20锁定后撤单跳水至 +0.5%（量能缩减 82%），警惕开盘接盘风险"`

#### 用例 2：巨额未匹配买单虚托撤离诱多 (Bull Trap via Unmatched Buy Cancel)
- **昨收基准**：\(P_{\text{pre\_close}} = 10.00\) 元
- **输入序列**：
  - `09:15`: 价格 10.20 元, 撮合量 500 手, 未匹配买单 1000 手 (`Buy`)
  - `09:18`: 价格 10.80 元, 撮合量 1000 手, 未匹配买单 5000 手 (`Buy` 虚假大买单封盘)
  - `09:20`: 价格 10.10 元, 撮合量 900 手, 未匹配买单 100 手 (`Buy` 撤单 98%)
  - `09:24`: 价格 10.05 元, 撮合量 900 手, 未匹配买单 50 手 (`Buy`)
- **预期计算输出**：
  - `diagnosis.tag` = `AuctionTag::BullTrap`
  - `diagnosis.detail` 包含 `"买单撤离 99%"`（或 \(\ge 50\%\) 且早盘虚托量 \(\ge 500\) 手特征文案）

#### 用例 3：恐吓深砸与撤单拉升诱空 (Bear Trap via Scare & Rebound)
- **昨收基准**：\(P_{\text{pre\_close}} = 10.00\) 元
- **输入序列**：
  - `09:15`: 价格 9.80 元 (-2.0%), 总量 500 手
  - `09:18`: 价格 9.20 元 (-8.0%), 总量 4000 手（跌停恐吓谷值）
  - `09:20`: 价格 9.90 元 (-1.0%), 总量 600 手（撤单拉升，反弹 7.0%）
  - `09:24`: 价格 10.05 元 (+0.5%), 总量 800 手（完全翻红）
- **预期计算输出**：
  - `early_peak_pct` = `-8.0%`
  - `locked_pct` = `+0.5%`
  - `diagnosis.tag` = `AuctionTag::BearTrap`
  - `diagnosis.label` = `"🟢 疑似诱空"`
  - `diagnosis.detail` 包含 `"早盘恐吓深跌至 -8.0%，09:20锁定后大单撤离拉升至 +0.5%"`

#### 用例 4：真金白银持续抢筹 (Real Snatching)
- **昨收基准**：\(P_{\text{pre\_close}} = 10.00\) 元
- **输入序列**：
  - `09:16`: 价格 10.20 元 (+2.0%), 总量 1000 手
  - `09:19`: 价格 10.40 元 (+4.0%), 总量 2500 手
  - `09:20`: 价格 10.45 元 (+4.5%), 总量 3000 手
  - `09:24`: 价格 10.50 元 (+5.0%), 总量 3500 手（持续放量走高）
- **预期计算输出**：
  - `early_peak_pct` = `+4.0%`
  - `locked_pct` = `+5.0%`
  - `drop_from_peak` = `-1.0%`（无冲高回落）
  - `diagnosis.tag` = `AuctionTag::Snatching`
  - `diagnosis.label` = `"🔥 真实抢筹"`
  - `diagnosis.detail` = `"09:20锁定后强势维持在 +5.0%，买盘挂单扎实，成交意愿坚决"`

#### 用例 5：开盘坚决沉重抛压 (Real Dumping)
- **昨收基准**：\(P_{\text{pre\_close}} = 10.00\) 元
- **输入序列**：
  - `09:16`: 价格 9.70 元 (-3.0%), 总量 1000 手
  - `09:19`: 价格 9.50 元 (-5.0%), 总量 2000 手
  - `09:20`: 价格 9.40 元 (-6.0%), 总量 2800 手
  - `09:24`: 价格 9.35 元 (-6.5%), 总量 3200 手（承接乏力）
- **预期计算输出**：
  - `early_peak_pct` = `-5.0%`
  - `locked_pct` = `-6.5%`
  - `diagnosis.tag` = `AuctionTag::Dumping`
  - `diagnosis.label` = `"❄️ 真实抛压"`
  - `diagnosis.detail` = `"09:20锁定后持续低位承压在 -6.5%，卖盘堆积无明显承接，注意早盘抛压"`

#### 用例 6：09:20 后冷启动接入保护 (Cold Start Defense)
- **昨收基准**：\(P_{\text{pre\_close}} = 10.00\) 元
- **输入序列**：
  - `09:22`: 价格 10.30 元, 总量 2000 手（缺少 09:15-09:19 试盘样本）
  - `09:24`: 价格 10.35 元, 总量 2500 手
- **预期计算输出**：
  - `diagnosis.tag` = `AuctionTag::Normal`
  - `diagnosis.label` = `"竞价撮合中"`
  - `diagnosis.detail` 包含 `"09:20后接入，缺少试盘阶段对比"`

---

### 5.2 代码与测试映射双向契约 (Traceability Matrix)

| 业务环节与模块 | 实现源文件 | 精确行号范围 | 职责与功能描述 |
| :--- | :--- | :--- | :--- |
| **启发式诊断算法核心** | [heuristics.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/heuristics.rs) | [L11-L225](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/heuristics.rs#L11-L225) | 试盘期与锁定承诺期特征提取、落差/萎缩率计算、4 大异动决策树 |
| **竞价数据结构与契约** | [types.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/types.rs) | [L7-L101](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/types.rs#L7-L101) | `AuctionPoint`, `AuctionTag`, `AuctionDiagnosis`, `AuctionData` 强类型定义 |
| **时序累积与冷启动追踪** | [tracker.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/tracker.rs) | [L13-L204](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/tracker.rs#L13-L204) | 盘口买卖一量解构撮合/未匹配量、跨日重置、指数过滤、09:25 开盘锚点补全 |
| **时间格式解析工具** | [tracker.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/tracker.rs) | [L217-L265](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/tracker.rs#L217-L265) | `parse_time_details` 与 `parse_time_hhmm` 各种格式时间戳兼容解析 |
| **调度轮询与 AUCTION 日志** | [quotes.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/poller/quotes.rs) | [L214-L245](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/poller/quotes.rs#L214-L245) | 竞价时段调度、静默期分支、状态变化触发 `target: "AUCTION"` 结构化日志 |
| **系统桌面通知免打扰门禁** | [quotes.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/poller/quotes.rs) | [L98-L101](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/poller/quotes.rs#L98-L101) | 竞价期彻底静默系统通知，阻断桌面弹窗轰炸 |
| **竞价状态微标组件** | [AuctionBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/AuctionBadge.tsx) | [L1-L144](file:///D:/Project/private/ai/ai-finance-moyu/src/components/AuctionBadge.tsx#L1-L144) | 极简紧凑态呈现、悬停呼出 304px 卡片、完整诊断文案与参数胶囊条 |
| **微标样式与主题变量绑定** | [AuctionBadge.css](file:///D:/Project/private/ai/ai-finance-moyu/src/components/AuctionBadge.css) | [L1-L52](file:///D:/Project/private/ai/ai-finance-moyu/src/components/AuctionBadge.css#L1-L52) | 暗色玻璃态面板、微型阶段标签、高对比度红绿微标样式 |
| **竞价画布容器与交互** | [AuctionCanvas.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/AuctionCanvas.tsx) | [L1-L75](file:///D:/Project/private/ai/ai-finance-moyu/src/components/AuctionCanvas.tsx#L1-L75) | ResizeObserver 尺寸监听、鼠标悬停槽位映射与十字光标联动 |
| **双层柱状图与折线绘制核心** | [auctionDraw.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/auctionDraw.ts) | [L1-L295](file:///D:/Project/private/ai/ai-finance-moyu/src/components/auctionDraw.ts#L1-L295) | 09:15-09:20 双底色分区、09:20 分界线、底层撮合+顶层未匹配双层柱状图、价格曲线 |
| **坐标刻度与时间轴标签** | [auctionAxis.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/auctionAxis.ts) | [L27-L66](file:///D:/Project/private/ai/ai-finance-moyu/src/components/auctionAxis.ts#L27-L66) | 左右价格与百分比对称刻度绘制、底部 09:15 / 09:20(黄) / 09:25 时间轴标注 |
| **单元测试全量用例集** | [tests.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/tests.rs) | [L10-L225](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/auction_engine/tests.rs#L10-L225) | 覆盖时间解析、诱多、买单撤离、诱空、卖单撤离、抢筹、抛压、冷启动与尾盘竞价 |
