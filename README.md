# 📈 AI Finance Moyu · A股桌面摸鱼悬浮窗

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?style=flat-square&logo=windows" alt="Platform" />
  <img src="https://img.shields.io/badge/Framework-Tauri%20v2-24C8D8?style=flat-square&logo=tauri" alt="Tauri" />
  <img src="https://img.shields.io/badge/Backend-Rust%202021-DEA584?style=flat-square&logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/Frontend-SolidJS%20%2B%20TypeScript-2C4F7C?style=flat-square&logo=solid" alt="SolidJS" />
  <img src="https://img.shields.io/badge/Tests-107%20Passed-brightgreen?style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
</p>

<p align="center">
  <b>专为 A 股投资者打造的高性能、极简桌面摸鱼行情挂件。</b><br/>
  透明无边框、智能贴边吸附、老板键一秒隐形、不占任务栏、不进 Alt+Tab。<br/>
  集成<b>集合竞价盘口双柱分析</b>、<b>本地量价走势研判</b>与<b>多维度盘口即时异动告警</b>。
</p>

---

## ✨ 核心特性一览

### 1. 🎛️ 四大经典显示形态，随心切换
支持通过全局热键 `Ctrl+Alt+1 ~ 4` 或右键菜单随时切换形态，窗口位置与各形态独立尺寸自动记忆：

| 形态 | 核心内容 | 适用场景 |
| :--- | :--- | :--- |
| **💊 数字条 (Bar)** | 单行 32px 胶囊条，滚轮横向滑动切换标的，文字柔和描边 | 极度隐蔽，与状态栏或桌面边缘浑然一体 |
| **📈 迷你图 (Mini)** | 独立大卡片、实时分时走势、均价线、十字光标、标的药丸切歌 | 专注盯单只核心龙头或持仓标的日内分时 |
| **📋 列表看板 (List)** | 高密度自选股票池、全标的实时走势 Sparkline、浮盈汇总统计 | 兼顾多只自选股走势，盈亏与波段一览无遗 |
| **🧭 大盘全景 (Market)** | 三大指数快照、全市场涨跌分布多空温度计、两市总成交额及环比放缩量、领涨板块与龙头 | 宏观大盘温度监控与市场风格定位 |

---

### 2. ⚖️ 集合竞价微观盘口洞见 (09:15 - 09:25)
针对 A 股早盘集合竞价主力虚报撤单频繁的痛点，量身打造微观盘口分析：
- **挂单量与撮合量分离双柱呈现**：将每一分钟盘口细分为 **已成交撮合量（实心）** 与 **未匹配委托单（买剩/卖剩虚线柱）**；
- **主力意向 Heuristic 智能诊断**：
  - 🚨 **冲高大撤单诱多 (Bull Trap)**：9:15~9:19 虚假挂单抬高试盘价，临近 9:20 撤单砸回；
  - ⚠️ **恐吓大撤单诱空 (Bear Trap)**：早期大单砸盘恐吓抢跑，9:20 前撤单回归；
  - 🚀 **真实抢筹 (Snatching)**：9:20 后不可撤单阶段，价格坚决推升且撮合量持续放大；
  - 📉 **真实抛压 (Dumping)**：开盘试盘坚决低开，抛盘沉重。
- **免轰炸原则**：竞价阶段自动静音系统弹窗，微观诊断仅在卡片微标与画布中优雅呈现。

---

### 3. 🚨 智能实时盘口异动与突破告警
内置边沿触发（Schmitt Trigger）防抖检测引擎，精准捕捉盘口瞬时异动：
- **🚀 急涨急跌**：短线 1~2 分钟涨跌速超过 ±1.5% 实时提醒；
- **📈 日内极值突破**：突破日内新高（突破门槛 ≥ 0.8%）或跌破日内新低；
- **💥 盘口大单扫盘/砸盘**：1 分钟脉冲爆量超过日内均速 3 倍且伴随买卖推升；
- **🔴 接近涨跌停与炸板**：封板瞬间或封板后开板异动捕捉；
- **🎯 成本线与自定义压力/支撑线**：支持设置多条价格预警线，穿越时柔和闪烁边框或弹出系统气泡通知。

---

### 4. 🧠 本地走势研判引擎 (Trend Engine)
基于纯本地 Rust 算法对分时序列进行多维度数学建模，不依赖外部付费投顾服务：
- **均线偏离度与加权均价 (VWAP)**：个股对标日内成交量加权均价，大盘指数对标动态 MA20 趋势；
- **量价顶/底背离识别**：检测双峰价格创日内新高但成交量显著衰竭的背离诱多形态；
- **多空综合健康度评分**：输出 -100 ~ +100 综合多空分值与技术标签（突破回踩、强势整理、超卖反弹等）。

---

### 5. 🥷 极致摸鱼防窥设计
- **智能边缘吸附与折叠**：拖拽靠近屏幕左、右、上边缘时，自动折叠为 **8~11px 超薄把手**；支持「鼠标悬停展开」与「双击展开防误触」，光标移开即刻平滑缩回；
- **真·免打扰与防窥避险**：
  - 原生注入 Windows `WS_EX_TOOLWINDOW`，**彻底移出 Alt+Tab 切换列表与任务栏**；
  - 全局老板键 `Ctrl+Alt+H`，任意时刻一键彻底隐藏/秒显；
  - 抑制 Windows Aero Snap 贴边分屏放大与标题栏双击放大，确保贴边吸附毫无阻滞；
- **窗口透明度与记忆**：30% ~ 100% 自由滑块透明度调节，各形态独立窗口尺寸与屏幕位置关机持久记忆。

---

### 6. 📋 完整运行日志与留痕审计系统
- **双层留痕架构**：
  - **持久化归档**：本地滚动日志存储于 `%APPDATA%/.../logs/app.log`，单文件上限 5MB，自动轮转保留 3 份历史归档；
  - **内存环形缓冲区**：保留最近 200 条活跃事件；
- **可视化日志面板**：在【设置 - 运行日志】面板中提供分类过滤（异动/竞价/时段/网络/系统/告警）、关键字实时检索、一键调用系统资源管理器打开日志目录。

---

### 7. 🛡️ 零侵入开源规范与单日配额智能熔断
- **开箱即用，凭据安全**：代码库不包含任何私有 API Key，无 Key 用户拉取代码后后台使用平滑基准数据，绝不白屏、不崩溃；
- **单日智能熔断机制 (Circuit Breaker)**：若配置的同花顺问财免费 API Key 达到每日配额限制（HTTP 401 次数耗尽），系统自动启动单日熔断保护，暂停后续高频请求并平滑降级，次日自动重置或换 Key 即时恢复。

---

## ⌨️ 常用快捷键

| 快捷键 | 作用 | 备注 |
| :--- | :--- | :--- |
| `Ctrl+Alt+H` | **老板键**：显示 / 彻底隐藏挂件 | 窗口处于后台或完全隐藏时依然全局生效 |
| `Ctrl+Alt+1` | 切换至 **数字条形态** | 32px 极简行 |
| `Ctrl+Alt+2` | 切换至 **迷你图形态** | 分时走势与竞价盘口 |
| `Ctrl+Alt+3` | 切换至 **列表看板形态** | 自选股全景 |
| `Ctrl+Alt+4` | 切换至 **大盘全景形态** | 市场温度与板块排行 |

> 💡 **提示**：快捷键支持在【设置 - 按键系统】面板中自定义覆盖，无需重新编译。

---

## 🚀 快速上手

### 下载预编译版本
前往 [Releases 页面](../../releases) 获取由 GitHub Actions 自动编译发布的最新双端版本：

- 🪟 **Windows 用户**：下载 `.exe`（NSIS 一键安装包）或 `.msi` 安装包，运行即可。
- 🍎 **macOS 用户**：下载 Universal 通用版 `.dmg`（已同时内置 Apple Silicon M 系列芯片与 Intel x86_64 架构），将图标拖入 `Applications` 目录即可。
  > 💡 **macOS 首次打开提示（免证书隔离解除）**：  
  > 由于个人开源项目未购买商业 Apple 开发者证书（$99/年），macOS Gatekeeper 安全机制可能会拦截并提示「无法验证开发者」或「已损坏，无法打开」。这是 macOS 对未签名开源软件的标准拦截行为，请任选一种方式即可正常打开：  
  > 1. **系统设置放行**：进入 `系统设置` → `隐私与安全性` → 滑至底部 `安全性` 栏目，点击「仍要打开」；或在访达中右键点按应用，选择「打开」。  
  > 2. **终端一键解除隔离属性**：  
  >    ```bash
  >    sudo xattr -rd com.apple.quarantine /Applications/ai-finance-moyu.app
  >    ```

### 自动化多端打包 (GitHub Actions)
仓库已内置多平台自动构建发布流水线 [`.github/workflows/release.yml`](.github/workflows/release.yml)：
- **触发机制**：推送版本标签（例如 `git tag v0.1.0 && git push origin v0.1.0`）或在 GitHub Actions 页面手动点击 `workflow_dispatch`；
- **构建矩阵**：并行调度 Windows 与 macOS 矩阵 Runner，自动完成代码编译、打包签名回退、生成 Universal 通用 Binary，并将编译产物自动发布至 GitHub Releases。

### 从源码构建与开发

#### 前置依赖
1. 安装 [Node.js](https://nodejs.org/) (`>= 18.0.0`)
2. 安装 [Rust 工具链](https://rustup.rs/) (`stable`, `>= 1.75.0`)
3. 安装 Visual Studio 2022 C++ 构建工具（包含 MSVC 与 Windows SDK）

#### 启动开发环境
```bash
# 克隆仓库
git clone https://github.com/your-username/ai-finance-moyu.git
cd ai-finance-moyu

# 安装前端依赖
npm install

# 启动本地联调（Tauri 原生桌面窗口 + 前端热重载）
npm run tauri dev
```

#### 在纯浏览器中调试 UI
```bash
# 启动 Vite 前端开发服务器（内置模拟数据，无需编译 Rust，无需开市）
npm run dev
# 浏览器打开 http://localhost:1420/?layout=mini (或 bar / list / market)
```

#### 生产打包构建
```bash
npm run tauri build
```
编译产物位于 `src-tauri/target/release/ai-finance-moyu.exe`，安装包位于 `bundle/nsis/`。

---

## 📊 自选股代码格式规范

本挂件推荐采用带有市场前缀的标准代码：

| 输入代码 | 对应市场 | 示例标的 |
| :--- | :--- | :--- |
| `sh600000` | 沪市主板 | 浦发银行 |
| `sh688981` | 科创板 | 中芯国际 |
| `sh000001` | 上证指数 | **上证综合指数** |
| `sz000001` | 深市主板 | **平安银行**（注意区分上证指数！） |
| `sz300750` | 创业板 | 宁德时代 |
| `sz399001` | 深市指数 | 深证成指 |
| `bj830799` | 北交所 | 艾融软件 |

> 🔍 **智能搜索**：在设置窗口的搜索栏中，您可以直接输入**股票中文名、拼音缩写（如 `PAEF`）或 6 位代码**，系统将自动模糊匹配并补齐市场前缀。

---

## 🛠️ 项目技术栈

```
ai-finance-moyu/
├── src-tauri/                     # Rust 后端引擎 (Tauri v2)
│   ├── src/
│   │   ├── auction_engine.rs      # 集合竞价微观盘口 Heuristic 诊断引擎
│   │   ├── trend_engine.rs        # 日内分时走势建模、背离检测与评分
│   │   ├── crossing.rs            # 边沿触发异动与到价告警检测
│   │   ├── market_overview.rs     # 大盘全景、涨跌分布、行业联动与智能熔断
│   │   ├── quote.rs               # 腾讯/新浪一级行情拉取与 GB18030 解析
│   │   ├── poller.rs              # 分层自适应行情轮询调度器
│   │   ├── logger.rs              # 滚动文件持久化与内存环形日志系统
│   │   ├── config.rs              # 配置读写与原子化备份存储
│   │   ├── tray.rs                # Windows 原生系统托盘菜单
│   │   └── lib.rs                 # 窗口生命周期、Aero Snap 抑制、全局热键
├── src/                           # 现代响应式前端 (SolidJS + TypeScript)
│   ├── components/                # 竞价画布、自选编辑器、Sparkline 走势组件
│   ├── layouts/                   # 数字条、迷你图、列表看板、大盘全景四大形态
│   ├── SettingsApp.tsx            # 现代化设置管理面板（股票池、外观、热键、运行日志）
│   ├── chart.ts                   # 手写原生 HTML5 Canvas 高性能分时渲染引擎
│   └── types.ts                   # 前后端强类型契约定义
```

---

## 🧪 自动化测试验证

本项目拥有完善的单元测试覆盖：

```bash
# 运行后端所有单元测试（包含 107+ 项核心算法测试）
cargo test --manifest-path src-tauri/Cargo.toml --lib

# 运行前端类型检查与 Vite 打包测试
npm run build
```

---

## 🤝 参与贡献

欢迎通过 Issue 提出任何建议或缺陷报告！详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 📜 开源许可证 (License)

本项目采用 [MIT License](./LICENSE) 协议开源。

---

## ⚠️ 免责声明 (Disclaimer)

1. 本软件仅供量化技术交流、桌面微型工具开发探索与个人摸鱼辅助使用；
2. 本软件展示的所有行情数据来源于各大财经门户公开数据接口，数据的准确性、完整性及实时性以各证券交易所官方发布为准；
3. 本软件内的走势研判、多空评分及竞价诊断算法仅为量化模型的技术指标演示，**不构成任何形式的投资建议或买卖依据**。入市有风险，投资需谨慎！
