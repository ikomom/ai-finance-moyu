# 参与贡献指南 (Contributing Guide)

感谢您对 **ai-finance-moyu（A股摸鱼悬浮窗）** 的关注与支持！无论是提交 Bug 反馈、完善文档，还是提交代码 PR，我们都非常欢迎。

---

## 一、本地开发环境准备

在开始贡献代码前，请确保您的开发机已配置以下环境：

1. **操作系统**：Windows 10 / 11（由于挂件使用了 Windows 原生无边框、Alt+Tab 隐藏与系统托盘 API，推荐在 Windows 原生或虚拟机环境下开发与测试）。
2. **Node.js**：`>= 18.0.0`（推荐使用 LTS 版本）。
3. **Rust 工具链**：`stable` 分支（推荐 `>= 1.75.0`），包含 `cargo`。
4. **C++ 构建工具**：Visual Studio 2022 C++ 构建工具（Tauri 编译所需）。

---

## 二、本地启动与调试

```bash
# 1. 克隆仓库
git clone https://github.com/your-username/ai-finance-moyu.git
cd ai-finance-moyu

# 2. 安装前端依赖
npm install

# 3. 运行本地开发（支持 Rust 后端热重载与 Vite 前端 HMR）
npm run tauri dev

# 4. 浏览器纯前端调试（无原生窗口依赖，内置模拟数据）
npm run dev
# 打开浏览器访问 http://localhost:1420/?layout=mini (或 bar / list / market)
```

---

## 三、开发守则与核心约束

提交代码前，请务必阅读并严格遵守 [`AGENTS.md`](./AGENTS.md) 中定义的领域准则：

1. **凭据安全与零侵入**：严禁硬编码任何私有 API Key / Token；无 Key 用户拉取代码后必须能平滑回退基准缓存，绝不允许出现白屏或崩溃。
2. **北向资金红线**：根据交易所 2024 年 8 月起新规，严禁展示日内盘中实时北向资金流向，大盘宏观指标聚焦于两市总成交额与环比放量/缩量。
3. **网络与接口规范**：
   - 行情网络客户端必须配置 `.no_proxy()`，避免受本地代理影响；
   - 严禁直连东方财富 `push2.eastmoney.com`（反爬限制严格）；
   - 第三方开放接口（如问财）必须具备单日智能熔断保护（401/429/配额耗尽后停止重试）。
4. **并发测试锁机制**：凡涉及静态单例或全局状态的 Rust 单元测试，必须引入 `static TEST_LOCK: Mutex<()>` 串行化，保证 `cargo test` 稳定通过。

---

## 四、测试与代码验证

提交 Pull Request 之前，必须在本地通过以下命令验证无报错：

```bash
# 1. 前端类型检查与打包
npm run build

# 2. 后端语法与生命周期检查
cargo check --manifest-path src-tauri/Cargo.toml

# 3. 运行后端所有单元测试（包含 100+ 项测试）
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

---

## 五、Git 提交规范

推荐遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 格式：

- `feat:` 新增功能（如新增形态、新增指标计算）
- `fix:` 修复缺陷（如修复贴边折叠判定、修复分时走势刷新）
- `perf:` 性能与内存优化
- `refactor:` 代码重构（未改变外部行为）
- `docs:` 文档更新或注释补充
- `test:` 补充或修改单元测试
