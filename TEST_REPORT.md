# E-Sugoroku 验证报告 (V1.1–V1.3)

**项目**：江戸浮世絵・絵双六（E-Sugoroku）  
**规格书**：[`docs/GAME_DESIGN_SPEC_V1.1-V2.0.md`](docs/GAME_DESIGN_SPEC_V1.1-V2.0.md)  
**唯一规则正本**：`mobile/js/core.js` + `mobile/js/boards.js`（四卷 25/25/24/27 格、12 护符、公平骰子、四卷主动战术机制）  
**C11 原型说明**：`core/esugoroku.c` 作为早期 17〜19 格 C11 原型保留。

---

## JavaScript 权威规则与几何回归（`node tools/test_js_rules.mjs`）

覆盖范围（40+ 项确定性断言）：

- **棋盘与图结构**：4 个画帖（25 / 25 / 24 / 27 格）、36 张唯一锦绘札、12 种怀中护符（每局最多装备 3 枚）、24 项成就。
- **V1.1 公平骰子与确定性 RNG**：`createSeededRng(seed)` 与 `rollDie(rng)` 保证人类与 AI 完全使用同一 1〜6 均匀骰子，支持同种子确定性回放；`maxPly` 超时按 `progressValue` 结算。
- **V1.2 卷一（东海道）**：`#2 泥鰌鍋`、`#7 稲荷寿司`、`#12 宇治茶` 收集名物印并获得「旅钱」（每格每名玩家限 1 次），支持消耗 1 枚旅钱免除宿场泊或关所退格。
- **V1.2 卷二（百种怪谈）**：`#4, #10, #16, #22` 四个独立青行灯节点按玩家分别点亮；集齐四灯后进入个人「百鬼夜行」待机，仅在下一次前进跳跃时触发 `×2`（配合青行灯护符 `×3`），当回合不提前消耗、后退跳跃不误消耗。
- **V1.2 卷三（英勇揃）**：三备え（兜・太刀・陣太鼓）收集与御前开门检查；同格合战支持 `assault`（猛攻）、`feint`（牵制）、`defend`（固守）三种战术姿态，以及替身符 (`decoy`)、军配印 (`gunbai_seal`) 防御验证。
- **V1.2 卷四（源氏绘合）**：抵达或经过 `#15 関屋` 时可主动选择 `good`（雅道）或 `evil`（修罗道），不再被奇偶强制绑定；维护 `boardState.genji.balance`。
- **V1.2/V1.3 公平 AI 与存档迁移**：验证 `easy / normal / hard / master` 四档 AI 仅从合法战术动作中决策、绝不操纵骰子点数；验证 `esugoroku.profile.v1 -> v2` 迁移与对局结算解锁逻辑。

---

## 浏览器 E2E（137 checks）

通过 `tools/test_browser_e2e.py` 自动启动 `8090`，使用 Chromium headless 执行。

### 静态服务器

- `index.html` 强制 `no-store, no-cache, must-revalidate`。
- CSP、`nosniff`、JS MIME、Web Manifest MIME。
- Manifest `short_name` 与普通／maskable 双图标。

### 启动与选择

- 加载遮罩正确消失。
- 四卷选择卡矩形独立且全部位于 1280×800 舞台内。
- 真实指针点击第二卷进入手番／护符画面。
- 点击「出陣」进入 PLAYING，人类先手，阶段为 ROLL。

### 四卷独立性

依次切换 `boardIdx` 0〜3，断言：

| 断言 | 结果 |
|---|---|
| 四卷几何签名唯一 | PASS |
| 四卷 layout／shape 唯一 | PASS |
| 四卷 UI skin 唯一 | PASS |
| 四卷 HUD 唯一 | PASS |
| 四卷骰具名称／形状唯一 | PASS |
| 节点数 17／17／16／23 | PASS |
| 所有札位于 800×640 印面内 | PASS |
| 每格标题非空、ID 唯一 | PASS |
| 巻ノ壱中央 3×3 上り大格 | PASS |
| 巻ノ弐大小错落、六面预览目标 | PASS |
| 巻ノ参倾斜武者牌、大出陣／上り | PASS |
| 巻ノ肆四色短册、善悪双轨 | PASS |

### 规则分支

- 巻ノ壱：15 → 出目 3 → 反弹至 14。
- 巻ノ弐：0 → 出目 3 → 查表跳至 4，并熄一盏青行灯。
- 巻ノ参：无备え进入上り被弹回；三备え齐全后进入上り并结算。
- 巻ノ肆：出目 2 进入善道 → 17；出目 3 进入悪道 → 19。

### 骰子物理与画面稳定

- 两个 3D 骨骰，初始静止于右侧榻榻米托盘。
- 骰点值合法（1〜6）。
- 摇骰期间对盘面区域截取两帧，像素差异低于 3.5%，通过。
- 骰子物理确实处于旋转／落定流程。

### 图鉴与结算

- 36 札图鉴打开、关闭按钮有效。
- 护符标签切换正常。
- 结算画面可达。
- 点击结算菜单返回四卷选择。
- 浏览器控制台无 SEVERE 错误。

结果：

```text
Browser checks: 137, failures: 0
All browser E2E checks passed.
```

---

## 截图

最终 E2E 截图位于：

```text
/tmp/esugoroku-final-shots/
├── 00-select.png
├── 01-side-yokai.png
├── 02-board-tokaido.png
├── 03-board-yokai.png
├── 04-board-kesshu.png
├── 05-board-genji.png
├── 06-gallery-cards.png
├── 07-gallery-charms.png
└── 08-settlement.png
```

---

## 最终命令输出

```text
Suites: 5/5 passed
Checks: 290 total (layout 26, syntax 13, C 92, JS 22, browser 137)
Elapsed: 25.88s
全部 PASS ─ E-Sugoroku is ready.
```

---

## 预览

```bash
cd /home/ou/Projects/E-Sugoroku
node server.js
```

打开 <http://localhost:8090/>。

所有资源（含 367 个离线字体文件）由本地 `server.js` 提供，无外部 CDN、无追踪请求。
