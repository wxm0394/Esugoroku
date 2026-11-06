# E-Sugoroku Architecture (V2.0 Edo–Meiji Historical E-Sugoroku Redesign)

## 1. Design Goals & Canonical Rules Authority

E-Sugoroku is a 3D/2D ukiyo-e tabletop game built around four distinct Edo–Meiji woodblock print volumes plus the Ansei 4 (1857) special variant *Shin Kufu Ken Sugoroku* (`しん工夫けん双六`). See [`docs/EDO_MEIJI_ESUGOROKU_GAMEPLAY_REDESIGN.md`](docs/EDO_MEIJI_ESUGOROKU_GAMEPLAY_REDESIGN.md) for the historical redesign specification and [`docs/GAME_DESIGN_SPEC_V1.1-V2.0.md`](docs/GAME_DESIGN_SPEC_V1.1-V2.0.md) for the full V1.1–V2.0 reference.

1. **Three Explicit Historical Movement Engines (`movementMode: 'mawari' | 'tobi' | 'tobi-mawari'`)**:
   - **`mawari` (廻り双六 / Vol. 1 Tokaido)**: Advances step-by-step along continuous post-station routes (`node.next`) from `振り出し` (Nihonbashi) to `上り` (Kyoto Sanjo Ohashi / Gosho) with `exact-bounce` goal overshoot and both 25-node compact and 55-node complete 53-station (`TOKAIDO_53_FULL_NODES`) scales.
   - **`tobi` (飛び双六 / Vol. 2 Yokai)**: Reads `node.dieDestinations[roll]` (`1..6 -> targetNodeId | null`) directly from the current square (`#0 百物語` to `#24 古御所の妖猫`). Rolling a face whose destination is `null` keeps the pawn in place (`tobi_stay`) and passes the turn.
   - **`tobi-mawari` (飛び廻り双六 / Vol. 3 Kesshu & Vol. 4 Genji)**: Combines continuous step movement along `node.next` with `いろは` kana index jumps (`Vol. 3 英勇揃伊呂波双六`) or literary chapter transitions (`Vol. 4 源氏物語五十四帖・絵合双六`).
2. **Single-Execution Landing Instructions (`executeLandingInstructionOnce`)**:
   - Every square defines structured `landingInstruction: { type: 'rest' | 'moveTo' | 'returnTo' | 'restart' | 'branch', target, turns, kana, badge, text } | null`.
   - Executed at most **once** per turn upon landing so chained jumps can never loop infinitely.
3. **Peaceful Multi-Pawn Coexistence & 2–4 Players (`allowSharedSquare: true`)**:
   - Supports 2–4 players (`playerCount: 2..4`) with cosmetic koma (`旅人・壱, 白狐・弐, 武者・参, 姫・肆`).
   - In `historical` mode, multiple pawns occupy the same square peacefully with zero knockback, zero item theft, and zero combat stances.
4. **Special Historical Variant: 『しん工夫けん双六』（狐拳名所双六, `ruleMode: 'kitsune'`）**:
   - Based on Utagawa Kunisato's Ansei 4 (1857) print. Players choose forward (`順回り`) or reverse (`逆回り`) direction each turn; meeting an opponent on the same square triggers a Kitsune-ken bout (`狐 > 庄屋 > 猟師 > 狐`) where the loser transfers 1 sweet token (`菓子 / kashi`) without knocking pawns back.
5. **Museum Provenance vs. Digital Adaptation (`sourceNote`)**:
   - Every board and node explicitly declares `historicalSource` and `sourceNote: 'museum-verified' | 'historical-adaptation'`.
6. **Cultural Gallery & Optional Legacy Mode (`ruleMode: 'legacy'`)**:
   - All 36 Nishiki-e prints (`UKIYOE_CARDS`), 12 amulets (`CHARMS`), and 24 titles (`ACHIEVEMENTS`) are preserved as a cultural appreciation gallery in historical mode, while `ruleMode: 'legacy'` retains full V1.1–V1.3 tactical compatibility.

---

## 2. Canonical Board & Node Schema (`mobile/js/boards.js`)

```js
// Board contract
{
  id: 'tokaido' | 'yokai' | 'kesshu' | 'genji',
  movementMode: 'mawari' | 'tobi' | 'tobi-mawari',
  start: 0,
  goal: 24, // 54 in Tokaido full53 scale
  startNodeId: 'nihonbashi',
  goalNodeId: 'kyoto_sanjo_gosho',
  goalRule: { type: 'exact-bounce' | 'reach', description: '...' },
  allowSharedSquare: true,
  historicalRequiredTokens: 0,
  historicalSource: '...',
  nodes: [
    {
      id: 0,
      slugId: 'nihonbashi',
      title: '日本橋',
      reading: 'にほんばし',
      illustration: 'nihonbashi',
      caption: '...',
      movementMode: 'mawari' | 'tobi' | 'tobi-mawari',
      next: [1],
      dieDestinations: { 1: 3, 2: null, 3: 4, 4: 1, 5: null, 6: 2 } | null,
      landingInstruction: {
        type: 'rest' | 'moveTo' | 'returnTo' | 'restart' | 'branch',
        target: 'odawara',
        turns: 1,
        kana: 'ち',
        badge: '...',
        text: '...'
      } | null,
      sourceNote: 'museum-verified' | 'historical-adaptation'
    }
  ]
}
```

---

## 3. Verification Pipeline

```text
python3 tools/verify_all.py --browser --port 8090
├── file-layout & independence audit      32 checks
├── node --check on every JS module       18 checks
├── C11 legacy prototype verification     static check (or 92 checks when gcc/cc is installed)
├── node tools/test_js_rules.mjs          66 deterministic unit, reachability & 1,000-match simulation tests
└── tools/test_browser_e2e.py             175 headless Chromium E2E checks
```
