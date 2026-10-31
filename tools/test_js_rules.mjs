#!/usr/bin/env node
// Deterministic rules + board-data regression suite for E-Sugoroku.
// Run: node tools/test_js_rules.mjs

import assert from 'node:assert/strict';
import { BOARDS, UKIYOE_CARDS, CHARMS, createMatch, getBoard } from '../mobile/js/boards.js';
import { EsugorokuCore, ESR_CHARM } from '../mobile/js/core.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL ${name}`);
    for (const line of String(err?.message || err).split('\n')) {
      console.log(`       ${line}`);
    }
  }
}

function group(name) {
  console.log(`\n${name}`);
}

function stateFor(boardIndex, options = {}) {
  return createMatch(boardIndex, {
    humanSide: 0,
    charms: [],
    ...options,
  });
}

function applyNext(board, state, roll, options) {
  const result = EsugorokuCore.applyRoll(board, state, roll, options);
  return result;
}

function findEvent(events, type) {
  return events.find(ev => ev.type === type);
}

function geometrySignature(board) {
  return board.nodes.map(n => `${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.w)},${Math.round(n.h)}`).join('|');
}

group('Board collection and geometry');
test('exactly four boards and thirty-six unique ukiyo-e cards', () => {
  assert.equal(BOARDS.length, 4);
  assert.equal(UKIYOE_CARDS.length, 36);
  assert.equal(new Set(UKIYOE_CARDS.map(c => c.id)).size, 36);
  for (let i = 0; i < 4; i++) {
    assert.equal(UKIYOE_CARDS.filter(c => c.board === i).length, 9);
    assert.equal(BOARDS[i].cardIds.length, 9);
  }
});

test('all four directed graphs are connected and reachable', () => {
  for (const board of BOARDS) {
    const result = EsugorokuCore.validateBoard(board);
    assert.equal(result.ok, true, `${board.id}: ${result.reason}`);
  }
});

test('four boards use four independent geometry signatures', () => {
  const signatures = new Set(BOARDS.map(geometrySignature));
  assert.equal(signatures.size, 4);
  assert.equal(getBoard(0).layout, 'spiral-corridor');
  assert.equal(getBoard(1).layout, 'irregular-collage');
  assert.equal(getBoard(2).layout, 'tilted-warrior-cards');
  assert.equal(getBoard(3).layout, 'four-color-split-tracks');
});

test('Tokaido uses pointed arrow strips, komae windows and red tomari seals', () => {
  const board = getBoard(0);
  assert.equal(board.shape, 'arrow-strip');
  assert.equal(board.bounceBack, true);
  assert.ok(board.nodes.slice(0, 16).every(n => n.komae !== undefined));
  const stays = board.nodes.filter(n => n.stayTurns > 0);
  assert.equal(stays.length, 2);
  assert.ok(stays.every(n => n.seal === '泊'));
  assert.deepEqual(['泥鰌鍋', '稲荷寿司', '宇治茶'], [2, 7, 12].map(i => board.nodes[i].title));
});

test('Yokai collage has genuinely large and small interlocking prints', () => {
  const board = getBoard(1);
  const areas = board.nodes.slice(0, 16).map(n => n.w * n.h);
  assert.ok(Math.max(...areas) >= Math.min(...areas) * 1.5);
  assert.ok(board.nodes.slice(0, 16).some(n => n.big === true));
  assert.ok(board.nodes.slice(0, 16).some(n => n.big === false));
  for (const node of board.nodes.slice(0, 16)) {
    assert.equal(node.jumpTable.length, 6);
    assert.ok(node.jumpText && node.jumpText.includes('【'));
  }
});

test('Kesshu start/goal are large cards, every warrior card is tilted -7..+9 degrees', () => {
  const board = getBoard(2);
  const start = board.nodes[board.start];
  const goal = board.nodes[board.goal];
  assert.ok(start.w >= 240 && start.h >= 170, '出陣 must be an army-sized card');
  assert.ok(goal.w >= 240 && goal.h >= 170, '上り must be an army-sized card');
  assert.ok(start.x > 500 && start.y > 400, '出陣 belongs to the lower-right');
  assert.ok(goal.x < 100 && goal.y < 100, '上り belongs to the upper-left');
  const regular = board.nodes.slice(1, 15);
  for (const node of regular) {
    const deg = node.tilt * 180 / Math.PI;
    assert.ok(deg >= -7.001 && deg <= 9.001, `${node.title} tilt ${deg}`);
  }
  assert.equal(new Set(regular.map(n => n.tilt.toFixed(4))).size > 6, true);
  assert.equal(board.requiredTokens, 3);
  assert.deepEqual(
    board.nodes.filter(n => n.tokens).map(n => n.tokenLabel).sort(),
    ['兜', '太刀', '陣太鼓'].sort(),
  );
});

test('Genji outer strips use the four mandated colors and vertical geometry', () => {
  const board = getBoard(3);
  const mandated = new Set(['#5383a6', '#e8b954', '#e09879', '#b8b6a8']);
  const outer = board.nodes.slice(0, 16);
  assert.ok(outer.every(n => mandated.has(n.stripColor)));
  assert.ok(outer.every(n => n.w <= 72 && n.h > 120));
  const good = board.nodes.filter(n => n.kind === 'good');
  const evil = board.nodes.filter(n => n.kind === 'evil');
  assert.equal(good.length, 3);
  assert.equal(evil.length, 3);
  assert.ok(good.every(n => n.y < 300));
  assert.ok(evil.every(n => n.y > 350));
  assert.ok(board.nodes[board.goal].x > 250 && board.nodes[board.goal].x < 400);
  assert.ok(board.nodes[board.goal].y > 280 && board.nodes[board.goal].y < 390);
});

test('charm loadout exposes exactly three pocket talismans', () => {
  assert.equal(CHARMS.length, 3);
  assert.deepEqual(CHARMS.map(c => c.mask), [1, 2, 4]);
  const match = stateFor(0, { charms: ['stay', 'guard', 'dash'] });
  assert.equal(match.charms[0], 7);
  assert.equal(match.charms[1], 0);
});

group('Tokaido mawari rules');
test('moves clockwise and passes the turn', () => {
  const board = getBoard(0);
  let state = stateFor(0);
  const { state: next } = applyNext(board, state, 3);
  assert.equal(next.pos[0], 3);
  assert.equal(next.turn, 1);
});

test('tomari square sets one skipped turn', () => {
  const board = getBoard(0);
  let state = stateFor(0);
  state.pos[0] = 3;
  state.turn = 0;
  const { state: next, events } = applyNext(board, state, 1);
  assert.equal(next.pos[0], 4);
  assert.equal(next.skip[0], 1);
  assert.ok(findEvent(events, 'stay'));
});

test('food squares accelerate with a printed jump', () => {
  const board = getBoard(0);
  let state = stateFor(0);
  state.pos[0] = 1;
  state.turn = 0;
  const { state: next, events } = applyNext(board, state, 1);
  assert.equal(next.pos[0], 4);
  assert.ok(findEvent(events, 'jump'));
});

test('exact finish wins, overshoot bounces back', () => {
  const board = getBoard(0);
  let state = stateFor(0);
  state.pos[0] = 15;
  state.turn = 0;
  const exact = applyNext(board, state, 1);
  assert.equal(exact.won, true);
  assert.equal(exact.state.winner, 0);

  state = stateFor(0);
  state.pos[0] = 15;
  state.turn = 0;
  const overshoot = applyNext(board, state, 4);
  assert.equal(overshoot.won, false);
  assert.equal(overshoot.state.pos[0], 13);
  assert.ok(findEvent(overshoot.events, 'bounce'));
});

test('stay charm cancels tomari, dash adds one first step', () => {
  const board = getBoard(0);
  let state = stateFor(0, { charms: ['stay'] });
  state.pos[0] = 3;
  state.turn = 0;
  let result = applyNext(board, state, 1);
  assert.equal(result.state.skip[0], 0);
  assert.equal(result.state.charmUsed[0] & ESR_CHARM.STAY, ESR_CHARM.STAY);

  state = stateFor(0, { charms: ['dash'] });
  result = applyNext(board, state, 1);
  assert.equal(result.state.pos[0], 4);
  assert.equal(result.state.charmUsed[0] & ESR_CHARM.DASH, ESR_CHARM.DASH);
});

group('Yokai tobi table rules');
test('all six die faces resolve through the landing jump table', () => {
  const board = getBoard(1);
  const expected = [12, 12, 10, 10, 8, 8];
  for (let roll = 1; roll <= 6; roll++) {
    const state = stateFor(1);
    state.pos[0] = 10 - roll;
    state.turn = 0;
    const { state: next, events } = applyNext(board, state, roll);
    assert.equal(next.pos[0], expected[roll - 1], `roll ${roll}`);
    if (roll !== 3 && roll !== 4) {
      assert.ok(findEvent(events, 'jump'), `roll ${roll} must jump`);
    }
  }
});

test('previewDestinations returns one bezier preview target per die face', () => {
  const board = getBoard(1);
  const state = stateFor(1);
  state.pos[0] = 4;
  state.turn = 0;
  const rows = [1, 2, 3, 4, 5, 6].map(roll => EsugorokuCore.previewDestinations(board, state, roll)[0]);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(r => r.roll), [1, 2, 3, 4, 5, 6]);
  assert.ok(rows.every(r => Number.isInteger(r.to) && r.to >= 0 && r.to <= board.goal));
  assert.ok(new Set(rows.map(r => r.to)).size > 1);
});

test('guard charm cancels a backward spectre jump', () => {
  const board = getBoard(1);
  const plain = stateFor(1);
  plain.pos[0] = 5;
  plain.turn = 0;
  const back = applyNext(board, plain, 5);
  assert.equal(back.state.pos[0], 8);

  const guarded = stateFor(1, { charms: ['guard'] });
  guarded.pos[0] = 5;
  guarded.turn = 0;
  const result = applyNext(board, guarded, 5);
  assert.equal(result.state.pos[0], 10);
  assert.equal(result.state.charmUsed[0] & ESR_CHARM.GUARD, ESR_CHARM.GUARD);
});

group('Kesshu mustering rules');
test('three regalia tokens are collectible', () => {
  const board = getBoard(2);
  let state = stateFor(2);
  state.pos[0] = 2;
  state.turn = 0;
  state = applyNext(board, state, 1).state;
  assert.equal(state.tokens[0], 1);
  state.pos[0] = 6;
  state.turn = 0;
  state = applyNext(board, state, 1).state;
  assert.equal(state.tokens[0], 3);
  state.pos[0] = 10;
  state.turn = 0;
  state = applyNext(board, state, 1).state;
  assert.equal(state.tokens[0], 7);
});

test('goal is locked until all three tokens are held', () => {
  const board = getBoard(2);
  let state = stateFor(2);
  state.pos[0] = 14;
  state.tokens[0] = 2;
  state.turn = 0;
  let result = applyNext(board, state, 1);
  assert.equal(result.won, false);
  assert.equal(result.state.pos[0], 14);
  assert.ok(findEvent(result.events, 'goal_locked'));

  state.tokens[0] = 7;
  result = applyNext(board, state, 1);
  assert.equal(result.won, true);
});

test('same-square warriors trigger a duel push', () => {
  const board = getBoard(2);
  const state = stateFor(2);
  state.pos[0] = 1;
  state.pos[1] = 2;
  state.turn = 0;
  const result = applyNext(board, state, 1);
  assert.equal(result.state.pos[0], 2);
  assert.equal(result.state.pos[1], 1);
  assert.ok(findEvent(result.events, 'duel'));
});

group('Genji split-track rules');
test('even roll takes the golden good track, odd roll the purple evil track', () => {
  const board = getBoard(3);
  let state = stateFor(3);
  state.pos[0] = 14;
  state.turn = 0;
  const good = applyNext(board, state, 2);
  assert.equal(good.state.pos[0], 18);
  assert.ok(findEvent(good.events, 'branch_good'));

  state = stateFor(3);
  state.pos[0] = 14;
  state.turn = 0;
  const evil = applyNext(board, state, 3);
  assert.equal(evil.state.pos[0], 20);
  assert.ok(findEvent(evil.events, 'branch_evil'));
  assert.equal(evil.state.skip[0], 2);
});

test('good shortcut jumps forward; evil ink boat stays', () => {
  const board = getBoard(3);
  let state = stateFor(3);
  state.pos[0] = 14;
  state.turn = 0;
  const good = applyNext(board, state, 2);
  assert.ok(findEvent(good.events, 'jump'));
  assert.equal(good.state.pos[0], 18);

  state = stateFor(3);
  state.pos[0] = 14;
  state.turn = 0;
  const evil = applyNext(board, state, 3);
  assert.equal(evil.state.skip[0], 2);
  assert.ok(findEvent(evil.events, 'stay'));
});

test('AI expected value is finite and terminal states are extreme', () => {
  const board = getBoard(3);
  const state = stateFor(3);
  const value = EsugorokuCore.expectedValue(board, state, 0);
  assert.ok(Number.isFinite(value));
  assert.ok(value > 0);
  const won = { ...state, winner: 0 };
  assert.equal(EsugorokuCore.expectedValue(board, won, 0), 1000);
  assert.equal(EsugorokuCore.expectedValue(board, won, 1), -1000);
});

console.log(`\n${passed} tests passed, ${failures.length} failed.`);
if (failures.length) {
  process.exit(1);
}
