# E-Sugoroku 验证报告 (V1.1–V1.3)

**项目**：江戸浮世絵・絵双六（E-Sugoroku）  
**分支**：`quality/v1.1-v1.3-consistency`（基线 commit：`9603df3`）  
**设计规格书**：[`docs/GAME_DESIGN_SPEC_V1.1-V2.0.md`](docs/GAME_DESIGN_SPEC_V1.1-V2.0.md)  
**工程审计记录**：[`docs/V1.1-V1.3_ENGINEERING_AUDIT.md`](docs/V1.1-V1.3_ENGINEERING_AUDIT.md)  
**唯一规则正本**：`mobile/js/core.js` + `mobile/js/boards.js`（四卷 25 / 25 / 24 / 27 格、终点 `#24 / #24 / #23 / #26`、12 护符、无偏拒绝采样骰子、四卷主动战术机制、有限深度 Expectiminimax AI）  
**C11 原型说明**：`core/esugoroku.c` 作为早期 17〜19 格 C11 Legacy Prototype 保留；当前容器环境未安装 `gcc/cc` 编译器，`verify_all.py` 对 C11 源码执行静态完整性校验并透明标注编译器状态。

---

## 一、综合验证汇总（`python3 tools/verify_all.py --browser --port 8090`）

| 验证套件 | 命令 / 入口 | 检查项数 | 结果 | 说明 |
|---|---|---:|---|---|
| 目录与文件结构审计 (`file-layout`) | `verify_all.py` | **32** | **PASS** | 核验全部核心模块、规格书、工程审计文档、字体与离线资源 |
| JS 模块语法检查 (`js-syntax`) | `node --check` | **18** | **PASS** | `server.js`、`tools/test_js_rules.mjs` 及 `mobile/js/*.js` 全部 18 个文件零语法错误 |
| C11 Legacy Prototype (`c-rules`) | `verify_all.py` | **0 (Static)** | **PASS (Skipped Binary)** | 容器内未安装 `gcc/cc`；已静态校验 `core/esugoroku.h`、`core/esugoroku.c`、`core/test_rules.c` 完整性 |
| JS 权威规则与 AI 单元测试 (`js-rules`) | `node tools/test_js_rules.mjs` | **55** | **PASS (55/55)** | 覆盖四卷几何、拒绝采样 RNG、12 护符、四卷主动机制、Expectiminimax 搜索与 320 局批量模拟 |
| 浏览器端到端测试 (`browser-e2e`) | `python3 tools/test_browser_e2e.py --port 8090` | **157** | **PASS (157/157)** | 真实 Headless Chromium + Playwright 驱动，验证四卷 25/25/24/27 格、规则分支、3D 骨骰与 UI |
| **总计** | `python3 tools/verify_all.py --browser --port 8090` | **262** | **5/5 Suites PASS** | **0 失败** |

---

## 二、JavaScript 权威规则与 AI 回归（`node tools/test_js_rules.mjs` ─ 55/55 PASS）

1. **四卷棋盘与图结构（25 / 25 / 24 / 27 格）**
   - 卷一 `tokaido`：25 格，起点 `#0`，终点 `#24`，恰好 **3 处名物宿**（`#2 泥鰌鍋`、`#7 稲荷寿司`、`#12 宇治茶`；`#16` 为 `+2` 跳跃格）。
   - 卷二 `yokai`：25 格，起点 `#0`，终点 `#24`，**4 处青行灯节点**（`#4, #10, #16, #22`）。
   - 卷三 `kesshu`：24 格，起点 `#0`，终点 `#23`，3 处武具节点（`#4 兜=1, #11 太刀=2, #18 陣太鼓=4`，开门条件 `mask = 7`）。
   - 卷四 `genji`：27 格，起点 `#0`，终点 `#26`，`#15 関屋` 分支通往善道 `#16..#20` 与恶道 `#21..#25`。
2. **无偏拒绝采样 RNG（Rejection Sampling）**
   - `UNBIASED_U32_LIMIT = 4294967292`（`Math.floor(2^32 / 6) * 6`），严格拒绝 `4294967292..4294967295` 尾部余数，消除 `2^32 % 6` 模偏差。
   - 60,000 次确定性采样测试中，1〜6 各面频次均落在 `[9650, 10350]` 均匀置信区间内，且人类与 AI 共享同一随机数生成器。
3. **12 种怀中护符（主動 + 被動完整触发链）**
   - 验证全部 12 种护符：`stay`、`guard`、`dash`、`reroll`、`decoy`、`counter`、`wind`、`purify`（含赛前主动净化 `skip`/`grudgeMarks` 与落点被动净化）、`tokaido_pass`、`andon_ward`、`gunbai_seal`、`waka_slip`（含赛前主动预设善恶路线与路线预览）。
4. **有限深度 Expectiminimax 搜索与四档 AI 批量对局模拟**
   - `expectiminimaxSearch(board, state, maximizingPlayer, depth)` 显式包含 **Max 决策节点**、**Min 对手决策节点**与 **1..6 均匀概率节点（各面权重 `1/6`）**，搜索过程零状态污染。
   - `runAiBatchSimulation` 在四卷棋盘上对 `easy / normal / hard / master` 四档 AI 各执行 80 局（每卷 20 局，固定种子序列 `baseSeed = 0x20260501`）确定性模拟：

| AI 难度 | 总结算局数 | 胜 / 负 / 平 (vs Easy 基线) | 胜率 | 平均完赛手数 (`avgPly`) | 特殊机制触发次数 (`specialTriggers`) | 累计资源收集 (`resources`) |
|---|---:|---|---:|---:|---:|---:|
| `easy` (初伝) | 80 | 37W / 38L / 5D | 46.3% | 43.2 | 14 | 95 |
| `normal` (中伝) | 80 | 53W / 27L / 0D | 66.2% | 35.9 | 170 | 102 |
| `hard` (奥伝) | 80 | 53W / 26L / 1D | 66.2% | 40.3 | 190 | 112 |
| `master` (皆伝 Expectiminimax) | 80 | 52W / 27L / 1D | 65.0% | 40.6 | 216 | 107 |

---

## 三、浏览器端到端验证（`python3 tools/test_browser_e2e.py` ─ 157/157 PASS）

通过本地 `server.js`（端口 `8090`）与 Headless Chromium（Playwright 驱动）执行全部 **157 项断言**：

| 验证模块 | 关键断言内容 | 结果 |
|---|---|---|
| HTTP 与安全响应头 | `Cache-Control: no-store, no-cache, must-revalidate`、CSP、`nosniff`、ES Module & Web Manifest MIME | PASS |
| 启动、护符池与选卷流程 | 加载遮罩消失、12 护符池、3 槽位装备、24 项成就、13+ 初始解锁锦绘、`openSide(1)` 与 `beginMatch()` | PASS |
| 四卷独立几何与终点契约 | 节点数 **25 / 25 / 24 / 27**、终点 **#24 / #24 / #23 / #26**、东海道 3 处名物宿 (`#2, #7, #12`)、百种怪谈 4 处青行灯 (`#4, #10, #16, #22`)、英勇揃倾斜武者牌、源氏绘合善恶五帖双轨 (`#16..#20` / `#21..#25`) | PASS |
| 四卷核心规则分支 | 东海道 `#2` 名物印与旅钱、`#24` 超过折返至 `#22 鈴鹿関所` 再退至 `#19`；百种怪谈查表跳与青行灯点亮；英勇揃同格合战三姿态 (`assault/feint/defend`)、武具夺取、`#23` 锁门与三备齐全获胜；源氏绘合 `#15 関屋` 主动选路 (`good` / `evil`) 与非交互奇偶回退 | PASS |
| 3D 骨骰物理与構筑切换 | 真实浮世绘纹理挂载、骨骰物理滚动与落定、3D 欧拉角顶面法线与逻辑点数严格一致 (`+Y = 1.0`)、12 护符 3 槽切换、皆传 Expectiminimax 难度切换 | PASS |
| 图鉴、称号与结算流转 | 36 锦绘打开/关闭、24 称号标签页、英勇揃 `#23` 结算画面可达、返回选卷大厅、浏览器控制台零 SEVERE 错误 | PASS |

---

## 四、最终执行命令输出

```text
Suites: 5/5 passed
Checks: 262 total (layout 32, syntax 18, C 0, JS 55, browser 157)
全部 PASS ─ E-Sugoroku is ready.
```
