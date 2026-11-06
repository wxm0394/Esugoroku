# 江戸浮世絵・絵双六 ─ E-Sugoroku (V1.1–V1.3)

四巻の浮世絵画帖をめぐる、ブラウザ用の本格戦術絵双六。  
三十六枚の錦絵札、十二種から三枚を選ぶ懐中守り札、四巻固有の戦術決断（旅銭・四灯百鬼夜行・三構え合戦・善悪二道選択）、公平な 1〜6 骨骰と四段階 AI（初伝・中伝・奥伝・皆伝）を備えたブラウザゲームです。

- **唯一規則正本 (Canonical Rules Authority)**: `mobile/js/core.js` ＋ `mobile/js/boards.js`（25/25/24/27 格・V1.1〜V1.3 戦術システム）
- **設計仕様書**: [`docs/GAME_DESIGN_SPEC_V1.1-V2.0.md`](docs/GAME_DESIGN_SPEC_V1.1-V2.0.md)
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
PORT=8091 node server.js
```

`make serve` / `make serve PORT=8091` でも起動できます。

---

## 四巻の画帖（24〜27格・巻別主動戦術）

| 巻 | 画帖 | 格数 | 版式 | 固有戦術システム |
|---|---|---:|---|---|
| 巻ノ壱 | 東海道・御府内名物道中双六 | 25格 | 外周16宿＋内周8宿の二重螺旋回廊 | 名物三宿（#2・#7・#12）で「旅銭」を獲得し、宿場泊や関所押し戻しを旅銭または通行手形で突破 |
| 巻ノ弐 | 百種怪談・妖物飛び双六 | 25格 | 大小錯落の怪談コラージュ | 四箇所の青行灯（#4・#10・#16・#22）を個人別に点灯。四灯揃うと次回の前進跳びが「百鬼夜行（2倍/3倍）」に増幅 |
| 巻ノ参 | 英勇揃伊呂波双六 | 24格 | 傾けた武者札（-7°〜+9°）の戦陣配置 | 三備え（兜・太刀・陣太鼓）集結＋同格合戦での三構え選択（猛攻・牽制・固守） |
| 巻ノ肆 | 源氏繪合 | 27格 | 四色外周短冊＋善悪五帖ずつの二重軌道 | 分岐マス（#15 関屋）で金色の「雅道（善）」か紫の「修羅道（悪）」を主体的に選択＋善悪天平 |

---

## 遊び方・戦術要素

1. 四巻から画帖を選び、AI 難度（初伝・中伝・奥伝・皆伝）または「同席二人」を選択。
2. **12種の懐中護符**から最大3枚を装備し、蒐集済みの**自定义手札（36枚の錦絵）**から初期Buff手札を1枚選ぶ。
3. 賽を振る前に「辻風奇襲」や主動護符（風神符・浄め符・和歌懐紙）を発動可能。
4. 人間と AI は**完全に同一の公平な 1〜6 骨骰 (`EsugorokuCore.rollDie`)** を振り、AI は出目操作を行わず合法な戦術選択のみで競います。

### 懐中守り札（全12種・対局ごとに3枚編成）

- **宿場守り (`stay`)**: 宿場泊の休みを自動免除
- **関所・妖怪封じ (`guard`)**: 関所や怪異の戻り跳びを封じる
- **早駕籠 (`dash`)**: 最初の移動で出目＋1歩加速
- **重抽符 (`reroll`)**: 出目確定後、1局に1回だけ賽を振り直す
- **身代り符 (`decoy`)**: 相手からの追突・一騎討ちの押し戻しと武具奪取を防ぐ
- **返し太刀符 (`counter`)**: 追突された際、相手を2格弾き返す
- **風神符 (`wind`)**: 主動発動で今回の出目に＋2歩加速
- **浄め符 (`purify`)**: 宿場泊の残り休みや源氏巻の怨念印を浄化する
- **通行手形 (`tokaido_pass`)**: 東海道専用・旅銭を消費せず関所や泊を突破
- **青行灯護符 (`andon_ward`)**: 百種怪談専用・百鬼夜行の前進倍率を2倍→3倍に強化
- **軍配印 (`gunbai_seal`)**: 英勇揃専用・一騎討ちで自分の武具印が奪われるのを防ぐ
- **和歌懐紙 (`waka_slip`)**: 源氏絵合専用・#15 関屋の善悪分岐を任意に予約指定

---

## ディレクトリ

```text
E-Sugoroku/
├── docs/
│   └── GAME_DESIGN_SPEC_V1.1-V2.0.md  V1.1〜V2.0 公式ゲーム設計仕様書
├── core/
│   ├── esugoroku.h          初期 C11 プロトタイプ API（Legacy 17〜19格）
│   ├── esugoroku.c          初期 C11 有向グラフ実装
│   └── test_rules.c         C11 プロトタイプ回帰テスト
├── mobile/
│   ├── index.html           エントリ（3D 盤面 + 戦術モーダル + 12護符編成 UI）
│   ├── manifest.json        PWA マニフェスト
│   ├── styles.css           UI スタイル・戦術選択・木版画フレーム
│   └── js/
│       ├── state.js         G 状態・Profile v2 移行・確定型カード解放・HUD 同期
│       ├── boards.js        四巻ノード幾何（25/25/24/27格）・36錦絵・12護符・24称号
│       ├── core.js          ブラウザ唯一権威規則エンジン（公平賽・4巻戦術・Expectiminimax AI）
│       ├── tabletop_3d.js   Three.js 3D 盤面・磁碗衝突・水墨飛沫・浮世絵木版シェーダー
│       ├── nishikie_woodblock.js 高精細浮世絵カード版画描画
│       ├── audio.js         三味線・十三絃箏 BGM ＋ 骨骰・檜木駒 SFX 独立合成音響
│       └── main.js          主循環・3D 骨骰物理・戦術決断 UI・E2E hooks
├── tools/
│   ├── test_js_rules.mjs    V1.1〜V1.3 JS 規則・12護符・4巻戦術・AI・Profile 移行テスト
│   └── verify_all.py        一括検証スクリプト
├── README.md
├── ARCHITECTURE.md
└── TEST_REPORT.md
```

---

## テスト

### 一括検証（推奨）

```bash
python3 tools/verify_all.py --browser
```

または:

```bash
make verify-browser
```

### 個別実行

```bash
# C11 規則エンジン
gcc -std=c11 -O2 -Wall -Wextra -Werror -c core/esugoroku.c -o /tmp/esr.o
gcc -std=c11 -O2 -Wall -Wextra -Werror core/test_rules.c /tmp/esr.o -o /tmp/esr_test
/tmp/esr_test

# JS 規則・幾何・36 札
node tools/test_js_rules.mjs

# ブラウザ E2E（自動で 8090 を起動）
python3 tools/test_browser_e2e.py

# 既に起動中のサーバーを使う
python3 tools/test_browser_e2e.py --base-url http://127.0.0.1:8090/

# スクリーンショットを残す
python3 tools/test_browser_e2e.py --screenshot-dir /tmp/esugoroku-e2e
```

ブラウザ E2E は次を検証します。

- 四巻の `boardIdx` 0〜3 切替
- 版式・UI 皮膚・HUD・骰具・骰子形状が四巻で独立していること
- 札の矩形・ノード数・開始／上り・短冊色・善悪分岐
- 巻ノ壱の超過反弹、巻ノ弐の查表飛び、巻ノ参の上り封鎖、巻ノ肆の偶奇分岐
- 3D 骨骰二個、右側トレイ内の静止位置
- 骰子回転中に盤面が動かないこと（ピクセル差分）
- 図鑑、守り札タブ、結算画面、巻選択への復帰
- `Cache-Control: no-store, no-cache, must-revalidate` と CSP
- ブラウザコンソールに SEVERE エラーがないこと

---

## 規則エンジンの正本と C11 プロトタイプ

現在のブラウザゲームにおける**唯一の規則正本（Canonical Rules Engine）**は `mobile/js/core.js` と `mobile/js/boards.js` です（25/25/24/27 ノード構成、12種護符、4巻固有戦術状態、公平な 1〜6 乱数賽、Expectiminimax AI を実装）。

`core/esugoroku.h` および `core/esugoroku.c` は初期の 17〜19 ノード構成の **C11 レガシープロトタイプ（Legacy Prototype）** としてリポジトリ内に保持されており、現行ブラウザ版の拡張ルールとは直接ミラーリングされていません。詳細は [`docs/GAME_DESIGN_SPEC_V1.1-V2.0.md`](docs/GAME_DESIGN_SPEC_V1.1-V2.0.md) を参照してください。

---

## 描画と安定性

- 盤面は各画帖ごとにオフスクリーン Canvas へ一度だけ描画し、以後はキャッシュを合成。
- 骰子・駒・プレビュー弧線・着地金雲／桜吹雪だけを毎フレーム描画。
- 骰子は Canvas 2D の透視投影による立方体。竹筒・茶碗・陣中筒・振筒は各巻専用の形状。
- 骰子が転がっている間、盤面キャッシュには一切の Transform を加えない。
- 着地演出は最終マスの中心にだけ発生し、盤面全体を揺らさない。
- 文字は各札の右側縦題箋・左上こま絵・下部規則帯・中央偏下駒座に分離し、上り印は題箋と重ねない。

---

## ライセンス表記

- 浮世絵調の図像はすべて Canvas の程序化描画で、特定の版木画像を複製したものではありません。
- フォントは `mobile/assets/fonts/` に同梱したオフライン WOFF2 を使用します。
- 外部 CDN・解析・トラッキングはありません。
