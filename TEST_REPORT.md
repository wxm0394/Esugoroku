# E-Sugoroku 验证报告

**项目**：江戸浮世絵・絵双六（E-Sugoroku）  
**日期**：2026-10-30  
**结论**：**全部 PASS**（5/5 suites，290 checks）

---

## 环境

| 项目 | 版本／路径 |
|---|---|
| OS | Linux |
| Python | 3.13.5 |
| Node.js | v24.21.0 |
| C 编译器 | gcc 14.2.0，`-std=c11 -O2 -Wall -Wextra -Werror` |
| 浏览器 | Chromium 144.0.7559.109（headless） |
| 驱动 | `/usr/bin/chromedriver` |
| 预览服务器 | `server.js`，默认 `8090`，零依赖 |

---

## 总览

| Suite | Result | Checks |
|---|---|---:|
| 目录结构与独立性 | PASS | 26 |
| JavaScript 语法（`node --check`） | PASS | 13 |
| C11 规则回归 | PASS | 92 |
| JS 规则／几何／36 札数据 | PASS | 22 |
| 浏览器 E2E | PASS | 137 |
| **合计** | **5/5** | **290** |

执行命令：

```bash
python3 tools/verify_all.py --browser
```

服务器响应头：

```http
HTTP/1.1 200 OK
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
Expires: 0
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'self'; ...
```

---

## C11 规则回归（92 checks）

覆盖范围：

- 四卷画帖的节点数、连通性、开始／上り。
- 巻ノ壱：顺时针移动、泊、名物跳转、终点点点一致、超过反弹。
- 巻ノ弐：出目 1〜6 的短册查表、后退怪異、妖怪封じ。
- 巻ノ参：兜／太刀／陣太鼓的 bit mask 收集、未集齐时上り封锁、同格决斗。
- 巻ノ肆：偶善奇悪分岐、善道捷径、悪道泥舟、戒律。
- 三枚护符：宿场守り、妖怪封じ、早駕籠。
- 胜负判定、AI 期望值、终局极大值。
- 四个内蔵模型的规则差异。

结果：

```text
E-Sugoroku C11 rules regression suite
-------------------------------------
Checks: 92, failures: 0
C rules regression tests passed.
```

---

## JavaScript 规则与几何（22 tests）

覆盖范围：

- 恰好 4 个画帖、36 张唯一锦绘札、3 枚护符。
- 四张有向图完全连通且可达。
- 四个版式几何签名互不相同。
- 巻ノ壱尖头短册、こま絵、赤「泊」印。
- 巻ノ弐大小错落、约 1.5 倍妖怪格、六面预览。
- 巻ノ参 `-7°〜+9°` 倾斜、出陣／上り大格、三备え。
- 巻ノ肆四色短册、善玉／悪玉双轨。
- 泊、飞、终点反弹、护符、集結、源氏分岐、AI 期望值。

结果：

```text
22 tests passed, 0 failed.
```

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
