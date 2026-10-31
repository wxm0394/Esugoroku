# 江戸浮世絵・絵双六 ─ E-Sugoroku

四巻の浮世絵画帖をめぐる、ブラウザ用の本格絵双六。  
三十六枚の錦絵札、三枚の懐中守り札、物理演算で転がる 3D 骨骰、そして C11 と JavaScript の二重規則エンジンを収録した独立プロジェクトです。

- 実行環境: Node.js 18+ / モダンブラウザ
- 外部依存: **なし**（サーバー・描画・音響・テストすべて自前）
- 既定ポート: **8090**
- 画像生成: Canvas 2D による奉书纸・雲母・ぼかし・青海波・貝合わせ・こま絵の程序化描画

---

## 起動

```bash
cd /home/ou/Projects/E-Sugoroku
node server.js
```

ブラウザで <http://localhost:8090/> を開きます。  
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

## 四巻の画帖

| 巻 | 画帖 | 版式 | 専用 UI | 骰具 | 規則 |
|---|---|---|---|---|---|
| 巻ノ壱 | 東海道・御府内名物道中双六 | 外圈顺时针向内螺旋回廊 | 杉木焼印「道中通行手形」 | 白磁染付青花茶碗 | 泊・名物飛び・点点一致の上り |
| 巻ノ弐 | 百種怪談・妖物飛び双六 | 不規則コラージュ（妖怪格は約1.5倍） | 黒漆経巻＋青行灯四灯 | 朱符黒竹筒 | 妖怪札の出目別短冊で查表ジャンプ |
| 巻ノ参 | 英勇揃伊呂波双六 | 傾けた武者札のカード配置 | 黒漆金箔甲胄戦牌＋討入備え | 六角金蒔絵陣中筒 | 兜・太刀・陣太鼓を集めるまで上り不可 |
| 巻ノ肆 | 源氏繪合 | 四色の外周短冊＋善悪二重軌道 | 梨地金蒔絵手文庫＋心学天平 | 朱漆金鶴蒔絵振筒 | 偶の目は善玉、奇の目は悪玉 |

### 巻ノ壱
外側の宿場札を時計回りに進み、中央の「京都・八百善大上り」を目指します。  
紅丸の「泊」は一休み、「飛」の名物格は短冊の距離だけ跳びます。上がりは点数ぴったり。超過すると道中へ弾き返されます。

### 巻ノ弐
妖怪札の右側に `①→3 ②→4 …` の紅短冊があり、止まった妖怪と出目で行き先が決まります。  
青色の半透明ベジェ弧線が、現在地から出目 1〜6 の着地点を事前に示します。妖怪格を踏むと青行灯が一灯消え、四灯すべて消えると次の怪異飛びが二倍になる「百鬼夜行」が発動します。

### 巻ノ参
歌川芳虎『英勇揃伊呂波双六』の戦陣構成を 1:1 の気持ちで再構成。  
武者札は `-7°〜+9°` で微妙に傾き、右下に大きな「出陣」、左上に御前の「上り」を配置。兜・太刀・陣太鼓の三備えが揃うまで上りへ入ると御前に弾き返されます。

### 巻ノ肆
外周はベロ藍・藤黄・珊瑚・藍鼠の四色短冊。  
内部は上段の金色「善玉・源氏雅道」と下段の暗紫「悪玉・修羅道」に分かれ、最後は中央の金地御帘「源氏繪合・上り」へ合流します。偶の目は善玉、奇の目は悪玉へ。

---

## 遊び方

1. 四巻から画帖を選ぶ。
2. 手番（人間／相手）と三枚の懐中守り札を確認して「出陣」。
3. 右側の骰具を押さえて離すか、`Space` キーで骰子を振る。
4. 出目に従って駒が進み、止まった札の規則が発動する。
5. 相手は期待値計算で自動的に手を選ぶ。

### 懐中守り札

- **宿場守り**: 泊を一度無効化
- **妖怪封じ**: 戻り飛びを一度封じる
- **早駕籠**: 出目に +1 歩を加える

### 主な操作

| 操作 | 内容 |
|---|---|
| 骰具を押して離す | 骰子を振る |
| `Space` | 骰子を振る |
| `Esc` | 図鑑／手番選択を閉じる |
| 左側のボタン | 錦絵札図鑑、守り札、巻選択へ |
| 右下の骰具 | 3D 竹筒・茶碗・陣中筒・振筒 |

---

## ディレクトリ

```text
E-Sugoroku/
├── core/
│   ├── esugoroku.h          C11 規則エンジン API
│   ├── esugoroku.c          有向グラフ・ジャンプ・泊・分岐・AI
│   └── test_rules.c         92 項目の C11 回帰テスト
├── mobile/
│   ├── index.html           エントリ
│   ├── manifest.json        PWA マニフェスト
│   ├── _headers             静的ホスティング用 no-cache ヘッダー
│   ├── styles.css           全画面 Canvas と loading 演出
│   ├── fonts.css            オフライン和文フォント宣言
│   ├── assets/
│   │   ├── icon.svg         アプリアイコン
│   │   └── fonts/           Shippori Mincho B1 / Yuji Syuku ほか
│   └── js/
│       ├── state.js         舞台座標・G 状態・存档・効果
│       ├── boards.js        四巻のノード幾何・36 札・3 守り札
│       ├── core.js          JS 規則エンジンと C11 ミラー
│       ├── art_core.js      奉書紙・紋様・雲・波・鳥居・金箔
│       ├── art_figures.js   旅人・美人・武者・妖怪・源氏貴婦
│       ├── art_scenes.js    四巻の場面・名所・静物・上り
│       ├── ukiyoe_art.js    札・こま絵・肖像の公共描画入口
│       ├── board_renderer.js 四版式・UI 皮膚・HUD・3D 骰子・駒
│       ├── ui_screens.js    巻選択・手番／守り札・図鑑・結算
│       ├── audio.js         WebAudio 合成音
│       └── main.js          主循環・物理・AI・入力・E2E hooks
├── server.js                ゼロ依存静的サーバー（既定 8090）
├── Makefile                 build / test / verify / serve
├── tools/
│   ├── test_js_rules.mjs    JS 規則・幾何・札データ回帰
│   ├── test_browser_e2e.py  Chromium E2E（四巻・規則・物理・画面遷移）
│   └── verify_all.py        C11 / JS / ブラウザ一括検証
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

## C11 規則エンジン

`core/esugoroku.h` は汎用有向グラフ API を公開します。

```c
typedef struct EsrNode {
    int next[2];        /* 二又分岐。next[1] = -1 なら一本道 */
    int prev;
    int jump_table[6];  /* 出目 1〜6 の相対飛距離。0 は停止 */
    int stay_turns;
    unsigned tokens;    /* 兜=1, 太刀=2, 陣太鼓=4 など */
    EsrKind kind;
} EsrNode;
```

四つの内蔵モデル:

- `ESR_STYLE_MAWARI` ─ 17 ノード、外周螺旋、超過反弹
- `ESR_STYLE_TOBI` ─ 17 ノード、妖怪查表
- `ESR_STYLE_KESSHU` ─ 18 ノード、三備え集結
- `ESR_STYLE_WAKARE` ─ 19 ノード、善悪分岐

主な API:

```c
void esr_match_init(EsrMatch *m, const EsrBoard *b, int human_side, unsigned charms);
int  esr_apply_roll(EsrBoard *b, EsrMatch *m, int roll, EsrEventList *events);
int  esr_preview_destinations(const EsrBoard *b, const EsrMatch *m,
                              int player, EsrPreview out[6]);
double esr_expected_value(const EsrBoard *b, const EsrMatch *m, int player);
```

`core.js` は同じ規則をブラウザ向けに写した鏡像です。C11 側は数値規則の正本、JS 側は描画・入力・E2E のための実行系として、双方を回帰テストで拘束しています。

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
