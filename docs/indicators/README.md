# AI Finance Moyu 本地指标需求与算法规范体系

本目录维护本项目所有金融量化指标、盘口异动、竞价演变与宏观全景的**单一事实来源（Single Source of Truth, SSOT）**。  
文档严格遵循「研发规范与用户手册合一的双层架构」，既为交易者提供直观的信号解读与看盘指南，又为后端与前端工程师/AI Agent 提供精确的算法公式、时段契约与测试基准。

---

## 规范标准

- **单指标编写模板**：请统一遵照 [template.md](template.md) 的标准五段式结构编写与维护。
- **治理原则**：遵循 [AGENTS.md](../../AGENTS.md) 第 16 条「指标规范与测试双向契约」红线，公式与阈值调整必须与代码及测试同步演进。

---

## 业务域与指标全景目录

```text
docs/indicators/
├── README.md                      # 本文件：体系总纲与索引导航
├── template.md                    # 标准五段式规范编写模板
│
├── kline/                         # 【K线与多周期量价域】
│   ├── ma.md                      # 滚动均线系统 (MA5, MA10, MA20)
│   ├── macd.md                    # 指数平滑异同移动平均线 (MACD 12, 26, 9)
│   ├── kdj.md                     # 随机指标 (KDJ 9, 3, 3)
│   └── support_resistance.md      # 滚动 5 日支撑位与阻力位 (Support & Resistance)
│
├── auction/                       # 【集合竞价时段诊断域】
│   └── auction_evolution.md       # 早盘集合竞价演变（诱多/诱空/抢筹/抛压诊断、未匹配量）
│
├── tape/                          # 【分时盘口与日内异动域】
│   ├── intraday_momentum.md       # 急速拉升与快速跳水 (Intraday Momentum)
│   ├── price_extremes.md          # 日内新高与新低突破 (Price Extremes)
│   ├── volume_sweep.md            # 爆量扫盘与砸盘监控 (Volume Sweep)
│   └── limit_board.md             # 触及涨跌停与炸板监控 (Limit Board Monitor)
│
├── market/                        # 【市场大盘宏观全景域】
│   ├── market_breadth.md          # 市场涨跌平分布与赚钱效应 (Market Breadth)
│   └── market_volume.md           # 两市总成交额与环比放量/缩量 (Market Volume)
│
└── dragon_tiger/                  # 【龙虎榜与席位追踪域】
    └── seat_radar.md              # 知名游资与机构席位雷达 (Seat Radar)
```

---

## 核心指标索引速查表

| 指标中文名称 | 标识/代号 | 业务域分类 | 核心计算引擎 | UI 宿主呈现 | 对应需求文档 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **移动平均线** | MA (5, 10, 20) | K线量价 | `src-tauri/src/quote/indicators.rs` | `KLineBadge.tsx` / `KlineCanvas.tsx` | [ma.md](kline/ma.md) |
| **MACD 指标** | MACD (12, 26, 9) | K线量价 | `src-tauri/src/quote/indicators.rs` | `klineSubchart.ts` / `macdRenderer.ts` | [macd.md](kline/macd.md) |
| **KDJ 随机指标** | KDJ (9, 3, 3) | K线量价 | `src-tauri/src/quote/indicators.rs` | `KLineBadgePopover.tsx` | [kdj.md](kline/kdj.md) |
| **5日支撑阻力** | Sup / Res | K线量价 | `src-tauri/src/quote/indicators.rs` | `StockBadge.tsx` / `KLineBadge.tsx` | [support_resistance.md](kline/support_resistance.md) |
| **集合竞价诊断** | Auction Evolve | 集合竞价 | `src-tauri/src/logger/mod.rs` | `AuctionBadge.tsx` / `AuctionCanvas.tsx` | [auction_evolution.md](auction/auction_evolution.md) |
| **急速拉升/跳水** | Momentum Move | 分时异动 | `src-tauri/src/trend_engine/patterns.rs` | `TrendBadge.tsx` / `MicroTapePopover.tsx` | [intraday_momentum.md](tape/intraday_momentum.md) |
| **日内新高/新低** | High / Low Break | 分时异动 | `src-tauri/src/trend_engine/patterns.rs` | `TrendBadge.tsx` | [price_extremes.md](tape/price_extremes.md) |
| **爆量扫盘/砸盘** | Volume Sweep | 分时异动 | `src-tauri/src/trend_engine/patterns.rs` | `volumeRenderer.ts` / `MicroTapePopover.tsx` | [volume_sweep.md](tape/volume_sweep.md) |
| **涨跌停与炸板** | Limit Board | 盘口板态 | `src-tauri/src/trend_engine/limit_board.rs` | `TrendBadge.tsx` / `StockBadge.tsx` | [limit_board.md](tape/limit_board.md) |
| **市场涨跌分布** | Market Breadth | 宏观全景 | `src-tauri/src/market_overview/breadth.rs` | `GlobalStatusBadge.tsx` | [market_breadth.md](market/market_breadth.md) |
| **两市总成交额** | Market Volume | 宏观全景 | `src-tauri/src/market_overview/fetcher.rs` | `GlobalStatusBadge.tsx` | [market_volume.md](market/market_volume.md) |
| **龙虎榜席位雷达** | Seat Radar | 龙虎榜席位 | `src-tauri/src/market_overview/concepts_db.rs` | `DragonTigerBadge.tsx` / `SeatRadarView.tsx` | [seat_radar.md](dragon_tiger/seat_radar.md) |
