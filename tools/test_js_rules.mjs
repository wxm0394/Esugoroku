#!/usr/bin/env node
// Deterministic rules + board-data regression suite for E-Sugoroku (V1.1–V1.3).
// Run: node tools/test_js_rules.mjs

import assert from 'node:assert/strict';
import {
  BOARDS, UKIYOE_CARDS, CHARMS, CHARM_BY_ID, ACHIEVEMENTS,
  MAX_EQUIPPED_CHARMS, sanitizeCharmLoadout, createMatch, getBoard,
} from '../mobile/js/boards.js';
import {
  EsugorokuCore, ESR_CHARM, createSeededRng, rollDie,
  computeDieTargetEulerYXZ, evaluateDieTopFaceYXZ,
} from '../mobile/js/core.js';
import { migrateProfileData, evaluateMatchProgression, G } from '../mobile/js/state.js';
import { audio, BGM_THEMES, getBgmTheme, computeBgmStepNotes, tileWoodClack } from '../mobile/js/audio.js';

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

group('Board collection and expanded geometry');
test('exactly four expanded boards (24-27 nodes each) and thirty-six unique ukiyo-e cards', () => {
  assert.equal(BOARDS.length, 4);
  assert.equal(getBoard(0).nodes.length, 25);
  assert.equal(getBoard(1).nodes.length, 25);
  assert.equal(getBoard(2).nodes.length, 24);
  assert.equal(getBoard(3).nodes.length, 27);
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

test('Tokaido uses pointed arrow strips, komae windows, checkpoints and red tomari seals', () => {
  const board = getBoard(0);
  assert.equal(board.shape, 'arrow-strip');
  assert.equal(board.bounceBack, true);
  assert.equal(board.goal, 24);
  assert.ok(board.nodes.slice(0, 24).every(n => n.komae !== undefined));
  const stays = board.nodes.filter(n => n.stayTurns > 0);
  assert.equal(stays.length, 3);
  assert.ok(stays.every(n => n.seal === '泊'));
  assert.deepEqual(['泥鰌鍋', '稲荷寿司', '宇治茶'], [2, 7, 12].map(i => board.nodes[i].title));
  const pullbacks = board.nodes.filter(n => n.jumpDelta < 0);
  assert.ok(pullbacks.length >= 3, 'Tokaido has checkpoint pullback squares');
});

test('Yokai collage has genuinely large and small interlocking prints across 24 spirit stations', () => {
  const board = getBoard(1);
  assert.equal(board.goal, 24);
  const areas = board.nodes.slice(0, 24).map(n => n.w * n.h);
  assert.ok(Math.max(...areas) >= Math.min(...areas) * 1.4);
  assert.ok(board.nodes.slice(0, 24).some(n => n.big === true));
  assert.ok(board.nodes.slice(0, 24).some(n => n.big === false));
  for (const node of board.nodes.slice(0, 24)) {
    assert.equal(node.jumpTable.length, 6);
    assert.ok(node.jumpText && node.jumpText.includes('【'));
  }
});

test('Kesshu start/goal are large cards, every warrior card is tilted -7..+9 degrees', () => {
  const board = getBoard(2);
  assert.equal(board.goal, 23);
  const start = board.nodes[board.start];
  const goal = board.nodes[board.goal];
  assert.ok(start.w >= 210 && start.h >= 150, '出陣 must be an army-sized card');
  assert.ok(goal.w >= 210 && goal.h >= 150, '上り must be an army-sized card');
  assert.ok(start.x > 500 && start.y > 400, '出陣 belongs to the lower-right');
  assert.ok(goal.x < 100 && goal.y < 100, '上り belongs to the upper-left');
  const regular = board.nodes.slice(1, 23);
  for (const node of regular) {
    const deg = node.tilt * 180 / Math.PI;
    assert.ok(deg >= -7.001 && deg <= 9.001, `${node.title} tilt ${deg}`);
  }
  assert.equal(new Set(regular.map(n => n.tilt.toFixed(4))).size > 6, true);
  assert.equal(board.requiredTokens, 3);
  assert.deepEqual(
    [...new Set(board.nodes.filter(n => n.tokens).map(n => n.tokenLabel))].sort(),
    ['兜', '太刀', '陣太鼓'].sort(),
  );
});

test('Genji outer strips use the four mandated colors and expanded 5-good / 5-evil branches', () => {
  const board = getBoard(3);
  assert.equal(board.goal, 26);
  const mandated = new Set(['#5383a6', '#e8b954', '#e09879', '#b8b6a8']);
  const outer = board.nodes.slice(0, 16);
  assert.ok(outer.every(n => mandated.has(n.stripColor)));
  assert.ok(outer.every(n => n.w <= 72 && n.h > 120));
  const good = board.nodes.filter(n => n.kind === 'good');
  const evil = board.nodes.filter(n => n.kind === 'evil');
  assert.equal(good.length, 5);
  assert.equal(evil.length, 5);
  assert.ok(good.every(n => n.y < 300));
  assert.ok(evil.every(n => n.y > 350));
  assert.ok(board.nodes[board.goal].x > 250 && board.nodes[board.goal].x < 400);
  assert.ok(board.nodes[board.goal].y > 280 && board.nodes[board.goal].y < 390);
});

test('charm loadout exposes 12 talismans and equips up to 3 per match', () => {
  assert.equal(CHARMS.length, 12);
  assert.equal(MAX_EQUIPPED_CHARMS, 3);
  assert.deepEqual(CHARMS.slice(0, 3).map(c => c.mask), [1, 2, 4]);
  const match = stateFor(0, { charms: ['stay', 'guard', 'dash'] });
  assert.equal(match.charms[0], 7);
  assert.equal(match.charms[1], 0);
  // Passing more than 3 charms truncates to 3 unique valid charms
  const capped = sanitizeCharmLoadout(['stay', 'guard', 'dash', 'reroll', 'wind']);
  assert.equal(capped.length, 3);
  assert.deepEqual(capped, ['stay', 'guard', 'dash']);
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
  state.pos[0] = 23;
  state.turn = 0;
  const exact = applyNext(board, state, 1);
  assert.equal(exact.won, true);
  assert.equal(exact.state.winner, 0);

  state = stateFor(0);
  state.pos[0] = 23;
  state.turn = 0;
  const overshoot = applyNext(board, state, 4);
  assert.equal(overshoot.won, false);
  assert.equal(overshoot.state.pos[0], 21);
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

group('Kesshu mustering and tug-of-war rules');
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
  state.pos[0] = 9;
  state.turn = 0;
  state = applyNext(board, state, 1).state;
  assert.equal(state.tokens[0], 7);
});

test('goal is locked until all three tokens are held', () => {
  const board = getBoard(2);
  let state = stateFor(2);
  state.pos[0] = 22;
  state.tokens[0] = 2;
  state.turn = 0;
  let result = applyNext(board, state, 1);
  assert.equal(result.won, false);
  assert.equal(result.state.pos[0], 22);
  assert.ok(findEvent(result.events, 'goal_locked'));

  state.tokens[0] = 7;
  result = applyNext(board, state, 1);
  assert.equal(result.won, true);
});

test('same-square warriors trigger a duel push and steal unheld regalia', () => {
  const board = getBoard(2);
  const state = stateFor(2);
  state.pos[0] = 1;
  state.pos[1] = 2;
  state.tokens[0] = 1;
  state.tokens[1] = 2;
  state.turn = 0;
  const result = applyNext(board, state, 1);
  assert.equal(result.state.pos[0], 2);
  assert.equal(result.state.pos[1], 1);
  assert.equal(result.state.tokens[0], 3);
  assert.equal(result.state.tokens[1], 0);
  const duelEv = findEvent(result.events, 'duel');
  assert.ok(duelEv);
  assert.equal(duelEv.stolenBit, 2);
});

test('tactical gale strike pulls leading opponent back 2 steps and sets 4-turn cooldown', () => {
  const board = getBoard(0);
  const state = stateFor(0);
  state.pos[0] = 6;
  state.pos[1] = 12;
  const strikeRes = EsugorokuCore.applyTacticalStrike(board, state, 0);
  assert.equal(strikeRes.ok, true);
  assert.equal(strikeRes.state.pos[1], 10);
  assert.equal(strikeRes.state.strikeCooldown[0], 4);
  assert.ok(findEvent(strikeRes.events, 'strike'));
});

test('spent talismans recharge every 8 half-turns during prolonged matches', () => {
  const board = getBoard(0);
  let state = stateFor(0, { charms: ['stay'] });
  state.charmUsed[0] = ESR_CHARM.STAY;
  state.turnCount = 8;
  state.turn = 0;
  const result = applyNext(board, state, 1);
  assert.equal(result.state.turnCount, 9);
  assert.equal(result.state.charmUsed[0], 0);
  assert.ok(findEvent(result.events, 'recharge'));
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
  assert.equal(evil.state.pos[0], 22);
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

group('Custom Hand Card (自定义手札) Initial Buffs');
test('all 36 Ukiyo-e cards expose a complete initial buff definition', () => {
  for (const card of UKIYOE_CARDS) {
    assert.ok(card.buff, `missing buff on ${card.id}`);
    assert.equal(card.buff.cardId, card.id);
    assert.ok(card.buff.seal && card.buff.name && card.buff.shortDesc);
  }
});

test('headstart card (tokaido_01) starts +2 squares ahead and adds +1 step on first roll', () => {
  const board = getBoard(0);
  const state = stateFor(0, { customCard: 'tokaido_01' });
  assert.equal(state.customCard, 'tokaido_01');
  assert.equal(state.pos[0], 2);
  assert.equal(state.pos[1], 0);
  const r1 = applyNext(board, state, 1);
  assert.equal(r1.state.pos[0], 4);
  assert.equal(r1.state.customBuff.firstRollPending, false);
  assert.ok(findEvent(r1.events, 'custom_buff'));
});

test('first_dash card (tokaido_02) adds +2 steps on first roll and +1 extra square on forward jumps', () => {
  const board = getBoard(0);
  let state = stateFor(0, { customCard: 'tokaido_02' });
  state.pos[0] = 1;
  state.customBuff.firstRollPending = false;
  state.playerBuffs[0].firstRollPending = false;
  const rJump = applyNext(board, state, 1);
  assert.equal(rJump.state.pos[0], 5);
  assert.ok(findEvent(rJump.events, 'custom_buff'));
});

test('duel_master card (kesshu_01) pushes opponent +2 extra squares back and advances attacker +1 square', () => {
  const board = getBoard(0);
  const state = stateFor(0, { customCard: 'kesshu_01' });
  state.customBuff.firstRollPending = false;
  state.playerBuffs[0].firstRollPending = false;
  state.pos[0] = 5;
  state.pos[1] = 6;
  const res = applyNext(board, state, 1);
  assert.equal(res.state.pos[1], 2);
  assert.equal(res.state.pos[0], 7);
  assert.ok(findEvent(res.events, 'custom_buff'));
});

test('regalia_boon card (kesshu_06) starts match with 1 regalia token already held', () => {
  const state = stateFor(2, { customCard: 'kesshu_06' });
  assert.equal(state.tokens[0], 1);
  assert.equal(state.tokens[1], 0);
});

test('gale_tactician card (yokai_01) pulls opponent 3 steps back with 2-turn cooldown', () => {
  const board = getBoard(1);
  const state = stateFor(1, { customCard: 'yokai_01' });
  assert.equal(state.pos[0], 1);
  state.pos[1] = 10;
  const strikeRes = EsugorokuCore.applyTacticalStrike(board, state, 0);
  assert.equal(strikeRes.ok, true);
  assert.equal(strikeRes.state.pos[1], 7);
  assert.equal(strikeRes.state.strikeCooldown[0], 2);
  assert.ok(findEvent(strikeRes.events, 'custom_buff'));
});

test('eternal_talisman card (genji_02) recharges spent charms every 4 half-turns instead of 8', () => {
  const board = getBoard(3);
  const state = stateFor(3, { charms: ['stay'], customCard: 'genji_02' });
  state.charmUsed[0] = ESR_CHARM.STAY;
  state.turnCount = 4;
  state.turn = 0;
  const res = applyNext(board, state, 1);
  assert.equal(res.state.charmUsed[0], 0);
  assert.ok(findEvent(res.events, 'recharge'));
});

group('V1.1 Fair Dice, Seeded RNG & MaxPly Settlement');
test('createSeededRng and rollDie produce identical deterministic 1..6 sequences for the same seed', () => {
  const rngA = createSeededRng(123456);
  const rngB = createSeededRng(123456);
  const seqA = Array.from({ length: 40 }, () => rollDie(rngA));
  const seqB = Array.from({ length: 40 }, () => rollDie(rngB));
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every(v => Number.isInteger(v) && v >= 1 && v <= 6));
  assert.equal(new Set(seqA).size, 6, 'All 6 faces appear in 40 rolls');
});

test('maxPly timeout settlement determines winner by progressValue and tokens', () => {
  const board = getBoard(0);
  const state = stateFor(0, { maxPly: 2 });
  state.pos[0] = 8;
  state.pos[1] = 2;
  state.ply = 1;
  state.turn = 0;
  const res = applyNext(board, state, 2);
  assert.equal(res.state.ply, 2);
  assert.equal(res.state.winner, 0);
  assert.equal(res.state.resultReason, 'max_ply');
  assert.ok(findEvent(res.events, 'timeout'));
});

group('V1.2 Volume 1 (Tokaido): Gourmet Collection & Travel Coins (旅銭)');
test('landing on gourmet station #2 grants gourmet bitmask and +1 travel coin (once per station)', () => {
  const board = getBoard(0);
  let state = stateFor(0);
  state.pos[0] = 1;
  state.turn = 0;
  // Roll 1 lands on #2 (泥鰌鍋, gourmetBit: 1), awards 1 coin, and jumps +2 to #4
  const r1 = applyNext(board, state, 1, { spendCoin: false });
  assert.equal(r1.state.boardState.tokaido.gourmetMask[0], 1);
  assert.equal(r1.state.boardState.tokaido.coins[0], 1);
  assert.ok(findEvent(r1.events, 'gourmet'));

  // Visiting #2 a second time does not award a duplicate coin
  let state2 = r1.state;
  state2.pos[0] = 1;
  state2.skip[0] = 0;
  state2.turn = 0;
  const r2 = applyNext(board, state2, 1, { spendCoin: false });
  assert.equal(r2.state.boardState.tokaido.coins[0], 1);
});

test('spending 1 travel coin cancels Tokaido stay penalty or checkpoint pullback', () => {
  const board = getBoard(0);
  let state = stateFor(0);
  state.boardState.tokaido.coins[0] = 2;
  state.pos[0] = 3; // #4 is stay (宿場泊)
  state.turn = 0;
  // Interactive pauseOnChoice triggers pendingChoice for tokaido_coin
  const paused = applyNext(board, state, 1, { pauseOnChoice: true });
  assert.ok(paused.state.pendingChoice);
  assert.equal(paused.state.pendingChoice.type, 'tokaido_coin');
  assert.equal(paused.state.pendingChoice.reason, 'stay');

  // Spend 1 coin via applyChoice
  const resolved = EsugorokuCore.applyChoice(board, paused.state, { type: 'tokaido_coin', spendCoin: true });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.state.skip[0], 0, 'Stay penalty cancelled by spending travel coin');
  assert.equal(resolved.state.boardState.tokaido.coins[0], 1);
  assert.ok(findEvent(resolved.events, 'coin_spent'));
});

group('V1.2 Volume 2 (Yokai): 4 Ao-Andon Lanterns & Personal Hyakki Yagyo');
test('4 explicit Ao-Andon lantern nodes (#4, #10, #16, #22) light per-player mask and trigger 2x on next forward jump', () => {
  const board = getBoard(1);
  assert.deepEqual(
    board.nodes.filter(n => n.lanternBit > 0).map(n => n.id),
    [4, 10, 16, 22],
  );

  let state = stateFor(1);
  // Pre-light 3 lanterns (#4=1, #10=2, #16=4 -> mask 7) for player 0
  state.boardState.yokai.lanternMask[0] = 7;
  state.pos[0] = 20;
  state.turn = 0;
  // Roll 2 lands on #22 (lanternBit: 8). All 4 lanterns collected -> mask === 15, frenzyPending[0] = true
  // Crucially, frenzyPending is NOT consumed on the same turn it was earned!
  const rEarn = applyNext(board, state, 2);
  assert.equal(rEarn.state.boardState.yokai.frenzyPending[0], true);
  assert.equal(rEarn.state.boardState.yokai.lanternMask[0], 15);
  assert.ok(findEvent(rEarn.events, 'frenzy_ready'));
  assert.equal(findEvent(rEarn.events, 'frenzy_used'), undefined);

  // Next turn for player 0: backward jump does NOT consume frenzyPending
  let stateBack = rEarn.state;
  stateBack.pos[0] = 5;
  stateBack.turn = 0;
  // Roll 5 -> #10 has jumpTable[4] = -2 (backward jump)
  const rBack = applyNext(board, stateBack, 5);
  assert.equal(rBack.state.boardState.yokai.frenzyPending[0], true, 'Backward jump must not consume frenzyPending');

  // Forward jump consumes frenzyPending and doubles jump delta (+2 -> +4)
  let stateFwd = rBack.state;
  stateFwd.pos[0] = 1;
  stateFwd.turn = 0;
  // Roll 5 -> lands on #6 where jumpTable[4] = +2 -> doubled to +4 -> lands on #10
  const rFwd = applyNext(board, stateFwd, 5);
  assert.equal(rFwd.state.pos[0], 10);
  assert.equal(rFwd.state.boardState.yokai.frenzyPending[0], false);
  assert.ok(findEvent(rFwd.events, 'frenzy_used'));
});

group('V1.2 Volume 3 (Kesshu): 3 Combat Stances & 12-Charm Defenses');
test('Kesshu clash supports assault, feint, and defend stances via applyChoice', () => {
  const board = getBoard(2);
  const baseState = stateFor(2);
  baseState.pos[0] = 1;
  baseState.pos[1] = 2;
  baseState.tokens[0] = 1;
  baseState.tokens[1] = 2;
  baseState.turn = 0;

  // Pause on clash choice
  const paused = applyNext(board, baseState, 1, { pauseOnChoice: true });
  assert.equal(paused.state.pendingChoice?.type, 'kesshu_stance');

  // 1) Assault (猛攻): pushes 1 back near start (#2 -> #1) and steals token bit 2
  const assaultRes = EsugorokuCore.applyChoice(board, paused.state, { type: 'kesshu_stance', stance: 'assault' });
  assert.equal(assaultRes.state.pos[1], 1);
  assert.equal(assaultRes.state.tokens[0], 3);
  assert.equal(assaultRes.state.tokens[1], 0);

  // 2) Feint (牽制): pushes 1 back and grants tempShield without stealing
  const feintRes = EsugorokuCore.applyChoice(board, paused.state, { type: 'kesshu_stance', stance: 'feint' });
  assert.equal(feintRes.state.boardState.kesshu.tempShield[0], true);
  assert.equal(feintRes.state.tokens[1], 2);

  // 3) Defend (固守): 0 push, grants tempShield
  const defendRes = EsugorokuCore.applyChoice(board, paused.state, { type: 'kesshu_stance', stance: 'defend' });
  assert.equal(defendRes.state.pos[1], 2);
  assert.equal(defendRes.state.boardState.kesshu.tempShield[0], true);
});

test('decoy charm cancels clash pushback, gunbai_seal prevents regalia theft', () => {
  const board = getBoard(2);
  // Defender (player 1) has decoy charm
  const stateDecoy = stateFor(2, { charmsP1: ['decoy'] });
  stateDecoy.pos[0] = 3;
  stateDecoy.pos[1] = 4;
  stateDecoy.tokens[1] = 2;
  stateDecoy.turn = 0;
  const rDecoy = applyNext(board, stateDecoy, 1);
  assert.equal(rDecoy.state.pos[1], 4, 'Decoy charm keeps defender in place');
  assert.equal(rDecoy.state.tokens[1], 2, 'Decoy charm prevents regalia theft');

  // Defender (player 1) has gunbai_seal charm
  const stateGunbai = stateFor(2, { charmsP1: ['gunbai_seal'] });
  stateGunbai.pos[0] = 3;
  stateGunbai.pos[1] = 4;
  stateGunbai.tokens[1] = 2;
  stateGunbai.turn = 0;
  const rGunbai = applyNext(board, stateGunbai, 1);
  assert.equal(rGunbai.state.tokens[1], 2, 'Gunbai seal protects regalia from being stolen');
  assert.ok(rGunbai.state.charmUsed[1] & ESR_CHARM.GUNBAI_SEAL);
});

test('reroll charm is oncePerMatch and never recharges', () => {
  const board = getBoard(0);
  let state = stateFor(0, { charms: ['reroll'] });
  const r1 = EsugorokuCore.applyCharm(board, state, 'reroll', { player: 0 });
  assert.equal(r1.ok, true);
  assert.ok(r1.state.charmUsed[0] & ESR_CHARM.REROLL);
  assert.equal(r1.state.charmCooldown[0].reroll, -1);

  // Cannot use reroll a second time in the same match
  const r2 = EsugorokuCore.applyCharm(board, r1.state, 'reroll', { player: 0 });
  assert.equal(r2.ok, false);
});

group('V1.2 Volume 4 (Genji): Active Route Choice & Moral Balance');
test('reaching #15 allows active choice between good (雅道) and evil (修羅道) regardless of roll parity', () => {
  const board = getBoard(3);
  const state = stateFor(3);
  state.pos[0] = 14;
  state.turn = 0;

  // Roll 3 (odd) with pauseOnChoice pauses at #15 for player route decision
  const paused = applyNext(board, state, 3, { pauseOnChoice: true });
  assert.equal(paused.state.pos[0], 15);
  assert.equal(paused.state.pendingChoice?.type, 'genji_branch');
  assert.equal(paused.state.pendingChoice?.remainingSteps, 2);

  // Player chooses 'good' even though the roll was odd (3)!
  const chosenGood = EsugorokuCore.applyChoice(board, paused.state, { type: 'genji_branch', route: 'good' });
  assert.equal(chosenGood.ok, true);
  assert.ok(findEvent(chosenGood.events, 'branch_good'));
  assert.ok(chosenGood.state.boardState.genji.balance[0] > 0);
});

group('V1.2–V1.3 Fair AI Action Selection & Profile v2 Migration');
test('aiSelectAction selects legal pre-roll or choice actions across easy, normal, hard, and master without choosing dice faces', () => {
  const board = getBoard(2);
  const state = stateFor(2, { charmsP1: ['wind', 'stay', 'guard'] });
  state.turn = 1;
  state.pos[0] = 12;
  state.pos[1] = 4;

  for (const diff of ['easy', 'normal', 'hard', 'master']) {
    const action = EsugorokuCore.aiSelectAction(board, state, diff);
    assert.ok(['roll', 'strike', 'charm', 'genji_branch'].includes(action.type), `Invalid AI action ${action.type} for ${diff}`);
    assert.equal(action.forcedRoll, undefined, 'AI must never output a forcedRoll');
  }
});

test('migrateProfileData migrates v1 profile to v2 schema and evaluateMatchProgression unlocks cards deterministically', () => {
  const v1Raw = JSON.stringify({
    collection: ['tokaido_01', 'yokai_01'],
    customHandCard: 'tokaido_01',
    stats: { matches: 3, wins: 2, jumps: 5, duels: 1 },
  });
  const migrated = migrateProfileData(v1Raw, null);
  assert.equal(migrated.version, 2);
  assert.ok(migrated.collection.includes('tokaido_01'));
  assert.ok(migrated.collection.includes('kesshu_01'));
  assert.ok(migrated.collection.includes('genji_01'));
  assert.equal(migrated.customHandCard, 'tokaido_01');
  assert.equal(migrated.stats.wins, 2);

  // Verify deterministic progression unlock on winning Tokaido with all 3 gourmet dishes
  const winState = stateFor(0);
  winState.winner = 0;
  winState.humanSide = 0;
  winState.ply = 18;
  winState.boardState.tokaido.gourmetMask[0] = 7;
  winState.boardState.tokaido.coinsSpent[0] = 1;

  const prog = evaluateMatchProgression(0, winState, { persist: false });
  assert.ok(prog.newlyUnlockedCards.length > 0 || G.collection.has('tokaido_02'));
  assert.ok(G.collection.has('tokaido_02'), 'Completing Tokaido unlocks completion cards');
  assert.ok(G.collection.has('tokaido_04'), 'Winning Tokaido unlocks victory cards');
  assert.ok(G.collection.has('tokaido_07'), 'Collecting all 3 gourmet dishes unlocks gourmet cards');
  assert.equal(ACHIEVEMENTS.length, 24);
});

group('Ambient Shamisen & Koto BGM and Independent Mute Controls');
test('all 4 board volumes define distinct Shamisen & Koto modal compositions', () => {
  for (const board of BOARDS) {
    const theme = getBgmTheme(board.id);
    assert.ok(theme, `missing BGM theme for ${board.id}`);
    assert.equal(theme.id, board.id);
    assert.ok(theme.scale.length >= 8);
    assert.equal(theme.kotoPattern.length, 16);
    assert.equal(theme.shamisenPattern.length, 16);

    const step0 = computeBgmStepNotes(board.id, 0);
    assert.equal(step0.themeId, board.id);
    assert.ok(step0.bassFreq > 0);
    assert.ok(step0.kotoFreq !== null || step0.shamisenFreq !== null);
  }
});

test('BGM mute state and SFX mute state toggle completely independently', () => {
  audio.setEnabled(true);
  audio.setBgmEnabled(true);
  assert.equal(audio.isEnabled(), true);
  assert.equal(audio.isBgmEnabled(), true);

  audio.setBgmEnabled(false);
  assert.equal(audio.isBgmEnabled(), false);
  assert.equal(audio.isEnabled(), true);
  assert.equal(audio.getState().bgmMuted, true);
  assert.equal(audio.getState().sfxMuted, false);

  audio.setEnabled(false);
  audio.setBgmEnabled(true);
  assert.equal(audio.isBgmEnabled(), true);
  assert.equal(audio.isEnabled(), false);
  assert.equal(audio.getState().bgmMuted, false);
  assert.equal(audio.getState().sfxMuted, true);

  audio.setEnabled(true);
  audio.setBgmEnabled(true);
});

group('3D Physics-Based Dice Orientation & Visual-vs-Logic Face Verification');
test('all 6 die values (1..6) place their exact face normal straight UP (+Y) for any yaw angle in YXZ Euler order', () => {
  const testYaws = [-Math.PI, -1.25, -0.5, 0, 0.25, 0.85, Math.PI * 0.75];
  for (let val = 1; val <= 6; val++) {
    for (const yaw of testYaws) {
      const target = computeDieTargetEulerYXZ(val, yaw);
      assert.equal(target.order, 'YXZ');
      const evalRes = evaluateDieTopFaceYXZ(target.rx, target.ry, target.rz);
      assert.equal(evalRes.topFace, val, `Expected face ${val} on top for yaw=${yaw}, got ${evalRes.topFace}`);
      assert.equal(evalRes.alignmentDot, 1, `Expected alignmentDot=1.0 for face ${val}, got ${evalRes.alignmentDot}`);
      assert.equal(evalRes.faceDots[7 - val], -1, `Expected opposite face ${7 - val} pointing straight down (-1.0)`);
    }
  }
});

test('multi-turn 3D spin convergence to nearest 2*PI multiple preserves exact visual top face matching logic roll', () => {
  const nearest = (cur, target) => target + Math.round((cur - target) / (Math.PI * 2)) * Math.PI * 2;
  for (let val = 1; val <= 6; val++) {
    const target = computeDieTargetEulerYXZ(val, 0.42);
    const tumbledRx = target.rx + Math.PI * 2 * 3 + 0.18;
    const tumbledRy = target.ry - Math.PI * 2 * 2 - 0.24;
    const tumbledRz = target.rz + Math.PI * 2 * 4 - 0.12;

    const settledRx = nearest(tumbledRx, target.rx);
    const settledRy = nearest(tumbledRy, target.ry);
    const settledRz = nearest(tumbledRz, target.rz);

    const evalRes = evaluateDieTopFaceYXZ(settledRx, settledRy, settledRz);
    assert.equal(evalRes.topFace, val);
    assert.equal(evalRes.alignmentDot, 1);
  }
});

group('3D Board Tile Wood-on-Wood Clack Sound Effect');
test('audio.tileClack produces a subtle wood clack with warm pitch and balanced volume', () => {
  audio.setEnabled(true);
  const res = audio.tileClack(0);
  assert.equal(res.played, true);
  assert.equal(res.vol, 0.20, 'Volume should be a subtle 0.20 matching SFX bus without being jarring');
  assert.ok(res.pitch >= 470 && res.pitch <= 570, `Pitch ${res.pitch} should be in resonant wood range (470-570 Hz)`);
  assert.equal(audio.getState().lastSfx, 'tileClack');
  assert.equal(audio.getState().lastTileClack.nodeId, 0);
});

test('tileWoodClack modulates pitch across different board tiles for tactile organic acoustic texture', () => {
  audio.setEnabled(true);
  const pitches = [];
  for (let nodeId = 0; nodeId < 7; nodeId++) {
    const res = audio.tileClack(nodeId);
    assert.equal(res.played, true);
    pitches.push(res.pitch);
  }
  const uniquePitches = new Set(pitches);
  assert.equal(uniquePitches.size, 7, 'Each of the 7 tile steps should have a distinct pitch');
  assert.ok(Math.min(...pitches) >= 475);
  assert.ok(Math.max(...pitches) <= 565);
});

test('audio.woodTileClack is an alias of tileClack and respects SFX mute state', () => {
  audio.setEnabled(false);
  const muted = audio.woodTileClack(4);
  assert.equal(muted.played, false);
  assert.equal(muted.reason, 'sfx_disabled');

  audio.setEnabled(true);
  const unmuted = audio.woodTileClack(4);
  assert.equal(unmuted.played, true);
  assert.equal(unmuted.vol, 0.20);
});

console.log(`\n${passed} tests passed, ${failures.length} failed.`);
if (failures.length) {
  process.exit(1);
}
