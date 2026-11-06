# E-Sugoroku Architecture (V1.1–V1.3)

## 1. Design Goals & Canonical Rules Authority

E-Sugoroku is a browser tabletop board game built around four distinct ukiyo-e volumes. See [`docs/GAME_DESIGN_SPEC_V1.1-V2.0.md`](docs/GAME_DESIGN_SPEC_V1.1-V2.0.md) for the authoritative V1.1–V2.0 game design specification and [`docs/V1.1-V1.3_ENGINEERING_AUDIT.md`](docs/V1.1-V1.3_ENGINEERING_AUDIT.md) for the engineering audit record.

1. **Four genuinely different boards & volume mechanics** — not one grid with four palettes:
   - **Vol. 1 Tokaido (`tokaido`, 25 nodes, goal `#24`)**: 3 gourmet stations (`#2 泥鰌鍋`, `#7 稲荷寿司`, `#12 宇治茶`) & Travel Coins (`旅銭`) to bypass stays (`泊`) and checkpoint pullbacks (`関所`). Node `#16` (`桑名七里渡`) is a `+2` forward jump (`jumpTable`), not a gourmet station.
   - **Vol. 2 Yokai (`yokai`, 25 nodes, goal `#24`)**: 4 explicit Ao-Andon lantern nodes (`#4, #10, #16, #22`) tracked per player (`lanternMask`), triggering a personal Hyakki Yagyo (`×2` forward jump multiplier, or `×3` with `andon_ward`) on the player's next forward jump.
   - **Vol. 3 Kesshu (`kesshu`, 24 nodes, goal `#23`)**: 3 regalia tokens (`兜=1, 太刀=2, 陣太鼓=4`, required `mask = 7`) required to unlock `#23`, plus 3 interactive combat stances (`assault 猛攻`, `feint 牽制`, `defend 固守`) on same-square clashes.
   - **Vol. 4 Genji (`genji`, 27 nodes, goal `#26`)**: Active route choice at `#15 関屋` between the golden `good` track (`雅道 #16..#20`) and the purple `evil` track (`修羅道 #21..#25`), with roll parity (`even -> good`, `odd -> evil`) retained only as a non-interactive fallback when `pauseOnChoice` is false and no `routeChoice` is preset.
2. **Single Authoritative Browser Rules Engine** — `mobile/js/core.js` + `mobile/js/boards.js` are the sole canonical source of truth for board graphs, 12 charms, fair 1–6 dice (`rollDie`), volume state (`boardState`), and AI decision search (`aiSelectAction` / `expectiminimaxSearch`). `core/esugoroku.c` is retained strictly as a 17–19 node C11 Legacy Prototype.
3. **Unbiased Fair Dice & True Expectiminimax AI** — both Human and AI roll from the exact same rejection-sampled 1–6 generator (`createSeededRng` / `rollDie` with `UNBIASED_U32_LIMIT = 4294967292`, eliminating `2^32 % 6` modulo bias). AI never selects or alters dice faces; difficulty levels (`easy`, `normal`, `hard`, `master`) differ solely in legal pre-roll, post-roll (`reroll`), and pending-choice decision evaluation.
4. **Deterministic Verification Surface** — `window.__ESR__` and `tools/test_js_rules.mjs` drive the exact same pure rules engine used by the UI.

```text
      ┌──────────────────────────────────────────────────────────┐
      │ mobile/js/boards.js                                      │
      │ 4 node graphs (25/25/24/27) · 36 cards · 12 charms       │
      └────────────────────────────┬─────────────────────────────┘
                                   │
      ┌────────────────────────────▼─────────────────────────────┐
      │ mobile/js/core.js (Canonical Rules Engine)               │
      │ Unbiased RNG · 4 volume mechanics · Expectiminimax AI    │
      └────────────────┬───────────────────────────┬─────────────┘
                       │                           │
         ┌─────────────▼────────────┐  ┌───────────▼─────────────┐
         │ tabletop_3d.js           │  │ main.js + state.js      │
         │ Three.js + Ukiyo-e pass  │  │ HUD · choices · v1->v2  │
         └──────────────────────────┘  └─────────────────────────┘
```

---

## 2. Stage and Coordinate Model

The browser canvas is sized to the viewport at up to 2× DPR. All 2D board and overlay layout is authored in a virtual **1280 × 800** stage and centered with a uniform scale:

- `W = 1280`, `H = 800`
- `LEFT_PANEL = { x: 14, y: 68, w: 166, h: 664 }`
- `BOARD_SURFACE = { x: 190, y: 78, w: 800, h: 640 }`
- `RIGHT_PANEL = { x: 1000, y: 68, w: 266, h: 664 }`
- `DICE_TRAY = { x: 1014, y: 432, w: 240, h: 250 }`
- Board-local node rectangles use **800 × 640** coordinates (`0 <= x, y`, `x + w <= 800`, `y + h <= 640`).

---

## 3. Canonical Board Geometry & Data Model

| Volume | Board ID | Node Count | Start ID | Goal ID | Style | Key Nodes & Tactical Data |
|---|---|---:|---:|---:|---|---|
| Vol. 1 東海道 | `tokaido` | **25** | `0` | `24` | `mawari` | Outer 16 stations (`#0..#15`) + inner 8 stations (`#16..#23`) + center goal `#24`. Gourmet stations: `#2, #7, #12` (`gourmetBit = 1, 2, 4`). Exact-landing bounce at `#24`. |
| Vol. 2 百種怪談 | `yokai` | **25** | `0` | `24` | `tobi` | Irregular collage (`#0..#24`), 6-face jump lookup tables (`jumpTable`), 4 Ao-Andon lantern nodes (`#4, #10, #16, #22`, `lanternBit = 1, 2, 4, 8`). |
| Vol. 3 英勇揃 | `kesshu` | **24** | `0` | `23` | `kesshu` | Tilted karuta battlefield (`#0..#23`), 3 regalia tokens (`#4 兜=1`, `#11 太刀=2`, `#18 陣太鼓=4`, `requiredTokens = 3`), 3 clash stances (`assault`, `feint`, `defend`). |
| Vol. 4 源氏繪合 | `genji` | **27** | `0` | `26` | `wakare` | Outer 16 chapters (`#0..#15`), branch at `#15 関屋` into 5 `good` nodes (`#16..#20`) and 5 `evil` nodes (`#21..#25`), converging at `#26 六条院大上り`. |

Each volume exports a `Board` object from `mobile/js/boards.js`:

```js
{
  id, volume, style, styleLabel, title, shortTitle,
  start, goal, bounceBack, requiredTokens, maxTurns,
  nodes,                    // ordered directed graph (25, 25, 24, 27 nodes)
  cardIds,                  // 9 gallery cards per volume (36 total)
  layout, shape,            // renderer contracts
  ui: {
    skin, panelTitle, panelSub,
    diceDevice, diceShape, hud, hudLabel
  }
}
```

---

## 4. Canonical Rules Engine (`mobile/js/core.js`)

### 4.1 Unbiased 1–6 RNG & Rejection Sampling

`createSeededRng(seed)` and `rollDie(rngOrState)` use Mulberry32 32-bit state transitions with rejection sampling:

- `UNBIASED_U32_LIMIT = 4294967292` (`Math.floor(0x100000000 / 6) * 6`, leaving `4` tail values `4294967292..4294967295` rejected).
- Any 32-bit sample `>= UNBIASED_U32_LIMIT` is rejected and re-sampled so every die face `1..6` has an exact mathematical probability of `1/6`.

### 4.2 Nine-Step Single-Ply Resolution Pipeline

1. **Cooldown Tick & Recharge**: Decrement `strikeCooldown` and `charmCooldown`; recharge eligible 4/5-turn charms when cooldown reaches `0`.
2. **Skip Check**: If `skip[player] > 0`, decrement `skip`, emit `skip`, and pass turn.
3. **Pre-Move Modifiers**: Apply active `wind` charm (`+2` steps) or passive `dash` charm (`+1` step, mutually exclusive on the same turn), plus `first_roll` card buff (`+1..+2` steps, capped).
4. **Graph Walk (`walk`)**: Advance step-by-step along `next`. On `tokaido`, overshooting `#24` bounces backward along `prev`. On `genji` `#15`, if `pauseOnChoice` is enabled and no `routeChoice` is preset, pause and emit `pendingChoice = { type: 'genji_branch' }`.
5. **Contact-Node Resource Collection**: Collect regalia tokens (`kesshu`), gourmet bits + Travel Coins (`tokaido` `#2, #7, #12`), Ao-Andon lanterns + personal frenzy standby (`yokai` `#4, #10, #16, #22`), and moral balance / grudge marks (`genji`).
6. **Single Jump-Table Lookup**: Apply `contactNode.jumpTable[roll - 1]` (at most one jump per ply; no recursive chained jumps). Negative jumps can be negated by `guard`, `purify`, or spending 1 Tokaido Travel Coin (`spendCoin`). Positive jumps on `yokai` consume pending personal Hyakki Yagyo (`×2`, or `×3` with `andon_ward`), never on the same turn the 4th lantern was lit.
7. **Stay Penalty**: Apply `contactNode.stayTurns` unless negated by `stay`, `purify`, or spending 1 Tokaido Travel Coin.
8. **Goal & Lock Check**: Reaching `board.goal` checks `requiredTokens`; if locked (`kesshu` without `mask = 7`), push back 1 step to `#22` and emit `goal_locked`. Otherwise award win (`resultReason = 'goal'`).
9. **Universal Same-Square Clash & Max-Ply Settlement**: Landing on the opponent's non-start/non-goal node triggers a clash (`decoy` or `tempShield` blocks; `kesshu` offers 3 stances `assault / feint / defend`; `counter` pushes the attacker back 1 step). Reaching `maxPly` resolves by `getNodeProgress` and volume resource tie-breakers.

### 4.3 Four-Tier Fair AI & Finite-Depth Expectiminimax

All four AI tiers (`easy`, `normal`, `hard`, `master`) use the exact same fair `rollDie` and never inspect or alter upcoming dice outcomes:

- **`easy` (初伝)**: Conservative baseline; randomly picks among safe legal choices and rarely uses active skills.
- **`normal` (中伝)**: Evaluates 1-ply expected value (`expectedValue`) across 6 equiprobable die faces (`1..6`).
- **`hard` (奥伝)**: Combines 1-ply EV with opponent next-turn threat projection (`opponentBestThreat`).
- **`master` (皆伝)**: Runs explicit finite-depth **Expectiminimax search (`expectiminimaxSearch`)** with:
  - **Max Decision Nodes**: Maximizing player chooses among legal actions (`getLegalChoices`).
  - **Min Decision Nodes**: Opponent chooses among legal actions to minimize the maximizing player's utility.
  - **Chance Nodes (1..6)**: Averages over all 6 die outcomes with uniform weight `1/6` (`chanceRollExpectiminimax`).
  - Supports post-roll `reroll` charm evaluation when the realized roll utility falls significantly below the 6-face chance expectation.

### 4.4 C11 Legacy Prototype Boundary

`core/esugoroku.h`, `core/esugoroku.c`, and `core/test_rules.c` represent the initial V1.0 17–19 node C11 prototype. They are preserved for historical reference and optional C toolchain regression testing, while `mobile/js/core.js` + `mobile/js/boards.js` are the sole canonical rules authority for the V1.1–V1.3 application.

---

## 5. Rendering & Audio Architecture

- **3D Tabletop (`mobile/js/tabletop_3d.js`)**: Three.js WebGL scene with 3D porcelain dice bowl, bone die physics with YXZ Euler top-face verification (`evaluateDieTopFaceYXZ`), sumi-e ink splatter particles on wall collisions, and a custom post-processing Ukiyo-e woodblock shader (mulberry washi paper grain + sumi ink edge detection).
- **2D Woodblock & Print Cache (`mobile/js/board_renderer.js`, `mobile/js/nishikie_woodblock.js`, `mobile/js/ukiyoe_art.js`)**: Procedural woodblock illustrations, bokashi gradients, and public-domain ukiyo-e print textures.
- **Procedural Web Audio (`mobile/js/audio.js`)**: Independent Shamisen/Koto ambient BGM synthesizer (`setBgm` / `toggleBgm`) and bone-die / hinoki-komoma wood-on-wood SFX (`tileClack`, `wallHit`, `soulBurst`).

### Runtime Dependency Boundary

All game rules, AI, state persistence, WOFF2 fonts (`mobile/assets/fonts/`), and audio synthesis are 100% local with zero external API calls. The 3D WebGL view imports `three@0.170.0` via `<script type="importmap">` in `mobile/index.html` (`https://cdn.jsdelivr.net/npm/three@0.170.0/`).

---

## 6. Persistence & Profile v1 -> v2 Migration

`mobile/js/state.js` implements idempotent migration (`migrateProfileData`) from `esugoroku.profile.v1` to `esugoroku.profile.v2`, preserving all unlocked cards while validating the 3-charm loadout (`sanitizeCharmLoadout`), custom hand card (`customHandCard`), AI difficulty (`easy | normal | hard | master`), match records (`records`), and 24 achievements (`achievements`).

---

## 7. Verification Pipeline

```text
python3 tools/verify_all.py --browser --port 8090
├── file-layout & independence audit      32 checks
├── node --check on every JS module       18 checks
├── C11 legacy prototype verification     static check (or 92 checks when gcc/cc is installed)
├── node tools/test_js_rules.mjs          55 deterministic unit & batch simulation tests
└── tools/test_browser_e2e.py             157 headless Chromium E2E checks
    ├── HTTP headers / CSP / MIME / PWA manifest
    ├── boot, 12-charm pool, 24 achievements & volume selection
    ├── four volume contracts (25 / 25 / 24 / 27 nodes, goals #24 / #24 / #23 / #26)
    ├── rule branch matrix (Tokaido coins/bounce, Yokai 4 lanterns, Kesshu 3 stances, Genji active choice + parity fallback)
    ├── 3D dice Euler alignment, 3-slot charm loadout & master Expectiminimax switch
    └── gallery, achievements & settlement flows
```
