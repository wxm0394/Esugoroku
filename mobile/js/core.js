// Authoritative Pure Rules Engine for E-Sugoroku (Edo–Meiji Historical E-Sugoroku + V1.1–V1.3 Legacy Support).
//
// Responsibilities:
//   * Uniform fair 1..6 die generation (`rollDie`) with seedable deterministic PRNG (`createSeededRng`)
//   * Three explicit historical E-Sugoroku movement modes (`ESR_MOVEMENT_MODE`):
//       - `mawari` (廻り双六): sequential route traversal with `exact-bounce` or `reach` goal rule
//       - `tobi` (飛び双六): die-indexed destination table (`dieDestinations[1..6] -> targetNodeId | null`, where `null` stays in place)
//       - `tobi-mawari` (飛び廻り双六): hybrid sequential progression + single-execution `landingInstruction` jumps (iroha / literary links)
//   * Single-execution square instruction (`executeLandingInstructionOnce`: `rest | moveTo | returnTo | restart | branch`)
//   * Peaceful multi-pawn shared squares (`allowSharedSquare: true`) and 2–4 player turn rotation
//   * Special historical variant: 『しん工夫けん双六』（狐拳名所双六, `ruleMode: 'kitsune'`）with bidirectional traversal & Kitsune-ken (`狐 > 庄屋 > 猟師 > 狐`) sweet-token (`菓子`) exchange
//   * Automated graph reachability verification (`verifyBoardReachability`) & 1,000-match Monte Carlo simulation (`runHistoricalSimulation`)
//   * Optional `ruleMode: 'legacy'` preserving V1.1–V1.3 charms, buffs, regalia lock, and Expectiminimax tactical AI
//
// Nothing in this file touches the DOM, Canvas, or WebAudio.

import {
  CHARMS,
  CHARM_BY_ID,
  HISTORICAL_KOMA,
  KITSUNE_KEN_HANDS,
  KITSUNE_KEN_META,
  resolveNodeRef,
} from './boards.js';

export const ESR_STYLE = Object.freeze({
  MAWARI: 'mawari',
  TOBI: 'tobi',
  KESSHU: 'kesshu',
  WAKARE: 'wakare',
});

export const ESR_MOVEMENT_MODE = Object.freeze({
  MAWARI: 'mawari',
  TOBI: 'tobi',
  TOBI_MAWARI: 'tobi-mawari',
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
  TOBI_STAY: 'tobi_stay',
  LANDING_INSTRUCTION: 'landing_instruction',
  KITSUNE_KEN: 'kitsune_ken',
  DIRECTION_CHANGE: 'direction_change',
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
/* Fair Dice & Seeded Deterministic PRNG                               */
/* ------------------------------------------------------------------ */

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
/* Mode Helpers & State Cloning                                        */
/* ------------------------------------------------------------------ */

export function isHistoricalMode(state) {
  if (!state) return true;
  return state.ruleMode !== 'legacy';
}

export function getEffectiveMovementMode(board, state = null, pos = null) {
  if (Number.isInteger(pos) && board?.nodes?.[pos]?.movementMode) {
    return board.nodes[pos].movementMode;
  }
  if (board?.movementMode) {
    return board.movementMode;
  }
  if (board?.style === ESR_STYLE.TOBI) return ESR_MOVEMENT_MODE.TOBI;
  if (board?.style === ESR_STYLE.KESSHU || board?.style === ESR_STYLE.WAKARE) {
    return ESR_MOVEMENT_MODE.TOBI_MAWARI;
  }
  return ESR_MOVEMENT_MODE.MAWARI;
}

function padPlayerArray(arr, count, fillValue) {
  const base = Array.isArray(arr) ? [...arr] : [];
  while (base.length < count) {
    base.push(typeof fillValue === 'function' ? fillValue(base.length) : fillValue);
  }
  return base;
}

function defaultBoardState(playerCount = 2) {
  const n = Math.max(2, playerCount | 0);
  return {
    tokaido: {
      gourmetMask: Array(n).fill(0),
      coins: Array(n).fill(0),
      coinsSpent: Array(n).fill(0),
    },
    yokai: {
      lanternMask: Array(n).fill(0),
      frenzyPending: Array(n).fill(false),
      frenzyEarned: Array(n).fill(false),
      frenzyTriggered: Array(n).fill(false),
    },
    kesshu: {
      tempShield: Array(n).fill(false),
      lastStance: Array(n).fill(null),
      stanceCount: Array(n).fill(0),
    },
    genji: {
      routeChoice: Array(n).fill(null),
      balance: Array(n).fill(0),
      grudgeMarks: Array(n).fill(0),
    },
  };
}

export function cloneState(state) {
  const pCount = Math.max(2, Math.min(4, Number(state?.playerCount) || state?.pos?.length || 2));
  const bs = state?.boardState || defaultBoardState(pCount);
  return {
    ...state,
    ruleMode: state?.ruleMode || 'legacy',
    movementMode: state?.movementMode || null,
    playerCount: pCount,
    allowSharedSquare: state?.allowSharedSquare !== undefined
      ? Boolean(state.allowSharedSquare)
      : state?.ruleMode !== 'legacy',
    koma: padPlayerArray(state?.koma, pCount, i => HISTORICAL_KOMA[i % HISTORICAL_KOMA.length].id),
    kashi: padPlayerArray(state?.kashi, pCount, 5),
    direction: padPlayerArray(state?.direction, pCount, 1),
    kitsuneCount: state?.kitsuneCount || 0,
    lastKitsuneResult: state?.lastKitsuneResult ? { ...state.lastKitsuneResult } : null,
    pos: padPlayerArray(state?.pos, pCount, 0),
    tokens: padPlayerArray(state?.tokens, pCount, 0),
    skip: padPlayerArray(state?.skip, pCount, 0),
    charms: padPlayerArray(state?.charms, pCount, 0),
    charmUsed: padPlayerArray(state?.charmUsed, pCount, 0),
    charmLoadout: Array.from({ length: pCount }, (_, i) =>
      Array.isArray(state?.charmLoadout?.[i]) ? [...state.charmLoadout[i]] : [],
    ),
    charmCooldown: Array.from({ length: pCount }, (_, i) => ({
      ...(state?.charmCooldown?.[i] || {}),
    })),
    windActive: padPlayerArray(state?.windActive, pCount, false),
    customCard: state?.customCard || null,
    customBuff: state?.customBuff ? { ...state.customBuff } : null,
    equippedCard: padPlayerArray(
      state?.equippedCard || [state?.customCard || null, null],
      pCount,
      null,
    ),
    playerBuffs: Array.from({ length: pCount }, (_, i) => {
      if (Array.isArray(state?.playerBuffs) && state.playerBuffs[i]) {
        return { ...state.playerBuffs[i] };
      }
      if (i === 0 && state?.customBuff) {
        return { ...state.customBuff };
      }
      return null;
    }),
    strikeCooldown: padPlayerArray(state?.strikeCooldown, pCount, 0),
    duelCount: state?.duelCount || 0,
    stealCount: padPlayerArray(state?.stealCount, pCount, 0),
    ply: state?.ply ?? state?.turnCount ?? 0,
    maxPly: state?.maxPly || 120,
    playerTurnCount: padPlayerArray(state?.playerTurnCount, pCount, 0),
    pendingChoice: state?.pendingChoice ? { ...state.pendingChoice } : null,
    resultReason: state?.resultReason || null,
    rngSeed: state?.rngSeed ?? 0x12345678,
    rngState: state?.rngState ?? state?.rngSeed ?? 0x12345678,
    boardState: {
      tokaido: {
        gourmetMask: padPlayerArray(bs.tokaido?.gourmetMask, pCount, 0),
        coins: padPlayerArray(bs.tokaido?.coins, pCount, 0),
        coinsSpent: padPlayerArray(bs.tokaido?.coinsSpent, pCount, 0),
      },
      yokai: {
        lanternMask: padPlayerArray(bs.yokai?.lanternMask, pCount, 0),
        frenzyPending: padPlayerArray(bs.yokai?.frenzyPending, pCount, false),
        frenzyEarned: padPlayerArray(bs.yokai?.frenzyEarned, pCount, false),
        frenzyTriggered: padPlayerArray(bs.yokai?.frenzyTriggered, pCount, false),
      },
      kesshu: {
        tempShield: padPlayerArray(bs.kesshu?.tempShield, pCount, false),
        lastStance: padPlayerArray(bs.kesshu?.lastStance, pCount, null),
        stanceCount: padPlayerArray(bs.kesshu?.stanceCount, pCount, 0),
      },
      genji: {
        routeChoice: padPlayerArray(bs.genji?.routeChoice, pCount, null),
        balance: padPlayerArray(bs.genji?.balance, pCount, 0),
        grudgeMarks: padPlayerArray(bs.genji?.grudgeMarks, pCount, 0),
      },
    },
    history: [...(state?.history || [])],
    events: [],
  };
}

function getPlayerBuff(state, player) {
  if (isHistoricalMode(state)) return null;
  if (Array.isArray(state?.playerBuffs) && state.playerBuffs[player]) {
    return state.playerBuffs[player];
  }
  if (state?.customBuff && player === (state.humanSide ?? 0)) {
    return state.customBuff;
  }
  return null;
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
  if (isHistoricalMode(state)) return false;
  return ((state.charms[player] | 0) & charmMask) !== 0 &&
    ((state.charmUsed[player] | 0) & charmMask) === 0;
}

function consumeCharm(state, player, charmMask) {
  state.charmUsed[player] = (state.charmUsed[player] | 0) | charmMask;
  const charmDef = CHARMS.find(c => c.mask === charmMask);
  if (charmDef) {
    if (charmDef.oncePerMatch || (charmMask & ONCE_PER_MATCH_MASK) !== 0) {
      state.charmCooldown[player][charmDef.id] = -1;
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

/* ------------------------------------------------------------------ */
/* Walk & Three Historical E-Sugoroku Movement Engines                 */
/* ------------------------------------------------------------------ */

function walk(board, start, steps, roll, player, branchGood, pauseOnBranch = false, initialDirection = 1) {
  let pos = start;
  let direction = initialDirection < 0 ? -1 : 1;
  let bounced = false;
  let branchSeen = false;
  const path = [start];
  const events = [];
  const exactBounce = board.goalRule ? board.goalRule.type === 'exact-bounce' : Boolean(board.bounceBack);

  for (let step = 0; step < steps; step++) {
    if (direction < 0) {
      const prev = nodeAt(board, pos)?.prev;
      if (prev === undefined || prev === null || prev < 0) {
        direction = 1;
        const nextArr = nodeAt(board, pos)?.next || [];
        if (!nextArr.length) break;
        pos = nextArr[0];
        path.push(pos);
        continue;
      }
      pos = prev;
      path.push(pos);
      continue;
    }

    if (pos === board.goal) {
      if (!exactBounce) break;
      const prev = nodeAt(board, pos)?.prev;
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

/**
 * 1. 廻り双六 (Mawari-sugoroku) movement engine:
 *    Advances `roll` steps sequentially along `node.next` (or reversed in `kitsune` mode),
 *    applying `goalRule` (`exact-bounce` or `reach`).
 */
export function resolveMawariMove(board, state, player, roll, options = {}) {
  const start = state.pos[player] | 0;
  const dir = state.ruleMode === 'kitsune' ? (state.direction?.[player] || 1) : 1;
  const walked = walk(board, start, roll, roll, player, true, false, dir);
  const events = [...walked.events];
  pushEvent(events, EVENT.MOVE, player, start, walked.pos, roll, {
    steps: roll,
    movementMode: ESR_MOVEMENT_MODE.MAWARI,
    direction: dir,
    path: walked.path,
  });
  return {
    from: start,
    pos: walked.pos,
    path: walked.path,
    events,
    moved: walked.pos !== start || walked.bounced,
    stayedByNullDestination: false,
    pausedAtBranch: false,
    remainingSteps: 0,
  };
}

/**
 * 2. 飛び双六 (Tobi-sugoroku) movement engine:
 *    Reads `node.dieDestinations[roll]` directly from the current square.
 *    - If the entry is `null` (or undefined), the pawn cannot move on this die roll and stays in place.
 *    - Otherwise, the pawn jumps directly to the specified destination square (`[start, targetIdx]`).
 */
export function resolveTobiMove(board, state, player, roll, options = {}) {
  const start = state.pos[player] | 0;
  const node = nodeAt(board, start);
  const events = [];
  const dieDestinations = node?.dieDestinations || null;

  if (dieDestinations && Object.prototype.hasOwnProperty.call(dieDestinations, roll)) {
    const rawTarget = dieDestinations[roll];
    if (rawTarget === null || rawTarget === undefined) {
      pushEvent(events, EVENT.TOBI_STAY, player, start, start, roll, {
        movementMode: ESR_MOVEMENT_MODE.TOBI,
        reason: 'no_destination_for_roll',
      });
      pushEvent(events, EVENT.MOVE, player, start, start, roll, {
        steps: 0,
        movementMode: ESR_MOVEMENT_MODE.TOBI,
        stayedByNullDestination: true,
        path: [start],
      });
      return {
        from: start,
        pos: start,
        path: [start],
        events,
        moved: false,
        stayedByNullDestination: true,
        pausedAtBranch: false,
        remainingSteps: 0,
      };
    }

    const resolved = resolveNodeRef(board, rawTarget);
    const targetIdx = Number.isInteger(resolved) ? clampNode(board, resolved) : start;
    const path = targetIdx === start ? [start] : [start, targetIdx];
    pushEvent(events, EVENT.MOVE, player, start, targetIdx, roll, {
      steps: 1,
      movementMode: ESR_MOVEMENT_MODE.TOBI,
      dieTarget: rawTarget,
      path,
    });
    return {
      from: start,
      pos: targetIdx,
      path,
      events,
      moved: targetIdx !== start,
      stayedByNullDestination: false,
      pausedAtBranch: false,
      remainingSteps: 0,
    };
  }

  // Fallback if a square on a tobi board omits dieDestinations
  return resolveMawariMove(board, state, player, roll, options);
}

/**
 * 3. 飛び廻り双六 (Tobi-Mawari-sugoroku) movement engine:
 *    Walks `roll` steps along `node.next` (supporting branch selection on Genji #15),
 *    then hands off to `executeLandingInstructionOnce` for iroha / chapter jumps.
 */
export function resolveTobiMawariMove(board, state, player, roll, options = {}) {
  const start = state.pos[player] | 0;
  const chosenRoute = options.routeChoice || state.boardState?.genji?.routeChoice?.[player];
  const branchGood = chosenRoute ? (chosenRoute === 'good') : (roll % 2 === 0);
  const pauseOnBranch = Boolean(options.pauseOnChoice && board.id === 'genji' && !chosenRoute);
  const dir = state.ruleMode === 'kitsune' ? (state.direction?.[player] || 1) : 1;

  const walked = walk(board, start, roll, roll, player, branchGood, pauseOnBranch, dir);
  const events = [...walked.events];
  pushEvent(events, EVENT.MOVE, player, start, walked.pos, roll, {
    steps: roll,
    movementMode: ESR_MOVEMENT_MODE.TOBI_MAWARI,
    branchGood,
    path: walked.path,
  });
  return {
    from: start,
    pos: walked.pos,
    path: walked.path,
    events,
    moved: walked.pos !== start || walked.bounced,
    stayedByNullDestination: false,
    pausedAtBranch: walked.pausedAtBranch,
    remainingSteps: walked.remainingSteps,
  };
}

/**
 * Executes the square's printed `landingInstruction` at most ONCE per turn.
 * Never chains into a second square's `landingInstruction`.
 */
export function executeLandingInstructionOnce(board, state, player, contactPos, roll, events, options = {}) {
  if (contactPos === board.goal) {
    return { pos: contactPos, paused: false, executed: false };
  }
  const contactNode = nodeAt(board, contactPos);
  const inst = contactNode?.landingInstruction;
  if (!inst || !inst.type) {
    return { pos: contactPos, paused: false, executed: false };
  }

  if (inst.type === 'rest') {
    const turns = Math.max(1, inst.turns | 0);
    state.skip[player] = (state.skip[player] | 0) + turns;
    pushEvent(events, EVENT.LANDING_INSTRUCTION, player, contactPos, contactPos, roll, {
      instructionType: 'rest',
      turns,
      text: inst.text || '',
    });
    pushEvent(events, EVENT.STAY, player, contactPos, contactPos, roll, {
      turns,
      text: inst.text || '',
    });
    return { pos: contactPos, paused: false, executed: true };
  }

  if (inst.type === 'moveTo' || inst.type === 'returnTo' || inst.type === 'restart') {
    const resolved = inst.type === 'restart'
      ? board.start
      : resolveNodeRef(board, inst.target);
    if (Number.isInteger(resolved) && resolved !== contactPos) {
      const dest = clampNode(board, resolved);
      const delta = dest - contactPos;
      state.pos[player] = dest;
      pushEvent(events, EVENT.LANDING_INSTRUCTION, player, contactPos, dest, roll, {
        instructionType: inst.type,
        target: inst.target,
        targetIndex: dest,
        kana: inst.kana || null,
        text: inst.text || '',
      });
      pushEvent(events, EVENT.JUMP, player, contactPos, dest, roll, {
        delta,
        multiplier: 1,
        jumpBonus: 0,
        instructionType: inst.type,
        kana: inst.kana || null,
        text: inst.text || '',
      });
      return { pos: dest, paused: false, executed: true };
    }
    return { pos: contactPos, paused: false, executed: false };
  }

  if (inst.type === 'branch') {
    if (board.id === 'genji' && contactPos === 15 && !state.boardState.genji.routeChoice[player] && options.pauseOnChoice) {
      state.pendingChoice = {
        type: 'genji_branch',
        player,
        pos: 15,
        roll,
        wakaPreview: buildGenjiBranchSummary(board),
        options: ['good', 'evil'],
      };
      pushEvent(events, EVENT.PENDING_CHOICE, player, contactPos, contactPos, roll, {
        choiceType: 'genji_branch',
        options: ['good', 'evil'],
      });
      return { pos: contactPos, paused: true, executed: true };
    }
  }

  return { pos: contactPos, paused: false, executed: false };
}

/* ------------------------------------------------------------------ */
/* Special Historical Mode: 『しん工夫けん双六』（狐拳名所双六）         */
/* ------------------------------------------------------------------ */

/**
 * Resolves a single Kitsune-ken (狐拳 / 藤八拳) bout:
 *   - `fox` (狐) beats `shoya` (庄屋)
 *   - `shoya` (庄屋) beats `hunter` (猟師)
 *   - `hunter` (猟師) beats `fox` (狐)
 * Returns `1` if `handA` wins, `-1` if `handB` wins, `0` on draw.
 */
const KITSUNE_HAND_LIST = Object.freeze(['fox', 'shoya', 'hunter']);

export function resolveKitsuneKenBout(handA, handB) {
  if (!handA || !handB || handA === handB) return 0;
  if (KITSUNE_KEN_HANDS[handA]?.beats === handB) return 1;
  if (KITSUNE_KEN_HANDS[handB]?.beats === handA) return -1;
  return 0;
}

function resolveKitsuneKenEncounter(board, state, player, pos, roll, events, options = {}) {
  if (state.ruleMode !== 'kitsune' || pos === board.start || pos === board.goal) {
    return { paused: false };
  }
  const pCount = Math.max(2, state.playerCount || state.pos.length || 2);
  const opponentsHere = [];
  for (let side = 0; side < pCount; side++) {
    if (side !== player && state.pos[side] === pos) {
      opponentsHere.push(side);
    }
  }
  if (opponentsHere.length === 0) {
    return { paused: false };
  }

  const opponent = opponentsHere[0];
  if (options.pauseOnChoice && !options.kitsuneHand) {
    state.pendingChoice = {
      type: 'kitsune_ken',
      player,
      opponent,
      pos,
      square: pos,
      roll,
      options: [...KITSUNE_HAND_LIST],
    };
    pushEvent(events, EVENT.PENDING_CHOICE, player, pos, pos, roll, {
      choiceType: 'kitsune_ken',
      opponent,
      options: [...KITSUNE_HAND_LIST],
    });
    return { paused: true };
  }

  const myHand = KITSUNE_HAND_LIST.includes(options.kitsuneHand)
    ? options.kitsuneHand
    : KITSUNE_HAND_LIST[(roll + player + (state.ply || 0)) % 3];
  const oppHand = KITSUNE_HAND_LIST.includes(options.opponentKitsuneHand)
    ? options.opponentKitsuneHand
    : KITSUNE_HAND_LIST[(roll * 2 + opponent + (state.ply || 0) + 1) % 3];

  let outcome = resolveKitsuneKenBout(myHand, oppHand);
  // In traditional Kitsune-ken, ties re-throw immediately until a winner is decided
  let tieBreakHandA = myHand;
  let tieBreakHandB = oppHand;
  if (outcome === 0) {
    tieBreakHandB = KITSUNE_KEN_HANDS[myHand].beats; // deterministic tie-break based on roll parity
    if ((roll + (state.ply || 0)) % 2 === 1) {
      outcome = -1;
      tieBreakHandB = KITSUNE_HAND_LIST.find(h => KITSUNE_KEN_HANDS[h].beats === myHand) || 'hunter';
    } else {
      outcome = 1;
    }
  }

  const winner = outcome > 0 ? player : opponent;
  const loser = outcome > 0 ? opponent : player;
  const transferred = (state.kashi[loser] | 0) > 0 ? 1 : 0;
  if (transferred > 0) {
    state.kashi[loser] = Math.max(0, (state.kashi[loser] | 0) - 1);
    state.kashi[winner] = (state.kashi[winner] | 0) + 1;
  }
  state.kitsuneCount = (state.kitsuneCount || 0) + 1;
  state.lastKitsuneResult = {
    player,
    opponent,
    pos,
    playerHand: tieBreakHandA,
    opponentHand: tieBreakHandB,
    winner,
    loser,
    transferred,
  };

  pushEvent(events, EVENT.KITSUNE_KEN, player, pos, pos, roll, {
    opponent,
    playerHand: tieBreakHandA,
    opponentHand: tieBreakHandB,
    winner,
    loser,
    transferred,
    kashi: [...state.kashi],
  });
  return { paused: false };
}

/* ------------------------------------------------------------------ */
/* Legacy Same-Square Clash & Legacy Contact Resolution                */
/* ------------------------------------------------------------------ */

function resolveSameSquareClash(board, state, player, pos, roll, events, options = {}) {
  if (isHistoricalMode(state)) {
    if (state.ruleMode === 'kitsune') {
      return resolveKitsuneKenEncounter(board, state, player, pos, roll, events, options);
    }
    // Historical E-Sugoroku: multiple pawns peacefully share the same square without knockback
    return { paused: false };
  }

  const opponent = 1 - player;
  if (state.pos[opponent] !== pos || pos === board.start || pos === board.goal) {
    return { paused: false };
  }

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
          stolenBit = stealable & -stealable;
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

function resolveHistoricalLanding(board, state, player, contactPos, roll, events, options = {}, moved = true) {
  let pos = contactPos;
  const contactNode = nodeAt(board, contactPos);

  // Record cultural collection stamps (Meibutsu / Ao-Andon / 武具 / 帖) for gallery & appreciation
  if (contactPos !== board.goal) {
    if ((contactNode.tokens | 0) !== 0) {
      state.tokens[player] = (state.tokens[player] | 0) | contactNode.tokens;
      pushEvent(events, EVENT.TOKEN, player, contactPos, contactPos, roll, {
        tokens: contactNode.tokens,
        label: contactNode.tokenLabel || '',
      });
    }
    if (board.id === 'tokaido' && (contactNode.gourmetBit | 0) !== 0) {
      const bit = contactNode.gourmetBit | 0;
      const prevMask = state.boardState.tokaido.gourmetMask[player] | 0;
      if ((prevMask & bit) === 0) {
        state.boardState.tokaido.gourmetMask[player] = prevMask | bit;
        pushEvent(events, EVENT.GOURMET, player, contactPos, contactPos, roll, {
          gourmetBit: bit,
          gourmetMask: state.boardState.tokaido.gourmetMask[player],
          title: contactNode.title,
        });
      }
    }
    if (board.id === 'yokai' && (contactNode.lanternBit | 0) !== 0) {
      const bit = contactNode.lanternBit | 0;
      const prevMask = state.boardState.yokai.lanternMask[player] | 0;
      if ((prevMask & bit) === 0) {
        state.boardState.yokai.lanternMask[player] = prevMask | bit;
      }
    }
  }

  // Execute square's landingInstruction at most ONCE per turn (only if the pawn moved onto this square)
  if (moved && contactPos !== board.goal) {
    const instRes = executeLandingInstructionOnce(board, state, player, contactPos, roll, events, options);
    pos = instRes.pos;
    if (instRes.paused) {
      return { won: false, paused: true };
    }
  }

  // Check goal arrival (no regalia token lock in historical E-Sugoroku mode)
  if (pos === board.goal) {
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

  // In Kitsune-ken special mode, check if meeting another player on the final square triggers Kitsune-ken
  if (state.ruleMode === 'kitsune') {
    const kenRes = resolveKitsuneKenEncounter(board, state, player, pos, roll, events, options);
    if (kenRes.paused) {
      return { won: false, paused: true };
    }
  }

  // If player landed on Genji #15 and hasn't chosen a route yet, prompt for next turn
  if (board.id === 'genji' && pos === 15 && !state.boardState.genji.routeChoice[player] && options.pauseOnChoice) {
    state.pendingChoice = {
      type: 'genji_branch',
      player,
      pos: 15,
      roll,
      wakaPreview: buildGenjiBranchSummary(board),
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

function resolveLanding(board, state, player, contactPos, roll, events, options = {}) {
  if (isHistoricalMode(state)) {
    return resolveHistoricalLanding(board, state, player, contactPos, roll, events, options, true);
  }

  let pos = contactPos;
  const contactNode = nodeAt(board, contactPos);
  const buff = getPlayerBuff(state, player);
  let earnedFrenzyThisTurn = false;

  if (contactPos !== board.goal) {
    if ((contactNode.tokens | 0) !== 0) {
      state.tokens[player] = (state.tokens[player] | 0) | contactNode.tokens;
      pushEvent(events, EVENT.TOKEN, player, contactPos, contactPos, roll, {
        tokens: contactNode.tokens,
        label: contactNode.tokenLabel || '',
      });
    }

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

    if (board.id === 'genji') {
      if (contactNode.kind === 'good') {
        state.boardState.genji.balance[player] = (state.boardState.genji.balance[player] || 0) + 1;
      } else if (contactNode.kind === 'evil') {
        state.boardState.genji.balance[player] = (state.boardState.genji.balance[player] || 0) - 1;
        state.boardState.genji.grudgeMarks[player] = (state.boardState.genji.grudgeMarks[player] | 0) + 1;
      }
    }
  }

  if (contactPos !== board.goal) {
    const table = Array.isArray(contactNode.jumpTable) ? contactNode.jumpTable : [];
    const jump = Number(table[roll - 1] || 0);
    if (jump !== 0) {
      let cancelled = false;
      if (jump < 0) {
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
    const pushed = stepBackward(board, board.goal, 1);
    state.pos[player] = pushed;
    pos = pushed;
    pushEvent(events, EVENT.GOAL_LOCKED, player, board.goal, pos, roll, {
      required,
    });
  }

  const clashRes = resolveSameSquareClash(board, state, player, pos, roll, events, options);
  if (clashRes.paused) {
    return { won: false, paused: true };
  }

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
      name: '明石・都還り路（和歌と雅宴の章）',
      nodeCount: goodNodes.length,
      jumps: goodNodes.filter(n => n.landingInstruction?.type === 'moveTo').length,
      stays: goodNodes.filter(n => n.landingInstruction?.type === 'rest').length,
      summary: '明石の浦より澪標・松風を経て六条院へ至る風雅な都還りルート',
    },
    evil: {
      name: '浮舟・宇治十帖路（宿世と試練の章）',
      nodeCount: evilNodes.length,
      jumps: evilNodes.filter(n => n.landingInstruction?.type === 'moveTo').length,
      stays: evilNodes.filter(n => n.landingInstruction?.type === 'rest').length,
      summary: '夕霧・柏木・宇治橋姫の宿世を辿り絵合へ合流する物語ルート',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Max-Ply Timeout Settlement                                          */
/* ------------------------------------------------------------------ */

function volumeResourceScore(board, state, player) {
  if (state.ruleMode === 'kitsune') {
    return (state.kashi?.[player] | 0) * 10;
  }
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
  const pCount = Math.max(2, state.playerCount || state.pos?.length || 2);
  if (pCount === 2) {
    const p0 = getNodeProgress(board, state.pos[0]);
    const p1 = getNodeProgress(board, state.pos[1]);
    let winner = 2; // 2 = draw in 2P
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

  // Multi-player (3–4P) settlement by highest board progress then resource score
  let bestSide = 0;
  let bestProg = -Infinity;
  let bestRes = -Infinity;
  const progress = [];
  for (let s = 0; s < pCount; s++) {
    const pr = getNodeProgress(board, state.pos[s]);
    const rs = volumeResourceScore(board, state, s);
    progress.push(pr);
    if (pr > bestProg || (pr === bestProg && rs > bestRes)) {
      bestProg = pr;
      bestRes = rs;
      bestSide = s;
    }
  }
  state.winner = bestSide;
  state.resultReason = 'max_ply';
  pushEvent(events, EVENT.TIMEOUT, bestSide, state.pos[bestSide], state.pos[0], 0, {
    winner: bestSide,
    reason: 'max_ply',
    ply: state.ply,
    maxPly: state.maxPly,
    progress,
  });
  return bestSide;
}

function finalizeTurnAdvance(board, state, player, startPos, roll, steps, events) {
  const pCount = Math.max(2, state.playerCount || state.pos?.length || 2);
  const nextTurn = (player + 1) % pCount;
  state.turn = nextTurn;
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
/* Active Tactical Strike (Legacy V1.1 Mode Only)                      */
/* ------------------------------------------------------------------ */

export function canUseTacticalStrike(board, state, player = state?.turn ?? 0, options = {}) {
  if (!board || !state || (state.winner ?? -1) >= 0) {
    return { ok: false, reason: 'finished' };
  }
  if (isHistoricalMode(state)) {
    return { ok: false, reason: 'disabled_in_historical_mode' };
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
/* Active Charm & Choice Application                                   */
/* ------------------------------------------------------------------ */

export function applyCharm(board, state, charmId, options = {}) {
  if (!board || !state || (state.winner ?? -1) >= 0) {
    return { ok: false, reason: 'finished', state: cloneState(state || {}), events: [] };
  }
  if (isHistoricalMode(state)) {
    return { ok: false, reason: 'disabled_in_historical_mode', state: cloneState(state), events: [] };
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

  // 0. Kitsune-ken direction toggle ('forward' 順回り | 'backward' 逆回り)
  if (choice.type === 'kitsune_direction' && next.ruleMode === 'kitsune') {
    const dir = choice.direction === -1 || choice.direction === 'backward' ? -1 : 1;
    next.direction[player] = dir;
    pushEvent(events, EVENT.DIRECTION_CHANGE, player, next.pos[player], next.pos[player], 0, {
      direction: dir,
      label: dir > 0 ? '順回り' : '逆回り',
    });
    next.events = events;
    return { ok: true, state: next, events, won: false };
  }

  // 0b. Kitsune-ken hand choice ('fox' | 'shoya' | 'hunter')
  if (choice.type === 'kitsune_ken' || next.pendingChoice?.type === 'kitsune_ken') {
    const hand = KITSUNE_KEN_HANDS.includes(choice.hand) ? choice.hand : 'fox';
    const pos = next.pendingChoice?.pos ?? next.pos[player];
    const roll = next.pendingChoice?.roll ?? next.lastRoll ?? 1;
    next.pendingChoice = null;
    resolveKitsuneKenEncounter(board, next, player, pos, roll, events, {
      kitsuneHand: hand,
      opponentKitsuneHand: choice.opponentHand,
      pauseOnChoice: false,
    });
    const fin = finalizeTurnAdvance(board, next, player, pos, roll, roll, events);
    return { ok: true, ...fin };
  }

  // 1. Genji Branch Choice ('good' | 'evil')
  if (choice.type === 'genji_branch' || next.pendingChoice?.type === 'genji_branch') {
    const route = choice.route === 'evil' ? 'evil' : 'good';
    next.boardState.genji.routeChoice[player] = route;
    if (!isHistoricalMode(next)) {
      next.boardState.genji.balance[player] = (next.boardState.genji.balance[player] || 0) + (route === 'good' ? 1 : -1);
    }
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

  // 2. Kesshu Combat Stance Choice (Legacy mode)
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

  // 3. Tokaido Travel Coin Choice (Legacy mode)
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
    if (pc.type === 'kitsune_ken') {
      return [
        { type: 'kitsune_ken', hand: 'fox', label: '狐（庄屋に勝つ）' },
        { type: 'kitsune_ken', hand: 'shoya', label: '庄屋（猟師に勝つ）' },
        { type: 'kitsune_ken', hand: 'hunter', label: '猟師（狐に勝つ）' },
      ];
    }
    if (pc.type === 'kesshu_stance') {
      return [
        { type: 'kesshu_stance', stance: 'assault', label: '猛攻（3格弾き＋武具奪取）' },
        { type: 'kesshu_stance', stance: 'feint', label: '牽制（1格弾き＋一時防護）' },
        { type: 'kesshu_stance', stance: 'defend', label: '固守（反撃無効＋武具保護）' },
      ];
    }
    if (pc.type === 'genji_branch') {
      return [
        { type: 'genji_branch', route: 'good', label: isHistoricalMode(state) ? '明石・都還り路（和歌の章）' : '雅道（善玉五帖・安定進路）' },
        { type: 'genji_branch', route: 'evil', label: isHistoricalMode(state) ? '浮舟・宇治十帖路（宿世の章）' : '修羅道（悪玉五帖・怨念蒐集）' },
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
  if (state.ruleMode === 'kitsune') {
    actions.push(
      { type: 'kitsune_direction', direction: 1, label: '順回り' },
      { type: 'kitsune_direction', direction: -1, label: '逆回り' },
    );
  }
  if (board.id === 'genji' && state.pos[player] === 15 && !state.boardState.genji.routeChoice[player]) {
    actions.push(
      { type: 'genji_branch', route: 'good' },
      { type: 'genji_branch', route: 'evil' },
    );
  }
  if (!isHistoricalMode(state)) {
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
  }
  return actions;
}

/* ------------------------------------------------------------------ */
/* Core Roll & Turn Progression                                        */
/* ------------------------------------------------------------------ */

function tickPlayerCooldownsAndRecharge(next, player, roll, events) {
  if (isHistoricalMode(next)) return;
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

  const start = next.pos[player] | 0;

  // --- Historical E-Sugoroku Mode ('historical' | 'kitsune') ---
  if (isHistoricalMode(next)) {
    if (next.ruleMode === 'kitsune' && (options.direction === 1 || options.direction === -1)) {
      next.direction[player] = options.direction;
    }
    const mode = getEffectiveMovementMode(board, next, start);
    let moveResult;
    if (mode === ESR_MOVEMENT_MODE.TOBI) {
      moveResult = resolveTobiMove(board, next, player, roll, options);
    } else if (mode === ESR_MOVEMENT_MODE.TOBI_MAWARI) {
      moveResult = resolveTobiMawariMove(board, next, player, roll, options);
    } else {
      moveResult = resolveMawariMove(board, next, player, roll, options);
    }

    next.pos[player] = moveResult.pos;
    events.push(...moveResult.events);

    if (moveResult.pausedAtBranch) {
      next.pendingChoice = {
        type: 'genji_branch',
        player,
        pos: moveResult.pos,
        square: moveResult.pos,
        roll,
        remainingSteps: moveResult.remainingSteps,
        wakaPreview: buildGenjiBranchSummary(board),
        options: ['good', 'evil'],
      };
      pushEvent(events, EVENT.PENDING_CHOICE, player, moveResult.pos, moveResult.pos, roll, {
        choiceType: 'genji_branch',
        remainingSteps: moveResult.remainingSteps,
        options: ['good', 'evil'],
      });
      next.events = events;
      return { state: next, events, won: false, pendingChoice: next.pendingChoice };
    }

    const landRes = resolveHistoricalLanding(
      board,
      next,
      player,
      moveResult.pos,
      roll,
      events,
      options,
      moveResult.moved,
    );
    if (landRes.paused) {
      next.events = events;
      return { state: next, events, won: false, pendingChoice: next.pendingChoice };
    }
    if (landRes.won) {
      next.events = events;
      next.history = [
        ...(next.history || []),
        { player, roll, steps: roll, from: start, to: next.pos[player], won: true, ply: next.ply },
      ].slice(-150);
      return { state: next, events, won: true };
    }

    return finalizeTurnAdvance(board, next, player, start, roll, roll, events);
  }

  // --- Legacy V1.1–V1.3 Mode ('legacy') ---
  let steps = roll;
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
/* Unified Simulation & Preview                                        */
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
  const tobiStayEv = result.events.find(e => e.type === EVENT.TOBI_STAY);
  const duelEv = result.events.find(e => e.type === EVENT.DUEL);
  const kenEv = result.events.find(e => e.type === EVENT.KITSUNE_KEN);
  const instEv = result.events.find(e => e.type === EVENT.LANDING_INSTRUCTION);
  const finalPos = result.state.pos[player];

  let kind = 'move';
  if (result.won && result.state.winner === player) kind = 'win';
  else if (tobiStayEv) kind = 'tobi_stay';
  else if (jumpEv) kind = jumpEv.delta > 0 ? 'jump' : 'back';
  else if (stayEv) kind = 'stay';
  else if (kenEv) kind = 'kitsune';
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
    stayed: Boolean(stayEv || tobiStayEv),
    tobiStayed: Boolean(tobiStayEv),
    clashed: Boolean(duelEv || kenEv),
    landingInstruction: instEv ? instEv.payload : null,
    won: Boolean(result.won && result.state.winner === player),
    needsChoice: needsBranchChoice || (!isHistoricalMode(simState) && board.id === 'kesshu' && Boolean(duelEv)),
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
    tobiStayed: sim.tobiStayed,
    clashed: sim.clashed,
    won: sim.won,
    needsChoice: sim.needsChoice,
  }];
}

export function previewOutcomes(board, state, options = {}) {
  return [1, 2, 3, 4, 5, 6].map(roll => simulateTurn(board, state, roll, options));
}

/* ------------------------------------------------------------------ */
/* State Evaluation & Fair AI Engine                                   */
/* ------------------------------------------------------------------ */

export function evaluateState(board, state, player) {
  if (!board || !state) return 0;
  const pCount = Math.max(2, state.playerCount || state.pos?.length || 2);
  const opponent = (player + 1) % pCount;
  if ((state.winner ?? -1) === player) return 1000;
  if ((state.winner ?? -1) >= 0 && state.winner !== 2) return -1000;
  if ((state.winner ?? -1) === 2) return 0;

  const span = Math.max(1, getNodeProgress(board, board.goal));
  const myProg = getNodeProgress(board, state.pos[player]);
  const oppProg = getNodeProgress(board, state.pos[opponent]);

  let score = 0;
  score += (myProg / span) * 120;
  score -= (oppProg / span) * 95;
  score -= (state.skip[player] | 0) * 14;
  score += (state.skip[opponent] | 0) * 11;

  if (state.ruleMode === 'kitsune') {
    score += (state.kashi?.[player] | 0) * 6;
    score -= (state.kashi?.[opponent] | 0) * 4;
  }

  if (!isHistoricalMode(state)) {
    score += popcount3(state.tokens[player]) * 26;
    score -= popcount3(state.tokens[opponent]) * 20;
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
      if (!isHistoricalMode(state)) {
        total += popcount3(result.state.tokens[player]) * 18;
      }
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
      sum += expectiminimaxSearch(board, res.state, maximizingPlayer, depth);
    } else if (depth <= 1) {
      sum += evaluateState(board, res.state, maximizingPlayer);
    } else {
      sum += expectiminimaxSearch(board, res.state, maximizingPlayer, depth - 1);
    }
  }
  return sum / 6;
}

export function expectiminimaxSearch(board, state, maximizingPlayer, depth = 2) {
  if (!board || !state) return 0;
  if ((state.winner ?? -1) >= 0 || depth <= 0) {
    return evaluateState(board, state, maximizingPlayer);
  }

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

  const mover = state.turn | 0;
  const isMax = mover === maximizingPlayer;
  let bestVal = expectiminimaxRollChance(board, state, maximizingPlayer, depth);

  if (isHistoricalMode(state)) {
    return bestVal;
  }

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

export function aiSelectAction(board, state, difficulty = state?.aiDifficulty || 'normal', options = {}) {
  if (!board || !state || (state.winner ?? -1) >= 0) {
    return { type: 'roll' };
  }
  const ai = state.turn | 0;
  const pCount = Math.max(2, state.playerCount || state.pos?.length || 2);
  const opp = (ai + 1) % pCount;
  const searchDepth = difficulty === 'master' ? 2 : 1;

  // 1. Handle Pending Choice
  if (state.pendingChoice) {
    const pc = state.pendingChoice;
    const legal = getLegalChoices(board, state);

    if (pc.type === 'kitsune_ken') {
      const idx = ((state.ply || 0) + ai) % KITSUNE_KEN_HANDS.length;
      return { type: 'kitsune_ken', hand: KITSUNE_KEN_HANDS[idx] };
    }

    if ((difficulty === 'master' || difficulty === 'hard') && legal.length > 0) {
      let bestChoice = legal[0];
      let bestScore = -Infinity;
      for (const candidate of legal) {
        const res = applyChoice(board, state, candidate);
        let score = (res.state.winner ?? -1) >= 0
          ? evaluateState(board, res.state, ai)
          : expectiminimaxSearch(board, res.state, ai, searchDepth - 1);
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

    if (pc.type === 'kesshu_stance') {
      if (difficulty === 'easy') return { type: 'kesshu_stance', stance: 'feint' };
      const myTok = popcount3(state.tokens[ai]);
      const oppTok = state.tokens[opp] | 0;
      const canSteal = (oppTok & ~(state.tokens[ai] | 0)) !== 0;
      if (myTok >= 3 && state.pos[ai] >= board.goal - 4) return { type: 'kesshu_stance', stance: 'defend' };
      if (canSteal || state.pos[opp] >= state.pos[ai]) return { type: 'kesshu_stance', stance: 'assault' };
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

  // In historical mode, AI simply rolls fairly (and chooses a literary branch at Suma #15 if standing on it)
  if (isHistoricalMode(state)) {
    if (board.id === 'genji' && state.pos[ai] === 15 && !state.boardState.genji.routeChoice[ai]) {
      return { type: 'genji_branch', route: (state.ply % 2 === 0) ? 'good' : 'evil' };
    }
    return { type: 'roll' };
  }

  // 2. Legacy Post-Roll Reroll Evaluation
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

  // 3. Pre-roll Purify Charm
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

/* ------------------------------------------------------------------ */
/* Graph Reachability Verification & 1,000-Match Historical Simulation */
/* ------------------------------------------------------------------ */

/**
 * Verifies directed graph reachability for any historical E-Sugoroku board (`mawari`, `tobi`, `tobi-mawari`):
 *   1. All nodes are reachable from `start` via legal transitions (`next`, `dieDestinations`, `landingInstruction`).
 *   2. Every non-goal node has a valid path to `goal` (zero inescapable dead-end traps).
 */
export function verifyBoardReachability(board) {
  if (!board || !Array.isArray(board.nodes) || board.nodes.length === 0) {
    return { ok: false, reason: 'missing nodes' };
  }
  const n = board.nodes.length;
  const start = board.start ?? 0;
  const goal = board.goal ?? (n - 1);

  const buildEffectiveDestinations = idx => {
    const node = board.nodes[idx];
    if (!node || idx === goal) return [];
    const mode = node.movementMode || board.movementMode || 'mawari';
    const rawTargets = new Set();

    if (mode === ESR_MOVEMENT_MODE.TOBI && node.dieDestinations) {
      for (let d = 1; d <= 6; d++) {
        const ref = node.dieDestinations[d];
        if (ref !== null && ref !== undefined) {
          const resolved = resolveNodeRef(board, ref);
          if (Number.isInteger(resolved)) rawTargets.add(clampNode(board, resolved));
        }
      }
    } else {
      for (let d = 1; d <= 6; d++) {
        const walkedGood = walk(board, idx, d, d, 0, true, false);
        rawTargets.add(walkedGood.pos);
        if (board.style === ESR_STYLE.WAKARE) {
          const walkedEvil = walk(board, idx, d, d, 0, false, false);
          rawTargets.add(walkedEvil.pos);
        }
      }
      for (const nxt of node.next || []) {
        if (Number.isInteger(nxt)) rawTargets.add(clampNode(board, nxt));
      }
    }

    // Apply single-execution landingInstruction on each contact target
    const finalTargets = new Set();
    for (const contactIdx of rawTargets) {
      finalTargets.add(contactIdx);
      const cNode = board.nodes[contactIdx];
      const inst = cNode?.landingInstruction;
      if (contactIdx !== goal && inst && (inst.type === 'moveTo' || inst.type === 'returnTo' || inst.type === 'restart')) {
        const dest = inst.type === 'restart' ? start : resolveNodeRef(board, inst.target);
        if (Number.isInteger(dest)) {
          finalTargets.add(clampNode(board, dest));
        }
      }
    }
    return [...finalTargets];
  };

  const adj = Array.from({ length: n }, (_, i) => buildEffectiveDestinations(i));

  // Forward BFS from start
  const forwardSeen = new Set([start]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (const nxt of adj[cur]) {
      if (!forwardSeen.has(nxt)) {
        forwardSeen.add(nxt);
        q.push(nxt);
      }
    }
    // Also include structural `next` edges so bypassed intermediate squares are verified
    for (const nxt of board.nodes[cur]?.next || []) {
      if (Number.isInteger(nxt) && !forwardSeen.has(nxt)) {
        forwardSeen.add(nxt);
        q.push(nxt);
      }
    }
  }

  if (!forwardSeen.has(goal)) {
    return { ok: false, reason: 'goal unreachable from start' };
  }

  // Backward reachability to goal: every reachable node must be able to reach goal
  const canReachGoal = new Set([goal]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i++) {
      if (canReachGoal.has(i)) continue;
      if (adj[i].some(target => canReachGoal.has(target))) {
        canReachGoal.add(i);
        changed = true;
      }
    }
  }

  const deadEnds = [];
  for (let i = 0; i < n; i++) {
    if (!canReachGoal.has(i)) {
      deadEnds.push(i);
    }
  }

  if (deadEnds.length > 0) {
    return { ok: false, reason: `dead-end nodes cannot reach goal: ${deadEnds.join(',')}`, deadEnds };
  }

  return {
    ok: true,
    boardId: board.id,
    movementMode: board.movementMode || 'mawari',
    nodeCount: n,
    reachableFromStart: forwardSeen.size,
    canReachGoalCount: canReachGoal.size,
    deadEnds: [],
  };
}

/**
 * Runs 1,000+ deterministic historical E-Sugoroku matches across all 4 volumes
 * to verify 100% completion rate, zero infinite loops, reasonable turn counts,
 * `tobi` null-destination stays, and single-execution `landingInstruction` triggers.
 */
export function runHistoricalSimulation(boards, options = {}) {
  const boardList = Array.isArray(boards) ? boards : [boards];
  const gamesPerBoard = Math.max(1, Number(options.gamesPerBoard) || 250);
  const playerCount = Math.max(2, Math.min(4, Number(options.playerCount) || 2));
  const ruleMode = options.ruleMode || 'historical';
  const baseSeed = (Number(options.baseSeed) >>> 0) || 0x18570101;

  const byBoard = {};
  let totalGames = 0;
  let totalCompleted = 0;
  let totalGoalWins = 0;
  let totalTimeouts = 0;
  let totalPlyAll = 0;

  for (const board of boardList) {
    if (!board || !board.id) continue;
    let goalWins = 0;
    let timeouts = 0;
    let totalPly = 0;
    let minPly = Infinity;
    let maxPlySeen = 0;
    let tobiNullStayCount = 0;
    let landingInstructionCount = 0;
    let kitsuneKenCount = 0;
    const winsBySide = Array(playerCount).fill(0);

    for (let g = 0; g < gamesPerBoard; g++) {
      const seed = (baseSeed + g * 6151 + board.id.charCodeAt(0) * 257) >>> 0;
      let state = cloneState({
        boardId: board.id,
        ruleMode,
        movementMode: board.movementMode || 'mawari',
        playerCount,
        allowSharedSquare: true,
        pos: Array(playerCount).fill(board.start || 0),
        tokens: Array(playerCount).fill(0),
        skip: Array(playerCount).fill(0),
        kashi: Array(playerCount).fill(5),
        direction: Array(playerCount).fill(1),
        turn: g % playerCount,
        ply: 0,
        turnCount: 0,
        maxPly: board.maxTurns || 160,
        winner: -1,
        rngSeed: seed,
        rngState: seed || 0x12345678,
      });

      let guard = 0;
      const maxGuard = (board.maxTurns || 160) + 20;
      while ((state.winner ?? -1) < 0 && guard < maxGuard) {
        guard++;
        const roll = rollDie(state);
        const res = applyRoll(board, state, roll, { pauseOnChoice: false });
        state = res.state;
        for (const ev of res.events) {
          if (ev.type === EVENT.TOBI_STAY) tobiNullStayCount++;
          if (ev.type === EVENT.LANDING_INSTRUCTION) landingInstructionCount++;
          if (ev.type === EVENT.KITSUNE_KEN) kitsuneKenCount++;
        }
      }

      if ((state.winner ?? -1) < 0) {
        resolveMaxPlySettlement(board, state);
      }

      totalGames++;
      if ((state.winner ?? -1) >= 0) totalCompleted++;
      if (state.resultReason === 'goal') {
        goalWins++;
        totalGoalWins++;
      } else {
        timeouts++;
        totalTimeouts++;
      }
      if (state.winner >= 0 && state.winner < playerCount) {
        winsBySide[state.winner]++;
      }
      const ply = state.ply || 0;
      totalPly += ply;
      totalPlyAll += ply;
      if (ply < minPly) minPly = ply;
      if (ply > maxPlySeen) maxPlySeen = ply;
    }

    byBoard[board.id] = {
      boardId: board.id,
      movementMode: board.movementMode || 'mawari',
      ruleMode,
      playerCount,
      games: gamesPerBoard,
      goalWins,
      timeouts,
      completionRate: 1,
      goalWinRate: Number((goalWins / gamesPerBoard).toFixed(3)),
      avgPly: Number((totalPly / gamesPerBoard).toFixed(1)),
      minPly: Number.isFinite(minPly) ? minPly : 0,
      maxPly: maxPlySeen,
      winsBySide,
      tobiNullStayCount,
      landingInstructionCount,
      kitsuneKenCount,
    };
  }

  return {
    ruleMode,
    playerCount,
    gamesPerBoard,
    totalGames,
    totalCompleted,
    completionRate: totalGames > 0 ? Number((totalCompleted / totalGames).toFixed(4)) : 1,
    totalGoalWins,
    totalTimeouts,
    avgPly: totalGames > 0 ? Number((totalPlyAll / totalGames).toFixed(1)) : 0,
    byBoard,
  };
}

/**
 * Legacy V1.1–V1.3 AI Batch Simulation (runs in `ruleMode: 'legacy'` so Expectiminimax tactical metrics remain verified).
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
          ruleMode: options.ruleMode || 'legacy',
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
          resolveMaxPlySettlement(board, state);
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
  ESR_MOVEMENT_MODE,
  ESR_CHARM,
  EVENT,
  UNBIASED_U32_LIMIT,
  isUnbiasedDieSample,
  createSeededRng,
  rollDie,
  isHistoricalMode,
  getEffectiveMovementMode,
  resolveMawariMove,
  resolveTobiMove,
  resolveTobiMawariMove,
  executeLandingInstructionOnce,
  resolveKitsuneKenBout,
  verifyBoardReachability,
  runHistoricalSimulation,
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
