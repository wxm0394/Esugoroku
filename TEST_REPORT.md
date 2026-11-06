# 江戸—明治 浮世絵・絵双六 (E-Sugoroku V2.0) — 実測テスト・検証レポート

実行日時: `2026-11-06`  
対象ブランチ: `quality/v1.1-v1.3-consistency`  
対象仕様書:
- [`docs/EDO_MEIJI_ESUGOROKU_GAMEPLAY_REDESIGN.md`](docs/EDO_MEIJI_ESUGOROKU_GAMEPLAY_REDESIGN.md)（江戸—明治期 絵双六玩法再設計仕様書）
- [`docs/GAME_DESIGN_SPEC_V1.1-V2.0.md`](docs/GAME_DESIGN_SPEC_V1.1-V2.0.md)（V1.1〜V2.0 設計仕様書）

---

## 1. 総合検証サマリ (`python3 tools/verify_all.py --browser --port 8090`)

| 検証スイート | 実行コマンド | 結果 | チェック数 |
|---|---|---|---:|
| 1. ファイル構成・四巻独立性監査 | `tools/verify_all.py` (layout) | **PASS** | **32 / 32** |
| 2. JavaScript ES Modules 構文検証 | `node --check` (全18モジュール) | **PASS** | **18 / 18** |
| 3. C11 レガシープロトタイプ検証 | `tools/verify_all.py` (static/C11) | **PASS (Static)** | **0 errors** |
| 4. JS 規則単体・到達性・1,000局シミュレーション | `node tools/test_js_rules.mjs` | **PASS** | **66 / 66** |
| 5. ブラウザ E2E 検証 (Headless Chromium) | `python3 tools/test_browser_e2e.py --port 8090` | **PASS** | **221 / 221** |
| **合計** | `python3 tools/verify_all.py --browser --port 8090` | **5 / 5 Suites PASS** | **337 / 337** |

---

## 2. 江戸—明治 絵双六再設計 (V2.0) 検証項目

### 2.1 三種の歴史移動エンジン (`movementMode`) と単発落格指示 (`landingInstruction`)
- **`mawari`（廻り双六 / 巻ノ壱 東海道五十三次道中双六）**:
  - 三重県総合博物館蔵《東海道五十三駅道中記細見雙六》に倣い、日本橋（振り出し）から京都三条大橋・御所（上り）へ宿場を巡る。
  - 25格「道中略式」と **55格「東海道五十三次完本（日本橋＋53宿場＋京都三条大橋）」** の即時切替 (`setTokaidoRouteScale('compact' | 'full53')`) を検証。
  - 川止め・宿場泊の `rest`（一回休み）、箱根関所手形忘れの `returnTo: 'odawara'`、四日市からの `moveTo: 'seki'` が1ターンにつき最大1回のみ実行され、無限連鎖しないことを確認。
  - 上り丁度止まり（`goalRule.type = 'exact-bounce'`）と余り目折り返しを検証。
- **`tobi`（飛び双六 / 巻ノ弐 百種怪談妖物双六）**:
  - 東京学芸大学蔵《百種怪談妖物双六》（E120200301）に倣い、`#0 百物語` を振り出し、`#24 古御所の妖猫` を上りとして構成。
  - 全格が明示的な `dieDestinations: { 1..6: targetNodeId | null }` を保持し、**飛び先が `null` の出目を振った場合はその場に留まり (`tobi_stay`) 手番が移る**ことを単体テストおよびブラウザ E2E で検証。
- **`tobi-mawari`（飛び廻り双六 / 巻ノ参 英勇揃伊呂波双六・巻ノ肆 源氏物語五十四帖）**:
  - 巻ノ参は `いろは` 仮名見出し（`い`〜`上り`）と仮名送り指示、巻ノ肆は源氏物語の帖順と和歌・物語分岐（`#15 関屋`）で構成。
  - 歴史モード（`ruleMode: 'historical'`）では武具ロック（`requiredTokens = 0`）、同格撃退、武具奪取、善悪スコア、怨念印が発生しないことを検証。

### 2.2 複数駒の同格共存 (`allowSharedSquare: true`) と 2〜4人対局
- 全四巻で複数の木駒が同じ格に平和的に同居でき、自動撃退やアイテム強奪が発生しないことを確認。
- 2人・3人・4人対局（外観木駒：旅人・白狐・武者・姫）の手番ローテーション（`0 → 1 → 2 → 3 → 0`）と 3D こけし駒描画を検証。

### 2.3 特別歴史変体：安政4年（1857）歌川国郷『しん工夫けん双六』（狐拳名所双六）
- 独立モード `ruleMode: 'kitsune'` として実装。
- 順回り・逆回りの双方向移動選択と、同じ格で行き逢った際の「狐 ＞ 庄屋 ＞ 猟師 ＞ 狐」の狐拳勝負により、負けた側が菓子（`kashi` 点棒）を1つ渡す（駒の撃退なし、上り先着勝利）ことを検証。

### 2.4 有向グラフ到達性検証と 1,000局自動シミュレーション
- `EsugorokuCore.verifyBoardReachability`: 四巻すべて（および東海道 55格完本）において、振り出しから全ノードが到達可能であり、全ノードから上りへ到達可能（デッドエンド `0` 件・無限ループ `0` 件）であることを検証。
- `EsugorokuCore.runHistoricalSimulation`: 四巻 × 各250局 ＝ **計1,000局**のシード固定自動対局を実行し、**完走率 100% (`1000 / 1000`)・無限ループ 0 件**を確認。
