// Pure rules engine for E-Sugoroku (Expanded 24-27 Node Tug-of-War Edition).
//
// This mirrors core/esugoroku.c and adds extended tug-of-war mechanics:
//   * directed graph movement with optional branch edges,
//   * exact-finish bounce-back on the Tokaido board,
//   * one jump_table[roll-1] lookup after each landing,
//   * 泊 stay turns, token masks, universal same-square clashes & token raids,
//   * three pocket charms (stay / guard / dash) with periodic recharge,
//   * active tactical gale strike (辻風奇襲) to pull back a leading opponent, and
//   * a six-outcome expected-value evaluator for the AI.
//
// Nothing in this file touches the DOM.  Node tests import it directly.

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
});

const STYLE_TO_C = Object.freeze({
  mawari: 0,
  tobi: 1,
  kesshu: 2,
  wakare: 3,
});

const EVENT = Object.freeze({
  MOVE: 'move',
  JUMP: 'jump',
  STAY: 'stay',
  TOKEN: 'token',
  DUEL: 'duel',
  STEAL: 'steal',
  STRIKE: 'strike',
  RECHARGE: 'recharge',
  BOUNCE: 'bounce',
  GOAL_LOCKED: 'goal_locked',
  WIN: 'win',
  SKIP: 'skip',
  CHARM: 'charm',
  CUSTOM_BUFF: 'custom_buff',
  BRANCH_GOOD: 'branch_good',
  BRANCH_EVIL: 'branch_evil',
});

function cloneState(state) {
  return {
    ...state,
    pos: [...(state.pos || [0, 0])],
    tokens: [...(state.tokens || [0, 0])],
    skip: [...(state.skip || [0, 0])],
    charms: [...(state.charms || [0, 0])],
    charmUsed: [...(state.charmUsed || [0, 0])],
    customCard: state.customCard || null,
    customBuff: state.customBuff ? { ...state.customBuff } : null,
    strikeCooldown: [...(state.strikeCooldown || [0, 0])],
    duelCount: state.duelCount || 0,
    history: [...(state.history || [])],
    events: [],
  };
}

function hasCustomBuff(state, player) {
  return Boolean(state?.customBuff && player === (state.humanSide ?? 0));
}

function nodeAt(board, index) {
  return board.nodes[index] || board.nodes[board.goalIndex ?? board.goal];
}

function pushEvent(events, type, player, from, to, roll, extra = {}) {
  events.push({ type, player, from, to, roll, ...extra });
}

function hasCharm(state, player, charm) {
  return ((state.charms[player] | 0) & charm) !== 0 &&
    ((state.charmUsed[player] | 0) & charm) === 0;
}

function consumeCharm(state, player, charm) {
  state.charmUsed[player] = (state.charmUsed[player] | 0) | charm;
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

function popcount3(mask) {
  return ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0);
}

/*
 * Walk `steps` along the graph.  On mawari boards entering the goal before
 * the last step turns the walk around and retraces previous nodes.
 */
function walk(board, start, steps, roll, player, branchGood) {
  let pos = start;
  let direction = 1;
  let bounced = false;
  let branchSeen = false;
  const events = [];

  for (let step = 0; step < steps; step++) {
    if (direction < 0) {
      const prev = nodeAt(board, pos).prev;
      if (prev === undefined || prev === null || prev < 0) break;
      pos = prev;
      continue;
    }

    if (pos === board.goal) {
      if (!board.bounceBack) break;
      const prev = nodeAt(board, pos).prev;
      if (prev === undefined || prev === null || prev < 0) break;
      direction = -1;
      pos = prev;
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
    let edge = 0;
    if (next.length > 1) {
      edge = board.style === ESR_STYLE.WAKARE ? (branchGood ? 0 : 1) : 0;
      if (next.length > 1 && !branchSeen) {
        branchSeen = true;
        pushEvent(
          events,
          branchGood ? EVENT.BRANCH_GOOD : EVENT.BRANCH_EVIL,
          player,
          pos,
          next[edge],
          roll,
          { edge },
        );
      }
    }
    pos = next[edge];
    if (!Number.isInteger(pos) || pos < 0 || pos >= board.nodes.length) {
      pos = board.goal;
      break;
    }
  }
  return { pos, events, bounced };
}

function resolveLanding(board, state, player, pos, roll, events, options) {
  const opponent = 1 - player;

  if (pos !== board.goal) {
    const node = nodeAt(board, pos);
    const table = Array.isArray(node.jumpTable) ? node.jumpTable : [];
    let jump = Number(table[roll - 1] || 0);
    if (jump !== 0) {
      let cancelled = false;
      if (jump < 0 && hasCharm(state, player, ESR_CHARM.GUARD)) {
        consumeCharm(state, player, ESR_CHARM.GUARD);
        cancelled = true;
        pushEvent(events, EVENT.CHARM, player, pos, pos, roll, {
          charm: 'guard',
        });
      }
      if (!cancelled) {
        const multiplier = Math.max(1, Number(options.jumpMultiplier || 1));
        const jumpBonus = (jump > 0 && hasCustomBuff(state, player))
          ? (state.customBuff.jumpBonus | 0)
          : 0;
        const from = pos;
        const delta = jump * multiplier + jumpBonus;
        pos = clampNode(board, pos + delta);
        state.pos[player] = pos;
        pushEvent(events, EVENT.JUMP, player, from, pos, roll, {
          delta,
          multiplier,
          jumpBonus,
        });
        if (jumpBonus > 0) {
          pushEvent(events, EVENT.CUSTOM_BUFF, player, from, pos, roll, {
            effect: 'jump_boost',
            bonus: jumpBonus,
            cardId: state.customBuff.cardId,
            buffName: state.customBuff.name,
          });
        }
      }
    }
  }

  if (pos === board.goal) {
    const required = board.requiredTokens || 0;
    const heldCount = popcount3(state.tokens[player] | 0);
    if (heldCount >= required || (state.tokens[player] | 0) >= ((1 << required) - 1)) {
      state.winner = player;
      pushEvent(events, EVENT.WIN, player, pos, pos, roll, {});
      state.turnCount = (state.turnCount || 0) + 1;
      return true;
    }
    // Locked Goal: push back 1 step into the battlefield to force token collection
    const pushed = stepBackward(board, board.goal, 1);
    state.pos[player] = pushed;
    pos = pushed;
    pushEvent(events, EVENT.GOAL_LOCKED, player, board.goal, pos, roll, {
      required,
    });
  }

  const land = nodeAt(board, pos);
  if ((land.tokens | 0) !== 0) {
    state.tokens[player] = (state.tokens[player] | 0) | land.tokens;
    pushEvent(events, EVENT.TOKEN, player, pos, pos, roll, {
      tokens: land.tokens,
      label: land.tokenLabel || '',
    });
  }

  if ((land.stayTurns | 0) > 0) {
    if (hasCharm(state, player, ESR_CHARM.STAY)) {
      consumeCharm(state, player, ESR_CHARM.STAY);
      pushEvent(events, EVENT.CHARM, player, pos, pos, roll, {
        charm: 'stay',
      });
    } else {
      state.skip[player] = (state.skip[player] | 0) + land.stayTurns;
      pushEvent(events, EVENT.STAY, player, pos, pos, roll, {
        turns: land.stayTurns,
      });
    }
  }

  // Universal Same-Square Clash / Duel (追突・一騎討ち) across all boards
  if (state.pos[opponent] === state.pos[player] &&
      state.pos[player] !== board.start &&
      state.pos[player] !== board.goal) {
    const basePush = pos >= 4 ? (board.clashPush || 2) : 1;
    const duelPushBonus = hasCustomBuff(state, player) ? (state.customBuff.duelPushBonus | 0) : 0;
    const duelAdvance = hasCustomBuff(state, player) ? (state.customBuff.duelAdvance | 0) : 0;
    const pushSteps = basePush + duelPushBonus;
    const pushed = stepBackward(board, state.pos[opponent], pushSteps);
    state.pos[opponent] = pushed;
    state.duelCount = (state.duelCount || 0) + 1;

    // On Kesshu (or token boards), steal 1 token bit that opponent has and attacker lacks
    let stolenBit = 0;
    const oppTokens = state.tokens[opponent] | 0;
    const myTokens = state.tokens[player] | 0;
    const stealable = oppTokens & ~myTokens;
    if (stealable !== 0) {
      stolenBit = stealable & -stealable; // lowest set bit
      state.tokens[opponent] &= ~stolenBit;
      state.tokens[player] |= stolenBit;
    }

    if (duelAdvance > 0 && pos < board.goal - 1) {
      const nextStep = (nodeAt(board, pos)?.next || [])[0];
      if (Number.isInteger(nextStep) && nextStep > pos && nextStep < board.goal) {
        state.pos[player] = nextStep;
        pos = nextStep;
      }
    }

    pushEvent(events, EVENT.DUEL, player, pos, pushed, roll, {
      opponent,
      pushSteps,
      duelPushBonus,
      duelAdvance,
      stolenBit,
    });

    if (duelPushBonus > 0 || duelAdvance > 0) {
      pushEvent(events, EVENT.CUSTOM_BUFF, player, pos, pushed, roll, {
        effect: 'duel_master',
        duelPushBonus,
        duelAdvance,
        cardId: state.customBuff.cardId,
        buffName: state.customBuff.name,
      });
    }
  }

  return false;
}

// Active Tactical Action: Gale Strike (辻風奇襲) pulls a leading opponent back 2 steps (or 3 with gale_tactician buff)
function applyTacticalStrike(board, state, player = state?.turn ?? 0) {
  if (!board || !state || (state.winner ?? -1) >= 0) {
    return { ok: false, state: cloneState(state || {}), events: [] };
  }
  const next = cloneState(state);
  const opponent = 1 - player;
  if ((next.strikeCooldown[player] | 0) > 0) {
    return { ok: false, reason: 'cooldown', state: next, events: [] };
  }
  if (next.pos[opponent] <= board.start) {
    return { ok: false, reason: 'at_start', state: next, events: [] };
  }

  const buffActive = hasCustomBuff(next, player);
  const pullBonus = buffActive ? (next.customBuff.strikePullBonus | 0) : 0;
  const pullSteps = 2 + pullBonus;
  const cdTurns = buffActive && (next.customBuff.strikeCooldown | 0) > 0
    ? (next.customBuff.strikeCooldown | 0)
    : 4;

  const from = next.pos[opponent];
  const to = stepBackward(board, from, pullSteps);
  next.pos[opponent] = to;
  next.strikeCooldown[player] = cdTurns;
  const events = [];
  pushEvent(events, EVENT.STRIKE, player, from, to, 0, {
    opponent,
    delta: to - from,
    pullSteps,
    cooldown: cdTurns,
  });
  if (pullBonus > 0 || cdTurns < 4) {
    pushEvent(events, EVENT.CUSTOM_BUFF, player, from, to, 0, {
      effect: 'gale_tactician',
      pullSteps,
      cooldown: cdTurns,
      cardId: next.customBuff.cardId,
      buffName: next.customBuff.name,
    });
  }
  next.events = events;
  return { ok: true, state: next, events, from, to };
}

function applyRoll(board, state, roll, options = {}) {
  if (!board || !state || !Number.isInteger(roll) || roll < 1 || roll > 6) {
    return { state: cloneState(state || {}), events: [], won: false };
  }
  if ((state.winner ?? -1) >= 0) {
    return { state: cloneState(state), events: [], won: false };
  }

  const next = cloneState(state);
  const events = [];
  const player = next.turn | 0;
  const opponent = 1 - player;
  next.lastRoll = roll;

  if ((next.strikeCooldown[player] | 0) > 0) {
    next.strikeCooldown[player] = Math.max(0, next.strikeCooldown[player] - 1);
  }

  // Periodic Charm Recharge every 8 half-turns (or 4 half-turns when eternal_talisman Custom Hand Card is active)
  const rechargePeriod = (hasCustomBuff(next, player) && (next.customBuff.rechargePeriod | 0) > 0)
    ? (next.customBuff.rechargePeriod | 0)
    : 8;
  if (next.turnCount > 0 && next.turnCount % rechargePeriod === 0 && (next.charmUsed[player] | 0) !== 0) {
    const used = next.charmUsed[player] | 0;
    const rechargeBit = used & -used;
    next.charmUsed[player] &= ~rechargeBit;
    pushEvent(events, EVENT.RECHARGE, player, next.pos[player], next.pos[player], roll, {
      recharged: rechargeBit,
      rechargePeriod,
    });
  }

  if ((next.skip[player] | 0) > 0) {
    next.skip[player] -= 1;
    pushEvent(events, EVENT.SKIP, player, next.pos[player], next.pos[player], roll, {
      remaining: next.skip[player],
    });
    next.turn = opponent;
    next.turnCount = (next.turnCount || 0) + 1;
    next.events = events;
    return { state: next, events, won: false };
  }

  let steps = roll;
  if (hasCharm(next, player, ESR_CHARM.DASH)) {
    steps += 1;
    consumeCharm(next, player, ESR_CHARM.DASH);
    pushEvent(events, EVENT.CHARM, player, next.pos[player], next.pos[player], roll, {
      charm: 'dash',
      steps,
    });
  }

  if (hasCustomBuff(next, player) && next.customBuff.firstRollPending && (next.customBuff.firstRollBonus | 0) > 0) {
    const bonus = next.customBuff.firstRollBonus | 0;
    steps += bonus;
    next.customBuff.firstRollPending = false;
    pushEvent(events, EVENT.CUSTOM_BUFF, player, next.pos[player], next.pos[player], roll, {
      effect: 'first_roll',
      bonus,
      steps,
      cardId: next.customBuff.cardId,
      buffName: next.customBuff.name,
    });
  }

  const start = next.pos[player] | 0;
  const branchGood = roll % 2 === 0;
  const walked = walk(board, start, steps, roll, player, branchGood);
  next.pos[player] = walked.pos;
  events.push(...walked.events);
  pushEvent(events, EVENT.MOVE, player, start, walked.pos, roll, {
    steps,
    branchGood,
  });

  const won = resolveLanding(board, next, player, walked.pos, roll, events, options);
  if (!won) {
    next.turn = opponent;
    next.turnCount = (next.turnCount || 0) + 1;
  }
  next.events = events;
  next.history = [
    ...(next.history || []),
    { player, roll, steps, from: start, to: next.pos[player], won },
  ].slice(-120);
  return { state: next, events, won };
}

/*
 * Renderer helper: for every die face 1..6, return the square where the
 * player's current piece would land after the jump-table lookup.
 */
function previewDestinations(board, state, roll) {
  const player = state.turn | 0;
  const out = [];
  const start = state.pos[player] | 0;
  const branchGood = roll % 2 === 0;
  const walked = walk(board, start, roll, roll, player, branchGood);
  let pos = walked.pos;
  let kind = 'move';
  if (pos !== board.goal) {
    const jump = Number((nodeAt(board, pos).jumpTable || [])[roll - 1] || 0);
    if (jump !== 0) {
      pos = clampNode(board, pos + jump);
      kind = jump > 0 ? 'jump' : 'back';
    }
  }
  out.push({ roll, to: pos, kind });
  return out;
}

function expectedValue(board, state, player) {
  if (!board || !state) return 0;
  if ((state.winner ?? -1) === player) return 1000;
  if ((state.winner ?? -1) >= 0) return -1000;
  let total = 0;
  for (let roll = 1; roll <= 6; roll++) {
    const trial = cloneState(state);
    trial.turn = player;
    const result = applyRoll(board, trial, roll);
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
 * Matches BoxGeometry material order in tabletop_3d.js:
 *   +X (right): 2, -X (left): 5, +Y (top): 1, -Y (bottom): 6, +Z (front): 3, -Z (back): 4
 * Because Ry(yaw) is applied last around world +Y, the upward face normal (0, +1, 0)
 * is 100% invariant (dot = 1.0) for any yaw angle.
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

/**
 * Evaluates which 3D die face (1..6) is pointing most strongly toward world +Y (0, 1, 0)
 * for any Euler rotation (rx, ry, rz) in 'YXZ' order.
 */
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
    // R = Ry(ry) * Rx(rx) * Rz(rz); world +Y component of R * n is invariant under Ry(ry):
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
  applyRoll,
  applyTacticalStrike,
  previewDestinations,
  expectedValue,
  validateBoard,
  getNode,
  styleCode,
  nodeAt,
  computeDieTargetEulerYXZ,
  evaluateDieTopFaceYXZ,
});

