// Game loop, physical dice, input, AI and screen flow.
import {
  canvas, ctx, W, H, G, PLAY_BUTTONS, DICE_TRAY, TUBE_RECT, TUBE_CENTER,
  SETTLEMENT_BTNS, GALLERY_CLOSE, SIDE_CARDS, CHARM_SLOTS, START_BTN,
  SIDE_GALLERY_BTN, SIDE_BACK_BTN, currentBoard, resetMatchState,
  toStageXY, isInside, nodeCenter, showToast, showStamp, spawnLandingEffect,
  unlockBoardCards, equipAllCharms, getSelectBoardRect, getGalleryCardRect,
  BOARD_RECT, saveProfile,
} from './state.js';
import {
  BOARDS, UKIYOE_CARDS, CHARMS, getBoard,
} from './boards.js';
import { EsugorokuCore, ESR_CHARM } from './core.js';
import { drawPlaying, invalidateScene } from './board_renderer.js';
import {
  drawUI, drawGallery, drawSettlementScreen, TABS, SELECT_GALLERY,
} from './ui_screens.js';
import { audio } from './audio.js';
import { loadAllPrints, isPrintLoaded } from './prints.js';

const BOARD_STATUS = [
  ['東海道を進み、京・八百善の上りを目指す', '紅丸「泊」は一休み。名物格は跳び、上がりは点点一致。'],
  ['百物語の夜、妖怪札の飛び先を読む', '怪異格に止まると青行灯が消える。四灯全滅で百鬼夜行。'],
  ['討入備えを三つ揃え、御前の上りへ', '兜・太刀・陣太鼓を集めるまで上りは御前に弾かれる。'],
  ['善玉と悪玉、心の天平を傾けながら上る', '偶の目は善道、奇の目は悪道。分岐の先で運命が変わる。'],
];

let last = 0;
let initialized = false;
let pointerDown = false;
let galleryOpenedFrom = 'SELECT_BOARD';

function setStatus(text, sub) {
  G.statusText = text;
  if (sub) G.statusSub = sub;
}

function statusForTurn() {
  const board = currentBoard();
  const human = G.match?.humanSide ?? 0;
  if (G.match?.winner >= 0) return;
  if (G.match.turn === human) {
    setStatus('竹筒を押さえて振り、指を離して賽を投げよ', BOARD_STATUS[G.boardIdx][1]);
  } else {
    setStatus('相手の手番 ─ 賽の行方を見守る', BOARD_STATUS[G.boardIdx][1]);
  }
}

function openSide(index) {
  G.boardIdx = index;
  G.hoverBoard = -1;
  G.screen = 'SELECT_SIDE';
  G.hoverSide = -1;
  G.hoverCharm = -1;
  audio.paper();
}

function beginMatch() {
  G.screen = 'PLAYING';
  G.showGallery = false;
  resetMatchState();
  const board = currentBoard();
  setStatus(
    G.match.turn === G.humanSide ? '竹筒を押さえて振り、指を離して賽を投げよ' : '相手の手番 ─ 賽の行方を見守る',
    BOARD_STATUS[G.boardIdx][1],
  );
  const fresh = unlockBoardCards(G.boardIdx);
  if (fresh.length) {
    G.newCards = fresh;
    showToast(`${fresh.length} 枚の錦絵が開帳された`, board.volume + ' の新しい札');
  }
  invalidateScene();
  audio.paper();
  G.aiTimer = G.match.turn === G.humanSide ? 0 : 1.1;
  G.phase = 'ROLL';
  G.match.winner = -1;
}

function backToSelect() {
  G.screen = 'SELECT_BOARD';
  G.showGallery = false;
  G.hoverBoard = -1;
  G.phase = 'ROLL';
  audio.paper();
}

function syncBoardStats() {
  const board = currentBoard();
  if (!G.match) return;
  const human = G.match.humanSide;
  const tokens = G.match.tokens[human] || 0;
  G.kesshuPieces = [1, 2, 4].filter(m => tokens & m).length;
  const node = board.nodes[G.match.pos[human]];
  if (board.id === 'genji' && node) {
    if (node.kind === 'good') G.genjiBalance = Math.min(1, (G.genjiBalance || 0) + 0.45);
    else if (node.kind === 'evil') G.genjiBalance = Math.max(-1, (G.genjiBalance || 0) - 0.45);
    else G.genjiBalance *= 0.96;
  }
}

function handleEvents(result, roll) {
  const board = currentBoard();
  const human = G.match.humanSide;
  const player = result.state.turn === (1 - human) ? human : (result.state.winner >= 0 ? result.state.winner : 1 - result.state.turn);
  const mover = result.events.find(e => e.player !== undefined)?.player ?? human;
  const finalPos = result.state.pos[mover];
  const node = board.nodes[finalPos];
  const opponent = 1 - mover;
  let usedJump = false;
  let usedBounce = false;
  for (const ev of result.events) {
    if (ev.type === 'jump') {
      usedJump = true;
      G.stats.jumps++;
      audio.jump();
      showToast(`跳び ─ ${board.nodes[ev.from]?.title || ''} から ${board.nodes[ev.to]?.title || ''} へ`, `出目 ${roll} の短冊`);
    } else if (ev.type === 'bounce') {
      usedBounce = true;
      audio.bounce();
      showToast('上りを超過 ─ 道中へ弾き返された', '点点一致でなければ上がれない');
    } else if (ev.type === 'token') {
      audio.token();
      G.tokaidoGourmet.length = G.tokaidoGourmet.length;
      showStamp('討入備え', ev.label || '義士印');
      showToast(`討入備え「${ev.label || '印'}」を得た`, '三つ揃えば御前へ上がれる');
    } else if (ev.type === 'stay') {
      audio.stay();
      showToast(`泊 ─ ${ev.turns} 手休み`, board.nodes[ev.to]?.title || '');
    } else if (ev.type === 'duel') {
      G.stats.duels++;
      audio.duel();
      showToast('同格の武者と一騎討ち', '相手を一ます弾き返した');
    } else if (ev.type === 'charm') {
      audio.charm();
      showToast(ev.charm === 'stay' ? '宿場守りが泊を無効化' : ev.charm === 'guard' ? '妖怪封じが戻り跳びを封じた' : '早駕籠が一歩を加えた', '懐中守り札');
    } else if (ev.type === 'goal_locked') {
      audio.stay();
      showStamp('御前返し', `備え ${ev.required} 枚が必要`);
      showToast('上りはまだ開かない', '討入備えを三つ揃えよ');
    } else if (ev.type === 'win') {
      // Handled after state synchronisation.
    } else if (ev.type === 'branch_good') {
      showToast('善玉・源氏雅道へ', '偶の目が心の天平を善へ傾ける');
    } else if (ev.type === 'branch_evil') {
      showToast('悪玉・修羅道へ', '奇の目が心の天平を悪へ傾ける');
    } else if (ev.type === 'skip') {
      showToast('一休み', 'この手番は休み');
    }
  }

  // A local gold-cloud / sakura burst only at the final square.
  if (node) {
    const c = nodeCenter(node);
    spawnLandingEffect(c.x, c.y, board.id === 'genji' ? 'sakura' : 'gold', node.title);
  }
  if (mover === human) {
    G.tokaidoGourmet.length = G.tokaidoGourmet.length;
  }
  if (board.id === 'tokaido' && mover === human && node && node.kind === 'jump') {
    const foodIndex = [2, 7, 12].indexOf(node.id);
    if (foodIndex >= 0 && !G.tokaidoGourmet.includes(foodIndex)) {
      G.tokaidoGourmet.push(foodIndex);
      showToast(`宿場名物「${node.title}」を味わった`, '次の跳びが伸びる');
    }
  }

  if (board.id === 'yokai') {
    if (mover === G.match.humanSide || mover === 1 - G.match.humanSide) {
      if (finalPos > 0 && finalPos < board.goal && G.yokaiLanterns > 0) {
        G.yokaiLanterns -= 1;
        audio.lantern();
        if (G.yokaiLanterns === 0) {
          G.yokaiFrenzy = true;
          showStamp('百鬼夜行', '怪異飛距離 二倍');
          showToast('青行灯がすべて消えた', '次の怪異跳びは二倍になる');
        } else {
          showToast(`青行灯がひとつ消えた（残り ${G.yokaiLanterns}）`, '四灯全滅で百鬼夜行');
        }
      }
    }
  }

  if (G.yokaiFrenzy && usedJump) {
    G.yokaiFrenzy = false;
    G.yokaiLanterns = 4;
    G.yokaiFrenzyUsed = true;
    showToast('百鬼夜行が過ぎた', '青行灯が四つとも灯り直した');
  }
  if (usedBounce) G.yokaiFrenzyUsed = true;
  syncBoardStats();
  if (result.won || result.state.winner >= 0) {
    G.phase = 'SETTLEMENT';
    if (result.state.winner === G.match.humanSide) audio.win();
    else audio.lose();
    unlockBoardCards(G.boardIdx);
    showStamp(result.state.winner === G.match.humanSide ? '大上り' : '終局', result.state.winner === G.match.humanSide ? '見事、京へ到達' : '道半ば');
    return;
  }
  statusForTurn();
}

function applyResult(result, roll) {
  G.match = result.state;
  G.phase = result.won ? 'SETTLEMENT' : 'ROLL';
  G.diceValue = roll;
  G.dice[0] = roll;
  handleEvents(result, roll);
  if (G.phase !== 'SETTLEMENT') {
    G.aiTimer = G.match.turn === G.match.humanSide ? 0 : 0.9;
  }
}

function popcount3(mask) {
  return [1, 2, 4].filter(m => mask & m).length;
}

function simulateWalk(board, from, steps, roll) {
  const branchGood = roll % 2 === 0;
  let pos = from;
  let dir = 1;
  const path = [pos];
  for (let i = 0; i < steps; i++) {
    if (dir < 0) {
      const prev = board.nodes[pos].prev;
      if (prev === undefined || prev === null || prev < 0) break;
      pos = prev;
      path.push(pos);
      continue;
    }
    if (pos === board.goal) {
      if (!board.bounceBack) break;
      const prev = board.nodes[pos].prev;
      if (prev === undefined || prev === null || prev < 0) break;
      dir = -1;
      pos = prev;
      path.push(pos);
      continue;
    }
    const nxt = board.nodes[pos].next || [];
    if (!nxt.length) break;
    let edge = 0;
    if (nxt.length > 1) edge = board.style === 'wakare' ? (branchGood ? 0 : 1) : 0;
    pos = nxt[edge];
    path.push(pos);
  }
  return path;
}

function pathToPoints(board, indexes, side) {
  return indexes.map((idx, i) => {
    const node = board.nodes[Math.max(0, Math.min(board.goal, idx))];
    const c = nodeCenter(node);
    const n = i === indexes.length - 1 ? 0 : 1;
    return {
      x: c.x + (side === 0 ? -11 : 11),
      y: c.y + node.h * 0.24 + (side === 0 ? 2 : -2) - n * 4,
    };
  });
}

function beginMove(result, roll, oldState) {
  const board = currentBoard();
  const mover = oldState.turn;
  const hist = result.state.history?.[result.state.history.length - 1];
  const skipped = result.events.some(e => e.type === 'skip');
  const steps = skipped ? 0 : (hist?.steps || roll);
  let indexes = simulateWalk(board, oldState.pos[mover], steps, roll);
  const jump = result.events.find(e => e.type === 'jump');
  if (jump && indexes[indexes.length - 1] !== jump.to) indexes.push(jump.to);
  const final = result.state.pos[mover];
  if (indexes[indexes.length - 1] !== final) indexes.push(final);
  if (!indexes.length) indexes = [oldState.pos[mover], final];
  const path = pathToPoints(board, indexes, mover);
  const dur = Math.max(560, Math.min(1750, (indexes.length - 1) * 130 + (jump ? 320 : 0)));
  G.pieceAnim = { side: mover, path, t0: performance.now(), duration: dur };
  G.pendingResult = { result, roll };
  G.phase = 'MOVE';
  setStatus('賽の目に従って駒が進む', currentBoard().ruleSummary);
}

function finishMove() {
  if (!G.pendingResult) return;
  const { result, roll } = G.pendingResult;
  G.pendingResult = null;
  G.pieceAnim = null;
  G.match = result.state;
  G.phase = result.won || result.state.winner >= 0 ? 'SETTLEMENT' : 'ROLL';
  handleEvents(result, roll);
  G.diceValue = roll;
  if (G.phase !== 'SETTLEMENT') {
    G.aiTimer = G.match.turn === G.match.humanSide ? 0 : 0.9;
  }
}

function targetRotation(value, yaw) {
  switch (value) {
    case 1: return { rx: -Math.PI / 2, ry: yaw, rz: 0 };
    case 2: return { rx: 0, ry: yaw, rz: Math.PI / 2 };
    case 3: return { rx: 0, ry: yaw, rz: 0 };
    case 4: return { rx: Math.PI, ry: yaw, rz: 0 };
    case 5: return { rx: 0, ry: yaw, rz: -Math.PI / 2 };
    case 6: return { rx: Math.PI / 2, ry: yaw, rz: 0 };
    default: return { rx: 0, ry: yaw, rz: 0 };
  }
}

function startRoll(forcedValue = null) {
  if (G.screen !== 'PLAYING' || G.phase !== 'ROLL') return false;
  if (!G.match || G.match.winner >= 0) return false;
  if (G.match.turn !== G.match.humanSide && forcedValue === null) return false;
  const value = forcedValue ?? (1 + Math.floor(Math.random() * 6));
  const target = targetRotation(value, Math.random() * 1.4 - 0.7);
  const die = G.physDice[0];
  G.phase = 'ANIM';
  G.rollResolved = false;
  G.resolveTimer = 0;
  G.pendingRoll = value;
  G.tube.shake = 1;
  G.tube.tipped = true;
  G.rollPending = true;
  setStatus('賽が転がる ─ 目を読む', '盤面は静止したまま、骰だけが踊る');
  die.settled = false;
  die.settling = false;
  die.spinTime = 0;
  die.x = TUBE_CENTER.x + 14;
  die.y = TUBE_CENTER.y - 10;
  die.z = 42 + Math.random() * 18;
  die.vx = 24 + Math.random() * 40;
  die.vy = -7 + Math.random() * 18;
  die.vz = 26 + Math.random() * 22;
  die.wx = 9 + Math.random() * 8;
  die.wy = 7 + Math.random() * 9;
  die.wz = 5 + Math.random() * 7;
  die.target = target;
  die.value = value;
  die.active = true;
  audio.throwDie();
  showStamp('投 骰', `${currentBoard().ui.diceDevice}より一擲`);
  return true;
}

function onActiveSettled(value) {
  G.diceValue = value;
  G.dice[0] = value;
  G.rollResolved = true;
  G.resolveTimer = 0.24;
  G.tube.shake = 0;
  G.tube.tipped = false;
  G.rollPending = false;
  setStatus(`出目は ${value}`, '賽が静まり、駒が動き出す');
  audio.bounce();
}

function resolvePendingRoll() {
  if (!G.rollResolved || G.resolveTimer > 0) return;
  const value = G.pendingRoll || G.diceValue;
  G.rollResolved = false;
  const board = currentBoard();
  const oldState = G.match;
  const multiplier = board.id === 'yokai' && G.yokaiFrenzy ? 2 : 1;
  const result = EsugorokuCore.applyRoll(board, oldState, value, { jumpMultiplier: multiplier });
  beginMove(result, value, oldState);
}

function aiChooseRoll() {
  const board = currentBoard();
  const state = { ...G.match, turn: G.match.humanSide === 0 ? 1 : 0 };
  let best = 1;
  let bestVal = -Infinity;
  for (let roll = 1; roll <= 6; roll++) {
    const trial = EsugorokuCore.applyRoll(board, state, roll);
    let v = 0;
    if (trial.state.winner === state.turn) v = 10000;
    else if (trial.state.winner >= 0) v = -10000;
    else {
      v = trial.state.pos[state.turn] * 3 + popcount3(trial.state.tokens[state.turn]) * 20 - trial.state.skip[state.turn] * 14;
      const ev = EsugorokuCore.expectedValue(board, trial.state, state.turn);
      v += Number.isFinite(ev) ? ev * 0.08 : 0;
    }
    if (v > bestVal) { bestVal = v; best = roll; }
  }
  return best;
}

function updateDice(dt) {
  const board = currentBoard();
  for (const die of G.physDice) {
    if (die.settled) continue;
    die.spinTime += dt;
    if (!die.settling) {
      die.x += die.vx * dt;
      die.y += die.vy * dt;
      die.z += die.vz * dt;
      die.vz -= 760 * dt;
      if (die.z < 0) {
        die.z = 0;
        if (Math.abs(die.vz) > 8) {
          die.vz = -die.vz * 0.48;
          audio.bounce();
        } else {
          die.vz = 0;
        }
        die.vx *= 0.78;
        die.vy *= 0.78;
      }
      die.wx *= 0.985;
      die.wy *= 0.985;
      die.wz *= 0.985;
      die.rx += die.wx * dt;
      die.ry += die.wy * dt;
      die.rz += die.wz * dt;
      // Tray walls (V2 single oversized die).
      const left = 1050;
      const right = 1190;
      const top = 574;
      const bottom = 680;
      if (die.x < left) { die.x = left; die.vx = Math.abs(die.vx) * 0.7; }
      if (die.x > right) { die.x = right; die.vx = -Math.abs(die.vx) * 0.7; }
      if (die.y < top) { die.y = top; die.vy = Math.abs(die.vy) * 0.7; }
      if (die.y > bottom) { die.y = bottom; die.vy = -Math.abs(die.vy) * 0.7; }
      if ((die.spinTime > 0.82 && die.z <= 0.1 && Math.abs(die.vx) + Math.abs(die.vy) < 32) || die.spinTime > 1.7) {
        die.settling = true;
      }
    } else {
      const nearest = (cur, target) => target + Math.round((cur - target) / (Math.PI * 2)) * Math.PI * 2;
      const tx = nearest(die.rx, die.target.rx);
      const ty = nearest(die.ry, die.target.ry);
      const tz = nearest(die.rz, die.target.rz);
      const k = Math.min(1, dt * 10);
      die.rx += (tx - die.rx) * k;
      die.ry += (ty - die.ry) * k;
      die.rz += (tz - die.rz) * k;
      die.x += (1110 - die.x) * k;
      die.y += (620 - die.y) * k;
      if (Math.abs(tx - die.rx) < 0.01 && Math.abs(ty - die.ry) < 0.01 && Math.abs(tz - die.rz) < 0.01) {
        die.rx = tx; die.ry = ty; die.rz = tz;
        die.settled = true;
        die.settling = false;
        if (die.active) onActiveSettled(die.value);
      }
    }
  }
  if (G.tube.shake > 0) G.tube.shake = Math.max(0, G.tube.shake - dt * 1.4);
  if (G.rollResolved) {
    if (G.resolveTimer > 0) {
      G.resolveTimer -= dt;
      if (G.resolveTimer <= 0) resolvePendingRoll();
    }
  }
}

function update(dt) {
  G.pulseTick += dt;
  if (G.toast) {
    G.toast.life -= dt;
    if (G.toast.life <= 0) G.toast = null;
  }
  if (G.stamp) {
    G.stamp.life -= dt;
    if (G.stamp.life <= 0) G.stamp = null;
  }
  for (const fx of G.effects) fx.t += dt;
  G.effects = G.effects.filter(fx => fx.t < fx.life);
  if (G.screen !== 'PLAYING') return;
  updateDice(dt);
  if (G.phase === 'MOVE' && G.pieceAnim) {
    const anim = G.pieceAnim;
    const p = Math.max(0, Math.min(1, (performance.now() - anim.t0) / anim.duration));
    const seg = Math.min(anim.path.length - 2, Math.floor(p * (anim.path.length - 1)));
    if (seg !== anim.lastSeg) {
      anim.lastSeg = seg;
      audio.step();
    }
    // V2 camera: zoom 1 -> 1.22 and track the moving pawn.
    const next = anim.path[Math.min(anim.path.length - 1, seg + 1)] || anim.path[anim.path.length - 1];
    const cur = anim.path[seg >= 0 ? seg : 0] || next;
    G.camera.focus = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 - 6 };
    G.camera.zoom = 1 + 0.22 * p;
    if (p >= 1) finishMove();
  }
  // Restore the overview camera after movement ends.
  if (G.phase !== 'MOVE' || !G.pieceAnim) {
    const bx = BOARD_RECT.x + BOARD_RECT.w / 2;
    const by = BOARD_RECT.y + BOARD_RECT.h / 2;
    G.camera.focus = { x: bx + (G.camera.focus.x - bx) * 0.12, y: by + (G.camera.focus.y - by) * 0.12 };
    G.camera.zoom = Math.min(1.0, G.camera.zoom + (1 - G.camera.zoom) * 0.18);
  }
  if (G.phase === 'ROLL' && G.match?.winner < 0 && G.match?.turn !== G.match?.humanSide) {
    if (G.aiTimer <= 0.001) {
      const value = aiChooseRoll();
      startRoll(value);
      G.aiTimer = 0;
    } else {
      G.aiTimer -= dt;
    }
  }
}

function handleGalleryClick(p) {
  if (isInside(GALLERY_CLOSE, p.x, p.y)) {
    G.showGallery = false;
    audio.paper();
    return true;
  }
  if (isInside(TABS.cards, p.x, p.y)) { G.galleryTab = 'cards'; G.galleryHover = -1; return true; }
  if (isInside(TABS.charms, p.x, p.y)) { G.galleryTab = 'charms'; G.galleryHover = -1; return true; }
  return true;
}

function handleClick(p) {
  if (G.showGallery) {
    handleGalleryClick(p);
    return;
  }
  if (G.screen === 'SELECT_BOARD') {
    if (isInside(SELECT_GALLERY, p.x, p.y)) {
      galleryOpenedFrom = 'SELECT_BOARD';
      G.showGallery = true;
      G.galleryTab = 'cards';
      audio.paper();
      return;
    }
    for (let i = 0; i < 4; i++) {
      if (isInside(getSelectBoardRect(i), p.x, p.y)) {
        openSide(i);
        return;
      }
    }
  } else if (G.screen === 'SELECT_SIDE') {
    for (const card of SIDE_CARDS) {
      if (isInside(card, p.x, p.y)) {
        G.humanSide = card.side;
        audio.select();
        return;
      }
    }
    for (const slot of CHARM_SLOTS) {
      if (isInside(slot, p.x, p.y)) {
        const idx = G.charms.indexOf(slot.id);
        if (idx >= 0) G.charms.splice(idx, 1);
        else if (G.charms.length < 3) G.charms.push(slot.id);
        else {
          G.charms.shift();
          G.charms.push(slot.id);
        }
        saveProfile();
        audio.select();
        return;
      }
    }
    if (isInside(START_BTN, p.x, p.y)) { beginMatch(); return; }
    if (isInside(SIDE_GALLERY_BTN, p.x, p.y)) {
      galleryOpenedFrom = 'SELECT_SIDE';
      G.showGallery = true;
      G.galleryTab = 'cards';
      audio.paper();
      return;
    }
    if (isInside(SIDE_BACK_BTN, p.x, p.y)) { backToSelect(); return; }
  } else if (G.screen === 'PLAYING') {
    if (G.match?.winner >= 0 || G.phase === 'SETTLEMENT') {
      if (isInside(SETTLEMENT_BTNS.again, p.x, p.y)) {
        beginMatch();
        return;
      }
      if (isInside(SETTLEMENT_BTNS.menu, p.x, p.y)) {
        backToSelect();
        return;
      }
      return;
    }
    if (isInside(PLAY_BUTTONS.gallery, p.x, p.y)) {
      G.showGallery = true;
      G.galleryTab = 'cards';
      galleryOpenedFrom = 'PLAYING';
      audio.paper();
      return;
    }
    if (isInside(PLAY_BUTTONS.charms, p.x, p.y)) {
      G.showGallery = true;
      G.galleryTab = 'charms';
      galleryOpenedFrom = 'PLAYING';
      audio.paper();
      return;
    }
    if (isInside(PLAY_BUTTONS.menu, p.x, p.y)) {
      backToSelect();
      return;
    }
    if (G.match?.turn === G.match?.humanSide && G.phase === 'ROLL' && isInside(TUBE_RECT, p.x, p.y)) {
      startRoll();
      return;
    }
  }
}

function hoverAt(p) {
  G.hoverBoard = -1;
  G.hoverSide = -1;
  G.hoverCharm = -1;
  G.hoverPlayBtn = -1;
  G.hoverNode = -1;
  G.galleryHover = -1;
  if (G.showGallery) {
    if (G.galleryTab === 'cards') {
      for (let i = 0; i < UKIYOE_CARDS.length; i++) {
        if (isInside(getGalleryCardRect(i), p.x, p.y)) { G.galleryHover = i; break; }
      }
    } else {
      for (let i = 0; i < CHARMS.length; i++) {
        const cw = 280; const ch = 330;
        const x = 18 + 60 + i * (cw + 35);
        const y = 14 + 150;
        if (isInside({ x, y, w: cw, h: ch }, p.x, p.y)) { G.galleryHover = i; break; }
      }
    }
    return;
  }
  if (G.screen === 'SELECT_BOARD') {
    for (let i = 0; i < 4; i++) if (isInside(getSelectBoardRect(i), p.x, p.y)) G.hoverBoard = i;
  } else if (G.screen === 'SELECT_SIDE') {
    for (const card of SIDE_CARDS) if (isInside(card, p.x, p.y)) G.hoverSide = card.side;
    for (const slot of CHARM_SLOTS) if (isInside(slot, p.x, p.y)) G.hoverCharm = slot.id;
    if (isInside(START_BTN, p.x, p.y)) G.hoverPlayBtn = 9;
  } else if (G.screen === 'PLAYING') {
    if (isInside(PLAY_BUTTONS.gallery, p.x, p.y)) G.hoverPlayBtn = 0;
    else if (isInside(PLAY_BUTTONS.charms, p.x, p.y)) G.hoverPlayBtn = 1;
    else if (isInside(PLAY_BUTTONS.menu, p.x, p.y)) G.hoverPlayBtn = 2;
    if (isInside(TUBE_RECT, p.x, p.y)) {
      G.tube.hover = true;
      document.body.style.cursor = 'grab';
    } else {
      G.tube.hover = false;
      document.body.style.cursor = 'default';
    }
    const board = currentBoard();
    const bx = p.x - 190;
    const by = p.y - 68;
    for (let i = 0; i < board.nodes.length; i++) {
      const n = board.nodes[i];
      if (bx >= n.x && bx <= n.x + n.w && by >= n.y && by <= n.y + n.h) {
        G.hoverNode = i;
        break;
      }
    }
  }
}

function setupInput() {
  canvas.addEventListener('pointermove', e => {
    const p = toStageXY(e.clientX, e.clientY);
    hoverAt(p);
  });
  canvas.addEventListener('pointerdown', e => {
    if (!initialized) {
      initialized = true;
      audio.toggle();
    }
    canvas.setPointerCapture?.(e.pointerId);
    const p = toStageXY(e.clientX, e.clientY);
    if (G.screen === 'PLAYING' && !G.showGallery && G.phase === 'ROLL' &&
        G.match?.turn === G.match?.humanSide && isInside(TUBE_RECT, p.x, p.y)) {
      G.tube.hold = true;
      G.tube.holdT = performance.now();
      G.tube.shake = 0.55;
      audio.shake();
      setStatus('竹筒を握る ─ 離すと賽が飛ぶ', currentBoard().ruleBrief || currentBoard().ruleSummary);
      e.preventDefault();
      return;
    }
    pointerDown = true;
  });
  canvas.addEventListener('pointerup', e => {
    const p = toStageXY(e.clientX, e.clientY);
    if (G.tube.hold) {
      G.tube.hold = false;
      G.tube.shake = 0;
      if (G.match?.turn === G.match?.humanSide && G.phase === 'ROLL') startRoll();
      return;
    }
    if (pointerDown) {
      pointerDown = false;
      handleClick(p);
    }
  });
  canvas.addEventListener('pointercancel', () => {
    G.tube.hold = false;
    G.tube.shake = 0;
    pointerDown = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      if (G.showGallery) {
        G.showGallery = false;
        return;
      }
      if (G.screen === 'SELECT_SIDE') {
        backToSelect();
        return;
      }
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (G.screen === 'PLAYING' && G.phase === 'ROLL' && G.match?.turn === G.match?.humanSide) startRoll();
    }
  });
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  update(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // The canvas is sized to the viewport; draw the 1280x800 stage centered.
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const scale = Math.min(canvas.width / W, canvas.height / H);
  ctx.setTransform(scale, 0, 0, scale, (canvas.width - W * scale) / 2, (canvas.height - H * scale) / 2);
  if (G.screen === 'PLAYING') {
    drawPlaying(ctx, now / 1000);
    if (G.match?.winner >= 0) drawSettlementScreen(ctx, now / 1000);
  } else {
    drawUI(ctx, now / 1000);
  }
  if (G.showGallery) drawGallery(ctx, now / 1000);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Debug / deterministic E2E surface                                   */
/* ------------------------------------------------------------------ */

function snapshot() {
  const board = currentBoard();
  const signature = board.nodes.map(n => `${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.w)},${Math.round(n.h)}`).join('|');
  return {
    screen: G.screen,
    phase: G.phase,
    boardIdx: G.boardIdx,
    boardId: board.id,
    layout: board.layout,
    style: board.style,
    shape: board.shape,
    title: board.title,
    uiSkin: board.ui.skin,
    panelTitle: board.ui.panelTitle,
    hud: board.ui.hud,
    diceDevice: board.ui.diceDevice,
    diceShape: board.ui.diceShape,
    requiredTokens: board.requiredTokens,
    start: board.start,
    goal: board.goal,
    geometrySignature: signature,
    nodeRects: board.nodes.map(n => ({
      id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, kind: n.kind,
      tilt: n.tilt || 0, title: n.title, jumpTable: n.jumpTable,
      tokens: n.tokens, stripColor: n.stripColor || null,
    })),
    humanSide: G.match?.humanSide,
    turn: G.match?.turn,
    pos: G.match ? [...G.match.pos] : [],
    tokens: G.match ? [...G.match.tokens] : [],
    skip: G.match ? [...G.match.skip] : [],
    winner: G.match?.winner ?? -1,
    lanterns: G.yokaiLanterns,
    previewTargets: board.id === 'yokai' && G.match
      ? [1, 2, 3, 4, 5, 6].map(roll => EsugorokuCore.previewDestinations(board, G.match, roll)[0])
      : [],
    frenzy: G.yokaiFrenzy,
    kesshuPieces: G.kesshuPieces,
    genjiBalance: G.genjiBalance,
    charms: [...G.charms],
    collection: G.collection.size,
    statusText: G.statusText,
    statusSub: G.statusSub,
    diceValue: G.diceValue,
    dice: [G.physDice[0]].map(function(d){
      return {x:d.x,y:d.y,z:d.z,vx:d.vx,vy:d.vy,settled:d.settled,active:d.active,value:d.value};
    }),
    dieValue: G.diceValue,
    effects: G.effects.length,
    deviceRect: { ...TUBE_RECT },
    boardRect: { x: 190, y: 68, w: 800, h: 660 },
  };
}

window.__ESR__ = {
  get state() { return G; },
  boards: BOARDS,
  cards: UKIYOE_CARDS,
  charms: CHARMS,
  snapshot,
  switchToBoard(index) {
    const i = Math.max(0, Math.min(3, Number(index) | 0));
    G.boardIdx = i;
    G.screen = 'PLAYING';
    G.humanSide = 0;
    G.charms = ['stay', 'guard', 'dash'];
    resetMatchState();
    unlockBoardCards(i);
    invalidateScene();
    G.match.turn = G.humanSide;
    G.phase = 'ROLL';
    G.aiTimer = 0;
    statusForTurn();
    return snapshot();
  },
  openSide(index) { openSide(Number(index) | 0); return snapshot(); },
  beginMatch() { beginMatch(); return snapshot(); },
  roll(value) { return startRoll(value ?? undefined); },
  applyRollNow(value) {
    const board = currentBoard();
    const old = G.match;
    const result = EsugorokuCore.applyRoll(board, old, Number(value), { jumpMultiplier: 1 });
    G.match = result.state;
    G.phase = result.won ? 'SETTLEMENT' : 'ROLL';
    G.diceValue = Number(value);
    handleEvents(result, Number(value));
    if (G.phase !== 'SETTLEMENT') G.aiTimer = 0;
    return snapshot();
  },
  settleMove() {
    if (G.pieceAnim) finishMove();
    return snapshot();
  },
  setTurn(side) {
    G.match.turn = side;
    G.aiTimer = 0;
    statusForTurn();
    return snapshot();
  },
  selectRect(index) {
    const r = getSelectBoardRect(index);
    return { ...r };
  },
  galleryCloseRect() { return { ...GALLERY_CLOSE }; },
  showGallery(on, tab = 'cards') { G.showGallery = !!on; G.galleryTab = tab; },
  invalidation() { invalidateScene(); },
  printsLoaded(boardId, art) { return isPrintLoaded(boardId, art); },
};

setupInput();
requestAnimationFrame(frame);
loadAllPrints();
setTimeout(() => document.body.classList.add('ready'), 800);
