# 江戸浮世絵・絵双六 ─ E-Sugoroku (V1.1–V1.3)

四巻の浮世絵画帖をめぐる、ブラウザ用の本格戦術絵双六。  
三十六枚の錦絵札、十二種から三枚を選ぶ懐中守り札、四巻固有の戦術決断（旅銭・四灯百鬼夜行・三構え合戦・善悪二道選択）、棄却サンプリングによる完全無偏の 1〜6 骨骰と四段階 AI（初伝・中伝・奥伝・皆伝 Expectiminimax 探索）を備えたブラウザゲームです。

- **唯一規則正本 (Canonical Rules Authority)**: `mobile/js/core.js` ＋ `mobile/js/boards.js`（25/25/24/27 格・ゴール #24/#24/#23/#26・V1.1〜V1.3 戦術システム）
- **設計仕様書**: [`docs/GAME_DESIGN_SPEC_V1.1-V2.0.md`](docs/GAME_DESIGN_SPEC_V1.1-V2.0.md)
- **品質監査記録**: [`docs/V1.1-V1.3_ENGINEERING_AUDIT.md`](docs/V1.1-V1.3_ENGINEERING_AUDIT.md)
- **C11 エンジン (`core/esugoroku.c`)**: 初期 17〜19 格プロトタイプ（Legacy Prototype）として保持
- 実行環境: Node.js 18+ / モダンブラウザ（WebGL + Canvas 2D 浮世絵木版摺りシェーダー）
- 既定ポート: **3000**（または環境変数 `PORT`）

---

## 起動

```bash
node server.js
```

ブラウザで <http://localhost:3000/> を開きます。  
`server.js` は `mobile/` を配信し、全レスポンスに次のヘッダーを付与します。

```http
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
Expires: 0
```

ポートを変える場合:

```bash
PORT=8090 node server.js
```

`make serve` / `make serve PORT=8090` でも起動できます。

---

## 四巻の画帖（25 / 25 / 24 / 27 格・巻別主動戦術）

| 巻 | 画帖 | 格数 | ゴール ID | 版式 | 固有戦術システム |
|---|---|---:|---:|---|---|
| 巻ノ壱 | 東海道・御府内名物道中双六 | 25格 | `#24` | 外周16宿＋内周8宿の二重螺旋回廊 | 名物三宿（`#2 泥鰌鍋`・`#7 稲荷寿司`・`#12 宇治茶`）で「旅銭」を獲得し、宿場泊や関所押し戻しを旅銭または通行手形で突破（`#16` は `+2` 前進ジャンプ） |
| 巻ノ弐 | 百種怪談・妖物飛び双六 | 25格 | `#24` | 大小錯落の怪談コラージュ | 四箇所の青行灯（`#4`・`#10`・`#16`・`#22`）を個人別に点灯。四灯揃うと次回の前進跳びが「百鬼夜行（2倍/3倍）」に増幅 |
| 巻ノ参 | 英勇揃伊呂波双六 | 24格 | `#23` | 傾けた武者札（-7°〜+9°）の戦陣配置 | 三備え（兜・太刀・陣太鼓、`mask = 7`）集結＋同格合戦での三構え選択（猛攻・牽制・固守） |
| 巻ノ肆 | 源氏繪合 | 27格 | `#26` | 四色外周短冊＋善悪五帖ずつの二重軌道 | 分岐マス（`#15 関屋`）で金色の「雅道（善 `#16..#20`）」か紫の「修羅道（悪 `#21..#25`）」を主体的に選択（非対話呼び出し時は偶奇フォールバック）＋善悪天平 |

---

## 遊び方・戦術要素

1. 四巻から画帖を選び、AI 難度（初伝 `easy`・中伝 `normal`・奥伝 `hard`・皆伝 `master`）または「同席二人 (`local2p`)」を選択。
2. **12種の懐中護符**から最大3枚を装備し、蒐集済みの**自定义手札（36枚の錦絵）**から初期Buff手札を1枚選ぶ。
3. 賽を振る前に「辻風奇襲 (`strike`)」や主動護符（風行符 `wind`・祓浄符 `purify`・和歌懐紙 `waka_slip`）を発動可能。出目確定後には重骰符 (`reroll`) による振り直しも選択可能。
4. 人間と AI は**完全に同一の無偏 1〜6 骨骰 (`EsugorokuCore.rollDie`、棄却サンプリング上限 `4294967292`)** を振り、AI は出目操作を一切行わず合法な戦術選択のみで競います。皆伝 (`master`) AI は Max 決定ノード・Min 相手決定ノード・1〜6 一様 Chance ノード（各面確率 `1/6`）による有限深さ Expectiminimax 探索を実行します。

### 懐中守り札（全12種・対局ごとに3枚編成）

- **宿場守り (`stay`)**: 宿場泊の休みを自動免除（4手番再充填）
- **関所・妖怪封じ (`guard`)**: 関所や怪異の戻り跳びを封じる（4手番再充填）
- **東海道早駕籠 (`dash`)**: 移動時に出目＋1歩加速（4手番再充填）
- **重骰符 (`reroll`)**: 出目確定後、1局に1回だけ賽を振り直す
- **身代り符 (`decoy`)**: 相手からの追突・一騎討ち・辻風奇襲の押し戻しと武具奪取を防ぐ（1局1回）
- **反撃符 (`counter`)**: 追突された際、攻撃側を1格後ろへ押し返す（5手番再充填）
- **風行符 (`wind`)**: 主動発動で今回の出目に＋2歩加速（1局1回）
- **祓浄符 (`purify`)**: 賽前の主動発動で残り休み・怨念印を浄化、または着地時の負効果を自動浄化（5手番再充填）
- **通行手形 (`tokaido_pass`)**: 東海道専用・対局開始時に旅銭＋1枚を付与
- **青行灯護符 (`andon_ward`)**: 百種怪談専用・百鬼夜行の前進倍率を2倍→3倍に強化（1局1回）
- **軍配印 (`gunbai_seal`)**: 英勇揃専用・一騎討ちで自分の武具印が奪われるのを防ぐ（4手番再充填）
- **和歌懐紙 (`waka_slip`)**: 源氏絵合専用・`#15 関屋` の善悪分岐を事前予約＆ルート内訳プレビュー（4手番再充填）

---

## ディレクトリ

```text
E-Sugoroku/
├── docs/
│   ├── GAME_DESIGN_SPEC_V1.1-V2.0.md  V1.1〜V2.0 公式ゲーム設計仕様書
│   └── V1.1-V1.3_ENGINEERING_AUDIT.md V1.1〜V1.3 エンジニアリング品質監査記録
├── core/
│   ├── esugoroku.h          初期 C11 プロトタイプ API（Legacy 17〜19格）
│   ├── esugoroku.c          初期 C11 有向グラフ実装（Legacy Prototype）
│   └── test_rules.c         C11 プロトタイプ回帰テスト
├── mobile/
│   ├── index.html           エントリ（3D 盤面 + 戦術モーダル + 12護符編成 UI）
│   ├── manifest.json        PWA マニフェスト
│   ├── styles.css           UI スタイル・戦術選択・木版画フレーム
│   └── js/
│       ├── state.js         G 状態・Profile v1→v2 移行・確定型カード解放・HUD 同期
│       ├── boards.js        四巻ノード幾何（25/25/24/27格）・36錦絵・12護符・24称号
│       ├── core.js          ブラウザ唯一権威規則エンジン（無偏賽・4巻戦術・Expectiminimax AI）
│       ├── tabletop_3d.js   Three.js 3D 盤面・磁碗衝突・水墨飛沫・浮世絵木版シェーダー
│       ├── board_renderer.js 2D 盤面キャッシュ・プレビュー弧線・HUD 補助描画
│       ├── nishikie_woodblock.js 高精細浮世絵カード版画描画
│       ├── ukiyoe_art.js    ノード図像・護符・肖像描画
│       ├── art_core.js      和紙・雲母・伝統文様・印章プリミティブ
│       ├── art_figures.js   浮世絵人物・武者・妖怪ベジェ描画
│       ├── art_scenes.js    東海道・怪談・合戦・源氏絵巻の情景描画
│       ├── print_loader.js  浮世絵版画テクスチャ読込
│       ├── ukiyoe_prints_real.js パブリックドメイン浮世絵シート管理
│       ├── ui_screens.js    巻選択・手番編成・図鑑・結算画面描画
│       ├── audio.js         三味線・十三絃箏 BGM ＋ 骨骰・檜木駒 SFX 独立合成音響
│       └── main.js          主循環・3D 骨骰物理・戦術決断 UI・E2E hooks (`window.__ESR__`)
├── tools/
│   ├── test_js_rules.mjs    V1.1〜V1.3 JS 規則・無偏乱数・12護符・4巻戦術・Expectiminimax AI・Profile 移行テスト（55項目）
│   ├── test_browser_e2e.py  ヘッドレス Chromium E2E テスト（157項目）
│   └── verify_all.py        総合検証ランナー（構成・構文・C11・JS・ブラウザ E2E）
├── README.md
├── ARCHITECTURE.md
└── TEST_REPORT.md
```

---

## テスト

### 一括検証（推奨）

```bash
python3 tools/verify_all.py --browser --port 8090
```

または:

```bash
make verify-browser
```

### 個別実行

```bash
# JS 全モジュール構文チェック
for f in server.js tools/test_js_rules.mjs mobile/js/*.js; do node --check "$f"; done

# JS 規則・幾何・無偏乱数・12護符・Expectiminimax AI・バッチシミュレーション（55 tests）
node tools/test_js_rules.mjs

# ブラウザ E2E（自動で 8090 を起動、157 checks）
python3 tools/test_browser_e2e.py --port 8090

# C11 レガシープロトタイプ（環境に gcc/cc がインストールされている場合）
gcc -std=c11 -O2 -Wall -Wextra -Werror -c core/esugoroku.c -o /tmp/esr.o
gcc -std=c11 -O2 -Wall -Wextra -Werror core/test_rules.c /tmp/esr.o -o /tmp/esr_test
/tmp/esr_test
```

ブラウザ E2E（全157チェック）は次を検証します。

- 四巻の `boardIdx` 0〜3 切替と幾何（25/25/24/27 ノード、ゴール `#24/#24/#23/#26`）
- 版式・UI 皮膚・HUD・骰具・骰子形状が四巻で独立していること
- 巻ノ壱の名物三宿（`#2, #7, #12`）と旅銭獲得、`#24` 超過折り返しと `#22 鈴鹿関所` 引き戻し
- 巻ノ弐の四箇所の青行灯（`#4, #10, #16, #22`）個別点灯と六面プレビュー目標
- 巻ノ参の同格合戦・三構え選択（`assault / feint / defend`）、武具奪取、三備え（`mask = 7`）による `#23` 開門と勝利
- 巻ノ肆の `#15 関屋` における能動的善悪ルート選択（`good #16..#20` / `evil #21..#25`）と非対話時の偶奇フォールバック
- 3D 骨骰の物理挙動、オイラー角上面法線と論理出目の一致、12種護符3枠編成、皆伝 Expectiminimax 難度切替
- 図鑑（36錦絵・24称号）、結算画面（巻ノ参ゴール `#23`）、巻選択への復帰
- `Cache-Control: no-store, no-cache, must-revalidate`、CSP、コンソール SEVERE エラー 0 件

---

## 規則エンジンの正本と C11 プロトタイプ

現在のブラウザゲームにおける**唯一の規則正本（Canonical Rules Engine）**は `mobile/js/core.js` と `mobile/js/boards.js` です（25/25/24/27 ノード構成、ゴール `#24/#24/#23/#26`、12種護符、4巻固有戦術状態、棄却サンプリングによる無偏 1〜6 乱数賽、有限深さ Expectiminimax AI を実装）。

`core/esugoroku.h` および `core/esugoroku.c` は初期の 17〜19 ノード構成の **C11 レガシープロトタイプ（Legacy Prototype）** としてリポジトリ内に保持されており、現行ブラウザ版の拡張ルールとは直接ミラーリングされていません。詳細は [`docs/GAME_DESIGN_SPEC_V1.1-V2.0.md`](docs/GAME_DESIGN_SPEC_V1.1-V2.0.md) を参照してください。

---

## ランタイム依存境界とオフライン動作

- **規則エンジン・AI・2D 版画・音響・フォント**: `mobile/js/` の ES モジュール、Canvas 2D 程序化木版画描画、Web Audio API 合成音響、および `mobile/assets/fonts/` の同梱 WOFF2 フォントはすべてローカル配信で完結し、外部 API やテレメトリ通信を一切行いません。
- **Three.js 3D 表示レイヤー**: `mobile/index.html` の `<script type="importmap">` は `three@0.170.0`（`https://cdn.jsdelivr.net/npm/three@0.170.0/`）を参照しています。完全エアギャップ環境で 3D WebGL 盤面を表示する場合は、`three@0.170.0` をローカル vendor ディレクトリへ配置して importmap を切り替えてください。なお、純粋規則エンジン (`mobile/js/core.js`, `mobile/js/boards.js`, `mobile/js/state.js`) および `node tools/test_js_rules.mjs` はネットワーク接続なしで100%動作します。
