// Authoritative Pure Rules Engine for E-Sugoroku (V1.1–V2.0 Specification).
//
// Responsibilities:
//   * Uniform fair 1..6 die generation (`rollDie`) with seedable deterministic PRNG (`createSeededRng`)
//   * Directed graph movement with bounce-back, branch choices, and contact-node resolution
//   * 12 pocket charms (`ESR_CHARM`) with per-owner turn cooldowns & once-per-match locks
//   * Volume-specific active mechanics:
//       - Vol.1 Tokaido: 3 gourmet bitmasks + Travel Coins (旅銭) to cancel stay/checkpoint penalties
//       - Vol.2 Yokai: 4 Ao-Andon lantern nodes (#4, #10, #16, #22) + personal Hyakki Yagyo (×2 / ×3 jump)
//       - Vol.3 Kesshu: 3 regalia gate + 3 combat stances (assault 猛攻 / feint 牽制 / defend 固守)
//       - Vol.4 Genji: Active branch choice at #15 (good 雅道 / evil 修羅道) + moral balance & grudge marks
//   * Max-ply timeout settlement (`resultReason: 'goal' | 'max_ply'`)
//   * Unified simulation & preview (`simulateTurn`, `previewDestinations`, `previewOutcomes`)
//   * Fair AI tactical decision engine (` easy | normal | hard | master ` Expectiminimax)
//
// Nothing in this file touches the DOM, Canvas, or WebAudio.

import { CHARMS, CHARM_BY_ID } from './boards.js';

export const ESR_STYLE = Object.freeze({
  MAWARI: 'mawari',
  TOBI: 'tobi',
  KESSHU: 'kesshu',
  WAKARE: 'wakare',
});

export const ESR_CHARM = Object.freeze({
  STAY: 1,
  GUARD: 2,
  DASH: 4,
  REROLL: 8,
  DECOY: 16,
  COUNTER: 32,
  WIND: 64,
  PURIFY: 128,
  TOKAIDO_PASS: 256,
  ANDON_WARD: 512,
  GUNBAI_SEAL: 1024,
  WAKA_SLIP: 2048,
});

const ONCE_PER_MATCH_MASK =
  ESR_CHARM.REROLL |
  ESR_CHARM.TOKAIDO_PASS |
  ESR_CHARM.ANDON_WARD |
  ESR_CHARM.GUNBAI_SEAL;

const STYLE_TO_C = Object.freeze({
  mawari: 0,
  tobi: 1,
  kesshu: 2,
  wakare: 3,
});

export const EVENT = Object.freeze({
  MOVE: 'move',
  JUMP: 'jump',
  STAY: 'stay',
  TOKEN: 'token',
  GOURMET: 'gourmet',
  COIN_SPENT: 'coin_spent',
  LANTERN: 'lantern',
  FRENZY_READY: 'frenzy_ready',
  FRENZY_USED: 'frenzy_used',
  DUEL: 'duel',
  STEAL: 'steal',
  STANCE: 'stance',
  STRIKE: 'strike',
  RECHARGE: 'recharge',
  BOUNCE: 'bounce',
  GOAL_LOCKED: 'goal_locked',
  WIN: 'win',
  TIMEOUT: 'timeout',
  SKIP: 'skip',
  CHARM: 'charm',
  REROLL: 'reroll',
  CUSTOM_BUFF: 'custom_buff',
  BRANCH_GOOD: 'branch_good',
  BRANCH_EVIL: 'branch_evil',
  BRANCH_CHOICE: 'branch_choice',
  PENDING_CHOICE: 'pending_choice',
});

/* ------------------------------------------------------------------ */
/* Fair Dice & Seeded Deterministic PRNG (V1.1 Section 2.1)            */
/* ------------------------------------------------------------------ */

/**
 * Largest multiple of 6 in [0, 2^32):
 * 2^32 = 4294967296 = 6 * 715827882 + 4 -> UNBIASED_U32_LIMIT = 4294967292.
 * Any uint32 sample >= UNBIASED_U32_LIMIT is rejected so 1..6 have exact 1/6 probability.
 */
export const UNBIASED_U32_LIMIT = 4294967292;

export function isUnbiasedDieSample(u32) {
  const val = Number(u32) >>> 0;
  return val < UNBIASED_U32_LIMIT;
}

export function nextRngState(stateWord) {
  let t = ((stateWord >>> 0) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
  const uint32 = (t ^ (t >>> 14)) >>> 0;
  const floatVal = uint32 / 4294967296;
  return { nextState: t >>> 0, uint32, value: floatVal };
}

export function createSeededRng(seed = 0x12345678) {
  let state = (Number(seed) >>> 0) || 0x12345678;
  const nextU32 = () => {
    const step = nextRngState(state);
    state = step.nextState;
    return step.uint32;
  };
  const api = () => nextU32() / 4294967296;
  api.nextUint32 = nextU32;
  api.nextFloat = api;
  api.rollDie = () => {
    for (let guard = 0; guard < 32; guard++) {
      const u32 = nextU32();
      if (u32 < UNBIASED_U32_LIMIT) {
        return 1 + (u32 % 6);
      }
    }
    return 1 + (nextU32() % 6);
  };
  api.getState = () => state >>> 0;
  api.setState = s => { state = (Number(s) >>> 0) || 1; };
  return api;
}

/**
 * Uniform 1..6 die generator with Rejection Sampling used identically by Human, AI, and Local 2P.
 * Supports:
 *   - `rollDie(rngFn)` where `rngFn()` returns [0, 1) or 1..6
 *   - `rollDie(seededRngObj)`
 *   - `rollDie(matchState)` which advances `matchState.rngState` deterministically via rejection sampling
 *   - `rollDie()` using browser CSPRNG with rejection sampling (`u32 < 4294967292`)
 */
export function rollDie(rng = null) {
  if (typeof rng === 'function') {
    if (typeof rng.rollDie === 'function') {
      return rng.rollDie();
    }
    const v = rng();
    if (Number.isInteger(v) && v >= 1 && v <= 6) return v;
    return 1 + Math.floor(Math.max(0, Math.min(0.9999999, Number(v) || 0)) * 6);
  }
  if (rng && typeof rng.rollDie === 'function') {
    return rng.rollDie();
  }
  if (rng && typeof rng.nextFloat === 'function') {
    return 1 + Math.floor(rng.nextFloat() * 6);
  }
  if (rng && typeof rng === 'object' && Number.isInteger(rng.rngState)) {
    for (let guard = 0; guard < 32; guard++) {
      const step = nextRngState(rng.rngState);
      rng.rngState = step.nextState;
      if (step.uint32 < UNBIASED_U32_LIMIT) {
        return 1 + (step.uint32 % 6);
      }
    }
    const fallback = nextRngState(rng.rngState);
    rng.rngState = fallback.nextState;
    return 1 + (fallback.uint32 % 6);
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    for (let guard = 0; guard < 32; guard++) {
      globalThis.crypto.getRandomValues(buf);
      if (buf[0] < UNBIASED_U32_LIMIT) {
        return 1 + (buf[0] % 6);
      }
    }
    globalThis.crypto.getRandomValues(buf);
    return 1 + (buf[0] % 6);
  }
  return 1 + Math.floor(Math.random() * 6);
}

/* ------------------------------------------------------------------ */
/* State Cloning & Helpers                                             */
/* ------------------------------------------------------------------ */

function defaultBoardState() {
  return {
    tokaido: { gourmetMask: [0, 0], coins: [0, 0], coinsSpent: [0, 0] },
    yokai: { lanternMask: [0, 0], frenzyPending: [false, false], frenzyEarned: [false, false], frenzyTriggered: [false, false] },
    kesshu: { tempShield: [false, false], lastStance: [null, null], stanceCount: [0, 0] },
    genji: { routeChoice: [null, null], balance: [0, 0], grudgeMarks: [0, 0] },
  };
}

export function cloneState(state) {
  const bs = state?.boardState || defaultBoardState();
  return {
    ...state,
    pos: [...(state?.pos || [0, 0])],
    tokens: [...(state?.tokens || [0, 0])],
    skip: [...(state?.skip || [0, 0])],
    charms: [...(state?.charms || [0, 0])],
    charmUsed: [...(state?.charmUsed || [0, 0])],
    charmLoadout: Array.isArray(state?.charmLoadout)
      ? [
          Array.isArray(state.charmLoadout[0]) ? [...state.charmLoadout[0]] : [],
          Array.isArray(state.charmLoadout[1]) ? [...state.charmLoadout[1]] : [],
        ]
      : [[], []],
    charmCooldown: Array.isArray(state?.charmCooldown)
      ? [{ ...(state.charmCooldown[0] || {}) }, { ...(state.charmCooldown[1] || {}) }]
      : [{}, {}],
    windActive: [...(state?.windActive || [false, false])],
    customCard: state?.customCard || null,
    customBuff: state?.customBuff ? { ...state.customBuff } : null,
    equippedCard: Array.isArray(state?.equippedCard) ? [...state.equippedCard] : [state?.customCard || null, null],
    playerBuffs: Array.isArray(state?.playerBuffs)
      ? [
          state.playerBuffs[0] ? { ...state.playerBuffs[0] } : null,
          state.playerBuffs[1] ? { ...state.playerBuffs[1] } : null,
        ]
      : [state?.customBuff ? { ...state.customBuff } : null, null],
    strikeCooldown: [...(state?.strikeCooldown || [0, 0])],
    duelCount: state?.duelCount || 0,
    stealCount: [...(state?.stealCount || [0, 0])],
    ply: state?.ply ?? state?.turnCount ?? 0,
    maxPly: state?.maxPly || 120,
    playerTurnCount: [...(state?.playerTurnCount || [0, 0])],
    pendingChoice: state?.pendingChoice ? { ...state.pendingChoice } : null,
    resultReason: state?.resultReason || null,
    rngSeed: state?.rngSeed ?? 0x12345678,
    rngState: state?.rngState ?? state?.rngSeed ?? 0x12345678,
    boardState: {
      tokaido: {
        gourmetMask: [...(bs.tokaido?.gourmetMask || [0, 0])],
        coins: [...(bs.tokaido?.coins || [0, 0])],
        coinsSpent: [...(bs.tokaido?.coinsSpent || [0, 0])],
      },
      yokai: {
        lanternMask: [...(bs.yokai?.lanternMask || [0, 0])],
        frenzyPending: [...(bs.yokai?.frenzyPending || [false, false])],
        frenzyEarned: [...(bs.yokai?.frenzyEarned || [false, false])],
        frenzyTriggered: [...(bs.yokai?.frenzyTriggered || [false, false])],
      },
      kesshu: {
        tempShield: [...(bs.kesshu?.tempShield || [false, false])],
        lastStance: [...(bs.kesshu?.lastStance || [null, null])],
        stanceCount: [...(bs.kesshu?.stanceCount || [0, 0])],
      },
      genji: {
        routeChoice: [...(bs.genji?.routeChoice || [null, null])],
        balance: [...(bs.genji?.balance || [0, 0])],
        grudgeMarks: [...(bs.genji?.grudgeMarks || [0, 0])],
      },
    },
    history: [...(state?.history || [])],
    events: [],
  };
}

function getPlayerBuff(state, player) {
  if (Array.isArray(state?.playerBuffs) && state.playerBuffs[player]) {
    return state.playerBuffs[player];
  }
  if (state?.customBuff && player === (state.humanSide ?? 0)) {
    return state.customBuff;
  }
  return null;
}

function hasCustomBuff(state, player) {
  return Boolean(getPlayerBuff(state, player));
}

function nodeAt(board, index) {
  return board.nodes[index] || board.nodes[board.goalIndex ?? board.goal];
}

function pushEvent(events, type, player, from, to, roll, extra = {}) {
  events.push({
    type,
    player,
    from,
    to,
    roll,
    source: extra.source || type,
    payload: { ...extra },
    ...extra,
  });
}

function hasCharm(state, player, charmMask) {
  return ((state.charms[player] | 0) & charmMask) !== 0 &&
    ((state.charmUsed[player] | 0) & charmMask) === 0;
}

function consumeCharm(state, player, charmMask) {
  state.charmUsed[player] = (state.charmUsed[player] | 0) | charmMask;
  const charmDef = CHARMS.find(c => c.mask === charmMask);
  if (charmDef) {
    if (charmDef.oncePerMatch || (charmMask & ONCE_PER_MATCH_MASK) !== 0) {
      state.charmCooldown[player][charmDef.id] = -1; // non-rechargeable
    } else {
      const buff = getPlayerBuff(state, player);
      const fastRecharge = buff && (buff.rechargePeriod | 0) > 0 && buff.rechargePeriod <= 4;
      const baseCd = charmDef.cooldownTurns || 4;
      state.charmCooldown[player][charmDef.id] = fastRecharge ? Math.max(2, Math.floor(baseCd / 2)) : baseCd;
    }
  }
}

function clampNode(board, index) {
  if (index < 0) return board.start;
  if (index >= board.nodes.length) return board.goal;
  return index;
}

function stepBackward(board, fromPos, steps) {
  let cur = fromPos;
  for (let i = 0; i < steps; i++) {
    const prev = nodeAt(board, cur)?.prev;
    if (prev === undefined || prev === null || prev < 0) {
      cur = board.start;
      break;
    }
    cur = prev;
  }
  return cur;
}

function popcountMask(mask) {
  let m = mask | 0;
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}

function popcount3(mask) {
  return ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0);
}

export function getNodeProgress(board, index) {
  const n = nodeAt(board, index);
  if (!n) return 0;
  if (typeof n.progressValue === 'number') return n.progressValue;
  return index;
}

/*
 * Walk `steps` along the graph. On mawari boards entering the goal before
 * the last step turns the walk around and retraces previous nodes.
 * On wakare (Genji #15), uses explicit routeChoice ('good' | 'evil') if chosen,
 * or falls back to roll parity if unchosen in non-interactive calls.
 */
function walk(board, start, steps, roll, player, branchGood, pauseOnBranch = false) {
  let pos = start;
  let direction = 1;
  let bounced = false;
  let branchSeen = false;
  const path = [start];
  const events = [];

  for (let step = 0; step < steps; step++) {
    if (direction < 0) {
      const prev = nodeAt(board, pos).prev;
      if (prev === undefined || prev === null || prev < 0) break;
      pos = prev;
      path.push(pos);
      continue;
    }

    if (pos === board.goal) {
      if (!board.bounceBack) break;
      const prev = nodeAt(board, pos).prev;
      if (prev === undefined || prev === null || prev < 0) break;
      direction = -1;
      pos = prev;
      path.push(pos);
      if (!bounced) {
        bounced = true;
        pushEvent(events, EVENT.BOUNCE, player, board.goal, pos, roll, {
          remaining: steps - step,
        });
      }
      continue;
    }

    const node = nodeAt(board, pos);
    const next = Array.isArray(node.next) ? node.next : [];
    if (next.length === 0) break;
    if (next.length > 1 && board.style === ESR_STYLE.WAKARE && pauseOnBranch) {
      return {
        pos,
        path,
        events,
        bounced,
        pausedAtBranch: true,
        remainingSteps: steps - step,
      };
    }
    let edge = 0;
    if (next.length > 1) {
      edge = board.style === ESR_STYLE.WAKARE ? (branchGood ? 0 : 1) : 0;
      if (!branchSeen) {
        branchSeen = true;
        pushEvent(
          events,
          branchGood ? EVENT.BRANCH_GOOD : EVENT.BRANCH_EVIL,
          player,
          pos,
          next[edge],
          roll,
          { edge, route: branchGood ? 'good' : 'evil' },
        );
      }
    }
    pos = next[edge];
    if (!Number.isInteger(pos) || pos < 0 || pos >= board.nodes.length) {
      pos = board.goal;
      path.push(pos);
      break;
    }
    path.push(pos);
  }
  return { pos, path, events, bounced, pausedAtBranch: false, remainingSteps: 0 };
}

/* ------------------------------------------------------------------ */
/* Kesshu Combat Stance & Universal Clash Resolution                   */
/* ------------------------------------------------------------------ */

function resolveSameSquareClash(board, state, player, pos, roll, events, options = {}) {
  const opponent = 1 - player;
  if (state.pos[opponent] !== pos || pos === board.start || pos === board.goal) {
    return { paused: false };
  }

  // Defender Decoy Charm (替身符) or Kesshu temporary shield cancels push & steal
  if (hasCharm(state, opponent, ESR_CHARM.DECOY)) {
    consumeCharm(state, opponent, ESR_CHARM.DECOY);
    pushEvent(events, EVENT.CHARM, opponent, pos, pos, roll, {
      charm: 'decoy',
      blockedAttacker: player,
    });
    return { paused: false };
  }

  if (board.id === 'kesshu' && state.boardState.kesshu.tempShield[opponent]) {
    state.boardState.kesshu.tempShield[opponent] = false;
    pushEvent(events, EVENT.STANCE, opponent, pos, pos, roll, {
      effect: 'shield_blocked',
      blockedAttacker: player,
    });
    return { paused: false };
  }

  // On Kesshu, if interactive choice mode is requested and no stance was passed yet, pause for choice
  if (board.id === 'kesshu' && options.pauseOnChoice && !options.stance) {
    const oppTokens = state.tokens[opponent] | 0;
    const myTokens = state.tokens[player] | 0;
    const stealableMask = oppTokens & ~myTokens;
    state.pendingChoice = {
      type: 'kesshu_stance',
      player,
      opponent,
      pos,
      square: pos,
      roll,
      stealableMask,
      options: ['assault', 'feint', 'defend'],
    };
    pushEvent(events, EVENT.PENDING_CHOICE, player, pos, pos, roll, {
      choiceType: 'kesshu_stance',
      options: ['assault', 'feint', 'defend'],
    });
    return { paused: true };
  }

  const stance = board.id === 'kesshu' ? (options.stance || 'assault') : 'standard';
  const buff = getPlayerBuff(state, player);
  const duelPushBonus = buff ? (buff.duelPushBonus | 0) : 0;
  const duelAdvance = buff ? (buff.duelAdvance | 0) : 0;

  let basePush = pos >= 4 ? (board.clashPush || 2) : 1;
  let allowSteal = board.id === 'kesshu';

  if (board.id === 'kesshu') {
    state.boardState.kesshu.lastStance[player] = stance;
    state.boardState.kesshu.stanceCount[player] = (state.boardState.kesshu.stanceCount[player] | 0) + 1;
    if (stance === 'feint') {
      basePush = 1;
      allowSteal = false;
      state.boardState.kesshu.tempShield[player] = true;
    } else if (stance === 'defend') {
      basePush = 0;
      allowSteal = false;
      state.boardState.kesshu.tempShield[player] = true;
    } else {
      // 'assault' (猛攻): push 3 squares (or 1 near start to match early-board clamp)
      basePush = pos >= 4 ? (board.clashPush || 3) : 1;
      allowSteal = true;
    }
    pushEvent(events, EVENT.STANCE, player, pos, pos, roll, {
      stance,
      tempShield: state.boardState.kesshu.tempShield[player],
    });
  }

  const pushSteps = basePush > 0 ? basePush + duelPushBonus : 0;
  const pushed = pushSteps > 0 ? stepBackward(board, state.pos[opponent], pushSteps) : state.pos[opponent];
  state.pos[opponent] = pushed;
  state.duelCount = (state.duelCount || 0) + 1;

  // Regalia theft on Kesshu when stance === 'assault'
  let stolenBit = 0;
  if (allowSteal) {
    const oppTokens = state.tokens[opponent] | 0;
    const myTokens = state.tokens[player] | 0;
    const stealable = oppTokens & ~myTokens;
    if (stealable !== 0) {
      if (hasCharm(state, opponent, ESR_CHARM.GUNBAI_SEAL)) {
        consumeCharm(state, opponent, ESR_CHARM.GUNBAI_SEAL);
        pushEvent(events, EVENT.CHARM, opponent, pos, pos, roll, {
          charm: 'gunbai_seal',
          protectedTokens: stealable,
        });
      } else {
        if (options.stealBit && (stealable & options.stealBit)) {
          stolenBit = options.stealBit;
        } else {
          stolenBit = stealable & -stealable; // lowest set bit
        }
        state.tokens[opponent] &= ~stolenBit;
        state.tokens[player] |= stolenBit;
        state.stealCount[player] = (state.stealCount[player] | 0) + 1;
        pushEvent(events, EVENT.STEAL, player, pos, pushed, roll, {
          opponent,
          stolenBit,
        });
      }
    }
  }

  if (duelAdvance > 0 && pushSteps > 0 && pos < board.goal - 1) {
    const nextStep = (nodeAt(board, pos)?.next || [])[0];
    if (Number.isInteger(nextStep) && nextStep > pos && nextStep < board.goal) {
      state.pos[player] = nextStep;
      pos = nextStep;
    }
  }

  pushEvent(events, EVENT.DUEL, player, pos, pushed, roll, {
    opponent,
    stance,
    pushSteps,
    duelPushBonus,
    duelAdvance,
    stolenBit,
  });

  if ((duelPushBonus > 0 || duelAdvance > 0) && pushSteps > 0 && buff) {
    pushEvent(events, EVENT.CUSTOM_BUFF, player, pos, pushed, roll, {
      effect: 'duel_master',
      duelPushBonus,
      duelAdvance,
      cardId: buff.cardId,
      buffName: buff.name,
    });
  }

  // Defender Counter Charm (反撃符): pushes attacker back 1 square after being hit (unless attacker chose 'defend')
  if (pushSteps > 0 && stance !== 'defend' && hasCharm(state, opponent, ESR_CHARM.COUNTER)) {
    consumeCharm(state, opponent, ESR_CHARM.COUNTER);
    const counterFrom = state.pos[player];
    const counterTo = stepBackward(board, counterFrom, 1);
    state.pos[player] = counterTo;
    pushEvent(events, EVENT.CHARM, opponent, counterFrom, counterTo, roll, {
      charm: 'counter',
      pushedPlayer: player,
      from: counterFrom,
      to: counterTo,
    });
  }

  return { paused: false };
}

/* ------------------------------------------------------------------ */
/* Contact-Node & Landing Resolution (V1.1 Section 2.3)                */
/* ------------------------------------------------------------------ */

function resolveLanding(board, state, player, contactPos, roll, events, options = {}) {
  let pos = contactPos;
  const contactNode = nodeAt(board, contactPos);
  const buff = getPlayerBuff(state, player);
  let earnedFrenzyThisTurn = false;

  // Step 6: Contact-node resource & collection features (before jump-table lookup)
  if (contactPos !== board.goal) {
    // 6a. Regalia / board tokens on contact node
    if ((contactNode.tokens | 0) !== 0) {
      state.tokens[player] = (state.tokens[player] | 0) | contactNode.tokens;
      pushEvent(events, EVENT.TOKEN, player, contactPos, contactPos, roll, {
        tokens: contactNode.tokens,
        label: contactNode.tokenLabel || '',
      });
    }

    // 6b. Vol.1 Tokaido Gourmet & Travel Coins (旅銭)
    if (board.id === 'tokaido' && (contactNode.gourmetBit | 0) !== 0) {
      const bit = contactNode.gourmetBit | 0;
      const prevMask = state.boardState.tokaido.gourmetMask[player] | 0;
      if ((prevMask & bit) === 0) {
        state.boardState.tokaido.gourmetMask[player] = prevMask | bit;
        state.boardState.tokaido.coins[player] = Math.min(3, (state.boardState.tokaido.coins[player] | 0) + 1);
        pushEvent(events, EVENT.GOURMET, player, contactPos, contactPos, roll, {
          gourmetBit: bit,
          gourmetMask: state.boardState.tokaido.gourmetMask[player],
          coins: state.boardState.tokaido.coins[player],
          title: contactNode.title,
        });
      }
    }

    // 6c. Vol.2 Yokai 4 Ao-Andon Lanterns (#4, #10, #16, #22)
    if (board.id === 'yokai' && (contactNode.lanternBit | 0) !== 0) {
      const bit = contactNode.lanternBit | 0;
      const prevMask = state.boardState.yokai.lanternMask[player] | 0;
      if ((prevMask & bit) === 0) {
        const nextMask = prevMask | bit;
        state.boardState.yokai.lanternMask[player] = nextMask;
        pushEvent(events, EVENT.LANTERN, player, contactPos, contactPos, roll, {
          lanternBit: bit,
          lanternMask: nextMask,
          count: popcountMask(nextMask),
        });
        if ((nextMask & 15) === 15 && !state.boardState.yokai.frenzyEarned[player]) {
          state.boardState.yokai.frenzyEarned[player] = true;
          state.boardState.yokai.frenzyPending[player] = true;
          earnedFrenzyThisTurn = true;
          pushEvent(events, EVENT.FRENZY_READY, player, contactPos, contactPos, roll, {
            lanternMask: nextMask,
          });
        }
      }
    }

    // 6d. Vol.4 Genji Moral Balance & Grudge Marks
    if (board.id === 'genji') {
      if (contactNode.kind === 'good') {
        state.boardState.genji.balance[player] = (state.boardState.genji.balance[player] || 0) + 1;
      } else if (contactNode.kind === 'evil') {
        state.boardState.genji.balance[player] = (state.boardState.genji.balance[player] || 0) - 1;
        state.boardState.genji.grudgeMarks[player] = (state.boardState.genji.grudgeMarks[player] | 0) + 1;
      }
    }
  }

  // Step 7: Single jump-table lookup on the contact node
  if (contactPos !== board.goal) {
    const table = Array.isArray(contactNode.jumpTable) ? contactNode.jumpTable : [];
    const jump = Number(table[roll - 1] || 0);
    if (jump !== 0) {
      let cancelled = false;
      if (jump < 0) {
        // Guard charm or Purify charm cancels negative jump
        if (hasCharm(state, player, ESR_CHARM.GUARD)) {
          consumeCharm(state, player, ESR_CHARM.GUARD);
          cancelled = true;
          pushEvent(events, EVENT.CHARM, player, contactPos, contactPos, roll, {
            charm: 'guard',
          });
        } else if (hasCharm(state, player, ESR_CHARM.PURIFY) && options.purifyTarget !== 'stay') {
          consumeCharm(state, player, ESR_CHARM.PURIFY);
          cancelled = true;
          pushEvent(events, EVENT.CHARM, player, contactPos, contactPos, roll, {
            charm: 'purify',
            cancelledEffect: 'jump',
          });
        } else if (board.id === 'tokaido' && (state.boardState.tokaido.coins[player] | 0) > 0) {
          if (options.spendCoin === true) {
            state.boardState.tokaido.coins[player] -= 1;
            state.boardState.tokaido.coinsSpent[player] = (state.boardState.tokaido.coinsSpent[player] | 0) + 1;
            cancelled = true;
            pushEvent(events, EVENT.COIN_SPENT, player, contactPos, contactPos, roll, {
              reason: 'checkpoint',
              remainingCoins: state.boardState.tokaido.coins[player],
            });
          } else if (options.pauseOnChoice && options.spendCoin === undefined) {
            state.pendingChoice = {
              type: 'tokaido_coin',
              subType: 'checkpoint',
              reason: 'checkpoint',
              player,
              pos: contactPos,
              square: contactPos,
              roll,
              jump,
              delta: jump,
              RetreatTo: clampNode(board, contactPos + jump),
              coins: state.boardState.tokaido.coins[player],
              options: ['spend_coin', 'accept_penalty'],
            };
            pushEvent(events, EVENT.PENDING_CHOICE, player, contactPos, contactPos, roll, {
              choiceType: 'tokaido_coin',
              subType: 'checkpoint',
              reason: 'checkpoint',
            });
            return { won: false, paused: true };
          }
        }
      }

      if (!cancelled) {
        let multiplier = Math.max(1, Number(options.jumpMultiplier || 1));
        // Personal Hyakki Yagyo multiplier on next forward jump (never on the same turn it was earned or on backward jump)
        if (
          board.id === 'yokai' &&
          jump > 0 &&
          state.boardState.yokai.frenzyPending[player] &&
          !earnedFrenzyThisTurn &&
          options.useFrenzy !== false
        ) {
          if (hasCharm(state, player, ESR_CHARM.ANDON_WARD)) {
            consumeCharm(state, player, ESR_CHARM.ANDON_WARD);
            multiplier = 3;
            pushEvent(events, EVENT.CHARM, player, contactPos, contactPos, roll, {
              charm: 'andon_ward',
              multiplier: 3,
            });
          } else {
            multiplier = Math.max(multiplier, 2);
          }
          state.boardState.yokai.frenzyPending[player] = false;
          state.boardState.yokai.frenzyTriggered[player] = true;
          pushEvent(events, EVENT.FRENZY_USED, player, contactPos, contactPos, roll, {
            multiplier,
          });
        } else if (jump < 0) {
          multiplier = 1;
        }

        const jumpBonus = (jump > 0 && buff) ? (buff.jumpBonus | 0) : 0;
        const from = contactPos;
        const delta = jump * multiplier + jumpBonus;
        pos = clampNode(board, contactPos + delta);
        state.pos[player] = pos;
        pushEvent(events, EVENT.JUMP, player, from, pos, roll, {
          delta,
          multiplier,
          jumpBonus,
        });
        if (jumpBonus > 0 && buff) {
          pushEvent(events, EVENT.CUSTOM_BUFF, player, from, pos, roll, {
            effect: 'jump_boost',
            bonus: jumpBonus,
            cardId: buff.cardId,
            buffName: buff.name,
          });
        }
      }
    }
  }

  // Contact-node stay penalty (only when contact node has stayTurns > 0)
  if (contactPos !== board.goal && (contactNode.stayTurns | 0) > 0) {
    if (hasCharm(state, player, ESR_CHARM.STAY)) {
      consumeCharm(state, player, ESR_CHARM.STAY);
      pushEvent(events, EVENT.CHARM, player, pos, pos, roll, {
        charm: 'stay',
      });
    } else if (hasCharm(state, player, ESR_CHARM.PURIFY) && options.purifyTarget !== 'jump') {
      consumeCharm(state, player, ESR_CHARM.PURIFY);
      pushEvent(events, EVENT.CHARM, player, pos, pos, roll, {
        charm: 'purify',
        cancelledEffect: 'stay',
      });
    } else if (board.id === 'tokaido' && (state.boardState.tokaido.coins[player] | 0) > 0 && options.spendCoin === true) {
      state.boardState.tokaido.coins[player] -= 1;
      state.boardState.tokaido.coinsSpent[player] = (state.boardState.tokaido.coinsSpent[player] | 0) + 1;
      pushEvent(events, EVENT.COIN_SPENT, player, pos, pos, roll, {
        reason: 'stay',
        remainingCoins: state.boardState.tokaido.coins[player],
      });
    } else if (board.id === 'tokaido' && (state.boardState.tokaido.coins[player] | 0) > 0 && options.pauseOnChoice && options.spendCoin === undefined) {
      state.pendingChoice = {
        type: 'tokaido_coin',
        subType: 'stay',
        reason: 'stay',
        player,
        pos,
        square: pos,
        roll,
        stayTurns: contactNode.stayTurns | 0,
        coins: state.boardState.tokaido.coins[player],
        options: ['spend_coin', 'accept_penalty'],
      };
      pushEvent(events, EVENT.PENDING_CHOICE, player, pos, pos, roll, {
        choiceType: 'tokaido_coin',
        subType: 'stay',
        reason: 'stay',
      });
      return { won: false, paused: true };
    } else {
      state.skip[player] = (state.skip[player] | 0) + (contactNode.stayTurns | 0);
      pushEvent(events, EVENT.STAY, player, pos, pos, roll, {
        turns: contactNode.stayTurns | 0,
      });
    }
  }

  // Step 8: Goal arrival & required-tokens lock check
  if (pos === board.goal) {
    const required = board.requiredTokens || 0;
    const heldCount = popcount3(state.tokens[player] | 0);
    if (heldCount >= required || (state.tokens[player] | 0) >= ((1 << required) - 1)) {
      state.winner = player;
      state.resultReason = 'goal';
      pushEvent(events, EVENT.WIN, player, pos, pos, roll, {
        reason: 'goal',
      });
      state.turnCount = (state.turnCount || 0) + 1;
      state.ply = (state.ply || 0) + 1;
      state.playerTurnCount[player] = (state.playerTurnCount[player] || 0) + 1;
      return { won: true, paused: false };
    }
    // Locked Goal: push back 1 step into the battlefield to force token collection
    const pushed = stepBackward(board, board.goal, 1);
    state.pos[player] = pushed;
    pos = pushed;
    pushEvent(events, EVENT.GOAL_LOCKED, player, board.goal, pos, roll, {
      required,
    });
  }

  // Step 9: Universal Same-Square Clash / Duel at final position
  const clashRes = resolveSameSquareClash(board, state, player, pos, roll, events, options);
  if (clashRes.paused) {
    return { won: false, paused: true };
  }

  // Step 10: If player landed on Genji branch #15 and hasn't chosen a route yet, prompt for next turn
  if (board.id === 'genji' && pos === 15 && !state.boardState.genji.routeChoice[player] && options.pauseOnChoice) {
    state.pendingChoice = {
      type: 'genji_branch',
      player,
      pos: 15,
      roll,
      wakaPreview: hasCharm(state, player, ESR_CHARM.WAKA_SLIP) ? buildGenjiBranchSummary(board) : null,
      options: ['good', 'evil'],
    };
    pushEvent(events, EVENT.PENDING_CHOICE, player, pos, pos, roll, {
      choiceType: 'genji_branch',
      options: ['good', 'evil'],
    });
    return { won: false, paused: true };
  }

  return { won: false, paused: false };
}

export function buildGenjiBranchSummary(board) {
  const goodNodes = (board?.nodes || []).filter(n => n.kind === 'good');
  const evilNodes = (board?.nodes || []).filter(n => n.kind === 'evil');
  return {
    good: {
      name: '雅道（善玉五帖）',
      nodeCount: goodNodes.length,
      jumps: goodNodes.filter(n => (n.jumpTable?.[0] || 0) > 0).length,
      stays: goodNodes.filter(n => (n.stayTurns || 0) > 0).length,
      summary: '停留・逆戻りが少なく安定して上りを目指せる王道ルート（善徳傾向＋）',
    },
    evil: {
      name: '修羅道（悪玉五帖）',
      nodeCount: evilNodes.length,
      jumps: evilNodes.filter(n => (n.jumpTable?.[0] || 0) !== 0).length,
      stays: evilNodes.filter(n => (n.stayTurns || 0) > 0).length,
      summary: '物怪の引き戻しや停留リスクがあるが、怨念印記を蒐集できる修羅ルート（修羅傾向−）',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Max-Ply Timeout Settlement (V1.1 Section 2.6)                       */
/* ------------------------------------------------------------------ */

function volumeResourceScore(board, state, player) {
  if (board.id === 'tokaido') {
    return popcountMask(state.boardState.tokaido.gourmetMask[player]) * 10 + (state.boardState.tokaido.coins[player] | 0);
  }
  if (board.id === 'yokai') {
    return popcountMask(state.boardState.yokai.lanternMask[player]) * 10 + (state.boardState.yokai.frenzyTriggered[player] ? 5 : 0);
  }
  if (board.id === 'kesshu') {
    return popcount3(state.tokens[player]) * 15 + (state.stealCount?.[player] | 0) * 3;
  }
  if (board.id === 'genji') {
    return Math.abs(state.boardState.genji.balance[player] || 0) * 5 + (state.boardState.genji.grudgeMarks[player] | 0) * 4;
  }
  return popcount3(state.tokens[player]);
}

export function resolveMaxPlySettlement(board, state, events = []) {
  const p0 = getNodeProgress(board, state.pos[0]);
  const p1 = getNodeProgress(board, state.pos[1]);
  let winner = 2; // 2 = draw
  if (p0 !== p1) {
    winner = p0 > p1 ? 0 : 1;
  } else {
    const r0 = volumeResourceScore(board, state, 0);
    const r1 = volumeResourceScore(board, state, 1);
    if (r0 !== r1) winner = r0 > r1 ? 0 : 1;
  }
  state.winner = winner;
  state.resultReason = 'max_ply';
  pushEvent(events, EVENT.TIMEOUT, winner === 2 ? 0 : winner, state.pos[0], state.pos[1], 0, {
    winner,
    reason: 'max_ply',
    ply: state.ply,
    maxPly: state.maxPly,
    progress: [p0, p1],
  });
  return winner;
}

function finalizeTurnAdvance(board, state, player, startPos, roll, steps, events) {
  const opponent = 1 - player;
  state.turn = opponent;
  state.turnCount = (state.turnCount || 0) + 1;
  state.ply = (state.ply || 0) + 1;
  state.playerTurnCount[player] = (state.playerTurnCount[player] || 0) + 1;

  let won = state.winner >= 0;
  if (!won && state.ply >= (state.maxPly || board.maxTurns || 120)) {
    resolveMaxPlySettlement(board, state, events);
    won = true;
  }

  state.events = events;
  state.history = [
    ...(state.history || []),
    {
      player,
      roll,
      steps,
      from: startPos,
      to: state.pos[player],
      won,
      ply: state.ply,
    },
  ].slice(-150);

  return { state, events, won, pendingChoice: state.pendingChoice };
}

/* ------------------------------------------------------------------ */
/* Active Tactical Strike (V1.1 Section 2.5)                           */
/* ------------------------------------------------------------------ */

export function canUseTacticalStrike(board, state, player = state?.turn ?? 0, options = {}) {
  if (!board || !state || (state.winner ?? -1) >= 0) {
    return { ok: false, reason: 'finished' };
  }
  if (options.enforceTurn && state.turn !== player) {
    return { ok: false, reason: 'not_your_turn' };
  }
  if (state.pendingChoice) {
    return { ok: false, reason: 'pending_choice' };
  }
  const opponent = 1 - player;
  if ((state.strikeCooldown?.[player] | 0) > 0) {
    return { ok: false, reason: 'cooldown' };
  }
  const oppPos = state.pos?.[opponent] ?? 0;
  if (oppPos <= board.start) {
    return { ok: false, reason: 'at_start' };
  }
  if (oppPos >= board.goal) {
    return { ok: false, reason: 'at_goal' };
  }
  const myProg = getNodeProgress(board, state.pos?.[player] ?? 0);
  const oppProg = getNodeProgress(board, oppPos);
  const minLead = options.minLead !== undefined ? options.minLead : 3;
  if (oppProg - myProg < minLead) {
    return { ok: false, reason: 'insufficient_lead', lead: oppProg - myProg, requiredLead: minLead };
  }
  return { ok: true, lead: oppProg - myProg };
}

function applyTacticalStrike(board, state, player = state?.turn ?? 0, options = {}) {
  const minLead = options.minLead !== undefined ? options.minLead : 3;
  const check = canUseTacticalStrike(board, state, player, { ...options, minLead });
  if (!check.ok) {
    return { ok: false, reason: check.reason, state: cloneState(state || {}), events: [] };
  }
  const next = cloneState(state);
  const opponent = 1 - player;
  const buff = getPlayerBuff(next, player);
  const pullBonus = buff ? (buff.strikePullBonus | 0) : 0;
  const pullSteps = 2 + pullBonus;
  const cdTurns = buff && (buff.strikeCooldown | 0) > 0
    ? (buff.strikeCooldown | 0)
    : 4;

  const from = next.pos[opponent];
  const events = [];

  // Check if opponent is protected by Decoy Charm (替身符)
  if (hasCharm(next, opponent, ESR_CHARM.DECOY)) {
    consumeCharm(next, opponent, ESR_CHARM.DECOY);
    next.strikeCooldown[player] = cdTurns;
    pushEvent(events, EVENT.CHARM, opponent, from, from, 0, {
      charm: 'decoy',
      blockedStrikeFrom: player,
    });
    next.events = events;
    return { ok: true, blockedByCharm: 'decoy', state: next, events, from, to: from };
  }

  const to = stepBackward(board, from, pullSteps);
  next.pos[opponent] = to;
  next.strikeCooldown[player] = cdTurns;

  pushEvent(events, EVENT.STRIKE, player, from, to, 0, {
    opponent,
    delta: to - from,
    pullSteps,
    cooldown: cdTurns,
  });
  if ((pullBonus > 0 || cdTurns < 4) && buff) {
    pushEvent(events, EVENT.CUSTOM_BUFF, player, from, to, 0, {
      effect: 'gale_tactician',
      pullSteps,
      cooldown: cdTurns,
      cardId: buff.cardId,
      buffName: buff.name,
    });
  }
  next.events = events;
  return { ok: true, state: next, events, from, to };
}

/* ------------------------------------------------------------------ */
/* Active Charm & Choice Application (V1.2 Section 3 & Section 8.2)    */
/* ------------------------------------------------------------------ */

export function applyCharm(board, state, charmId, options = {}) {
  if (!board || !state || (state.winner ?? -1) >= 0) {
    return { ok: false, reason: 'finished', state: cloneState(state || {}), events: [] };
  }
  const player = options.player ?? state.turn ?? 0;
  const charmDef = CHARM_BY_ID[charmId];
  if (!charmDef) {
    return { ok: false, reason: 'unknown_charm', state: cloneState(state), events: [] };
  }
  if (!hasCharm(state, player, charmDef.mask)) {
    return { ok: false, reason: 'unavailable', state: cloneState(state), events: [] };
  }

  const next = cloneState(state);
  const events = [];

  if (charmId === 'wind') {
    if (next.windActive[player]) {
      return { ok: false, reason: 'already_active', state: next, events: [] };
    }
    consumeCharm(next, player, ESR_CHARM.WIND);
    next.windActive[player] = true;
    pushEvent(events, EVENT.CHARM, player, next.pos[player], next.pos[player], 0, {
      charm: 'wind',
      bonusSteps: 2,
    });
    next.events = events;
    return { ok: true, state: next, events };
  }

  if (charmId === 'reroll') {
    consumeCharm(next, player, ESR_CHARM.REROLL);
    const newRoll = options.newRoll && options.newRoll >= 1 && options.newRoll <= 6
      ? options.newRoll
      : rollDie(options.rng || next);
    next.lastRoll = newRoll;
    pushEvent(events, EVENT.REROLL, player, next.pos[player], next.pos[player], newRoll, {
      charm: 'reroll',
      newRoll,
    });
    next.events = events;
    return { ok: true, newRoll, state: next, events };
  }

  if (charmId === 'purify') {
    const clearedSkip = next.skip[player] | 0;
    const clearedGrudge = next.boardState?.genji?.grudgeMarks?.[player] | 0;
    if (clearedSkip <= 0 && clearedGrudge <= 0) {
      return { ok: false, reason: 'nothing_to_purify', state: next, events: [] };
    }
    consumeCharm(next, player, ESR_CHARM.PURIFY);
    next.skip[player] = 0;
    if (next.boardState?.genji?.grudgeMarks) {
      next.boardState.genji.grudgeMarks[player] = 0;
    }
    pushEvent(events, EVENT.CHARM, player, next.pos[player], next.pos[player], 0, {
      charm: 'purify',
      effect: 'active_cleanse',
      clearedSkip,
      clearedGrudge,
    });
    next.events = events;
    return { ok: true, clearedSkip, clearedGrudge, state: next, events };
  }

  if (charmId === 'waka_slip') {
    const summary = buildGenjiBranchSummary(board);
    const route = options.route === 'evil' ? 'evil' : options.route === 'good' ? 'good' : null;
    if (route) {
      consumeCharm(next, player, ESR_CHARM.WAKA_SLIP);
      next.boardState.genji.routeChoice[player] = route;
    }
    pushEvent(events, EVENT.CHARM, player, next.pos[player], next.pos[player], 0, {
      charm: 'waka_slip',
      route,
      summary,
    });
    next.events = events;
    return { ok: true, route, summary, state: next, events };
  }

  return { ok: false, reason: 'passive_charm', state: next, events: [] };
}

export function applyChoice(board, state, choice = {}) {
  if (!board || !state) {
    return { ok: false, state: cloneState(state || {}), events: [], won: false };
  }
  const next = cloneState(state);
  const player = choice.player ?? next.pendingChoice?.player ?? next.turn ?? 0;
  const events = [];

  // 1. Genji Branch Choice ('good' 雅道 | 'evil' 修羅道)
  if (choice.type === 'genji_branch' || next.pendingChoice?.type === 'genji_branch') {
    const route = choice.route === 'evil' ? 'evil' : 'good';
    next.boardState.genji.routeChoice[player] = route;
    next.boardState.genji.balance[player] = (next.boardState.genji.balance[player] || 0) + (route === 'good' ? 1 : -1);
    pushEvent(events, EVENT.BRANCH_CHOICE, player, next.pos[player], next.pos[player], next.lastRoll || 0, {
      route,
      balance: next.boardState.genji.balance[player],
    });
    const hadPending = next.pendingChoice?.type === 'genji_branch';
    const pendingRoll = next.pendingChoice?.roll || next.lastRoll || 1;
    const remSteps = next.pendingChoice?.remainingSteps || 0;
    next.pendingChoice = null;

    if (hadPending && remSteps > 0) {
      const walked = walk(board, next.pos[player], remSteps, pendingRoll, player, route === 'good', false);
      next.pos[player] = walked.pos;
      events.push(...walked.events);
      const landRes = resolveLanding(board, next, player, walked.pos, pendingRoll, events, { pauseOnChoice: false });
      if (landRes.won) {
        next.events = events;
        return { ok: true, state: next, events, won: true };
      }
      const fin = finalizeTurnAdvance(board, next, player, 15, pendingRoll, remSteps, events);
      return { ok: true, ...fin };
    }

    if (hadPending && choice.completeTurn !== false) {
      const fin = finalizeTurnAdvance(board, next, player, next.pos[player], pendingRoll, 0, events);
      return { ok: true, ...fin };
    }
    next.events = events;
    return { ok: true, state: next, events, won: false };
  }

  // 2. Kesshu Combat Stance Choice ('assault' | 'feint' | 'defend')
  if (choice.type === 'kesshu_stance' || next.pendingChoice?.type === 'kesshu_stance') {
    const stance = ['assault', 'feint', 'defend'].includes(choice.stance) ? choice.stance : 'assault';
    const pos = next.pendingChoice?.pos ?? next.pos[player];
    const roll = next.pendingChoice?.roll ?? next.lastRoll ?? 1;
    next.pendingChoice = null;
    resolveSameSquareClash(board, next, player, pos, roll, events, {
      stance,
      stealBit: choice.stealBit,
      pauseOnChoice: false,
    });
    const fin = finalizeTurnAdvance(board, next, player, pos, roll, roll, events);
    return { ok: true, ...fin };
  }

  // 3. Tokaido Travel Coin Choice ('spend_coin' | 'accept_penalty')
  if (choice.type === 'tokaido_coin' || next.pendingChoice?.type === 'tokaido_coin') {
    const spend = choice.spendCoin === true || choice.decision === 'spend_coin';
    const pending = next.pendingChoice || {};
    const pos = pending.pos ?? next.pos[player];
    const roll = pending.roll ?? next.lastRoll ?? 1;
    next.pendingChoice = null;

    if (pending.subType === 'checkpoint') {
      if (spend && (next.boardState.tokaido.coins[player] | 0) > 0) {
        next.boardState.tokaido.coins[player] -= 1;
        next.boardState.tokaido.coinsSpent[player] = (next.boardState.tokaido.coinsSpent[player] | 0) + 1;
        pushEvent(events, EVENT.COIN_SPENT, player, pos, pos, roll, {
          reason: 'checkpoint',
          remainingCoins: next.boardState.tokaido.coins[player],
        });
      } else {
        const delta = Number(pending.jump || -2);
        const dest = clampNode(board, pos + delta);
        next.pos[player] = dest;
        pushEvent(events, EVENT.JUMP, player, pos, dest, roll, { delta, multiplier: 1, jumpBonus: 0 });
      }
      resolveSameSquareClash(board, next, player, next.pos[player], roll, events, { pauseOnChoice: false });
      const fin = finalizeTurnAdvance(board, next, player, pos, roll, roll, events);
      return { ok: true, ...fin };
    }

    if (pending.subType === 'stay') {
      if (spend && (next.boardState.tokaido.coins[player] | 0) > 0) {
        next.boardState.tokaido.coins[player] -= 1;
        next.boardState.tokaido.coinsSpent[player] = (next.boardState.tokaido.coinsSpent[player] | 0) + 1;
        pushEvent(events, EVENT.COIN_SPENT, player, pos, pos, roll, {
          reason: 'stay',
          remainingCoins: next.boardState.tokaido.coins[player],
        });
      } else {
        const turns = pending.stayTurns || 1;
        next.skip[player] = (next.skip[player] | 0) + turns;
        pushEvent(events, EVENT.STAY, player, pos, pos, roll, { turns });
      }
      resolveSameSquareClash(board, next, player, next.pos[player], roll, events, { pauseOnChoice: false });
      const fin = finalizeTurnAdvance(board, next, player, pos, roll, roll, events);
      return { ok: true, ...fin };
    }
  }

  return { ok: false, reason: 'no_matching_choice', state: next, events: [], won: false };
}

export function getLegalChoices(board, state) {
  if (!board || !state || (state.winner ?? -1) >= 0) return [];
  const player = state.turn | 0;
  if (state.pendingChoice) {
    const pc = state.pendingChoice;
    if (pc.type === 'kesshu_stance') {
      return [
        { type: 'kesshu_stance', stance: 'assault', label: '猛攻（3格弾き＋武具奪取）' },
        { type: 'kesshu_stance', stance: 'feint', label: '牽制（1格弾き＋一時防護）' },
        { type: 'kesshu_stance', stance: 'defend', label: '固守（反撃無効＋武具保護）' },
      ];
    }
    if (pc.type === 'genji_branch') {
      return [
        { type: 'genji_branch', route: 'good', label: '雅道（善玉五帖・安定進路）' },
        { type: 'genji_branch', route: 'evil', label: '修羅道（悪玉五帖・怨念蒐集）' },
      ];
    }
    if (pc.type === 'tokaido_coin') {
      return [
        { type: 'tokaido_coin', spendCoin: true, decision: 'spend_coin', label: '旅銭を1枚支払って厄災を免れる' },
        { type: 'tokaido_coin', spendCoin: false, decision: 'accept_penalty', label: '旅銭を温存して効果を受け入れる' },
      ];
    }
  }

  const actions = [{ type: 'roll' }];
  if (canUseTacticalStrike(board, state, player).ok) {
    actions.push({ type: 'strike' });
  }
  if (hasCharm(state, player, ESR_CHARM.WIND) && !state.windActive[player]) {
    actions.push({ type: 'charm', charmId: 'wind' });
  }
  if (
    hasCharm(state, player, ESR_CHARM.PURIFY) &&
    ((state.skip[player] | 0) > 0 || (state.boardState?.genji?.grudgeMarks?.[player] | 0) > 0)
  ) {
    actions.push({ type: 'charm', charmId: 'purify' });
  }
  if (board.id === 'genji' && state.pos[player] === 15 && !state.boardState.genji.routeChoice[player]) {
    actions.push(
      { type: 'genji_branch', route: 'good' },
      { type: 'genji_branch', route: 'evil' },
    );
  }
  return actions;
}

/* ------------------------------------------------------------------ */
/* Core Roll & Turn Progression (V1.1 Section 2.3)                     */
/* ------------------------------------------------------------------ */

function tickPlayerCooldownsAndRecharge(next, player, roll, events) {
  if ((next.strikeCooldown[player] | 0) > 0) {
    next.strikeCooldown[player] = Math.max(0, next.strikeCooldown[player] - 1);
  }

  const cdMap = next.charmCooldown[player] || {};
  let rechargedFromCooldown = false;
  for (const [cid, rem] of Object.entries(cdMap)) {
    if (rem > 0) {
      const updated = rem - 1;
      if (updated <= 0) {
        delete cdMap[cid];
        const def = CHARM_BY_ID[cid];
        if (def && !def.oncePerMatch && (next.charmUsed[player] & def.mask)) {
          next.charmUsed[player] &= ~def.mask;
          rechargedFromCooldown = true;
          pushEvent(events, EVENT.RECHARGE, player, next.pos[player], next.pos[player], roll, {
            recharged: def.mask,
            charmId: cid,
          });
        }
      } else {
        cdMap[cid] = updated;
      }
    }
  }

  // Fallback periodic recharge for legacy callers that directly set charmUsed + turnCount
  const buff = getPlayerBuff(next, player);
  const rechargePeriod = (buff && (buff.rechargePeriod | 0) > 0) ? (buff.rechargePeriod | 0) : 8;
  const rechargeableUsed = (next.charmUsed[player] | 0) & ~ONCE_PER_MATCH_MASK;
  if (
    !rechargedFromCooldown &&
    rechargeableUsed !== 0 &&
    Object.keys(cdMap).length === 0 &&
    next.turnCount > 0 &&
    next.turnCount % rechargePeriod === 0
  ) {
    const rechargeBit = rechargeableUsed & -rechargeableUsed;
    next.charmUsed[player] &= ~rechargeBit;
    pushEvent(events, EVENT.RECHARGE, player, next.pos[player], next.pos[player], roll, {
      recharged: rechargeBit,
      rechargePeriod,
    });
  }
}

export function applyRoll(board, state, roll, options = {}) {
  if (!board || !state || !Number.isInteger(roll) || roll < 1 || roll > 6) {
    return { state: cloneState(state || {}), events: [], won: false };
  }
  if ((state.winner ?? -1) >= 0) {
    return { state: cloneState(state), events: [], won: false };
  }

  const next = cloneState(state);
  const events = [];
  const player = next.turn | 0;
  next.lastRoll = roll;

  tickPlayerCooldownsAndRecharge(next, player, roll, events);

  if ((next.skip[player] | 0) > 0) {
    next.skip[player] -= 1;
    pushEvent(events, EVENT.SKIP, player, next.pos[player], next.pos[player], roll, {
      remaining: next.skip[player],
    });
    return finalizeTurnAdvance(board, next, player, next.pos[player], roll, 0, events);
  }

  let steps = roll;
  // Wind charm (+2 steps, mutually exclusive with Dash on the same turn)
  if (next.windActive[player] || options.useWindCharm) {
    if (!next.windActive[player] && hasCharm(next, player, ESR_CHARM.WIND)) {
      consumeCharm(next, player, ESR_CHARM.WIND);
    }
    next.windActive[player] = false;
    steps += 2;
    pushEvent(events, EVENT.CHARM, player, next.pos[player], next.pos[player], roll, {
      charm: 'wind',
      steps,
    });
  } else if (hasCharm(next, player, ESR_CHARM.DASH)) {
    steps += 1;
    consumeCharm(next, player, ESR_CHARM.DASH);
    pushEvent(events, EVENT.CHARM, player, next.pos[player], next.pos[player], roll, {
      charm: 'dash',
      steps,
    });
  }

  const buff = getPlayerBuff(next, player);
  if (buff && buff.firstRollPending && (buff.firstRollBonus | 0) > 0) {
    const bonus = Math.min(2, buff.firstRollBonus | 0);
    steps += bonus;
    buff.firstRollPending = false;
    if (player === (next.humanSide ?? 0) && next.customBuff) {
      next.customBuff.firstRollPending = false;
    }
    pushEvent(events, EVENT.CUSTOM_BUFF, player, next.pos[player], next.pos[player], roll, {
      effect: 'first_roll',
      bonus,
      steps,
      cardId: buff.cardId,
      buffName: buff.name,
    });
  }

  const start = next.pos[player] | 0;
  const chosenRoute = options.routeChoice || next.boardState.genji.routeChoice[player];
  const branchGood = chosenRoute ? (chosenRoute === 'good') : (roll % 2 === 0);
  const pauseOnBranch = Boolean(options.pauseOnChoice && board.id === 'genji' && !chosenRoute);

  const walked = walk(board, start, steps, roll, player, branchGood, pauseOnBranch);
  next.pos[player] = walked.pos;
  events.push(...walked.events);
  pushEvent(events, EVENT.MOVE, player, start, walked.pos, roll, {
    steps,
    branchGood,
    path: walked.path,
  });

  if (walked.pausedAtBranch) {
    next.pendingChoice = {
      type: 'genji_branch',
      player,
      pos: walked.pos,
      square: walked.pos,
      roll,
      remainingSteps: walked.remainingSteps,
      wakaPreview: hasCharm(next, player, ESR_CHARM.WAKA_SLIP) ? buildGenjiBranchSummary(board) : null,
      options: ['good', 'evil'],
    };
    pushEvent(events, EVENT.PENDING_CHOICE, player, walked.pos, walked.pos, roll, {
      choiceType: 'genji_branch',
      remainingSteps: walked.remainingSteps,
      options: ['good', 'evil'],
    });
    next.events = events;
    return { state: next, events, won: false, pendingChoice: next.pendingChoice };
  }

  const landRes = resolveLanding(board, next, player, walked.pos, roll, events, options);
  if (landRes.paused) {
    next.events = events;
    return { state: next, events, won: false, pendingChoice: next.pendingChoice };
  }
  if (landRes.won) {
    next.events = events;
    next.history = [
      ...(next.history || []),
      { player, roll, steps, from: start, to: next.pos[player], won: true, ply: next.ply },
    ].slice(-150);
    return { state: next, events, won: true };
  }

  return finalizeTurnAdvance(board, next, player, start, roll, steps, events);
}

/* ------------------------------------------------------------------ */
/* Unified Simulation & Preview (V1.1 Section 2.7)                     */
/* ------------------------------------------------------------------ */

export function simulateTurn(board, state, roll, options = {}) {
  const simState = cloneState(state);
  const player = simState.turn | 0;
  const needsBranchChoice =
    board.id === 'genji' &&
    simState.pos[player] <= 15 &&
    simState.pos[player] + roll > 15 &&
    !simState.boardState.genji.routeChoice[player] &&
    !options.routeChoice;

  const result = applyRoll(board, simState, roll, {
    ...options,
    pauseOnChoice: false,
  });
  const moveEv = result.events.find(e => e.type === EVENT.MOVE);
  const jumpEv = result.events.find(e => e.type === EVENT.JUMP);
  const stayEv = result.events.find(e => e.type === EVENT.STAY);
  const duelEv = result.events.find(e => e.type === EVENT.DUEL);
  const finalPos = result.state.pos[player];

  let kind = 'move';
  if (result.won && result.state.winner === player) kind = 'win';
  else if (jumpEv) kind = jumpEv.delta > 0 ? 'jump' : 'back';
  else if (stayEv) kind = 'stay';
  else if (duelEv) kind = 'duel';

  return {
    roll,
    from: state.pos[player],
    contactPos: moveEv ? moveEv.to : finalPos,
    to: finalPos,
    path: moveEv?.path || [state.pos[player], finalPos],
    kind,
    jumped: Boolean(jumpEv),
    jumpDelta: jumpEv ? jumpEv.delta : 0,
    stayed: Boolean(stayEv),
    clashed: Boolean(duelEv),
    won: Boolean(result.won && result.state.winner === player),
    needsChoice: needsBranchChoice || (board.id === 'kesshu' && Boolean(duelEv)),
  };
}

export function previewDestinations(board, state, roll, options = {}) {
  const sim = simulateTurn(board, state, roll, options);
  return [{
    roll: sim.roll,
    to: sim.to,
    contactPos: sim.contactPos,
    kind: sim.kind,
    path: sim.path,
    jumped: sim.jumped,
    stayed: sim.stayed,
    clashed: sim.clashed,
    won: sim.won,
    needsChoice: sim.needsChoice,
  }];
}

export function previewOutcomes(board, state, options = {}) {
  return [1, 2, 3, 4, 5, 6].map(roll => simulateTurn(board, state, roll, options));
}

/* ------------------------------------------------------------------ */
/* State Evaluation & Fair AI Engine (V1.2–V1.3 Section 6)             */
/* ------------------------------------------------------------------ */

export function evaluateState(board, state, player) {
  if (!board || !state) return 0;
  const opponent = 1 - player;
  if ((state.winner ?? -1) === player) return 1000;
  if ((state.winner ?? -1) === opponent) return -1000;
  if ((state.winner ?? -1) === 2) return 0;

  const span = Math.max(1, getNodeProgress(board, board.goal));
  const myProg = getNodeProgress(board, state.pos[player]);
  const oppProg = getNodeProgress(board, state.pos[opponent]);

  let score = 0;
  score += (myProg / span) * 120;
  score -= (oppProg / span) * 95;
  score += popcount3(state.tokens[player]) * 26;
  score -= popcount3(state.tokens[opponent]) * 20;
  score -= (state.skip[player] | 0) * 14;
  score += (state.skip[opponent] | 0) * 11;

  if (board.id === 'tokaido') {
    score += (state.boardState.tokaido.coins[player] | 0) * 9;
    score += popcountMask(state.boardState.tokaido.gourmetMask[player]) * 6;
  } else if (board.id === 'yokai') {
    score += popcountMask(state.boardState.yokai.lanternMask[player]) * 8;
    if (state.boardState.yokai.frenzyPending[player]) score += 22;
  } else if (board.id === 'kesshu') {
    if (state.boardState.kesshu.tempShield[player]) score += 12;
  } else if (board.id === 'genji') {
    score += (state.boardState.genji.balance[player] || 0) * 4;
  }

  return score;
}

export function expectedValue(board, state, player) {
  if (!board || !state) return 0;
  if ((state.winner ?? -1) === player) return 1000;
  if ((state.winner ?? -1) >= 0) return -1000;
  let total = 0;
  for (let roll = 1; roll <= 6; roll++) {
    const trial = cloneState(state);
    trial.turn = player;
    const result = applyRoll(board, trial, roll, { pauseOnChoice: false });
    if (result.state.winner === player) total += 1000;
    else if ((result.state.winner ?? -1) >= 0) total -= 1000;
    else {
      const span = Math.max(1, board.goal);
      total += 100 * (1 - result.state.pos[player] / span);
      total += popcount3(result.state.tokens[player]) * 18;
      total -= result.state.skip[player] * 7;
    }
  }
  return total / 6;
}

function expectiminimaxRollChance(board, state, maximizingPlayer, depth = 1) {
  if ((state.winner ?? -1) >= 0 || depth <= 0) {
    return evaluateState(board, state, maximizingPlayer);
  }
  let sum = 0;
  for (let r = 1; r <= 6; r++) {
    const res = applyRoll(board, state, r, { pauseOnChoice: true });
    if ((res.state.winner ?? -1) >= 0) {
      sum += evaluateState(board, res.state, maximizingPlayer);
    } else if (res.state.pendingChoice) {
      // Resolve post-roll decision node (Max for AI, Min for Opponent)
      sum += expectiminimaxSearch(board, res.state, maximizingPlayer, depth);
    } else if (depth <= 1) {
      sum += evaluateState(board, res.state, maximizingPlayer);
    } else {
      sum += expectiminimaxSearch(board, res.state, maximizingPlayer, depth - 1);
    }
  }
  return sum / 6;
}

/**
 * Genuine finite-depth Expectiminimax search tree:
 *  - Terminal node: returns `evaluateState(board, state, maximizingPlayer)`
 *  - Pending Choice decision node (`kesshu_stance`, `genji_branch`, `tokaido_coin`):
 *      Max over legal choices when `chooser === maximizingPlayer`,
 *      Min over legal choices when `chooser !== maximizingPlayer`.
 *  - Turn-Start decision node:
 *      Evaluates pre-roll tactical actions (`roll`, `strike`, `charm: wind`, `charm: purify`)
 *      followed by the 6-outcome uniform Chance node (`1/6` per die face),
 *      taking Max for `maximizingPlayer` and Min for opponent.
 */
export function expectiminimaxSearch(board, state, maximizingPlayer, depth = 2) {
  if (!board || !state) return 0;
  if ((state.winner ?? -1) >= 0 || depth <= 0) {
    return evaluateState(board, state, maximizingPlayer);
  }

  // 1. Pending Choice Node (Max for maximizingPlayer, Min for opponent)
  if (state.pendingChoice) {
    const chooser = state.pendingChoice.player ?? state.turn ?? 0;
    const isMax = chooser === maximizingPlayer;
    const choices = getLegalChoices(board, state);
    if (!choices.length) {
      return evaluateState(board, state, maximizingPlayer);
    }
    let bestVal = isMax ? -Infinity : Infinity;
    for (const choice of choices) {
      const res = applyChoice(board, state, choice);
      const nextDepth = Math.max(0, depth - 1);
      const val = (res.state.winner ?? -1) >= 0 || nextDepth === 0
        ? evaluateState(board, res.state, maximizingPlayer)
        : expectiminimaxSearch(board, res.state, maximizingPlayer, nextDepth);
      if (isMax) {
        if (val > bestVal) bestVal = val;
      } else {
        if (val < bestVal) bestVal = val;
      }
    }
    return Number.isFinite(bestVal) ? bestVal : evaluateState(board, state, maximizingPlayer);
  }

  // 2. Pre-roll Turn Decision Node + Chance Node
  const mover = state.turn | 0;
  const isMax = mover === maximizingPlayer;
  let bestVal = expectiminimaxRollChance(board, state, maximizingPlayer, depth);

  if (
    hasCharm(state, mover, ESR_CHARM.PURIFY) &&
    ((state.skip[mover] | 0) > 0 || (state.boardState?.genji?.grudgeMarks?.[mover] | 0) > 0)
  ) {
    const purified = applyCharm(board, state, 'purify', { player: mover });
    if (purified.ok) {
      const val = expectiminimaxRollChance(board, purified.state, maximizingPlayer, depth);
      bestVal = isMax ? Math.max(bestVal, val) : Math.min(bestVal, val);
    }
  }

  if (canUseTacticalStrike(board, state, mover).ok) {
    const struck = applyTacticalStrike(board, state, mover);
    if (struck.ok) {
      const val = expectiminimaxRollChance(board, struck.state, maximizingPlayer, depth);
      bestVal = isMax ? Math.max(bestVal, val) : Math.min(bestVal, val);
    }
  }

  if (hasCharm(state, mover, ESR_CHARM.WIND) && !state.windActive[mover]) {
    const winded = applyCharm(board, state, 'wind', { player: mover });
    if (winded.ok) {
      const val = expectiminimaxRollChance(board, winded.state, maximizingPlayer, depth);
      bestVal = isMax ? Math.max(bestVal, val) : Math.min(bestVal, val);
    }
  }

  return bestVal;
}

function expectiminimaxRollValue(board, state, maximizingPlayer, depth = 1) {
  return expectiminimaxRollChance(board, state, maximizingPlayer, depth);
}

/**
 * Selects a legal pre-roll tactical action, post-roll reroll, or pending-choice decision for AI
 * without EVER inspecting or choosing future dice outcomes.
 *
 * Difficulty tiers:
 *   - `easy`: random/conservative choices, minimal tactical intervention
 *   - `normal`: 1-step greedy heuristic (distance, stay avoidance, basic resource awareness)
 *   - `hard`: 1-ply Expectiminimax expectation over 1..6 + active tactical interference
 *   - `master`: multi-ply Expectiminimax search (`depth = 2`) modeling Max/Min/Chance nodes
 */
export function aiSelectAction(board, state, difficulty = state?.aiDifficulty || 'normal', options = {}) {
  if (!board || !state || (state.winner ?? -1) >= 0) {
    return { type: 'roll' };
  }
  const ai = state.turn | 0;
  const opp = 1 - ai;
  const searchDepth = difficulty === 'master' ? 2 : 1;

  // 1. Handle Pending Choice (Kesshu Combat Stance, Genji Branch, Tokaido Coin)
  if (state.pendingChoice) {
    const pc = state.pendingChoice;
    const legal = getLegalChoices(board, state);

    // Master & Hard use Expectiminimax tree evaluation across legal choices
    if ((difficulty === 'master' || difficulty === 'hard') && legal.length > 0) {
      let bestChoice = legal[0];
      let bestScore = -Infinity;
      for (const candidate of legal) {
        const res = applyChoice(board, state, candidate);
        let score = (res.state.winner ?? -1) >= 0
          ? evaluateState(board, res.state, ai)
          : expectiminimaxSearch(board, res.state, ai, searchDepth - 1);
        // Domain-aware tie-breakers for tactical richness
        if (pc.type === 'kesshu_stance') {
          const myTok = popcount3(state.tokens[ai]);
          const canSteal = ((state.tokens[opp] | 0) & ~(state.tokens[ai] | 0)) !== 0;
          if (candidate.stance === 'assault' && canSteal) score += 18;
          if (candidate.stance === 'defend' && myTok >= 3 && state.pos[ai] >= board.goal - 5) score += 16;
          if (candidate.stance === 'feint' && !canSteal && myTok < 3) score += 6;
        } else if (pc.type === 'genji_branch') {
          const trailing = getNodeProgress(board, state.pos[opp]) - getNodeProgress(board, state.pos[ai]);
          if (candidate.route === 'good' && trailing < 4) score += 5;
          if (candidate.route === 'evil' && trailing >= 4) score += 9;
        } else if (pc.type === 'tokaido_coin') {
          const coins = state.boardState.tokaido.coins[ai] | 0;
          if (candidate.spendCoin && (coins >= 2 || state.pos[ai] >= 12 || pc.subType === 'checkpoint')) {
            score += 8;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestChoice = candidate;
        }
      }
      return bestChoice;
    }

    // Easy & Normal heuristic choices
    if (pc.type === 'kesshu_stance') {
      if (difficulty === 'easy') {
        return { type: 'kesshu_stance', stance: 'feint' };
      }
      const myTok = popcount3(state.tokens[ai]);
      const oppTok = state.tokens[opp] | 0;
      const canSteal = (oppTok & ~(state.tokens[ai] | 0)) !== 0;
      if (myTok >= 3 && state.pos[ai] >= board.goal - 4) {
        return { type: 'kesshu_stance', stance: 'defend' };
      }
      if (canSteal || state.pos[opp] >= state.pos[ai]) {
        return { type: 'kesshu_stance', stance: 'assault' };
      }
      return { type: 'kesshu_stance', stance: 'feint' };
    }

    if (pc.type === 'genji_branch') {
      if (difficulty === 'easy') {
        return { type: 'genji_branch', route: (state.ply % 2 === 0) ? 'good' : 'evil' };
      }
      const trailing = getNodeProgress(board, state.pos[opp]) - getNodeProgress(board, state.pos[ai]);
      return { type: 'genji_branch', route: trailing >= 4 ? 'evil' : 'good' };
    }

    if (pc.type === 'tokaido_coin') {
      if (difficulty === 'easy') {
        return { type: 'tokaido_coin', spendCoin: false, decision: 'accept_penalty' };
      }
      const coins = state.boardState.tokaido.coins[ai] | 0;
      const nearGoal = state.pos[ai] >= 12;
      const shouldSpend = coins >= 2 || nearGoal || state.pos[opp] >= state.pos[ai];
      return {
        type: 'tokaido_coin',
        spendCoin: shouldSpend,
        decision: shouldSpend ? 'spend_coin' : 'accept_penalty',
      };
    }
  }

  // 2. Optional Post-Roll Reroll Evaluation (when `options.rolledValue` is provided)
  if (
    Number.isInteger(options.rolledValue) &&
    options.rolledValue >= 1 &&
    options.rolledValue <= 6 &&
    hasCharm(state, ai, ESR_CHARM.REROLL)
  ) {
    if (difficulty === 'easy') {
      return { type: 'keep_roll', roll: options.rolledValue };
    }
    const rolledRes = applyRoll(board, state, options.rolledValue, { pauseOnChoice: false });
    const currentVal = (rolledRes.state.winner ?? -1) >= 0
      ? evaluateState(board, rolledRes.state, ai)
      : (difficulty === 'master'
        ? expectiminimaxSearch(board, rolledRes.state, ai, 1)
        : evaluateState(board, rolledRes.state, ai));
    const rerollExpectation = expectiminimaxRollChance(board, state, ai, searchDepth);
    const threshold = difficulty === 'master' ? 5 : difficulty === 'hard' ? 8 : 14;
    if (rerollExpectation > currentVal + threshold) {
      return { type: 'charm', charmId: 'reroll' };
    }
    return { type: 'keep_roll', roll: options.rolledValue };
  }

  // 3. Pre-roll Purify Charm if skipping or cursed
  if (
    difficulty !== 'easy' &&
    hasCharm(state, ai, ESR_CHARM.PURIFY) &&
    ((state.skip[ai] | 0) > 0 || (state.boardState?.genji?.grudgeMarks?.[ai] | 0) > 0)
  ) {
    return { type: 'charm', charmId: 'purify' };
  }

  // 4. Pre-roll Genji branch selection if standing on #15
  if (board.id === 'genji' && state.pos[ai] === 15 && !state.boardState.genji.routeChoice[ai]) {
    if (difficulty === 'master' || difficulty === 'hard') {
      const goodRes = applyChoice(board, state, { type: 'genji_branch', route: 'good', completeTurn: false });
      const evilRes = applyChoice(board, state, { type: 'genji_branch', route: 'evil', completeTurn: false });
      const goodEv = expectiminimaxRollChance(board, goodRes.state, ai, searchDepth);
      const evilEv = expectiminimaxRollChance(board, evilRes.state, ai, searchDepth);
      const trailing = getNodeProgress(board, state.pos[opp]) - getNodeProgress(board, state.pos[ai]);
      return { type: 'genji_branch', route: (evilEv + (trailing >= 4 ? 8 : 0) > goodEv) ? 'evil' : 'good' };
    }
    const trailing = getNodeProgress(board, state.pos[opp]) - getNodeProgress(board, state.pos[ai]);
    return { type: 'genji_branch', route: trailing >= 4 ? 'evil' : 'good' };
  }

  // 5. Pre-roll Tactical Strike / Wind Charm evaluation
  const baseEv = difficulty === 'master'
    ? expectiminimaxRollChance(board, state, ai, 2)
    : expectiminimaxRollChance(board, state, ai, 1);

  if (canUseTacticalStrike(board, state, ai).ok) {
    if (difficulty === 'easy') {
      if (state.pos[opp] >= board.goal - 1) return { type: 'strike' };
    } else if (difficulty === 'normal') {
      const lead = getNodeProgress(board, state.pos[opp]) - getNodeProgress(board, state.pos[ai]);
      if (lead >= 4 || state.pos[opp] >= board.goal - 3) {
        return { type: 'strike' };
      }
    } else {
      const struck = applyTacticalStrike(board, state, ai);
      if (struck.ok) {
        const strikeEv = expectiminimaxRollChance(board, struck.state, ai, searchDepth);
        const margin = difficulty === 'master' ? 1.5 : 3.0;
        if (strikeEv > baseEv + margin || state.pos[opp] >= 8) {
          return { type: 'strike' };
        }
      }
    }
  }

  if (difficulty !== 'easy' && hasCharm(state, ai, ESR_CHARM.WIND) && !state.windActive[ai]) {
    if (difficulty === 'normal') {
      const distToGoal = getNodeProgress(board, board.goal) - getNodeProgress(board, state.pos[ai]);
      if (distToGoal <= 6 && distToGoal >= 3) {
        return { type: 'charm', charmId: 'wind' };
      }
    } else {
      const windRes = applyCharm(board, state, 'wind', { player: ai });
      if (windRes.ok) {
        const windEv = expectiminimaxRollChance(board, windRes.state, ai, searchDepth);
        const margin = difficulty === 'master' ? 0.5 : 2.0;
        if (windEv > baseEv + margin) {
          return { type: 'charm', charmId: 'wind' };
        }
      }
    }
  }

  return { type: 'roll' };
}

/**
 * Deterministic multi-seed AI vs Baseline simulation runner across volumes and difficulties.
 * Returns structured metrics for win rates, average ply, resource collection, special triggers, and timeouts.
 */
export function runAiBatchSimulation(boards, options = {}) {
  const boardList = Array.isArray(boards) ? boards : [boards];
  const difficulties = options.difficulties || ['easy', 'normal', 'hard', 'master'];
  const gamesPerCell = Math.max(1, Number(options.gamesPerDifficulty) || 12);
  const opponentDifficulty = options.opponentDifficulty || 'easy';
  const baseSeed = (Number(options.baseSeed) >>> 0) || 0x20260401;

  const summaryByDifficulty = {};
  const byBoard = {};

  for (const diff of difficulties) {
    summaryByDifficulty[diff] = {
      difficulty: diff,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      avgPly: 0,
      timeouts: 0,
      specialTriggers: 0,
      resourcesCollected: 0,
    };
  }

  for (const board of boardList) {
    if (!board || !board.id) continue;
    byBoard[board.id] = {};
    for (const diff of difficulties) {
      let wins = 0;
      let losses = 0;
      let draws = 0;
      let totalPly = 0;
      let timeouts = 0;
      let specialTriggers = 0;
      let resourcesCollected = 0;

      for (let g = 0; g < gamesPerCell; g++) {
        const seed = (baseSeed + g * 7919 + board.id.charCodeAt(0) * 131) >>> 0;
        let state = cloneState({
          boardId: board.id,
          pos: [board.start || 0, board.start || 0],
          tokens: [0, 0],
          skip: [0, 0],
          turn: 0,
          ply: 0,
          turnCount: 0,
          maxPly: board.maxTurns || 120,
          winner: -1,
          humanSide: 0,
          mode: 'ai',
          aiDifficulty: diff,
          rngSeed: seed,
          rngState: seed || 0x12345678,
          charms: [
            ESR_CHARM.STAY | ESR_CHARM.GUARD | ESR_CHARM.WIND | ESR_CHARM.REROLL | ESR_CHARM.PURIFY,
            ESR_CHARM.STAY | ESR_CHARM.GUARD | ESR_CHARM.DASH,
          ],
          charmUsed: [0, 0],
          charmLoadout: [['stay', 'guard', 'wind'], ['stay', 'guard', 'dash']],
          charmCooldown: [{}, {}],
          windActive: [false, false],
          strikeCooldown: [0, 0],
        });

        let guard = 0;
        const maxSteps = (board.maxTurns || 130) + 15;
        while ((state.winner ?? -1) < 0 && guard < maxSteps) {
          guard++;
          const active = state.turn | 0;
          const activeDiff = active === 0 ? diff : opponentDifficulty;

          // Pre-roll action check
          const preAction = aiSelectAction(board, state, activeDiff);
          if (preAction.type === 'strike') {
            const sr = applyTacticalStrike(board, state, active);
            if (sr.ok) {
              state = sr.state;
              if (active === 0) specialTriggers++;
            }
          } else if (preAction.type === 'charm' && preAction.charmId) {
            const cr = applyCharm(board, state, preAction.charmId, { player: active });
            if (cr.ok) {
              state = cr.state;
              if (active === 0) specialTriggers++;
            }
          } else if (preAction.type === 'genji_branch') {
            const br = applyChoice(board, state, preAction);
            if (br.ok) {
              state = br.state;
              if (active === 0) specialTriggers++;
            }
          }

          let roll = rollDie(state);
          const rerollCheck = aiSelectAction(board, state, activeDiff, { rolledValue: roll });
          if (rerollCheck.type === 'charm' && rerollCheck.charmId === 'reroll') {
            const rr = applyCharm(board, state, 'reroll', { player: active, rng: state });
            if (rr.ok && rr.newRoll) {
              state = rr.state;
              roll = rr.newRoll;
              if (active === 0) specialTriggers++;
            }
          }

          const res = applyRoll(board, state, roll, { pauseOnChoice: true });
          state = res.state;

          if (state.pendingChoice && (state.winner ?? -1) < 0) {
            const choicePlayer = state.pendingChoice.player ?? state.turn ?? active;
            const choiceDiff = choicePlayer === 0 ? diff : opponentDifficulty;
            const decision = aiSelectAction(board, state, choiceDiff);
            const cRes = applyChoice(board, state, decision);
            state = cRes.state;
            if (
              choicePlayer === 0 &&
              (decision.spendCoin === true || decision.stance === 'assault' || decision.stance === 'defend')
            ) {
              specialTriggers++;
            }
          }
        }

        if ((state.winner ?? -1) < 0) {
          state = resolveMaxPlySettlement(board, state).state;
        }

        totalPly += state.ply || 0;
        if (state.resultReason === 'max_ply' || state.winReason === 'max_ply_settlement') timeouts++;
        if (state.winner === 0) wins++;
        else if (state.winner === 1) losses++;
        else draws++;

        if (board.id === 'tokaido') {
          resourcesCollected += popcountMask(state.boardState.tokaido.gourmetMask[0]);
        } else if (board.id === 'yokai') {
          resourcesCollected += popcountMask(state.boardState.yokai.lanternMask[0]);
        } else if (board.id === 'kesshu') {
          resourcesCollected += popcount3(state.tokens[0]);
        } else if (board.id === 'genji') {
          resourcesCollected += Math.abs(state.boardState.genji.balance[0] || 0);
        }
      }

      const cellStats = {
        boardId: board.id,
        difficulty: diff,
        games: gamesPerCell,
        wins,
        losses,
        draws,
        winRate: Number((wins / gamesPerCell).toFixed(3)),
        avgPly: Number((totalPly / gamesPerCell).toFixed(1)),
        timeouts,
        specialTriggers,
        resourcesCollected,
      };
      byBoard[board.id][diff] = cellStats;

      const agg = summaryByDifficulty[diff];
      agg.games += gamesPerCell;
      agg.wins += wins;
      agg.losses += losses;
      agg.draws += draws;
      agg.avgPly += totalPly;
      agg.timeouts += timeouts;
      agg.specialTriggers += specialTriggers;
      agg.resourcesCollected += resourcesCollected;
    }
  }

  for (const diff of difficulties) {
    const agg = summaryByDifficulty[diff];
    if (agg.games > 0) {
      agg.winRate = Number((agg.wins / agg.games).toFixed(3));
      agg.avgPly = Number((agg.avgPly / agg.games).toFixed(1));
    }
  }

  return {
    gamesPerDifficulty: gamesPerCell,
    opponentDifficulty,
    summaryByDifficulty,
    byBoard,
  };
}

/* ------------------------------------------------------------------ */
/* Board Graph Validation & 3D Die Orientation Math                    */
/* ------------------------------------------------------------------ */

function validateBoard(board) {
  if (!board || !Array.isArray(board.nodes) || board.nodes.length === 0) {
    return { ok: false, reason: 'missing nodes' };
  }
  if (!Number.isInteger(board.start) || !Number.isInteger(board.goal)) {
    return { ok: false, reason: 'missing start/goal' };
  }
  if (board.goal < 0 || board.goal >= board.nodes.length) {
    return { ok: false, reason: 'goal out of range' };
  }
  const seen = new Set([board.start]);
  const queue = [board.start];
  while (queue.length) {
    const idx = queue.shift();
    const node = board.nodes[idx];
    if (!node) return { ok: false, reason: `missing node ${idx}` };
    for (const nxt of node.next || []) {
      if (nxt < 0 || nxt >= board.nodes.length) {
        return { ok: false, reason: `edge ${idx}->${nxt} out of range` };
      }
      if (!seen.has(nxt)) {
        seen.add(nxt);
        queue.push(nxt);
      }
    }
  }
  if (!seen.has(board.goal)) return { ok: false, reason: 'goal unreachable' };
  if (seen.size !== board.nodes.length) {
    return { ok: false, reason: `unreachable nodes: ${board.nodes.length - seen.size}` };
  }
  return { ok: true, reachable: seen.size };
}

function styleCode(style) {
  return STYLE_TO_C[style] ?? 0;
}

function getNode(board, index) {
  return board.nodes[index] || null;
}

/**
 * Pure 3D Bone Die Face-Up Orientation (Euler 'YXZ' order: R = Ry(ry) * Rx(rx) * Rz(rz)).
 */
export const DIE_LOCAL_NORMALS = Object.freeze({
  1: Object.freeze([0, 1, 0]),
  2: Object.freeze([1, 0, 0]),
  3: Object.freeze([0, 0, 1]),
  4: Object.freeze([0, 0, -1]),
  5: Object.freeze([-1, 0, 0]),
  6: Object.freeze([0, -1, 0]),
});

export function computeDieTargetEulerYXZ(value, yaw = 0) {
  const v = Number(value) | 0;
  switch (v) {
    case 1: return { rx: 0, ry: yaw, rz: 0, order: 'YXZ' };
    case 2: return { rx: 0, ry: yaw, rz: Math.PI / 2, order: 'YXZ' };
    case 3: return { rx: -Math.PI / 2, ry: yaw, rz: 0, order: 'YXZ' };
    case 4: return { rx: Math.PI / 2, ry: yaw, rz: 0, order: 'YXZ' };
    case 5: return { rx: 0, ry: yaw, rz: -Math.PI / 2, order: 'YXZ' };
    case 6: return { rx: Math.PI, ry: yaw, rz: 0, order: 'YXZ' };
    default: return { rx: 0, ry: yaw, rz: 0, order: 'YXZ' };
  }
}

export function evaluateDieTopFaceYXZ(rx, ry = 0, rz = 0) {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  let bestFace = 1;
  let bestDot = -Infinity;
  const faceDots = {};

  for (let face = 1; face <= 6; face++) {
    const [nx, ny, nz] = DIE_LOCAL_NORMALS[face];
    const yAfterZ = nx * sz + ny * cz;
    const worldY = yAfterZ * cx - nz * sx;
    faceDots[face] = Number(worldY.toFixed(6));
    if (worldY > bestDot) {
      bestDot = worldY;
      bestFace = face;
    }
  }

  return {
    topFace: bestFace,
    alignmentDot: Number(bestDot.toFixed(6)),
    faceDots,
  };
}

export const EsugorokuCore = Object.freeze({
  ESR_STYLE,
  ESR_CHARM,
  EVENT,
  UNBIASED_U32_LIMIT,
  isUnbiasedDieSample,
  createSeededRng,
  rollDie,
  cloneState,
  applyRoll,
  applyChoice,
  applyCharm,
  applyTacticalStrike,
  canUseTacticalStrike,
  getLegalChoices,
  simulateTurn,
  previewDestinations,
  previewOutcomes,
  evaluateState,
  expectedValue,
  expectiminimaxSearch,
  aiSelectAction,
  runAiBatchSimulation,
  resolveMaxPlySettlement,
  getNodeProgress,
  buildGenjiBranchSummary,
  validateBoard,
  getNode,
  styleCode,
  nodeAt,
  computeDieTargetEulerYXZ,
  evaluateDieTopFaceYXZ,
});
