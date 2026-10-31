// Pure rules engine for E-Sugoroku.
//
// This mirrors core/esugoroku.c:
//   * directed graph movement with optional branch edges,
//   * exact-finish bounce-back on the Tokaido board,
//   * one jump_table[roll-1] lookup after each landing,
//   * 泊 stay turns, token masks, Kesshu duels and locked goals,
//   * three pocket charms (stay / guard / dash), and
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
  BOUNCE: 'bounce',
  GOAL_LOCKED: 'goal_locked',
  WIN: 'win',
  SKIP: 'skip',
  CHARM: 'charm',
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
    history: [...(state.history || [])],
    events: [],
  };
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
        const from = pos;
        const delta = jump * multiplier;
        pos = clampNode(board, pos + delta);
        state.pos[player] = pos;
        pushEvent(events, EVENT.JUMP, player, from, pos, roll, {
          delta,
          multiplier,
        });
      }
    }
  }

  if (pos === board.goal) {
    const required = board.requiredTokens || 0;
    if ((state.tokens[player] | 0) >= required) {
      state.winner = player;
      pushEvent(events, EVENT.WIN, player, pos, pos, roll, {});
      state.turnCount = (state.turnCount || 0) + 1;
      return true;
    }
    const prev = nodeAt(board, pos).prev;
    const pushed = prev === undefined || prev === null || prev < 0 ? board.start : prev;
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

  if (board.style === ESR_STYLE.KESSHU &&
      state.pos[opponent] === state.pos[player] &&
      state.pos[player] !== board.start) {
    const prev = nodeAt(board, state.pos[opponent]).prev;
    const pushed = prev === undefined || prev === null || prev < 0 ? board.start : prev;
    state.pos[opponent] = pushed;
    pushEvent(events, EVENT.DUEL, player, pos, pushed, roll, {
      opponent,
    });
  }

  return false;
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
  ].slice(-80);
  return { state: next, events, won };
}

/*
 * Renderer helper for the Tobi board: for every die face, return the square
 * where the player's current piece would land after the jump-table lookup.
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
      total += result.state.tokens[player] * 8;
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

export const EsugorokuCore = Object.freeze({
  ESR_STYLE,
  ESR_CHARM,
  EVENT,
  applyRoll,
  previewDestinations,
  expectedValue,
  validateBoard,
  getNode,
  styleCode,
  nodeAt,
});
