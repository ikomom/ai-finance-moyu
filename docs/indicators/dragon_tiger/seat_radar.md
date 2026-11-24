# 龙虎榜席位雷达与机构游资协同 (Seat Radar) 需求与算法规范

> 模块分类：`dragon_tiger`  
> 适用标的：`个股`（自动跳过指数标的）  
> 核心标签：`龙虎榜 | 席位雷达 | 游资协同 | 机构抱团 | 做T对倒 | 摸鱼看盘`  
> 对应代码实现：  
> - 后端数据拉取与席位字典：
>   - [seat_radar.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/seat_radar.rs#L14-L264)、[seat_client.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/seat_client.rs#L26-L238)、[client.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/client.rs#L39-L279)  
>   - [trader_dict.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/trader_dict.rs#L6-L143)、[types.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/types.rs#L6-L226)、[baseline.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/baseline.rs#L13-L352)  
>   - [commands/dragon_tiger.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/commands/dragon_tiger.rs#L14-L171)、[market_overview/concepts_db.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/market_overview/concepts_db.rs#L6-L197)  
> - 前端视图与交互组件：  
>   - [DragonTigerBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTigerBadge.tsx#L1-L57)、[DragonTigerBadge.css](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTigerBadge.css#L1-L37)  
>   - [DragonTigerDrawer.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTigerDrawer.tsx#L1-L201)、[DragonTigerDrawer.css](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTigerDrawer.css#L1-L120)  
>   - [LhbSummaryCard.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/LhbSummaryCard.tsx#L1-L136)、[SeatRow.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRow.tsx#L1-L99)  
>   - [SeatRadarView.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRadarView.tsx#L1-L244)、[SeatRadarView.css](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRadarView.css#L1-L394)  
>   - [SeatRadarCard.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRadarCard.tsx#L1-L57)、[SeatPoolBar.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatPoolBar.tsx#L1-L162)  
>   - [SeatDetailView.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatDetailView.tsx#L1-L149)、[SeatDetailView.css](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatDetailView.css#L1-L179)  
>   - [StockTrendView.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/StockTrendView.tsx#L1-L226)、[MarketDragonTigerTab.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/MarketDragonTigerTab.tsx#L1-L216)  
>   - [seatDict.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/seatDict.ts#L1-L281)、[utils.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/utils.ts#L1-L196)  
>   - [settings/seatEntities.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/settings/seatEntities.ts#L1-L146)、[settings/popularTraders.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/settings/popularTraders.ts#L1-L23)、[settings/SeatsTab.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/settings/SeatsTab.tsx#L1-L282)  
> 对应单元测试：  
> - 后端测试：[tests.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/tests.rs#L1-L141)  
> - 前端测试：[SeatRadar.test.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRadar.test.tsx#L1-L141)、[DragonTiger.test.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTiger.test.tsx#L1-L206)、[SeatTrendDrill.test.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatTrendDrill.test.tsx#L1-L143)、[seatEntities.test.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/settings/seatEntities.test.ts#L1-L72)、[SeatsTab.test.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/settings/SeatsTab.test.tsx#L1-L120)  

---

## 1. 业务定位与看盘指引

### 1.1 业务定义与核心意图
- **定义**：龙虎榜席位雷达与机构游资协同系统（Seat Radar）是针对 A 股交易日盘后交易所披露的异动营业部成交明细（俗称“龙虎榜”），结合顶级游资营业部马甲知识库、机构与北向专用席位分类识别算法、日内做T对倒撮合引擎及多席位协同度模型，构建的端到端主力资金透视与雷达监控指标系统。
- **看盘痛点与业务价值**：
  1. **游资马甲隐蔽与多营业部协同盲区**：一线游资团队通常分散于全国数十家营业部操盘（如章盟主涉足上海江苏路、长宁区江苏路、杭州延安路、上海毛家弄等；呼家楼重仓于北京东城分公司与北京呼家楼；六一路坐镇福州六一中路）。散户面对长达数十个汉字的券商营业部全称往往毫无概念，无法洞悉谁在主导标的行情。本系统通过毫秒级模式匹配与别名扩展，将冗长繁杂的营业部名称直观映射为“章盟主”、“呼家楼”、“六一路”、“方新侠”、“陈小群”等具象化游资标签。
  2. **主力资金属性分野（机构抱团 vs 游资击鼓传花）**：
     - **机构专用席位**（公募基金、社保基金、保险资管、养老金）：看重基本面趋势与流动性深度，持仓周期多为数周至数季度。机构大额净买入往往标志着中长期趋势行情的起点。
     - **游资席位**：深谙情绪周期与短线题材，偏好连板博弈、分歧转一致与龙头接力，买入后通常在次日开盘利用高溢价冲高兑现离场，击鼓传花特征明显。
     - **协同合力封板 vs 独食出货反噬**：当多家顶级游资（如“呼家楼 + 六一路”或“方新侠 + 章盟主”）同日现身买入前五且仓位均衡时，表明全市场超短合力极强，次日溢价预期高；若单一游资买入占比超过 50%（独食封板），其余多为散户大本营（拉萨天团），主力陷入孤岛接盘境地，极易引发次日对手盘抢跑砸盘与天地板风险。
  3. **日内做T对倒洗盘辨识**：单一交易日内同一席位同时登上买方前五与卖方前五，多为游资利用底仓进行日内高抛低吸、对倒拉抬或锁仓做T，普通软件将其拆分为两张静态表格，极易割裂交易者认知。本系统通过图算法贪心撮合买卖席位，直观呈现对倒价量与做T标签。
  4. **摸鱼桌面场景下的极低视觉成本**：上班族无需打开庞大的券商 F10，在迷你悬浮挂件中通过一个极简徽标（🐉 龙虎）及一键侧边抽屉，即可秒级获悉主力资金是抱团入局、做T对倒还是独食出逃。

### 1.2 关键信号解读与实操应对矩阵

| 资金博弈格局 | 核心席位特征 | 典型形态与数据表象 | 微观博弈本质 | 实操应对指引 |
| :--- | :--- | :--- | :--- | :--- |
| **机构多席位抱团入局**<br>`InstCluster` | 买方前五出现 \(\ge 2\) 家「机构专用」，且机构净买入 \(> 1\) 亿元，卖方无大额机构砸盘 | 大市值标的（如中科曙光、工业富联）放量突破，买方前五合计净买入占比大 | 机构资金基于行业基本面拐点建仓，容纳大资金持续推升趋势，非一日游游资行情 | **中线波段顺势持股**。开盘若有小幅低开或回踩均线为良性加仓点，不宜轻易被短线洗盘震出。 |
| **知名游资协同合力**<br>`FamousSynergy` | 买方前五命中 \(\ge 2\) 家顶级游资（如呼家楼+六一路），且无单一席位独食 | 核心题材龙头标的分歧转一致涨停，买方前五金额均衡分布（CR1 \(< 40\%\)） | 市场核心主流游资达成超短逻辑共识，资金锁仓意愿极高，次日接力意愿强烈 | **超短看多/享高溢价**。次日早盘集合竞价多有高开抢筹，持筹者可持股待涨或在急冲高位分批兑现。 |
| **单一知名游资恶劣独食**<br>`MonopolyRisk` | 买一为顶级游资且买入占比 \(> 50\%\)，买二至买五均为普通席位或拉萨天团 | 涨停板封单不坚决，盘中有多次炸板回封，买方力量严重断层 | 该游资被动接盘封板或强行大单推土机买入，次日缺乏同量级对手盘接力，极易自相残杀抢跑出货 | **警惕次日核按钮砸盘**。开盘若未见高开抢筹或急速跌破均线，应果断止盈/止损离场，切忌盲目追高。 |
| **主力日内对倒做T**<br>`IntradayT0` | 同一知名席位或同名机构在买卖双方前五同时上榜，且买入与卖出金额均超千万元 | 标的日内振幅巨大（振幅 \(\ge 10\%\) 或剧烈洗盘换手），换手率显著放大 | 席位利用底仓进行盘中急跌低吸、脉冲高抛对冲风险，摊低持仓成本并洗刷浮筹 | **中性防守，观察筹码净额**。若席位最终大幅净买入则为借震荡加仓；若大幅净卖出则为借反弹掩护撤退。 |
| **散户大本营高潮接盘**<br>`RetailTop` | 买方前五被「东财拉萨团结路/东环路」占据 3 席以上，知名游资与机构现身卖方前五 | 标的位于高位连续连板后爆出历史天量，盘口换手极度活跃 | 机构与游资大举兑现利润，散户通过手机端高频跟风接盘，筹码由集中走向极度分散 | **坚决离场/规避退潮风险**。筹码结构彻底崩塌，次日极易遭遇一字跌停或持续阴跌。 |
| **机构主力决绝出逃**<br>`InstDumping` | 卖方前五出现多席位「机构专用」，机构合计净卖出 \(> 1\) 亿元，买方全为散户或游资 | 标的跌破关键均线或放量长阴，盘中反弹无力 | 机构调仓换股或遭遇基本面暴雷/业绩不及预期，大单不计成本砸盘变现 | **严禁左侧抄底**。机构出货具有延续性与坚决性，通常需要较长时间消化抛压。 |

### 1.3 UI 呈现与防窥规范
- **宿主组件体系与层级流转**：
  ```
  个股行情卡片 (StockCard)
  └── [DragonTigerBadge.tsx] (🐉 龙虎 独立微标，仅近 4 日有榜显现)
        └── 点击弹出 ──> [DragonTigerDrawer.tsx] (铺满全屏/半屏侧边抽屉)
                           ├── [LhbSummaryCard.tsx] (顶部总买/总卖/净额/多空对决比例条)
                           ├── [SeatRow.tsx] (买方前5与卖方前5席位行、做T联动高亮)
                           └── 点击席位 ──> [SeatDetailView.tsx] (该席位同日联动与历史战绩)
                                              └── 点击标的 ──> [StockTrendView.tsx] (当日分时图下钻 + 一键加自选)
  
  大盘全景面板 (MarketOverview)
  └── [MarketDragonTigerTab.tsx] (二级 Tab: 🔥 游资动向 vs 🎯 席位雷达)
        ├── [SeatRadarView.tsx] (席位雷达矩阵，多席位并发筛选与日期对齐)
        ├── [SeatPoolBar.tsx] (关注席位池胶囊标签、智能拼音模糊联想搜索)
        └── [SeatRadarCard.tsx] (命中标的卡片：股票代码、收盘价、涨跌幅、席位动向与买卖金额)
  ```
- **视觉排版与全主题自适应规范**：
  - **红绿高对比度保障**：遵循 AGENTS.md §15 红线，买入指示与多头柱状图采用正红（暗色 `#ef4444` / 浅色 `#dc2626`），卖出指示与空头柱状图采用深翡翠绿（暗色 `#22c55e` / 浅色 `#16a34a`），游资标签与重要预警采用琥珀金（暗色 `#fbbf24` / 浅色 `#b45309`）。
  - **消除视觉孤岛与变量绑定**：全量视图绑定 CSS 语义变量（如 `var(--surface-card-bg)`, `var(--surface-border-subtle)`, `var(--text-primary)`, `var(--text-muted)`），禁止使用 `#111` 或 `#fff` 静态颜色。
  - **多空对决比例条（Energy Bar）**：
    - 上方 3px 极简双色条：买方权重占据左侧（正红半透填充），卖方权重占据右侧（翡翠绿半透填充），中间实时展现百分比数值（如 `买方 62%` / `卖方 38%`）。
    - 席位行相对比例背景条（`.lhb-seat-bar-bg`）：席位行背景根据该席位占前五席位最大成交额的百分比进行绝对填充，买方席位从右向左延伸淡红微光，卖方席位延伸淡绿微光，直观呈现量能断层。
  - **营业部名称极简防窥清洗**：在 `cleanBranchName` 中剥除“股份有限公司”、“证券营业部”、“中国”等冗余字样，将东方财富证券压缩为“东财”，最大化保留“城市名+路名”，满足桌面迷你紧凑排版需求。
  - **键盘防窥与交互退出链**：支持 `Esc` 键逐级返回。在分时走势图按 Esc 返回席位战绩；在席位战绩按 Esc 返回龙虎榜明细；在龙虎榜明细按 Esc 直接关闭抽屉，确保防窥避险瞬时收起。

---

## 2. 数学公式与算法细节

### 2.1 依赖基础数据与字段字典
算法输入数据由东方财富数据中心 OpenAPI 与全市场实时行情快照聚合而成：
- **上游原始龙虎榜数据项**（东财 `RPT_BILLBOARD_DAILYDETAILSBUY` / `SELL`）：
  - `SECURITY_CODE`: 标的 6 位数字代码（如 `603019`）；
  - `SECURITY_NAME_ABBR`: 标的中文简称（如 `中科曙光`）；
  - `TRADE_DATE`: 交易披露日期字符串（格式 `YYYY-MM-DD`）；
  - `OPERATEDEPT_NAME`: 券商营业部官方完整法定名称；
  - `BUY`: 席位买入金额（单位：元，浮点数）；
  - `SELL`: 席位卖出金额（单位：元，浮点数）；
  - `NET`: 席位买卖净差额（单位：元，若字段缺失则为 \(BUY - SELL\)）；
  - `CLOSE_PRICE`: 标的当日收盘价；
  - `CHANGE_RATE`: 标的当日收盘涨跌幅（单位：%，如 `10.0`）；
  - `EXPLANATION`: 交易所异动上榜官方说明文字（如 `非S证券连续三个交易日内收盘价格涨幅偏离值累计达到20%的证券`）。
- **标的实时行情切片**（腾讯行情 `qt.gtimg.cn`）：
  - \(Amount_{\text{total}}\): 标的当日全市场累计成交金额（元）；
  - \(Close\): 标的最新价格；
  - \(Name\): 标的最新官方股票名称。

### 2.2 核心数学公式与递推逻辑

#### 1. 席位买卖净额与买卖方前五汇总
对于标的 \(S\) 在交易日 \(T\) 的买方席位集合 \(\mathcal{B} = \{b_1, b_2, \dots, b_{N_B}\}\)（\(N_B \le 5\)）和卖方席位集合 \(\mathcal{S} = \{s_1, s_2, \dots, s_{N_S}\}\)（\(N_S \le 5\)）：
- 单席位净买入额：
  \[
  Net_i = Buy_i - Sell_i
  \]
- 买方前五总买入额：
  \[
  TotalBuy = \sum_{i=1}^{N_B} Buy_i
  \]
- 卖方前五总卖出额：
  \[
  TotalSell = \sum_{j=1}^{N_S} Sell_j
  \]
- 龙虎榜买卖多空净额：
  \[
  NetTotal = TotalBuy - TotalSell
  \]

#### 2. 机构与北向专用资金测算
定义指示函数 \(\mathbb{I}_{\text{inst}}(\text{branch})\) 与 \(\mathbb{I}_{\text{north}}(\text{branch})\)：
\[
\mathbb{I}_{\text{inst}}(\text{branch}) = \begin{cases} 1, & \text{"机构专用"} \in \text{branch} \\ 0, & \text{otherwise} \end{cases}
\]
\[
\mathbb{I}_{\text{north}}(\text{branch}) = \begin{cases} 1, & \text{"深股通"} \in \text{branch} \lor \text{"沪股通"} \in \text{branch} \lor \text{"香港上海汇丰"} \in \text{branch} \\ 0, & \text{otherwise} \end{cases}
\]
- 机构总买入、总卖出与机构多空净额：
  \[
  InstBuy = \sum_{i=1}^{N_B} Buy_i \cdot \mathbb{I}_{\text{inst}}(b_i.\text{branch}), \quad InstSell = \sum_{j=1}^{N_S} Sell_j \cdot \mathbb{I}_{\text{inst}}(s_j.\text{branch})
  \]
  \[
  InstNet = InstBuy - InstSell
  \]
- 北向总买入、总卖出与北向多空净额：
  \[
  NorthBuy = \sum_{i=1}^{N_B} Buy_i \cdot \mathbb{I}_{\text{north}}(b_i.\text{branch}), \quad NorthSell = \sum_{j=1}^{N_S} Sell_j \cdot \mathbb{I}_{\text{north}}(s_j.\text{branch})
  \]
  \[
  NorthNet = NorthBuy - NorthSell
  \]

#### 3. 多空对抗能量比（Duel Energy Ratio）
用于在 `LhbSummaryCard` 顶部双色对决条中直观渲染买卖盘博弈比重：
\[
BuyRatio = \begin{cases} \frac{TotalBuy}{TotalBuy + TotalSell} \times 100\%, & TotalBuy + TotalSell > 0 \\ 50.0\%, & TotalBuy + TotalSell = 0 \end{cases}
\]
\[
SellRatio = \begin{cases} \frac{TotalSell}{TotalBuy + TotalSell} \times 100\%, & TotalBuy + TotalSell > 0 \\ 50.0\%, & TotalBuy + TotalSell = 0 \end{cases}
\]
两端严格满足 \(BuyRatio + SellRatio = 100.0\%\)。

#### 4. 席位买入集中度评估与独食度量（Concentration & Monopoly Index）
- **买方前五占全天成交总额比重（市场集中度）**：
  \[
  CR_{5,\text{mkt}} = \frac{TotalBuy}{Amount_{\text{total}}} \times 100\%
  \]
  若 \(CR_{5,\text{mkt}} \ge 20\%\)，表明主力资金控盘程度极高，行情受榜单前五席位主导。
- **买方前五内部赫芬达尔集中度指数（HHI）**：
  \[
  \text{HHI}_{\text{buyers}} = \sum_{i=1}^{N_B} \left( \frac{Buy_i}{TotalBuy} \right)^2 \quad (\text{HHI} \in (0, 1])
  \]
- **席位最大买入单一占比（独食度 \(MR\)）**：
  \[
  MR = \frac{\max_{i} (Buy_i)}{TotalBuy} \times 100\%
  \]
  - **恶劣独食预警条件**：
    \[
    MR \ge 50.0\% \quad \text{且} \quad Buy_{\text{rank1}} \ge 3.0 \times Buy_{\text{rank2}}
    \]
    命中时，标记为【单一主力独食】，警示次日开盘流动性反噬与对手砸盘风险。
  - **良性合力分布条件**：
    \[
    MR \le 35.0\% \quad \text{且} \quad N_B \ge 4 \quad \text{且} \quad \text{HHI}_{\text{buyers}} \le 0.30
    \]
    各主力席位仓位分散均衡，锁仓互保意愿强。

#### 5. 游资协同指数模型（Synergy Index \(S_{\text{syn}}\)）
衡量当日龙虎榜买方中顶级游资的抱团与合力强度：
设 \(N_{\text{trader}} = \sum_{i=1}^{N_B} \mathbb{I}_{\text{trader}}(b_i.\text{label})\)，其中 \(\mathbb{I}_{\text{trader}}\) 在命中方新侠、章盟主、呼家楼、六一路等知名游资时为 1：
\[
S_{\text{syn}} = 40 \times \frac{\min(N_{\text{trader}}, 3)}{3} + 35 \times \min\left(1.0, \frac{\log_{10}\left(\max\left(1.0, \frac{\sum_{t \in \text{trader}} Buy_t}{10^7}\right)\right)}{2.5}\right) + 25 \times (1.0 - \text{HHI}_{\text{buyers}})
\]
- 若 \(N_{\text{trader}} \ge 2\) 且 \(S_{\text{syn}} \ge 60\)：系统打上【知名游资协同合力】标签，预示次日高溢价接力概率大幅提升。

---

### 2.3 算法细节：做T对倒匹配与同名机构消除算法 (`analyzeSeatPairs`)
在 `src/components/dragon_tiger/utils.ts` 中，`analyzeSeatPairs` 函数实现了买卖席位图对倒匹配：
```typescript
analyzeSeatPairs(buyers, sellers)
│
├── 1. 初始化 Meta 结构体:
│      buyerMetas:   [{ displayName, isT: false, netAmount }]
│      sellerMetas:  [{ displayName, isT: false, netAmount }]
│      matchedSellerIndices = Set<number>()
│
├── 2. 第一阶段：具名营业部与外资对倒撮合 (非“机构专用”)
│      FOR EACH (b, bIdx) IN buyers:
│          IF b.branch_name == "机构专用" THEN CONTINUE
│          sIdx = sellers.findIndex(s => !matchedSellerIndices.has(idx) && s.branch_name == b.branch_name)
│          IF sIdx >= 0 THEN:
│              matchedSellerIndices.add(sIdx)
│              pairId = "pair_" + b.branch_name
│              设置 buyerMetas[bIdx] 与 sellerMetas[sIdx]: isT = true, pairId
│
└── 3. 第二阶段：匿名同名“机构专用”贪心配对
       instPairCounter = 0
       FOR EACH (b, bIdx) IN buyers:
           IF b.branch_name != "机构专用" OR buyerMetas[bIdx].isT THEN CONTINUE
           sIdx = sellers.findIndex(s => !matchedSellerIndices.has(idx) 
                                         AND s.branch_name == "机构专用" 
                                         AND |s.net_amount - b.net_amount| < 500)
           IF sIdx >= 0 THEN:
               matchedSellerIndices.add(sIdx)
               instPairCounter++
               numLabel = CIRCLE_NUMS[instPairCounter] // '①', '②', '③'...
               displayName = "机构专用 " + numLabel
               pairId = "pair_inst_" + instPairCounter
               设置 buyerMetas[bIdx] 与 sellerMetas[sIdx]: displayName, isT = true, pairId
```
- **算法业务价值**：彻底消除龙虎榜多个匿名“机构专用”混淆的问题，将日内买卖对倒做T的机构精准配对，并在前端赋予带圈序号（如 `机构专用 ①`），鼠标悬停任一方席位时，通过 `hoveredPairId` 联动高亮另一方的对倒席位与买卖价量。

---

### 2.4 算法细节：游资别名与席位模糊匹配模型 (`seatDict.ts` & `trader_dict.rs`)

#### 1. 席位标签判定三级递进管道 (`resolveSeatLabel`)
```
输入营业部全称 cleanName
│
├── [级别 1: 用户自定义席位规则 CustomSeatMapping] (最高优先级)
│   遍历 cachedCustomSeats (enabled == true):
│   IF cleanName 包含 keyword OR keyword 包含 cleanName THEN:
│       RETURN { label: item.label, category: item.category }
│
├── [级别 2: 后端分析结果 trader_label] (次优先级)
│   IF backendLabel 非空 THEN:
│       cat = ("机构专用" ? 'institution' : "北向外资" ? 'north' : 'trader')
│       RETURN { label: backendLabel, category: cat }
│
└── [级别 3: 本地内置著名游资字典 FAMOUS_BRANCH_LIST] (保底兜底)
    遍历字典条目 item:
    IF cleanName 与 item.branchName 互为子串 OR 命中长度>=4的特定关键词 THEN:
        RETURN { label: item.traderLabel, category: item.category }
```

#### 2. 核心游资字典与代表性席位映射矩阵 (`FAMOUS_BRANCH_LIST` / `trader_dict.rs`)

| 游资/主力代表标签 | 官方代表营业部全称或核心关键字 | 拼音检索简称 | 席位分类 (`Category`) | 市场风格与打板特征 |
| :--- | :--- | :--- | :--- | :--- |
| **方新侠** | 中信证券股份有限公司西安朱雀大街证券营业部 | `fxx`, `朱雀大街` | `trader` | 大资金趋势与容量题材主封，偏好百亿成交大盘中军，锁仓格局大。 |
| **章盟主** | 国泰君安证券上海江苏路、国泰海通长宁区江苏路、杭州延安路、海通上海毛家弄 | `zmz`, `江苏路` | `trader` | 江浙资深元老游资，百亿资金体量，善于大资金合力点火与板块中军助攻。 |
| **呼家楼** | 中信建投证券北京东城分公司、中信证券北京呼家楼证券营业部 | `hjl`, `东城分公司` | `trader` | 北方顶级新锐主力，资金实力极其雄厚，擅长高位连板重仓点火与引导大成交龙头。 |
| **六一路** | 招商证券福州六一中路、华泰证券福州六一中路 | `lyl`, `六一路` | `trader` | 情绪周期波段顶尖游资，主打顺周期分歧转一致龙头连板，号召力极强。 |
| **96余哥** | 东吴证券苏州石路证券营业部、东吴证券苏州相城大道证券营业部 | `yg`, `苏州石路` | `trader` | 90后顶尖短线游资，手法凌厉，专注短线情绪爆发与首板/二板爆量卡位。 |
| **小方神** | 东莞证券股份有限公司南京分公司 | `xfs`, `东莞南京` | `trader` | 活跃短线题材游资，专注题材接力与高换手板。 |
| **92科比** | 华鑫证券上海徐汇区瑞平路证券营业部 | `92kb`, `瑞平路` | `trader` | 情绪周期与弱转强接力代表游资，擅长微盘与小市值题材四两拨千斤。 |
| **陈小群** | 银泰证券大连黄河路、中国银河证券大连黄河路证券营业部 | `cxq`, `黄河路` | `trader` | 东北顶级短线游资，主攻超级大题材大主线核心总龙头，主升浪锁仓波段持股。 |
| **赵老哥** | 中国银河证券绍兴、浙商证券绍兴解放南路证券营业部 | `zlg`, `八年一万倍` | `trader` | “八年一万倍”传奇游资，擅长二板定龙头，快速进出与超短极速切换。 |
| **作手新一** | 国泰君安证券股份有限公司南京太平南路证券营业部 | `zsxy`, `太平南路` | `trader` | 新生代顶尖游资，专注核心热点题材接力与龙头首阴反包反抽。 |
| **炒股养家** | 华鑫证券上海宛平南路、华鑫证券上海茅台路、华鑫宁波大庆南路 | `cgyj`, `宛平南路` | `trader` | “养家心法”创始人，擅长利用资金优势构建通道排单买入，题材情绪领袖。 |
| **东北猛男** | 安信证券股份有限公司厦门湖西路证券营业部 | `dbmn`, `湖西路` | `trader` | 短线手法极其凶悍，主攻日内急速点火打板与超跌反弹。 |
| **上塘路** | 财通证券股份有限公司杭州上塘路证券营业部 | `stl`, `上塘路` | `trader` | 短线砸盘王之一，擅长首板独食引导，次日早盘高开急冲决绝砸盘兑现。 |
| **孙哥** | 中信证券股份有限公司上海溧阳路证券营业部 | `sg`, `溧阳路` | `trader` | 老牌游资巨头，资金规模巨大，常出没于全市场焦点连板龙虎榜。 |
| **桑田路** | 国盛证券有限责任公司宁波桑田路证券营业部 | `stl`, `桑田路` | `trader` | 活跃度极高的高频打板游资，多点开花。 |
| **益田路** | 华鑫证券有限责任公司深圳益田路证券营业部 | `ytl`, `益田路` | `trader` | 华南活跃短线席位，参与题材广泛。 |
| **量化打板** | 华泰证券总部、中金公司上海分公司、中金北京建国门外大街 | `lhdb`, `中金上海` | `quant` | 主机托管高频量化程序化交易，主打算法拆单打板、隔夜冲高抛售与折价套利。 |
| **机构专用** | 机构专用 | `jgzy`, `机构` | `institution` | 公募基金、社保基金、保险、券商自营等专业机构投资者。 |
| **北向外资** | 深股通专用、沪股通专用、香港上海汇丰银行 | `sgt`, `hgt`, `外资` | `north` | 香港中央结算有限公司（陆股通资金），代表海外机构与跨境外资。 |
| **拉萨天团** | 东财拉萨团结路第一/第二、东财拉萨东环路第一/第二证券营业部 | `lstt`, `拉萨` | `retail` | 东方财富散户网络开户集中地，高换手高频散户资金大本营。 |

#### 3. 营业部名称与异动原因正则清洗规则 (`utils.ts`)
- **营业部名称清洗 (`cleanBranchName`)**：
  ```typescript
  name
    .replace(/^中国/, '')
    .replace(/股份有限公司|有限责任公司/g, '')
    .replace(/证券营业部|营业部/g, '')
    .replace(/^东方财富证券/, '东财')
    .replace(/证券(分公司|路|街|桥|道|门|支)/g, '$1')
    .trim()
  ```
  *清洗范例*：`东方财富证券股份有限公司拉萨东环路第二证券营业部` \(\to\) `东财拉萨东环路第二`；`中信证券股份有限公司西安朱雀大街证券营业部` \(\to\) `中信西安朱雀大街`。
- **披露原因精简清洗 (`shortenLhbReason`)**：
  将交易所长达数十字的官方公文用语提炼为 10 字以内通俗看盘术语：
  - `连续三个交易日内收盘价格涨幅偏离值累计达到20%` \(\to\) `3日涨幅偏离达20%`
  - `日收盘价涨幅偏离值达到7%的前5只证券` \(\to\) `日涨幅偏离达7%`
  - `日换手率达到20%的前5只证券` \(\to\) `日换手率达20%`
  - `日振幅值达到15%的前5只证券` \(\to\) `日振幅达15%`
  - `无价格涨跌幅限制的证券` \(\to\) `无涨跌幅限制`
  - 若超出 18 个字符则截断为前 16 字符并追加 `…`。

---

### 2.5 边界情况与冷启动处理
1. **未披露龙虎榜标的优雅空态**：
   - 绝大多数 A 股日常波动未触及交易所披露门槛（涨跌偏离 \(< 7\%\) 且换手率 \(< 20\%\)）。系统返回 `StockDetailInfo { code, dragon_tiger: None }`，前端 `DragonTigerBadge` 不予渲染；抽屉内展示极简说明卡片「该标的近期未披露龙虎榜席位数据（多为正常市场波动，未触及交易所异动披露条件）」，杜绝报错与假死。
2. **历史龙虎榜过期防误导机制 (`getDaysDiff`)**：
   - 计算上榜日期与当前日期差值：若 \(Diff_{\text{days}} > 5\) 天，徽标由普通绿色切换为醒目橙色 `⚠️ 历史复盘 YYYY-MM-DD`，并在 Tooltip 中明确标示「距今已超 N 天，仅供历史操盘痕迹复盘，防范误将历史数据当作当下主力资金」。
3. **周末与节假日日期自然对齐 (`alignToTradeDay`)**：
   - 用户在周六或周日查询席位雷达时，`alignToTradeDay` 自动对齐至最近的周五（周日回退 2 天，周六回退 1 天），规避因节假日非交易日导致的空数据查询。
4. **除零与极值防御**：
   - 当买卖双方总额为 0 时，多空能量比例固定锁定为 50%/50%；
   - 席位行相对比例条计算中，若最大买卖金额 \(MaxAmt \le 0\)，比例宽度锁定为 0%，杜绝 `NaN%` 样式崩溃。

---

## 3. 数据契约与时段规则

### 3.1 上游数据链路与前后端职责边界
- **网络数据通道与东财端点**：
  - 全量每日榜单：`https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILS`
  - 营业部买入详情：`https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_BILLBOARD_DAILYDETAILSBUY`
  - 营业部卖出详情：`https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_BILLBOARD_DAILYDETAILSSELL`
- **高性能全市场买卖双榜批量并发拉取优化**：
  - 在 `src-tauri/src/dragon_tiger/seat_radar.rs` 的 `do_fetch_radar` 中，后端使用 `tokio::join!` 一次网络往返同时并发抓取买方全量榜单（`RPT_BILLBOARD_DAILYDETAILSBUY`，300条）与卖方全量榜单（`RPT_BILLBOARD_DAILYDETAILSSELL`，300条）。
  - 在内存中以纳秒级速度对关注席位模式展开项（`all_patterns`）进行模式匹配与去重，仅在冷门历史日期无法全量覆盖时，才回退单营业部串行抓取。
- **无名称标的腾讯 CDN 极速补全**：
  - 东财部分席位接口仅暴露股票数字代码，后端自动提取缺少名称的代码集合，调用腾讯证券 CDN（`qt.gtimg.cn`）批量单请求解码 GB18030，高并发补全股票简称。
- **前后端架构职责边界**：
  - **Rust 后端**（唯一数据核心）：承载 `.no_proxy()` 原生请求构造、单日内存缓存、模式展开、腾讯名称补全、Win32 磁盘持久化（`config.json` 的 `custom_seats` 字段）。
  - **SolidJS 前端**（轻量呈现）：仅接收强类型 JSON 结果，管理关注席位池状态、驱动抽屉式下钻、执行 `LocalStorage` 快速首屏渲染。

### 3.2 A 股交易时段与龙虎榜时效门禁矩阵

| 时段区间 | 业务阶段 | 龙虎榜数据状态 | 前端微标与标题文案 | 界面看盘指引 |
| :--- | :--- | :--- | :--- | :--- |
| **09:15 - 15:00** | 连续交易时段 | 当日尚未收盘，交易所不披露当日榜单 | 提示「盘中竞价 · 数据为上一个交易日盘后披露」<br>徽标 `参考日 T-1` | 界面展示 **T-1 交易日** 历史龙虎榜，作为今日盘前多空参考，绝不误传为今日盘中实时买卖。 |
| **15:00 - 16:30** | 盘后清算阶段 | 各营业部正向交易所报送成交清算数据 | 提示「盘后结算 · 龙虎榜清算中」<br>徽标 `清算中` | 静默等待交易所官方公布，提示用户稍后刷新。 |
| **16:30 - 17:30** | **官方密集披露期** | 沪深北交易所陆续发布当日龙虎榜明细 | 提示「盘后结算 · 今日龙虎榜披露中 (通常16:30~17:30)」<br>徽标 `披露中` | **盘后复盘核心窗口**。各营业部榜单逐只公布，席位雷达与大盘龙虎榜数据动态丰富。 |
| **17:30 - 次日 09:15** | 盘后复盘与夜间沉淀 | 当日全市场龙虎榜已全部披露完毕 | 提示「交易所盘后官方公开披露数据」<br>徽标 `披露日 YYYY-MM-DD` | 静态复盘主力动向、席位协同合力与机构建仓个股，制定次日早盘交易策略。 |
| **距今 > 5 天** | 历史冷门沉淀 | 标的近期无异动，仅保留历史榜单 | 提示「⚠️ 历史复盘」<br>徽标 `历史复盘 YYYY-MM-DD` | 明确标识为历史数据，防范误导。 |

### 3.3 离线保底与平滑降级规范 (遵循 AGENTS.md §2 & §14)
- **单日内存缓存（Daily Memory Cache）**：
  - 后端对全市场概览 `market_cache`、个股详情 `stock_cache`、席位详情 `seat_cache` 与雷达筛选 `radar_cache` 均采用 `today` 日期为 Key 进行内存缓存。跨日自动失效重置。
- **断网与网络故障零崩溃平滑保底（Baseline Fallback Cache）**：
  - 当远端接口报 404/500/网络超时或遭遇东财反爬阻断时，系统立即平滑回退至 `src-tauri/src/dragon_tiger/baseline.rs`：
    - `get_market_baseline()`: 返回中科曙光、工业富联、浪潮信息等 5 只大额机构净买标的及方新侠、呼家楼等知名游资动向；
    - `get_stock_baseline()`: 返回包含买卖前五、做T对倒席位的真实特征数据；
    - `get_seat_radar_baseline()`: 返回与查询营业部匹配的基准历史切片。
  - 严禁出现崩溃、白屏或全 0 异常，确保新用户拉取源码或离线状态下开箱即用。

---

## 4. 告警阈值与防扰规范

### 4.1 触发判定规则汇总

| 告警/异动类型 | 判定数学条件 | 界面微标与标签 | 审计日志 Target | 业务严重级 |
| :--- | :--- | :--- | :--- | :--- |
| **顶级游资协同合力** | 买方前五命中顶级游资数 \(N_{\text{trader}} \ge 2\) 且协同指数 \(S_{\text{syn}} \ge 60\) | `🔥 游资协同合力` (琥珀金) | `ALERT` | 中度预警（高溢价机会） |
| **机构主力重仓突击** | 机构净买入额 \(InstNet \ge 1.0 \times 10^8\) 元（超 1 亿元） | `🏆 机构重仓净买` (正红) | `ALERT` | 高度关注（趋势中军起航） |
| **单一游资巨额扫盘** | 单一知名游资净买入额 \(Net_i \ge 1.0 \times 10^8\) 元 | `⚡ 知名游资扫盘` (正红) | `ALERT` | 中度预警（主攻游资现身） |
| **席位日内对倒做T** | 同一具名营业部或机构买卖金额均 \(\ge 1000\) 万元且同时上榜 | `做T ⇄` (带圈序号) | `ALERT` | 提示性（洗盘与分歧） |
| **单一主力恶劣独食** | 买一买入占比 \(MR \ge 50.0\%\) 且 \(Buy_{\text{rank1}} \ge 3 \times Buy_{\text{rank2}}\) | `⚠️ 独食接盘风险` (警示黄) | `ALERT` | 高度风险（次日防砸盘） |

### 4.2 节流防轰炸与日志留痕规范 (遵循 AGENTS.md §3 & §7)
- **桌面通知绝对免打扰红线**：
  - 龙虎榜数据属于盘后低频披露性质，**默认绝对禁止向操作系统推送任何桌面级通知弹窗（Desktop Notification / Toast）**。所有的异动与协同特征仅在挂件微标、抽屉侧边栏及卡片内部呈现。
- **高价值分级审计日志留痕规范**：
  - 日志严格使用标准 `log` Facade，Target 统一归口为 `ALERT` 与 `USER`：
    - **雷达命中留痕**（`ALERT`）：
      ```rust
      log::info!(
          target: "ALERT",
          "【席位雷达】筛选完成: 披露日 {}, 监控 {} 个主力席位, 命中标的 {} 只",
          final_date, branches.len(), filtered.len()
      );
      ```
    - **个股查阅留痕与 10 秒节流**：
      为防止用户频繁快速切换自选股导致日志刷屏，在 `commands/dragon_tiger.rs` 中设计了内存时间戳锁 `LAST_LOGGED_STOCKS`，对同一标的设置 **10 秒静默冷却期**，冷却期内仅返回数据，不再重复输出 `ALERT` 留痕：
      ```rust
      log::info!(
          target: "ALERT",
          "【龙虎榜明细】查阅 {}({}) 披露日: {}, 机构净买: {:+.2}万, 龙虎净额: {:+.2}万, 现身资金: [{}]",
          dt.name, dt.code, dt.trade_date, dt.institution_net / 10000.0, dt.net_total / 10000.0, famous_str
      );
      ```
    - **席位战绩下钻留痕**（`ALERT`）：
      ```rust
      log::info!(
          target: "ALERT",
          "【席位操盘】下钻查看 [{}] ({}), 同日上榜: {} 只标的, 历史沉淀: {} 笔记录",
          label, branch_name, detail.same_day_operations.len(), detail.historical_operations.len()
      );
      ```
  - 日志持久化保存于 `%APPDATA%/.../logs/app.log`，单文件上限 5MB 轮转 3 份，并同步推入 200 条内存环形缓冲区供前端「运行日志」面板筛选。

---

## 5. 验收基准与测试对齐

### 5.1 黄金测试用例 (Golden Fixture Matrix)

以下用例完全对齐后端 `tests.rs` 及前端 `SeatRadar.test.tsx`、`DragonTiger.test.tsx`、`SeatTrendDrill.test.tsx`：

#### 用例 1：游资席位别名解析与模糊匹配测试
- **输入序列**：
  1. `branch_1` = `"机构专用"`
  2. `branch_2` = `"深股通专用"`
  3. `branch_3` = `"中信证券股份有限公司西安朱雀大街证券营业部"`
  4. `branch_4` = `"国泰君安证券股份有限公司上海江苏路证券营业部"`
  5. `branch_5` = `"中信证券股份有限公司北京呼家楼证券营业部"`
  6. `branch_6` = `"招商证券股份有限公司福州六一中路证券营业部"`
  7. `branch_7` = `"国泰海通证券长宁区江苏路"`
  8. `branch_8` = `"东吴证券股份有限公司苏州石路证券营业部"`
  9. `branch_9` = `"东莞证券股份有限公司南京分公司"`
  10. `branch_10` = `"华鑫证券上海徐汇区瑞平路"`
  11. `branch_11` = `"普通无名营业部"`
- **预期确定性输出**：
  - `match_famous_trader(branch_1)` = `Some("机构专用")`
  - `match_famous_trader(branch_2)` = `Some("北向外资")`
  - `match_famous_trader(branch_3)` = `Some("方新侠")`
  - `match_famous_trader(branch_4)` = `Some("章盟主")`
  - `match_famous_trader(branch_5)` = `Some("呼家楼")`
  - `match_famous_trader(branch_6)` = `Some("六一路")`
  - `match_famous_trader(branch_7)` = `Some("章盟主")`
  - `match_famous_trader(branch_8)` = `Some("96余哥")`
  - `match_famous_trader(branch_9)` = `Some("小方神")`
  - `match_famous_trader(branch_10)` = `Some("92科比")`
  - `match_famous_trader(branch_11)` = `None`
- **对应测试断言**：`src-tauri/src/dragon_tiger/tests.rs#L6-L55`

#### 用例 2：多空对决比率条与前五能量计算
- **标的信息**：九阳股份（`sz002242`），披露日 `2026-11-19`，异动原因 `日振幅达15%`
- **输入席位数据**：
  - 买方席位：
    - 买一：`深股通专用`（北向外资），买入 250,000,000 元，卖出 103,500,000 元，净额 +146,500,000 元
  - 卖方席位：
    - 卖一：`东吴证券苏州石路`（96余哥），买入 351,600 元，卖出 263,800,000 元，净额 -263,448,400 元
- **预期计算输出**：
  - `TotalBuy` = 250,000,000 元（渲染 `2.50亿`）
  - `TotalSell` = 263,800,000 元（渲染 `2.64亿`）
  - `NetTotal` = -13,800,000 元（净额为负，CSS 类 `net-down`）
  - `BuyRatio` = \(\frac{250,000,000}{250,000,000 + 263,800,000} \times 100\% \approx 48.66\%\)（渲染 `买方 49%`）
  - `SellRatio` = \(\frac{263,800,000}{250,000,000 + 263,800,000} \times 100\% \approx 51.34\%\)（渲染 `卖方 51%`）
- **对应测试断言**：`src/components/dragon_tiger/DragonTiger.test.tsx#L162-L205`

#### 用例 3：做T对倒席位配对与同名机构专用编号撮合
- **输入席位集合**：
  - 买方：`机构专用`（买入 10,000,000 元，净买入 10,000,000 元）
  - 卖方：`机构专用`（卖出 10,000,200 元，净卖出 -10,000,200 元）
  - 差额：\(|10,000,200 - 10,000,000| = 200 < 500\) 元
- **预期输出**：
  - 成功配对，`isT` = `true`
  - `displayName` = `"机构专用 ①"`
  - `pairId` = `"pair_inst_1"`
  - Tooltip 显示 `"⇄ 买卖对倒做T：买入 1000万 | 卖出 1000万 | 席位净额 -200"`
- **对应测试断言**：`src/components/dragon_tiger/utils.ts#L156-L194`

#### 用例 4：席位雷达全市场多路并发筛选与买卖方向过滤
- **指定日期**：`2026-11-02`
- **关注池席位**：`["六一路", "呼家楼", "章盟主", "机构专用"]`
- **雷达并发抓取返回项**：
  1. `sh603019`（中科曙光）：`北京东城分公司`（呼家楼），买入 95,000,000 元，`is_buy = true`
  2. `sz002049`（紫光国微）：`上海江苏路`（章盟主），卖出 65,000,000 元，`is_buy = false`
- **预期过滤与渲染**：
  - 方向切为 `全部`：渲染 2 张卡片，卡片 1 包含“中科曙光”、“呼家楼”、“买入 +9500万”；卡片 2 包含“紫光国微”、“章盟主”、“卖出 -6500万”；
  - 方向切为 `买入`：仅渲染 1 张卡片（中科曙光）；
  - 方向切为 `卖出`：仅渲染 1 张卡片（紫光国微）；
  - 点击中科曙光卡片：触发 `onOpenDrawer("sh603019", "中科曙光", "中信建投证券股份有限公司北京东城分公司")`。
- **对应测试断言**：`src/components/dragon_tiger/SeatRadar.test.tsx#L42-L102`

#### 用例 5：席位下钻与分时走势图联动及自选操作
- **选定席位**：`机构专用`，日期 `2026-10-30`
- **同日联动操作返回**：
  1. `sz301520`（万邦医药）：买入 10,420,000 元，涨幅 +7.2%，原因 `日涨幅偏离值达到15%`
  2. `sz301718`（通则康威）：卖出 13,770,000 元，跌幅 -3.1%，原因 `日换手率达到30%`
- **预期行为与断言**：
  - 点击“万邦医药”行：视图平滑切换至 `StockTrendView`，发起分时数据加载 `fetchStockTrend("sz301520")`；
  - 分时图中点击“+ 加自选”：调用 Tauri IPC `invoke('add_to_watchlist', { code: 'sz301520' })`，并弹出 Toast 提示；
  - 按 `Esc` 键：先返回 `SeatDetailView` 席位操盘战绩列表，不关闭外层抽屉。
- **对应测试断言**：`src/components/dragon_tiger/SeatTrendDrill.test.tsx#L90-L140`

#### 用例 6：自定义席位管理实体扁平化与分组双向转换
- **输入扁平规则**：
  ```json
  [
    { "id": "m1", "branch_keyword": "北京东城分公司", "label": "呼家楼", "category": "trader", "enabled": true },
    { "id": "m2", "branch_keyword": "北京呼家楼", "label": "呼家楼", "category": "trader", "enabled": false },
    { "id": "m3", "branch_keyword": "福州六一中路", "label": "六一路", "category": "trader", "enabled": true }
  ]
  ```
- **预期分组结果 (`groupSeatsToEntities`)**：
  - 聚合为 2 个实体：
    - 实体 1 `呼家楼`: 包含 2 个营业部关键字分支（`北京东城分公司`, `北京呼家楼`），`enabled = true`
    - 实体 2 `六一路`: 包含 1 个分支（`福州六一中路`）
- **逆向展平验证 (`flattenEntitiesToSeats`)**：
  - 扁平化后恢复为 3 条映射规则，数据无损。
- **拼音联想测试**：
  - 搜索 `zsxy` 成功命中 `作手新一`；搜索 `fxx` 命中 `方新侠`；已存在的实体自动在推荐列表中过滤剔除。
- **对应测试断言**：`src/components/settings/seatEntities.test.ts#L9-L72`

---

### 5.2 代码与测试映射双向契约 (Traceability Matrix)

| 业务环节与模块 | 实现源文件 | 精确行号范围 | 职责与功能描述 |
| :--- | :--- | :--- | :--- |
| **全市场雷达并发抓取** | [seat_radar.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/seat_radar.rs) | [L38-L160](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/seat_radar.rs#L38-L160) | `fetch_seat_radar`，`tokio::join!` 并发拉取买卖全量榜单，内存多路模式匹配 |
| **腾讯股票名称批量补全** | [seat_radar.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/seat_radar.rs) | [L218-L237](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/seat_radar.rs#L218-L237) | `resolve_names`，并发调用腾讯行情接口解码 GB18030 批量回填股票简称 |
| **游资字典与别名解析** | [trader_dict.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/trader_dict.rs) | [L6-L143](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/trader_dict.rs#L6-L143) | `match_famous_trader` 与 `resolve_branch_pattern` 20+ 顶级游资映射 |
| **席位操盘战绩下钻客户** | [seat_client.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/seat_client.rs) | [L42-L130](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/seat_client.rs#L42-L130) | `fetch_seat_detail`，单席位买入卖出历史聚合与同日联动提取 |
| **个股龙虎榜抓取与汇总** | [client.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/client.rs) | [L177-L271](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/client.rs#L177-L271) | `fetch_stock_detail`，买方前五/卖方前五拉取，机构总额与龙虎多空净额计算 |
| **平滑基准降级兜底缓存** | [baseline.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/baseline.rs) | [L13-L352](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/baseline.rs#L13-L352) | 全市场/个股/席位雷达离线基准保底，断网与反爬时保证零崩溃零白屏 |
| **IPC 命令与 10s 节流留痕** | [commands/dragon_tiger.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/commands/dragon_tiger.rs) | [L14-L171](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/commands/dragon_tiger.rs#L14-L171) | `get_stock_dragon_tiger`, `get_seat_radar`, 10 秒查询节流与 `ALERT` 日志 |
| **个股核心概念静态映射库** | [concepts_db.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/market_overview/concepts_db.rs) | [L6-L197](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/market_overview/concepts_db.rs#L6-L197) | `STOCK_CONCEPTS_MAP` 高频核心题材库（如浪潮信息-算力/CPO，中科曙光-信创） |
| **龙虎榜独立微标组件** | [DragonTigerBadge.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTigerBadge.tsx) | [L1-L57](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTigerBadge.tsx#L1-L57) | 4 日内上榜判定（`isRecentTradingDay`），极简 🐉 微标悬浮呈现 |
| **抽屉式侧边栏主容器** | [DragonTigerDrawer.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTigerDrawer.tsx) | [L28-L200](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTigerDrawer.tsx#L28-L200) | 全屏/半屏滑动展开，Esc 退出按键监听，多视图切换驱动 |
| **多空对决与能量比例卡** | [LhbSummaryCard.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/LhbSummaryCard.tsx) | [L16-L135](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/LhbSummaryCard.tsx#L16-L135) | 1日/3日榜徽标、缩略异动原因、总买/总卖/净额、多空对决比例条 |
| **席位明细与做T对倒行** | [SeatRow.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRow.tsx) | [L19-L98](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRow.tsx#L19-L98) | 相对比例条（`.lhb-seat-bar-bg`）、做T标签（`做T ⇄`）、带圈对倒高亮 |
| **席位雷达交互矩阵** | [SeatRadarView.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRadarView.tsx) | [L30-L244](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRadarView.tsx#L30-L244) | 关注席位池管理、日期对齐过滤、全部/买入/卖出方向切换、雷达卡片流 |
| **席位池控制与拼音搜索** | [SeatPoolBar.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatPoolBar.tsx) | [L14-L162](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatPoolBar.tsx#L14-L162) | 胶囊标签开关/删除、拼音首字母联想下拉浮层、恢复推荐游资 |
| **席位战绩下钻与联动** | [SeatDetailView.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatDetailView.tsx) | [L23-L148](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatDetailView.tsx#L23-L148) | 该席位同日上榜标的列表、近 1 个月战绩、点击直通分时走势图 |
| **标的日内分时分界图** | [StockTrendView.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/StockTrendView.tsx) | [L36-L226](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/StockTrendView.tsx#L36-L226) | 席位标的当日分时走势载入、自选分组选择、一键添加自选与 Esc 优先拦截 |
| **大盘龙虎榜与游资动向** | [MarketDragonTigerTab.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/MarketDragonTigerTab.tsx) | [L13-L216](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/MarketDragonTigerTab.tsx#L13-L216) | 盘中时段感知（`getSessionNotice`）、🔥 游资动向与 🎯 席位雷达二级切换 |
| **席位字典前端响应缓存** | [seatDict.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/seatDict.ts) | [L15-L281](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/seatDict.ts#L15-L281) | 席位标签解析分级管道（`resolveSeatLabel`）、拼音搜索与事件联动 |
| **做T分析与字符串清洗工具**| [utils.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/utils.ts) | [L17-L195](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/utils.ts#L17-L195) | `cleanBranchName`, `shortenLhbReason`, `alignToTradeDay`, `analyzeSeatPairs` |
| **席位自定义配置管理** | [SeatsTab.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/settings/SeatsTab.tsx) | [L33-L282](file:///D:/Project/private/ai/ai-finance-moyu/src/components/settings/SeatsTab.tsx#L33-L282) | 营业部规则实体化管理、新增营业部关键字、双向同步雷达 Storage |
| **后端单元测试套件** | [tests.rs](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/tests.rs) | [L6-L141](file:///D:/Project/private/ai/ai-finance-moyu/src-tauri/src/dragon_tiger/tests.rs#L6-L141) | 覆盖游资匹配、全市场基准、个股基准、席位详情、雷达筛选与代码规范化 |
| **席位雷达前端单元测试** | [SeatRadar.test.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRadar.test.tsx) | [L42-L140](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatRadar.test.tsx#L42-L140) | 关注池渲染、买卖方向过滤、卡片点击打开抽屉、模糊联想与增删 |
| **徽标与多空条单元测试** | [DragonTiger.test.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTiger.test.tsx) | [L12-L205](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/DragonTiger.test.tsx#L12-L205) | 营业部名称清洗、原因精简、指数过滤、微标点击、SeatRow与对决条渲染 |
| **分时下钻与加自选测试** | [SeatTrendDrill.test.tsx](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatTrendDrill.test.tsx) | [L90-L143](file:///D:/Project/private/ai/ai-finance-moyu/src/components/dragon_tiger/SeatTrendDrill.test.tsx#L90-L143) | 席位股票行点击打开分时图、加自选调用与 Toast 提示、Esc 退出链验证 |
| **席位实体双向转换测试** | [seatEntities.test.ts](file:///D:/Project/private/ai/ai-finance-moyu/src/components/settings/seatEntities.test.ts) | [L9-L72](file:///D:/Project/private/ai/ai-finance-moyu/src/components/settings/seatEntities.test.ts#L9-L72) | `groupSeatsToEntities` 与 `flattenEntitiesToSeats` 双向无损转换及拼音搜索 |
