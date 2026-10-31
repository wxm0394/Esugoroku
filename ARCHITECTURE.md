# E-Sugoroku Architecture

## 1. Design goals

E-Sugoroku is a standalone browser board game built around four deliberately
different ukiyo-e volumes.  The architecture prioritises:

1. **Four genuinely different boards** — not one grid with four palettes.
2. **Rule parity** — the C11 engine and the JavaScript engine must agree on
   every branch, jump, stay, token gate and win condition.
3. **Print stability** — the paper board is cached; dice, pieces, previews and
   landing effects are the only moving layers.
4. **Offline operation** — no CDN, no remote fonts, no analytics, no external
   image requests.
5. **Deterministic browser tests** — a debug surface drives the same public
   engine used by the UI.

```text
                    ┌──────────────────────────┐
                    │ core/esugoroku.c         │
                    │ C11 graph rules + EV AI  │
                    └────────────┬─────────────┘
                                 │ mirrored contracts
                    ┌────────────▼─────────────┐
                    │ mobile/js/core.js        │
                    │ JS graph rules + EV AI   │
                    └────────────┬─────────────┘
                                 │
      ┌──────────────────────────▼──────────────────────────┐
      │ mobile/js/boards.js                                 │
      │ 4 node graphs · 36 cards · 3 charms · UI metadata   │
      └───────────────┬───────────────────────┬─────────────┘
                      │                       │
        ┌─────────────▼────────────┐  ┌───────▼─────────────┐
        │ board_renderer.js        │  │ main.js             │
        │ cached print + 3D dice   │  │ loop · physics · AI │
        └─────────────┬────────────┘  └───────┬─────────────┘
                      │                       │
      ┌───────────────▼───────────────────────▼─────────────┐
      │ ukiyoe_art.js → art_core.js / figures / scenes      │
      │ washi · bokashi · patterns · figures · scenes       │
      └─────────────────────────────────────────────────────┘
```

## 2. Stage and coordinate model

The browser canvas is sized to the viewport at up to 2× DPR.  All game layout
is authored in a virtual **1280 × 800** stage and centred with a uniform scale.

```text
stage 1280 × 800
┌────────────────────────────────────────────────────────────┐
│ header                                                     │
│ ┌──────────┬──────────────────────────────┬──────────────┐ │
│ │ left     │ board surface                │ right tray   │ │
│ │ panel    │ 800 × 640 local coordinates  │ 264 wide     │ │
│ │ 166 wide │ BOARD_RECT {190,68,800,660}  │              │ │
│ └──────────┴──────────────────────────────┴──────────────┘ │
└────────────────────────────────────────────────────────────┘
```

- `W = 1280`, `H = 800`
- `LEFT_PANEL = { x: 14, y: 68, w: 166, h: 664 }`
- `BOARD_SURFACE = { x: 196, y: 92, w: 788, h: 640 }`
- `RIGHT_PANEL = { x: 1002, y: 68, w: 264, h: 664 }`
- `DICE_TRAY = { x: 1014, y: 432, w: 240, h: 250 }`
- `TUBE_RECT = { x: 1038, y: 542, w: 98, h: 108 }`
- Board-local cards use **800 × 640** coordinates.

`resize()` computes `scale`, `offsetX`, `offsetY`; `toStageXY()` and
`toClientXY()` perform the inverse mapping for pointer input and overlays.

## 3. Board data model

Each volume exports a `Board` object from `mobile/js/boards.js`:

```js
{
  id, volume, style, styleLabel, title, shortTitle,
  start, goal, bounceBack, requiredTokens, maxTurns,
  nodes,                    // ordered directed graph
  cardIds,                  // nine gallery cards
  layout, shape,            // renderer contracts
  ui: {
    skin, panelTitle, panelSub,
    diceDevice, diceShape, hud, hudLabel
  }
}
```

A node is:

```js
{
  id, title, reading, art, kind,
  x, y, w, h,               // 800 × 640 local geometry
  next: [id] | [good, evil],
  prev,
  jumpTable: [six relative jumps],
  stayTurns,
  tokens,                   // bit mask
  stripColor, tilt, komae, palette,
  rule, tokenLabel
}
```

Node kinds: `start`, `normal`, `jump`, `stay`, `token`, `branch`, `good`,
`evil`, `goal`.

### Volume-specific geometry

**巻ノ壱 東海道 — spiral corridor**  
Sixteen cards use a 5×5 ring (`RING_FROM_TOP_LEFT`); the central goal occupies
the full 3×3 interior, so the corridor visibly spirals inward.  Each card is an
arrow-strip shape with a right-hand vertical title slip and a red `泊`/`飛`
seal.  Overshoot bounces.

**巻ノ弐 百種怪談 — irregular collage**  
Cards are hand-placed with mixed sizes; the start card is 190×146 and several
normal cards are ~136×96, giving an intentional 1.4–1.6× size rhythm.  Each
monster card carries a red vertical lookup slip with six rows (`①→X … ⑥→Y`).
The start card's jump table is exposed to the renderer, which draws translucent
Bézier previews for all six die faces.

**巻ノ参 英勇揃伊呂波双六 — tilted warrior cards**  
Fifteen cards are scattered like a hand of karuta; `tilt` ranges from about
-7° to +9°.  The bottom-right `出陣` and top-left `上り` are oversized army
cards.  Every card has a yellow `いろは` roundel in its top-left.  Three token
nodes supply the regalia mask (`兜=1`, `太刀=2`, `陣太鼓=4`).

**巻ノ肆 源氏繪合 — four-colour split tracks**  
Sixteen outer vertical strips cycle through four pigments:
`#5383a6` (ベロ藍), `#e8b954` (藤黄), `#e09879` (珊瑚), `#b8b6a8` (藍鼠).
The branch at node 15 feeds a golden `good` track above and a purple `evil`
track below; both converge on the central gold-curtain goal.

## 4. Rules engine

### Shared contract

The C11 and JS engines operate on a directed graph:

1. Skip turns are consumed before movement.
2. The early-carriage charm adds one step and is consumed.
3. `walk()` advances by the effective step count.  At the goal, `bounceBack`
   reverses direction; otherwise movement stops.
4. Landing resolves in this order:
   - goal lock (regalia requirement),
   - win check,
   - jump table for the rolled face,
   - stay turn,
   - charm guards,
   - same-square duel,
   - token collection,
   - branch selection.
5. The turn passes unless the player won.

### C11 API

```c
typedef enum {
    ESR_STYLE_MAWARI = 0,
    ESR_STYLE_TOBI,
    ESR_STYLE_KESSHU,
    ESR_STYLE_WAKARE
} EsrStyle;

typedef struct EsrNode {
    int next[2];
    int prev;
    int jump_table[6];
    int stay_turns;
    unsigned tokens;
    EsrKind kind;
} EsrNode;
```

The engine exposes board builders, `esr_match_init`, `esr_apply_roll`,
`esr_preview_destinations`, `esr_expected_value` and event collection.

### JavaScript mirror

`mobile/js/core.js` exports `EsugorokuCore`, `ESR_STYLE` and `ESR_CHARM`.
`applyRoll()` returns `{ state, events, won }`.  `previewDestinations()` is
shared by the renderer and E2E tests so the drawn arc and the actual landing
cannot drift apart.

### AI

The opponent evaluates every legal die face with a one-ply expected value:

- +1000 for a win,
- -1000 for an opponent win,
- progress toward the goal,
- regalia tokens weighted positively,
- turns skipped and bounce risk penalised.

The same function is tested in both engines.

## 5. Rendering pipeline

### Static print cache

For each volume, `board_renderer.js` renders the paper, border, patterns,
connectors and every node art into an offscreen canvas once.  The main loop
draws:

1. cached board image,
2. dynamic preview arcs (tobi only),
3. animated pieces,
4. dice vessel,
5. 3D dice,
6. local landing gold-cloud / sakura particles,
7. HUD, stamps and toasts.

Changing volumes invalidates the cache.  Window resize only changes the stage
transform; it does not repaint the print cache.

### Ukiyo-e primitives

| Module | Responsibility |
|---|---|
| `art_core.js` | washi fibres, mica, stains, bokashi, seigaiha, asanoha, ichimatsu, kikkō, sayagata, clouds, Fuji, pines, waves, roofs, torii, lanterns, seals, komae, gold leaf, bamboo, cranes |
| `art_figures.js` | multi-layer Bézier travellers, beauties, warriors, yōkai, Genji ladies, crane pairs |
| `art_scenes.js` | Tōkaidō landmarks and food still lifes, yōkai night, warrior camps and armour, Genji interiors, all four goal scenes |
| `ukiyoe_art.js` | `drawNodeArt`, `drawUkiyoeCard`, `drawCharmCard`, `drawCardBack`, `drawPortrait`, `drawMiniCardArt` |

No stick figures are used.  Even the smallest card art is composed from
overlapping Bézier bodies, robes, hair masses, props and a paper/ink overlay.

### 3D dice

`drawDie3D()` builds a cube from six quads, applies an Euler rotation matrix and
projects vertices with a perspective divide.  It paints backfaces first, then
front faces, ivory grain, pips and a contact shadow.  The resting orientation is
chosen from the die value.

The vessel is drawn by `drawDiceDevice()` and is volume-specific:

| Volume | Vessel |
|---|---|
| Tōkaidō | white porcelain bowl with blue chrysanthemum band |
| Yōkai | black bamboo tube with vermilion talisman |
| Kesshu | hexagonal gold makie army tube |
| Genji | vermilion lacquer tube with golden cranes |

### Stability

While the dice are tumbling:

- no board transform or camera shake is applied,
- no full-screen particles are spawned,
- the board cache is not invalidated,
- only dice, shadows and vessel tilt animate.

Landing effects are emitted at the final node centre with a short lifetime.
The browser suite captures two board crops during a throw and verifies that
fewer than 3.5% of pixels change (the idle pawn bob is the only allowed motion).

## 6. Screens and interaction

`ui_screens.js` renders:

- four-volume selection with mini board previews,
- side/charm selection,
- 36-card and 3-charm gallery,
- settlement panel.

`main.js` owns the state machine:

```text
SELECT_BOARD ──click card──▶ SELECT_SIDE ──出陣──▶ PLAYING
      ▲                         │                    │
      └────────menu/Esc─────────┴────settlement──────┘
```

Input paths:

- pointer down/up on the canvas,
- pointer capture for the dice vessel,
- `Space` to roll,
- `Esc` to close gallery / side screen.

## 7. State and persistence

`state.js` keeps a single `G` object: screen, volume index, match, dice physics,
particles, gallery state, HUD counters and profile cache.

`localStorage` stores collection/unlocks only.  A match is intentionally not
resumed across reloads; this keeps the E2E state deterministic.

## 8. Test surface

`main.js` exposes `window.__ESR__`:

```js
__ESR__.snapshot()                 // geometry, UI, rules, positions, dice
__ESR__.switchToBoard(i)           // deterministic scene switch
__ESR__.applyRollNow(value)        // apply a rule result without waiting
__ESR__.roll(value)                // real physics path with a forced value
__ESR__.settleMove()
__ESR__.setTurn(side)
__ESR__.showGallery(on, tab)
__ESR__.selectRect(index)
__ESR__.boards / cards / charms
```

The browser suite uses only this public debug surface plus real pointer events
for the selection, start, gallery-close and settlement-menu buttons.

## 9. Verification pipeline

```text
verify_all.py
├── layout & independence audit
├── node --check on every JS module
├── gcc -std=c11 -Wall -Wextra -Werror
│   └── core/test_rules.c             92 checks
├── node tools/test_js_rules.mjs       22 tests
└── --browser
    └── test_browser_e2e.py           137 checks
        ├── HTTP headers / MIME
        ├── boot & selection
        ├── four volume contracts
        ├── rule branch matrix
        ├── dice & stability crop diff
        └── gallery / settlement
```

All suites are deterministic: browser tests force die values instead of
waiting for random outcomes.

## 10. Server

`server.js` is a zero-dependency Node HTTP server.  It serves only `mobile/`,
normalises paths to prevent traversal, supports `GET`/`HEAD`, sets strict
no-store and security headers, and maps `manifest.json` to
`application/manifest+json`.

Default address: <http://localhost:8090/>.
