// Main 3D Tabletop Game Controller, Step-by-Step Kinematics, DOM HUD, and E2E Surface
import {
  canvas, ctx, W, H, G, PLAY_BUTTONS, DICE_TRAY, TUBE_RECT, TUBE_CENTER,
  SETTLEMENT_BTNS, GALLERY_CLOSE, SIDE_CARDS, CHARM_SLOTS, START_BTN,
  SIDE_GALLERY_BTN, SIDE_BACK_BTN, currentBoard, resetMatchState,
  toStageXY, isInside, nodeCenter, showToast, showStamp, spawnLandingEffect,
  unlockBoardCards, equipAllCharms, getSelectBoardRect, getGalleryCardRect,
  BOARD_RECT, saveProfile,
} from './state.js';
import {
  BOARDS, UKIYOE_CARDS, CHARMS,
} from './boards.js';
import { EsugorokuCore } from './core.js';
import { invalidateScene } from './board_renderer.js';
import { audio } from './audio.js';
import { loadAllPrints, isPrintLoaded } from './prints.js';
import { Tabletop3D } from './tabletop_3d.js';
import { renderNishikieScene } from './nishikie_woodblock.js';

const BOARD_STATUS = [
  ['東海道を進み、京・八百善の上り（#16）を目指す', '赤丸「泊」は1回休み。名物料理マスは前方へジャンプ！ゴールはぴったり止まる「点点一致」ルール。'],
  ['百物語の夜、出目1〜6の飛び先を読んで上り（#12）へ', '怪異マスに止まると四隅の青行灯が消える。四灯すべて消えると「百鬼夜行（飛距離2倍）」発動！'],
  ['道中で討入備え（兜・太刀・陣太鼓）を三つ集めて御前（#13）へ', '三つの備えを揃えるまでゴールは開かない。同じマスに止まると一騎討ちで相手を1マス弾き返す！'],
  ['善玉と悪玉、分岐マスで偶数なら善道・奇数なら悪道へ', '偶数の目は金色の善道（近道ジャンプ）、奇数の目は紫の悪道（足止め）へ進む王朝双六。'],
];

const KANJI_NUMS = ['', '壱', '弐', '参', '肆', '伍', '陸'];

let last = 0;
let audioUnlocked = false;
let tabletop = null;
let galleryRendered = false;

function unlockAudioOnce() {
  if (!audioUnlocked) {
    audioUnlocked = true;
    audio.unlock();
  }
}

function setStatus(text, sub) {
  G.statusText = text;
  if (sub) G.statusSub = sub;
  syncHudDOM();
}

function statusForTurn() {
  const human = G.match?.humanSide ?? 0;
  if (!G.match || G.match.winner >= 0) return;
  if (G.match.turn === human) {
    setStatus(
      'あなたの番です ─ 下の「🎲 賽を振る (Space)」または3D賽碗をクリックして骨骰を投げてください',
      `盤上の ①〜⑥ マーカーは出目1〜6の着地予測です · ${BOARD_STATUS[G.boardIdx][1]}`,
    );
  } else {
    setStatus(
      '同行者（相手）の手番 ─ 相手が骨骰を振っています…',
      BOARD_STATUS[G.boardIdx][1],
    );
  }
}

function renderDieFaceDOM(value) {
  const el = document.getElementById('die-face-preview');
  const numText = document.getElementById('dice-number-text');
  if (!el || !numText) return;
  const v = Math.max(1, Math.min(6, Number(value) || 1));
  el.dataset.value = String(v);
  numText.textContent = `${KANJI_NUMS[v]} (${v}点)`;

  const pipMap = {
    1: ['center red'],
    2: ['tl', 'br'],
    3: ['tl', 'center', 'br'],
    4: ['tl', 'tr', 'bl', 'br'],
    5: ['tl', 'tr', 'center', 'bl', 'br'],
    6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
  };
  el.innerHTML = (pipMap[v] || pipMap[1])
    .map(cls => `<span class="pip ${cls}"></span>`)
    .join('');
}

function describeNodeRule(board, node) {
  if (!node) return '';
  if (node.kind === 'start') {
    return `【振出・起点】${board.title}の出発点です。ここから賽を振って上り（#${board.goal}）を目指します。`;
  }
  if (node.kind === 'goal') {
    if (board.id === 'kesshu') {
      return `【大上り・終着】道中で「兜・太刀・陣太鼓」の三つの討入備えを集めて到達すると勝利です！`;
    }
    return `【大上り・終着】ここに到達すれば勝利です！（東海道・源氏巻はぴったり止まる点点一致ルール）`;
  }
  if (board.id === 'yokai' && node.jumpTable) {
    const jumps = node.jumpTable.map((d, idx) => `${idx + 1}点→${d >= 0 ? '+' + d : d}格`).join(' / ');
    return `【飛び双六マス】${node.rule || ''} （出目ごとの移動: ${jumps}）`;
  }
  if (node.kind === 'jump') {
    const d = node.jumpTable ? node.jumpTable[0] : 2;
    return `【名物跳びマス】止まると名物の力でさらに ${d >= 0 ? '+' + d : d} 格ジャンプします！（${node.rule || ''}）`;
  }
  if (node.kind === 'stay') {
    return `【宿場泊マス】止まると本来は1回休みですが、「宿場守り」護符があれば自動で休みを無効化します！`;
  }
  if (node.kind === 'branch') {
    return `【善悪分岐マス】次の出目が偶数（2・4・6）なら金色の善道、奇数（1・3・5）なら紫の悪道へ分岐します。`;
  }
  if (node.tokens) {
    return `【討入備えマス】止まると御前上りに必要な武具印「${node.rule || '備え'}」を獲得します！`;
  }
  return `【道中マス】${node.rule || '次の宿場へ着実に駒を進めます。'}`;
}

function syncHudDOM() {
  const board = currentBoard();
  if (!board) return;

  // Topbar active board tab
  document.querySelectorAll('.nav-link[data-board]').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.board) === G.boardIdx);
  });

  // Coach banner
  const badgeEl = document.getElementById('coach-badge');
  const mainEl = document.getElementById('coach-main');
  const subEl = document.getElementById('coach-sub');
  if (badgeEl && mainEl && subEl) {
    const isHumanTurn = G.match && G.match.turn === G.match.humanSide;
    if (G.phase === 'ANIM') {
      badgeEl.textContent = '🎲 投骰中';
      badgeEl.style.background = '#c4922f';
    } else if (G.phase === 'MOVE') {
      badgeEl.textContent = '🏃 駒移動中';
      badgeEl.style.background = '#2b6e52';
    } else if (isHumanTurn) {
      badgeEl.textContent = 'あなたの手番';
      badgeEl.style.background = '#bf3426';
    } else {
      badgeEl.textContent = '相手の手番';
      badgeEl.style.background = '#1d5478';
    }
    mainEl.textContent = G.statusText || BOARD_STATUS[G.boardIdx][0];
    subEl.textContent = G.statusSub || BOARD_STATUS[G.boardIdx][1];
  }

  // Bottom dock players & volume status
  const volTitle = document.getElementById('dock-volume-title');
  const ruleTag = document.getElementById('dock-rule-tag');
  if (volTitle) volTitle.textContent = `${board.volume}・${board.title}`;
  if (ruleTag) ruleTag.textContent = board.ruleBrief || board.ruleSummary;

  if (G.match) {
    const human = G.match.humanSide;
    const ai = 1 - human;
    const hNode = board.nodes[G.match.pos[human]] || board.nodes[0];
    const aNode = board.nodes[G.match.pos[ai]] || board.nodes[0];

    const row0 = document.getElementById('player-row-0');
    const row1 = document.getElementById('player-row-1');
    const tag0 = document.getElementById('turn-tag-0');
    const tag1 = document.getElementById('turn-tag-1');
    const pos0 = document.getElementById('player-pos-0');
    const pos1 = document.getElementById('player-pos-1');

    const humanTurn = G.match.turn === human;
    if (row0) row0.classList.toggle('active', humanTurn);
    if (row1) row1.classList.toggle('active', !humanTurn);
    if (tag0) tag0.classList.toggle('hidden', !humanTurn);
    if (tag1) tag1.classList.toggle('hidden', humanTurn);
    if (pos0) {
      const skipTxt = G.match.skip[human] > 0 ? ` (休み${G.match.skip[human]})` : '';
      pos0.textContent = `現在地: #${hNode.id} ${hNode.title}${skipTxt}`;
    }
    if (pos1) {
      const skipTxt = G.match.skip[ai] > 0 ? ` (休み${G.match.skip[ai]})` : '';
      pos1.textContent = `現在地: #${aNode.id} ${aNode.title}${skipTxt}`;
    }

    const meterEl = document.getElementById('board-special-meter');
    if (meterEl) {
      const remain = Math.max(0, board.goal - G.match.pos[human]);
      if (board.id === 'tokaido') {
        meterEl.textContent = `🍱 宿場名物: ${G.tokaidoGourmet.length} / 3 獲得 · 上りまで残り ${remain} 格`;
      } else if (board.id === 'yokai') {
        meterEl.textContent = `🏮 青行灯: 残り ${G.yokaiLanterns} / 4 灯 ${G.yokaiFrenzy ? '【百鬼夜行・飛距離2倍！】' : ''}`;
      } else if (board.id === 'kesshu') {
        meterEl.textContent = `⚔️ 討入備え: ${G.kesshuPieces} / 3 獲得（3つ揃うと御前開門）`;
      } else {
        const mood = G.genjiBalance >= 0 ? '善道寄り（金色）' : '悪道寄り（紫色）';
        meterEl.textContent = `☯️ 心の天平: ${mood} · 上りまで残り ${remain} 格`;
      }
    }

    // Inspector card: show hovered node or current human node
    const inspectIdx = G.hoverNode >= 0 && board.nodes[G.hoverNode]
      ? G.hoverNode
      : G.match.pos[human];
    const inspNode = board.nodes[inspectIdx] || board.nodes[0];
    const inspId = document.getElementById('insp-id');
    const inspTitle = document.getElementById('insp-title');
    const inspKind = document.getElementById('insp-kind');
    const inspDesc = document.getElementById('insp-desc');

    if (inspId) inspId.textContent = `#${inspNode.id}`;
    if (inspTitle) inspTitle.textContent = inspNode.title;
    if (inspKind) {
      const kindNames = {
        start: '振出・起点',
        goal: '大上り・終着',
        jump: '名物跳び',
        stay: '宿場泊',
        branch: '善悪分岐',
        good: '善玉雅道',
        evil: '悪玉修羅道',
        normal: inspNode.tokens ? '討入備え' : '道中宿場',
      };
      inspKind.textContent = kindNames[inspNode.kind] || '道中';
    }
    if (inspDesc) inspDesc.textContent = describeNodeRule(board, inspNode);

    // Pocket talisman active state
    const usedMask = G.match.charmsUsed?.[human] || 0;
    const charmBits = { stay: 1, guard: 2, dash: 4 };
    document.querySelectorAll('.charm-item').forEach(el => {
      const cid = el.dataset.charm;
      const equipped = G.charms.includes(cid);
      const used = (usedMask & (charmBits[cid] || 0)) !== 0;
      el.classList.toggle('active', equipped && !used);
    });

    // Roll button state
    const rollBtn = document.getElementById('btn-roll');
    if (rollBtn) {
      const canRoll = G.screen === 'PLAYING' && G.phase === 'ROLL' && G.match.turn === human && G.match.winner < 0;
      rollBtn.disabled = !canRoll;
      const mainSpan = rollBtn.querySelector('.roll-cta-main');
      const subSpan = rollBtn.querySelector('.roll-cta-sub');
      if (mainSpan && subSpan) {
        if (G.phase === 'ANIM') {
          mainSpan.textContent = '🎲 骨骰が回転中…';
          subSpan.textContent = '賽碗の出目を見極めています';
        } else if (G.phase === 'MOVE') {
          mainSpan.textContent = '🏃 駒が進んでいます…';
          subSpan.textContent = '一歩ずつ宿場を跳び進みます';
        } else if (!humanTurn) {
          mainSpan.textContent = '⏳ 相手の手番中';
          subSpan.textContent = '同行者が賽を振っています';
        } else {
          mainSpan.textContent = '🎲 賽を振る (Space)';
          subSpan.textContent = '碗に骨骰を投げて進む';
        }
      }
    }
  }

  renderDieFaceDOM(G.diceValue || 1);

  // Event toast banner
  const toastEl = document.getElementById('event-toast');
  const toastTitle = document.getElementById('event-toast-title');
  const toastSub = document.getElementById('event-toast-sub');
  if (toastEl && toastTitle && toastSub) {
    if (G.toast && G.toast.life > 0) {
      toastTitle.textContent = G.toast.text;
      toastSub.textContent = G.toast.sub || '';
      toastEl.classList.remove('hidden');
    } else {
      toastEl.classList.add('hidden');
    }
  }

  // Settlement modal
  const settleModal = document.getElementById('settlement-modal');
  if (settleModal) {
    const wonState = G.screen === 'PLAYING' && G.match && (G.match.winner >= 0 || G.phase === 'SETTLEMENT');
    settleModal.classList.toggle('hidden', !wonState);
    if (wonState) {
      const humanWon = G.match.winner === G.match.humanSide;
      const seal = document.getElementById('settlement-seal');
      const title = document.getElementById('settlement-title');
      const sub = document.getElementById('settlement-sub');
      if (seal) {
        seal.textContent = humanWon ? '祝' : '終';
        seal.style.background = humanWon ? '#bf3426' : '#2a3b4c';
      }
      if (title) title.textContent = humanWon ? '見事、大上り達成！' : '惜敗 ─ 同行者が先に上りました';
      if (sub) {
        sub.textContent = humanWon
          ? `「${board.title}」を踏破し、見事に一番乗りを果たしました！`
          : `次は懐中護符と飛びマスを活かして雪辱を果たしましょう。`;
      }
    }
  }

  // Lobby modal sync with G.screen
  const lobbyModal = document.getElementById('lobby-modal');
  if (lobbyModal) {
    lobbyModal.classList.toggle('hidden', G.screen !== 'SELECT_BOARD' && G.screen !== 'SELECT_SIDE');
  }

  // Gallery modal sync with G.showGallery
  const galleryModal = document.getElementById('gallery-modal');
  if (galleryModal) {
    galleryModal.classList.toggle('hidden', !G.showGallery);
    if (G.showGallery) renderGalleryDOM();
  }
}

function renderGalleryDOM() {
  const countLabel = document.getElementById('gallery-count-label');
  if (countLabel) {
    countLabel.textContent = `蒐集状況: ${G.collection.size} / ${UKIYOE_CARDS.length} 枚 開帳済み`;
  }
  if (galleryRendered) return;
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  galleryRendered = true;
  grid.innerHTML = '';

  UKIYOE_CARDS.forEach(card => {
    const item = document.createElement('div');
    item.className = 'gallery-card-item';
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 220;
    const g = c.getContext('2d');
    const boardId = BOARDS[card.board]?.id || 'tokaido';
    renderNishikieScene(g, boardId, { art: card.art, id: card.number, kind: card.rarity === '特大判' ? 'goal' : 'normal' }, 320, 220);

    const meta = document.createElement('div');
    meta.className = 'gallery-card-meta';
    meta.innerHTML = `<strong>#${String(card.number).padStart(2, '0')} ${card.title}</strong><span>${card.artist}</span>`;
    item.appendChild(c);
    item.appendChild(meta);
    grid.appendChild(item);
  });
}

function openSide(index) {
  G.boardIdx = Math.max(0, Math.min(3, Number(index) | 0));
  G.hoverBoard = -1;
  G.screen = 'SELECT_SIDE';
  G.hoverSide = -1;
  G.hoverCharm = -1;
  audio.paper();
  syncHudDOM();
}

function beginMatch() {
  G.screen = 'PLAYING';
  G.showGallery = false;
  resetMatchState();
  const board = currentBoard();
  unlockBoardCards(G.boardIdx);
  invalidateScene();
  audio.paper();
  G.aiTimer = G.match.turn === G.humanSide ? 0 : 1.0;
  G.phase = 'ROLL';
  G.match.winner = -1;
  statusForTurn();
  syncHudDOM();
}

function backToSelect() {
  G.screen = 'SELECT_BOARD';
  G.showGallery = false;
  G.hoverBoard = -1;
  G.phase = 'ROLL';
  audio.paper();
  syncHudDOM();
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
  const mover = result.events.find(e => e.player !== undefined)?.player ?? human;
  const finalPos = result.state.pos[mover];
  const node = board.nodes[finalPos];
  let usedJump = false;
  let usedBounce = false;

  for (const ev of result.events) {
    if (ev.type === 'jump') {
      usedJump = true;
      G.stats.jumps++;
      audio.jump();
      showToast(`⚡ 名物跳び！ ${board.nodes[ev.from]?.title || ''} → ${board.nodes[ev.to]?.title || ''}`, `出目 ${roll} の跳躍効果`);
    } else if (ev.type === 'bounce') {
      usedBounce = true;
      audio.bounce(1.2);
      showToast('↩️ 上りを超過 ─ 点点一致のため折り返し', 'ぴったり止まると大上り達成');
    } else if (ev.type === 'token') {
      audio.token();
      showStamp('討入備え', ev.label || '義士印');
      showToast(`⚔️ 討入備え「${ev.label || '印'}」を獲得！`, '三つ揃えば御前の上りが開門');
    } else if (ev.type === 'stay') {
      audio.stay();
      showToast(`🏮 宿場泊 ─ ${ev.turns} 手休み`, board.nodes[ev.to]?.title || '');
    } else if (ev.type === 'duel') {
      G.stats.duels++;
      audio.duel();
      showToast('⚔️ 同格の武者と一騎討ち！', '相手を一格後ろへ弾き返した');
    } else if (ev.type === 'charm') {
      audio.charm();
      showToast(
        ev.charm === 'stay'
          ? '🛡️ 懐中護符「宿場守り」が泊休みを無効化！'
          : ev.charm === 'guard'
            ? '🛡️ 懐中護符「妖怪封じ」が戻り跳びを封じた！'
            : '⚡ 懐中護符「早駕籠」が初手を＋1歩加速！',
        '懐中守り札が自動発動',
      );
    } else if (ev.type === 'goal_locked') {
      audio.stay();
      showStamp('御前返し', `備え ${ev.required} 枚が必要`);
      showToast('🔒 御前の上りはまだ開かない！', '先に兜・太刀・陣太鼓を三つ揃えよう');
    } else if (ev.type === 'branch_good') {
      showToast('✨ 偶数の目 ─ 金色の「善道」へ進む！', '近道ルートへ入りました');
    } else if (ev.type === 'branch_evil') {
      showToast('🌑 奇数の目 ─ 紫の「悪道」へ進む', '足止めルートへ入りました');
    } else if (ev.type === 'skip') {
      showToast('🏮 宿場泊のためこの手番は一休み', '次の手番から再開します');
    }
  }

  if (node) {
    const c = nodeCenter(node);
    spawnLandingEffect(c.x, c.y, board.id === 'genji' ? 'sakura' : 'gold', node.title);
    if (tabletop) tabletop.spawnTileRipple(finalPos, usedJump ? '#ff5945' : '#f5cb5c');
  }

  if (board.id === 'tokaido' && mover === human && node && node.kind === 'jump') {
    const foodIndex = [2, 7, 12].indexOf(node.id);
    if (foodIndex >= 0 && !G.tokaidoGourmet.includes(foodIndex)) {
      G.tokaidoGourmet.push(foodIndex);
      showToast(`🍱 宿場名物「${node.title}」を堪能！`, `名物蒐集 ${G.tokaidoGourmet.length} / 3`);
    }
  }

  if (board.id === 'yokai') {
    if (finalPos > 0 && finalPos < board.goal && G.yokaiLanterns > 0) {
      G.yokaiLanterns -= 1;
      audio.lantern();
      if (G.yokaiLanterns === 0) {
        G.yokaiFrenzy = true;
        showStamp('百鬼夜行', '怪異飛距離 二倍');
        showToast('🏮 四隅の青行灯がすべて消えた！', '百鬼夜行発動 ─ 次の跳び距離が2倍！');
      } else {
        showToast(`🏮 青行灯がひとつ消えた（残り ${G.yokaiLanterns} 灯）`, '四灯全滅で百鬼夜行が到来');
      }
    }
  }

  if (G.yokaiFrenzy && usedJump) {
    G.yokaiFrenzy = false;
    G.yokaiLanterns = 4;
    G.yokaiFrenzyUsed = true;
  }
  if (usedBounce) G.yokaiFrenzyUsed = true;

  syncBoardStats();
  if (result.won || result.state.winner >= 0) {
    G.phase = 'SETTLEMENT';
    if (result.state.winner === G.match.humanSide) audio.win();
    else audio.lose();
    unlockBoardCards(G.boardIdx);
    syncHudDOM();
    return;
  }
  statusForTurn();
  syncHudDOM();
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
  let indexes = board.style === 'tobi'
    ? [oldState.pos[mover], result.state.pos[mover]]
    : simulateWalk(board, oldState.pos[mover], steps, roll);

  const jump = result.events.find(e => e.type === 'jump');
  if (jump && indexes[indexes.length - 1] !== jump.to) indexes.push(jump.to);
  const final = result.state.pos[mover];
  if (indexes[indexes.length - 1] !== final) indexes.push(final);
  if (indexes.length < 2) indexes = [oldState.pos[mover], final];

  const path = pathToPoints(board, indexes, mover);
  // Crisp 240ms per step so each hop feels distinct and rhythmic
  const dur = Math.max(480, Math.min(2200, (indexes.length - 1) * 240 + (jump ? 320 : 0)));
  G.pieceAnim = { side: mover, path, indexes, t0: performance.now(), duration: dur, lastSeg: -1 };
  G.pendingResult = { result, roll };
  G.phase = 'MOVE';
  setStatus(
    `出目「${KANJI_NUMS[roll]} (${roll}点)」に従って駒が ${indexes.length - 1} 歩進みます`,
    `${board.nodes[oldState.pos[mover]]?.title || ''} → ${board.nodes[final]?.title || ''}`,
  );
}

function finishMove() {
  if (!G.pendingResult) return;
  const { result, roll } = G.pendingResult;
  G.pendingResult = null;
  G.pieceAnim = null;
  G.match = result.state;
  G.phase = result.won || result.state.winner >= 0 ? 'SETTLEMENT' : 'ROLL';
  G.diceValue = roll;
  handleEvents(result, roll);
  if (G.phase !== 'SETTLEMENT') {
    G.aiTimer = G.match.turn === G.match.humanSide ? 0 : 0.85;
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
  unlockAudioOnce();
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
  setStatus('🎲 骨骰が賽碗の中で跳ねています…', '止まった上面の目が今回の歩数になります');

  die.settled = false;
  die.settling = false;
  die.spinTime = 0;
  die.x = TUBE_CENTER.x + 14;
  die.y = TUBE_CENTER.y - 10;
  die.z = 44 + Math.random() * 18;
  die.vx = 28 + Math.random() * 38;
  die.vy = -8 + Math.random() * 18;
  die.vz = 28 + Math.random() * 20;
  die.wx = 11 + Math.random() * 8;
  die.wy = 9 + Math.random() * 9;
  die.wz = 7 + Math.random() * 7;
  die.target = target;
  die.value = value;
  die.active = true;

  audio.shake();
  setTimeout(() => audio.throwDie(), 90);
  showStamp('投 骰', `${currentBoard().ui.diceDevice}より一擲`);
  syncHudDOM();
  return true;
}

function onActiveSettled(value) {
  G.diceValue = value;
  G.dice[0] = value;
  G.rollResolved = true;
  G.resolveTimer = 0.22;
  G.tube.shake = 0;
  G.tube.tipped = false;
  G.rollPending = false;
  setStatus(`🎲 出目は「${KANJI_NUMS[value]} (${value}点)」！`, '賽が静まり、木駒が一歩ずつ進み出します');
  audio.bounce(1.0);
  syncHudDOM();
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
  for (const die of G.physDice) {
    if (die.settled) continue;
    die.spinTime += dt;
    if (!die.settling) {
      die.x += die.vx * dt;
      die.y += die.vy * dt;
      die.z += die.vz * dt;
      die.vz -= 780 * dt;
      if (die.z < 0) {
        die.z = 0;
        if (Math.abs(die.vz) > 10) {
          die.vz = -die.vz * 0.50;
          audio.bounce(Math.min(1, Math.abs(die.vz) / 160));
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

      const left = 1050;
      const right = 1190;
      const top = 574;
      const bottom = 680;
      if (die.x < left) { die.x = left; die.vx = Math.abs(die.vx) * 0.7; }
      if (die.x > right) { die.x = right; die.vx = -Math.abs(die.vx) * 0.7; }
      if (die.y < top) { die.y = top; die.vy = Math.abs(die.vy) * 0.7; }
      if (die.y > bottom) { die.y = bottom; die.vy = -Math.abs(die.vy) * 0.7; }
      if ((die.spinTime > 0.75 && die.z <= 0.1 && Math.abs(die.vx) + Math.abs(die.vy) < 34) || die.spinTime > 1.45) {
        die.settling = true;
      }
    } else {
      const nearest = (cur, target) => target + Math.round((cur - target) / (Math.PI * 2)) * Math.PI * 2;
      const tx = nearest(die.rx, die.target.rx);
      const ty = nearest(die.ry, die.target.ry);
      const tz = nearest(die.rz, die.target.rz);
      const k = Math.min(1, dt * 12);
      die.rx += (tx - die.rx) * k;
      die.ry += (ty - die.ry) * k;
      die.rz += (tz - die.rz) * k;
      die.x += (1110 - die.x) * k;
      die.y += (620 - die.y) * k;
      if (Math.abs(tx - die.rx) < 0.02 && Math.abs(ty - die.ry) < 0.02 && Math.abs(tz - die.rz) < 0.02) {
        die.rx = tx; die.ry = ty; die.rz = tz;
        die.settled = true;
        die.settling = false;
        if (die.active) onActiveSettled(die.value);
      }
    }
  }
  if (G.tube.shake > 0) G.tube.shake = Math.max(0, G.tube.shake - dt * 1.6);
  if (G.rollResolved && G.resolveTimer > 0) {
    G.resolveTimer -= dt;
    if (G.resolveTimer <= 0) resolvePendingRoll();
  }
}

function update(dt) {
  G.pulseTick += dt;
  if (G.toast) {
    G.toast.life -= dt;
    if (G.toast.life <= 0) {
      G.toast = null;
      syncHudDOM();
    }
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
    const numSteps = Math.max(1, (anim.indexes?.length || anim.path.length) - 1);
    const seg = Math.min(numSteps - 1, Math.floor(p * numSteps));
    if (seg !== anim.lastSeg) {
      anim.lastSeg = seg;
      audio.step(seg);
      const steppedNodeId = anim.indexes?.[seg + 1];
      if (steppedNodeId !== undefined && tabletop) {
        tabletop.spawnTileRipple(steppedNodeId, '#f5cb5c');
      }
    }
    if (p >= 1) finishMove();
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

function setupDOMControls() {
  // Volume switch buttons in Top Bar
  document.querySelectorAll('.nav-link[data-board]').forEach(btn => {
    btn.addEventListener('click', () => {
      unlockAudioOnce();
      const idx = Number(btn.dataset.board) | 0;
      window.__ESR__.switchToBoard(idx);
      audio.select();
    });
  });

  // Camera preset buttons in Top Bar
  document.querySelectorAll('.cam-btn[data-cam]').forEach(btn => {
    btn.addEventListener('click', () => {
      unlockAudioOnce();
      const preset = btn.dataset.cam;
      document.querySelectorAll('.cam-btn').forEach(b => b.classList.toggle('active', b === btn));
      if (tabletop) tabletop.setCameraPreset(preset);
      audio.select();
    });
  });

  // Beginner Guide Modal
  const tutorialModal = document.getElementById('tutorial-modal');
  const openTutorial = () => {
    unlockAudioOnce();
    if (tutorialModal) tutorialModal.classList.remove('hidden');
    audio.paper();
  };
  const closeTutorial = () => {
    unlockAudioOnce();
    if (tutorialModal) tutorialModal.classList.add('hidden');
    audio.select();
  };
  document.getElementById('btn-tutorial')?.addEventListener('click', openTutorial);
  document.getElementById('btn-coach-help')?.addEventListener('click', openTutorial);
  document.getElementById('btn-tutorial-close')?.addEventListener('click', closeTutorial);
  document.getElementById('btn-tutorial-start')?.addEventListener('click', closeTutorial);
  document.getElementById('btn-tutorial-sound')?.addEventListener('click', () => {
    unlockAudioOnce();
    audio.setEnabled(true);
    audio.win();
    showToast('🔊 江戸和楽器と檜木駒の音響を再生中', '賽の投擲・木駒の歩進・三味線の跳躍音');
    syncHudDOM();
  });

  // Gallery Modal
  document.getElementById('btn-gallery')?.addEventListener('click', () => {
    unlockAudioOnce();
    G.showGallery = true;
    audio.paper();
    syncHudDOM();
  });
  document.getElementById('btn-gallery-close')?.addEventListener('click', () => {
    G.showGallery = false;
    audio.paper();
    syncHudDOM();
  });

  // Audio Toggle
  const audioBtn = document.getElementById('btn-audio');
  audioBtn?.addEventListener('click', () => {
    unlockAudioOnce();
    const next = !audio.isEnabled();
    audio.setEnabled(next);
    audioBtn.textContent = next ? '🔊 効果音: 開' : '🔇 効果音: 閉';
    if (next) audio.toggle();
  });

  // Lobby Modal
  document.getElementById('btn-lobby')?.addEventListener('click', () => {
    unlockAudioOnce();
    G.screen = 'SELECT_BOARD';
    audio.paper();
    syncHudDOM();
  });
  document.getElementById('btn-lobby-close')?.addEventListener('click', () => {
    G.screen = 'PLAYING';
    audio.select();
    syncHudDOM();
  });
  document.querySelectorAll('[data-play-board], [data-select-board]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      unlockAudioOnce();
      const idx = Number(el.dataset.playBoard ?? el.dataset.selectBoard) | 0;
      window.__ESR__.switchToBoard(idx);
      audio.select();
    });
  });

  // Bottom Dock Collapse / Expand (Zen Mode)
  const dockWrap = document.getElementById('bottom-dock-wrap');
  const dockToggle = document.getElementById('btn-dock-toggle');
  const toggleDock = () => {
    if (!dockWrap || !dockToggle) return;
    const collapsed = dockWrap.classList.toggle('collapsed');
    dockToggle.textContent = collapsed ? '▴ 操作パネルを展開する' : '▾ 操作パネルを隠す (Zen Mode)';
    audio.select();
  };
  dockToggle?.addEventListener('click', toggleDock);

  // Roll CTA Button
  document.getElementById('btn-roll')?.addEventListener('click', () => {
    unlockAudioOnce();
    startRoll();
  });

  // Settlement Buttons
  document.getElementById('btn-play-again')?.addEventListener('click', () => {
    unlockAudioOnce();
    beginMatch();
  });
  document.getElementById('btn-settlement-lobby')?.addEventListener('click', () => {
    unlockAudioOnce();
    backToSelect();
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    unlockAudioOnce();
    if (e.code === 'Space') {
      e.preventDefault();
      if (G.screen === 'PLAYING' && G.phase === 'ROLL' && G.match?.turn === G.match?.humanSide) {
        startRoll();
      }
    } else if (e.code === 'KeyH') {
      toggleDock();
    } else if (e.code === 'Escape') {
      if (G.showGallery) {
        G.showGallery = false;
        syncHudDOM();
      } else if (tutorialModal && !tutorialModal.classList.contains('hidden')) {
        tutorialModal.classList.add('hidden');
      } else if (G.screen !== 'PLAYING') {
        G.screen = 'PLAYING';
        syncHudDOM();
      }
    }
  });
}

// Software-WebGL safe frame scheduler (per Three.js skill directive)
let frameId = 0;
function afterDraw(cb) {
  if (!tabletop || !tabletop.renderer) {
    frameId = window.setTimeout(cb, 80);
    return;
  }
  const gl = tabletop.renderer.getContext();
  if (!gl || typeof gl.fenceSync !== 'function') {
    frameId = window.setTimeout(cb, 80);
    return;
  }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (state === gl.UNSIGNALED) {
      frameId = window.setTimeout(poll, 5);
    } else {
      if (sync) gl.deleteSync(sync);
      frameId = window.setTimeout(cb, 80);
    }
  };
  frameId = window.setTimeout(poll, 5);
}

function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  update(dt);
  if (tabletop) {
    tabletop.update(dt, now / 1000);
  }
  if (tabletop && tabletop.isSoftwareGl) {
    afterDraw(tick);
  } else {
    frameId = requestAnimationFrame(tick);
  }
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
    dice: [G.physDice[0]].map(d => ({
      x: d.x, y: d.y, z: d.z, vx: d.vx, vy: d.vy, settled: d.settled, active: d.active, value: d.value,
    })),
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
    if (tabletop) tabletop.buildBoard(i);
    statusForTurn();
    syncHudDOM();
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
    if (G.physDice[0]) G.physDice[0].value = Number(value);
    handleEvents(result, Number(value));
    if (G.phase !== 'SETTLEMENT') G.aiTimer = 0;
    syncHudDOM();
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
    syncHudDOM();
    return snapshot();
  },
  selectRect(index) {
    const r = getSelectBoardRect(index);
    return { ...r };
  },
  galleryCloseRect() { return { ...GALLERY_CLOSE }; },
  showGallery(on, tab = 'cards') {
    G.showGallery = !!on;
    G.galleryTab = tab;
    syncHudDOM();
  },
  invalidation() { invalidateScene(); },
  printsLoaded(boardId, art) { return isPrintLoaded(boardId, art); },
};

// Initialize 3D Tabletop & Start Immediately in Active Play Mode on Volume 1 (Tokaido)
const mountEl = document.getElementById('webgl-mount');
if (mountEl) {
  tabletop = new Tabletop3D(
    mountEl,
    nodeId => {
      if (G.hoverNode !== nodeId) {
        G.hoverNode = nodeId;
        syncHudDOM();
      }
    },
    nodeId => {
      unlockAudioOnce();
      G.hoverNode = nodeId;
      audio.select();
      syncHudDOM();
    },
    () => {
      unlockAudioOnce();
      startRoll();
    },
  );
}

setupDOMControls();
loadAllPrints();
window.__ESR__.switchToBoard(0);
document.body.classList.add('ready');
tick();
