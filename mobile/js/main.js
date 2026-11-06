// Main 3D Tabletop Game Controller, Step-by-Step Kinematics, DOM HUD, and E2E Surface (V1.1–V1.3)
import {
  canvas, ctx, W, H, G, PLAY_BUTTONS, DICE_TRAY, TUBE_RECT, TUBE_CENTER,
  SETTLEMENT_BTNS, GALLERY_CLOSE, SIDE_CARDS, CHARM_SLOTS, START_BTN,
  SIDE_GALLERY_BTN, SIDE_BACK_BTN, currentBoard, currentHandCard,
  isPreGameMatch, setCustomHandCard, resetMatchState, syncDerivedHudFromMatch,
  evaluateMatchProgression, toggleCharm,
  toStageXY, isInside, nodeCenter, showToast, showStamp, spawnLandingEffect,
  unlockBoardCards, equipAllCharms, getSelectBoardRect, getGalleryCardRect,
  BOARD_RECT, saveProfile,
} from './state.js';
import {
  BOARDS, UKIYOE_CARDS, CHARMS, CHARM_BY_ID, ACHIEVEMENTS, getCardById, sanitizeCharmLoadout,
} from './boards.js';
import { EsugorokuCore, computeDieTargetEulerYXZ, evaluateDieTopFaceYXZ } from './core.js';
import { invalidateScene } from './board_renderer.js';
import { audio } from './audio.js';
import { loadAllPrints, isPrintLoaded } from './prints.js';
import { Tabletop3D } from './tabletop_3d.js';
import { renderNishikieScene, create3DTileCanvas, preloadUkiyoeSheets } from './nishikie_woodblock.js';

const BOARD_STATUS = [
  ['外周16宿＋内周8宿を進み、京・八百善の上り（#24）を目指す', '名物三宿で旅銭を獲得し、泊や関所を旅銭・通行手形で突破。同じマスで追突合戦！'],
  ['全25格の百物語大迷宮、出目1〜6の飛び先を読んで上り（#24）へ', '四箇所の青行灯（#4・#10・#16・#22）を全て灯すと次回の前進跳びが「百鬼夜行（2倍/3倍）」に！'],
  ['三備え（兜・太刀・陣太鼓）を集めて御前大上り（#23）へ', '同格合戦では「猛攻・牽制・固守」の三構えを選択！三備えを揃えて御前を開門せよ！'],
  ['外周16帖から善悪五帖ずつへ分岐し、源氏絵合の上り（#26）へ', '分岐マス（#15）で金色の雅道か紫の修羅道を主体的に選択！和歌懐紙や運命符で道中を制せよ！'],
];

const KANJI_NUMS = ['', '壱', '弐', '参', '肆', '伍', '陸'];
const DIFFICULTY_LABELS = {
  easy: '初伝',
  normal: '中伝',
  hard: '奥伝',
  master: '皆伝',
};

let last = 0;
let audioUnlocked = false;
let tabletop = null;
let galleryRendered = false;
let lastInspectedKey = '';
let lastHandThumbKey = '';
let lastSettlementUnlocks = null;

function unlockAudioOnce() {
  if (!audioUnlocked) {
    audioUnlocked = true;
    audio.unlock();
  }
}

function isSideControlledByHuman(side) {
  if (!G.match) return side === 0;
  if (G.mode === 'local2p' || G.match.mode === 'local2p') return true;
  return side === G.match.humanSide;
}

function setStatus(text, sub) {
  G.statusText = text;
  if (sub) G.statusSub = sub;
  syncHudDOM();
}

function statusForTurn() {
  if (!G.match || G.match.winner >= 0) return;
  if (G.match.pendingChoice) {
    const pc = G.match.pendingChoice;
    if (isSideControlledByHuman(pc.player)) {
      setStatus(
        '⚡ 戦術決断 ─ 画面中央の巻物から行動を選択してください',
        BOARD_STATUS[G.boardIdx][1],
      );
    } else {
      setStatus(
        '同行者が戦術を選択しています…',
        BOARD_STATUS[G.boardIdx][1],
      );
    }
    return;
  }
  const turnSide = G.match.turn;
  if (isSideControlledByHuman(turnSide)) {
    const who = (G.mode === 'local2p' || G.match.mode === 'local2p')
      ? (turnSide === 0 ? '先手（あなた）の番です' : '後手（二人目）の番です')
      : 'あなたの番です';
    setStatus(
      `${who} ─ 下の「🎲 賽を振る (Space)」または3D賽碗をクリックして骨骰を投げてください`,
      `盤上の ①〜⑥ マーカーは出目1〜6の着地予測です · ${BOARD_STATUS[G.boardIdx][1]}`,
    );
  } else {
    const diffLabel = DIFFICULTY_LABELS[G.aiDifficulty] || '中伝';
    setStatus(
      `同行者（AI・${diffLabel}）の手番 ─ 相手が戦術を練り、公平な骨骰を振っています…`,
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
    const lanternTag = node.lanternBit ? '🏮【青行灯マス】止まると自分の青行灯が1灯点ります！ ' : '';
    return `${lanternTag}【飛び双六マス】${node.rule || ''} （出目ごとの移動: ${jumps}）`;
  }
  if (node.kind === 'jump') {
    const d = node.jumpTable ? node.jumpTable[0] : 2;
    const gourmetTag = node.gourmetBit ? '🍱【名物宿】初回到達で名物印＋旅銭1枚獲得！ ' : '';
    return `${gourmetTag}【名物跳びマス】止まると名物の力でさらに ${d >= 0 ? '+' + d : d} 格ジャンプします！（${node.rule || ''}）`;
  }
  if (node.kind === 'stay') {
    return `【宿場泊マス】止まると本来は1回休みですが、「宿場守り」護符または東海道の「旅銭」で休みを無効化できます！`;
  }
  if (node.kind === 'branch') {
    return `【善悪分岐マス】到達または通過時に金色の「雅道（善）」か紫の「修羅道（悪）」を主体的に選択できます！`;
  }
  if (node.tokens) {
    return `【討入備えマス】止まると御前上りに必要な武具印「${node.rule || '備え'}」を獲得します！`;
  }
  return `【道中マス】${node.rule || '次の宿場へ着実に駒を進めます。'}`;
}

function renderCharmStripSlots(board, human) {
  const loadout = G.match?.charmLoadout?.[human] || sanitizeCharmLoadout(G.charms);
  const usedMask = G.match?.charmUsed?.[human] ?? G.match?.charmsUsed?.[human] ?? 0;
  const cdMap = G.match?.charmCooldown?.[human] || {};

  for (let i = 0; i < 3; i++) {
    const slotEl = document.getElementById(`charm-slot-${i}`);
    if (!slotEl) continue;
    const cid = loadout[i] || CHARMS[i].id;
    const def = CHARM_BY_ID[cid] || CHARMS[i];
    const used = (usedMask & def.bit) !== 0;
    const cd = cdMap[cid] || 0;
    const canActivelyUse = G.screen === 'PLAYING'
      && G.phase === 'ROLL'
      && isSideControlledByHuman(G.match?.turn ?? 0)
      && G.match?.turn === human
      && !used
      && (
        (cid === 'wind' && !G.match?.windActive?.[human])
        || (cid === 'purify' && ((G.match?.skip?.[human] || 0) > 0 || (G.match?.boardState?.genji?.grudgeMarks?.[human] || 0) > 0))
        || (cid === 'waka_slip' && board.id === 'genji')
      );

    slotEl.dataset.charm = cid;
    slotEl.dataset.slotIndex = String(i);
    slotEl.classList.toggle('active', !used);
    slotEl.classList.toggle('activatable', Boolean(canActivelyUse));

    const sealEl = slotEl.querySelector('.charm-seal');
    const copyEl = slotEl.querySelector('.charm-copy');
    if (sealEl) sealEl.textContent = def.icon || def.name.slice(0, 1);
    if (copyEl) {
      let stateTag = '';
      if (used) {
        stateTag = def.oncePerMatch ? '（使用済）' : `（充填あと${cd}手）`;
      } else if (canActivelyUse) {
        stateTag = '（クリックで発動）';
      }
      copyEl.innerHTML = `<strong>${def.name}${stateTag}</strong><small>${def.effect}</small>`;
    }
  }
}

function renderTacticalChoiceModal() {
  const modal = document.getElementById('tactical-choice-modal');
  if (!modal) return;
  const pc = G.match?.pendingChoice;
  const showForHuman = G.screen === 'PLAYING'
    && pc
    && isSideControlledByHuman(pc.player)
    && G.match?.winner < 0;

  modal.classList.toggle('hidden', !showForHuman);
  if (!showForHuman) return;

  const board = currentBoard();
  const sealEl = document.getElementById('choice-modal-seal');
  const titleEl = document.getElementById('choice-modal-title');
  const subEl = document.getElementById('choice-modal-sub');
  const bodyEl = document.getElementById('choice-modal-options');
  if (!bodyEl) return;
  bodyEl.innerHTML = '';

  const usedMask = G.match?.charmUsed?.[pc.player] ?? 0;
  const loadout = G.match?.charmLoadout?.[pc.player] || [];
  const canReroll = loadout.includes('reroll')
    && (usedMask & (CHARM_BY_ID.reroll?.bit || 0)) === 0
    && (G.match?.rerollsUsedThisTurn || 0) < 1;

  if (pc.type === 'kesshu_stance') {
    if (sealEl) sealEl.textContent = '戦';
    if (titleEl) titleEl.textContent = `一騎討ち戦術選択（#${pc.square} ${board.nodes[pc.square]?.title || ''}）`;
    if (subEl) subEl.textContent = '相手と同じマスに踏み込みました！合戦の構えを選んでください。';

    const stances = [
      {
        stance: 'assault',
        badge: '猛 攻',
        title: '⚔️ 猛攻の構え（突撃）',
        desc: '相手を3格（荒武者Buff・太刀所持でさらに強化）弾き飛ばし、自分が未所持の武具印を1つ奪取します！',
      },
      {
        stance: 'feint',
        badge: '牽 制',
        title: '🛡️ 牽制の構え（奇襲＆護り）',
        desc: '相手を1格押し戻しつつ、自身に「一時鉄壁（次の被追突・奇襲を軽減）」を付与します。',
      },
      {
        stance: 'defend',
        badge: '固 守',
        title: '🏯 固守の構え（武具死守）',
        desc: '相手を押し戻さない代わりに、自身に「一時鉄壁」を張り、所持している三備えを確実に守ります。',
      },
    ];

    stances.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tactical-choice-btn';
      btn.dataset.choiceType = 'kesshu_stance';
      btn.dataset.stance = item.stance;
      btn.innerHTML = `<span class="choice-badge">${item.badge}</span><div class="choice-copy"><strong>${item.title}</strong><span>${item.desc}</span></div>`;
      btn.addEventListener('click', () => {
        unlockAudioOnce();
        audio.select();
        submitTacticalChoice({ type: 'kesshu_stance', stance: item.stance });
      });
      bodyEl.appendChild(btn);
    });
  } else if (pc.type === 'tokaido_coin') {
    const coins = G.match?.boardState?.tokaido?.coins?.[pc.player] || 0;
    const isStay = pc.reason === 'stay';
    if (sealEl) sealEl.textContent = '銭';
    if (titleEl) {
      titleEl.textContent = isStay
        ? `宿場泊の賄い選択（所持旅銭: ${coins}枚）`
        : `関所手形の通行選択（所持旅銭: ${coins}枚）`;
    }
    if (subEl) {
      subEl.textContent = isStay
        ? '名物宿で得た「旅銭」を1枚支払うと、今回の宿場泊（休み）を即座に免除できます。'
        : `「旅銭」を1枚支払うと、関所の押し戻し（${pc.delta}格）を無効化してそのまま留まれます。`;
    }

    const opts = [
      {
        spendCoin: true,
        badge: '旅銭消費',
        title: '🪙 旅銭を1枚支払って突破する',
        desc: isStay ? '旅銭を1枚使い、宿場泊の1回休みを無効化します。' : '旅銭を1枚使い、関所の押し戻しを無効化します。',
      },
      {
        spendCoin: false,
        badge: '温 存',
        title: '🏮 旅銭を温存して通常の効果を受ける',
        desc: isStay ? '旅銭を残し、この宿場で一休みします。' : `旅銭を残し、#${pc.RetreatTo} へ引き返します。`,
      },
    ];

    opts.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tactical-choice-btn';
      btn.dataset.choiceType = 'tokaido_coin';
      btn.dataset.spendCoin = String(item.spendCoin);
      btn.innerHTML = `<span class="choice-badge">${item.badge}</span><div class="choice-copy"><strong>${item.title}</strong><span>${item.desc}</span></div>`;
      btn.addEventListener('click', () => {
        unlockAudioOnce();
        audio.select();
        submitTacticalChoice({ type: 'tokaido_coin', spendCoin: item.spendCoin });
      });
      bodyEl.appendChild(btn);
    });
  } else if (pc.type === 'genji_branch') {
    if (sealEl) sealEl.textContent = '岐';
    if (titleEl) titleEl.textContent = '源氏絵合・善悪二道の選択（#15 関屋）';
    if (subEl) subEl.textContent = '関屋の分岐点に到達しました。金色の「雅道（善）」か紫の「修羅道（悪）」を選んでください。';

    const routes = [
      {
        route: 'good',
        badge: '雅道（善）',
        title: '🌸 金色の「雅道（善道）」へ進む',
        desc: '胡蝶の舞など前進跳びが多く、穏やかに上り（#26）へ近づく王道ルートです（善悪天平＋）。',
      },
      {
        route: 'evil',
        badge: '修羅（悪）',
        title: '🌑 紫の「修羅道（悪道）」へ進む',
        desc: '物怪の試練や浮舟の急流跳び（+3格）が待ち受ける波乱の奇襲ルートです（善悪天平−）。',
      },
    ];

    routes.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tactical-choice-btn';
      btn.dataset.choiceType = 'genji_branch';
      btn.dataset.route = item.route;
      btn.innerHTML = `<span class="choice-badge">${item.badge}</span><div class="choice-copy"><strong>${item.title}</strong><span>${item.desc}</span></div>`;
      btn.addEventListener('click', () => {
        unlockAudioOnce();
        audio.select();
        submitTacticalChoice({ type: 'genji_branch', route: item.route });
      });
      bodyEl.appendChild(btn);
    });
  }

  if (canReroll) {
    const rerollBtn = document.createElement('button');
    rerollBtn.type = 'button';
    rerollBtn.className = 'tactical-choice-btn';
    rerollBtn.dataset.choiceType = 'charm_reroll';
    rerollBtn.innerHTML = `<span class="choice-badge">重抽符</span><div class="choice-copy"><strong>🎲 懐中護符「重抽符」で賽を振り直す（1局1回）</strong><span>現在の出目結果を破棄し、手番を巻き戻してもう一度賽を振ります。</span></div>`;
    rerollBtn.addEventListener('click', () => {
      unlockAudioOnce();
      audio.charm();
      triggerRerollCharm();
    });
    bodyEl.appendChild(rerollBtn);
  }
}

function renderCharmPickerDOM() {
  const modal = document.getElementById('charm-picker-modal');
  if (!modal) return;
  const subEl = document.getElementById('charm-modal-subtitle');
  const pillEl = document.getElementById('charm-phase-pill');
  const grid = document.getElementById('charm-picker-grid');
  if (!grid) return;

  const preGame = isPreGameMatch();
  const equipped = sanitizeCharmLoadout(G.charms);
  if (subEl) {
    subEl.textContent = `現在装備中: ${equipped.map(id => CHARM_BY_ID[id]?.name || id).join(' ・ ')} （${equipped.length} / 3 枚）`;
  }
  if (pillEl) {
    pillEl.textContent = preGame ? '✨ 開幕前・選択すると即時適用' : '⏳ 対局進行中・次局から適用';
  }

  grid.innerHTML = '';
  CHARMS.forEach(charm => {
    const isEq = equipped.includes(charm.id);
    const card = document.createElement('div');
    card.className = `charm-picker-card${isEq ? ' equipped' : ''}`;
    card.dataset.charmId = charm.id;
    card.innerHTML = `
      <div class="charm-picker-head">
        <span class="charm-seal">${charm.icon || charm.name.slice(0, 1)}</span>
        <div>
          <strong>${charm.name}</strong>
          <small>${charm.category === 'board' ? '巻専用護符' : charm.trigger === 'active' ? '主動発動' : '自動発動'} · 再充填${charm.oncePerMatch ? '不可(1局1回)' : charm.cooldown + '手'}</small>
        </div>
      </div>
      <p class="charm-picker-desc">${charm.effect}</p>
      <button type="button" class="card-equip-btn${isEq ? ' equipped' : ''}">
        ${isEq ? '✓ 装備中（クリックで他と入替）' : '🛡️ この護符を懐中に帯びる'}
      </button>
    `;
    card.addEventListener('click', () => {
      unlockAudioOnce();
      audio.select();
      toggleCharm(charm.id);
      if (isPreGameMatch()) {
        resetMatchState();
        invalidateScene();
      }
      syncHudDOM();
    });
    grid.appendChild(card);
  });
}

function syncHudDOM() {
  const board = currentBoard();
  if (!board) return;

  if (G.match) {
    syncDerivedHudFromMatch(G.match);
  }

  // Topbar active board tab & BGM theme sync
  document.querySelectorAll('.nav-link[data-board]').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.board) === G.boardIdx);
  });
  audio.setBgmBoard(board.id);

  // Sync AI difficulty select in topbar
  const diffSelect = document.getElementById('select-ai-difficulty');
  if (diffSelect) {
    const val = G.mode === 'local2p' ? 'local2p' : (G.aiDifficulty || 'normal');
    if (diffSelect.value !== val) diffSelect.value = val;
  }

  // Sync Topbar BGM & SFX buttons in .hud-top-stack independently
  const bgmBtn = document.getElementById('btn-bgm');
  if (bgmBtn) {
    const bgmOn = audio.isBgmEnabled();
    const bgmState = audio.getState();
    bgmBtn.textContent = bgmOn ? '🪕 絃楽: 開' : '🔇 絃楽: 閉';
    bgmBtn.dataset.bgm = bgmOn ? 'on' : 'off';
    bgmBtn.setAttribute('aria-pressed', String(bgmOn));
    bgmBtn.title = `三味線・箏BGM「${bgmState.bgmTitle}」(${bgmState.bgmScale}) を効果音と独立して開閉 (Mキー)`;
  }
  const sfxBtn = document.getElementById('btn-audio');
  if (sfxBtn) {
    const sfxOn = audio.isEnabled();
    sfxBtn.textContent = sfxOn ? '🔊 効果音: 開' : '🔇 効果音: 閉';
    sfxBtn.dataset.sfx = sfxOn ? 'on' : 'off';
    sfxBtn.setAttribute('aria-pressed', String(sfxOn));
  }

  // Coach banner
  const badgeEl = document.getElementById('coach-badge');
  const mainEl = document.getElementById('coach-main');
  const subEl = document.getElementById('coach-sub');
  if (badgeEl && mainEl && subEl) {
    const isHumanTurn = G.match && isSideControlledByHuman(G.match.turn);
    if (G.phase === 'ANIM') {
      badgeEl.textContent = '🎲 投骰中';
      badgeEl.style.background = '#c4922f';
    } else if (G.phase === 'MOVE') {
      badgeEl.textContent = '🏃 駒移動中';
      badgeEl.style.background = '#2b6e52';
    } else if (G.match?.pendingChoice) {
      badgeEl.textContent = '⚡ 戦術決断';
      badgeEl.style.background = '#8e2a59';
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
      const duels = G.match.duelCount || G.stats.duels || 0;
      const plyText = `手数 ${G.match.ply || 0}/${G.match.maxPly || 80}`;
      if (board.id === 'tokaido') {
        const coins = G.match.boardState?.tokaido?.coins?.[human] || 0;
        meterEl.textContent = `🍱 名物: ${G.tokaidoGourmet.length}/3 · 🪙 旅銭: ${coins}枚 · ⚔️ 追突: ${duels}回 · 残り${remain}格 (${plyText})`;
      } else if (board.id === 'yokai') {
        const lit = 4 - G.yokaiLanterns;
        meterEl.textContent = `🏮 青行灯: ${lit}/4灯点灯 ${G.yokaiFrenzy ? '【百鬼夜行待機！】' : ''} · ⚔️ 追突: ${duels}回 · 残り${remain}格 (${plyText})`;
      } else if (board.id === 'kesshu') {
        const shield = G.match.boardState?.kesshu?.tempShield?.[human] ? '🛡️鉄壁 ' : '';
        meterEl.textContent = `⚔️ 討入備え: ${G.kesshuPieces}/3 ${shield}· 一騎討ち: ${duels}回 · 残り${remain}格 (${plyText})`;
      } else {
        const mood = G.genjiBalance > 0 ? `雅道(+${G.genjiBalance})` : G.genjiBalance < 0 ? `修羅(${G.genjiBalance})` : '中庸(0)';
        meterEl.textContent = `☯️ 天平: ${mood} · ⚔️ 追突: ${duels}回 · 残り${remain}格 (${plyText})`;
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
        jump: (inspNode.jumpTable?.[0] || 0) < 0 ? '関所・奇襲' : (inspNode.gourmetBit ? '名物宿・跳び' : '名物跳び'),
        stay: '宿場泊',
        branch: '善悪分岐',
        good: '善玉雅道',
        evil: '悪玉修羅道',
        normal: inspNode.tokens ? '討入備え' : inspNode.lanternBit ? '青行灯マス' : '道中宿場',
      };
      inspKind.textContent = kindNames[inspNode.kind] || '道中';
    }
    if (inspDesc) inspDesc.textContent = describeNodeRule(board, inspNode);

    // Render crisp HD woodblock preview in the bottom dock
    const artCanvas = document.getElementById('inspector-art-canvas');
    const artKey = `${board.id}-${inspNode.id}-${G.printsReadyTick || 0}`;
    if (artCanvas && lastInspectedKey !== artKey) {
      lastInspectedKey = artKey;
      const g = artCanvas.getContext('2d');
      renderNishikieScene(g, board.id, inspNode, artCanvas.width, artCanvas.height);
    }

    // Render dynamic 3 equipped charms from the 12-charm pool
    renderCharmStripSlots(board, human);

    // 4th Slot: Custom Hand Card (自定义手札) in bottom .charm-strip
    const handCard = currentHandCard();
    const handSlotEl = document.getElementById('custom-hand-slot');
    const handSealEl = document.getElementById('custom-hand-seal');
    const handTitleEl = document.getElementById('custom-hand-title');
    const handBuffEl = document.getElementById('custom-hand-buff');
    const handBadgeEl = document.getElementById('custom-hand-badge');
    const handCanvasEl = document.getElementById('custom-hand-canvas');
    const preGame = isPreGameMatch();

    if (handSlotEl && handCard && handCard.buff) {
      handSlotEl.classList.toggle('locked-in', !preGame);
      if (handSealEl) {
        handSealEl.textContent = handCard.buff.seal || '錦';
        handSealEl.style.background = handCard.buff.color || '#bf3426';
      }
      if (handTitleEl) handTitleEl.textContent = `自定义手札: ${handCard.title}`;
      if (handBuffEl) handBuffEl.textContent = `${handCard.buff.name.replace('の加護', '')}: ${handCard.buff.shortDesc}`;
      if (handBadgeEl) {
        handBadgeEl.textContent = preGame ? '開幕前変更可' : '加護発動中';
      }
      const thumbKey = `${handCard.id}-${G.printsReadyTick || 0}`;
      if (handCanvasEl && lastHandThumbKey !== thumbKey) {
        lastHandThumbKey = thumbKey;
        const hg = handCanvasEl.getContext('2d');
        const cBoardId = BOARDS[handCard.board]?.id || 'tokaido';
        renderNishikieScene(hg, cBoardId, { art: handCard.art, id: handCard.number, kind: 'normal' }, handCanvasEl.width, handCanvasEl.height);
      }
    }

    // Lobby pre-game Custom Hand Card banner sync
    const lobbyHandName = document.getElementById('lobby-hand-card-name');
    const lobbyHandDesc = document.getElementById('lobby-hand-card-desc');
    if (handCard && handCard.buff) {
      if (lobbyHandName) lobbyHandName.textContent = `${handCard.title}（${handCard.buff.name}）`;
      if (lobbyHandDesc) lobbyHandDesc.textContent = `${handCard.buff.shortDesc} · 護符: ${sanitizeCharmLoadout(G.charms).map(id => CHARM_BY_ID[id]?.name).join(' / ')}`;
    }

    // Tactical Gale Strike Button state (uses unified EsugorokuCore.canUseTacticalStrike)
    const strikeBtn = document.getElementById('btn-strike');
    const strikeSub = document.getElementById('strike-sub-text');
    if (strikeBtn && strikeSub) {
      const activeSide = G.match.turn;
      const oppSide = 1 - activeSide;
      const cd = G.match.strikeCooldown?.[activeSide] || 0;
      const oppPos = G.match.pos[oppSide] || 0;
      const pullDist = 2 + (G.match.playerBuffs?.[activeSide]?.strikePullBonus || G.match.customBuff?.strikePullBonus || 0);
      const canStrike = G.screen === 'PLAYING'
        && G.phase === 'ROLL'
        && isSideControlledByHuman(activeSide)
        && EsugorokuCore.canUseTacticalStrike(board, G.match, activeSide);
      strikeBtn.disabled = !canStrike;
      if (cd > 0) {
        strikeSub.textContent = `再充填あと${cd}手`;
      } else if (oppPos <= 0) {
        strikeSub.textContent = '相手が起点に待機中';
      } else {
        strikeSub.textContent = `相手(#${oppPos})を-${pullDist}格戻す`;
      }
    }

    // Roll button state
    const rollBtn = document.getElementById('btn-roll');
    if (rollBtn) {
      const canRoll = G.screen === 'PLAYING'
        && G.phase === 'ROLL'
        && !G.match.pendingChoice
        && isSideControlledByHuman(G.match.turn)
        && G.match.winner < 0;
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
        } else if (G.match.pendingChoice) {
          mainSpan.textContent = '⚡ 戦術を選択中…';
          subSpan.textContent = '中央の巻物から決断を下してください';
        } else if (!isSideControlledByHuman(G.match.turn)) {
          mainSpan.textContent = '⏳ 相手の手番中';
          subSpan.textContent = '同行者が公平な賽を振っています';
        } else {
          mainSpan.textContent = '🎲 賽を振る (Space)';
          subSpan.textContent = '碗に骨骰を投げて進む';
        }
      }
    }
  }

  renderDieFaceDOM(G.diceValue || 1);
  renderTacticalChoiceModal();

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
      const reasonBadge = document.getElementById('settlement-reason-badge');
      const unlocksBox = document.getElementById('settlement-unlocks');
      if (seal) {
        seal.textContent = humanWon ? '祝' : '終';
        seal.style.background = humanWon ? '#bf3426' : '#2a3b4c';
      }
      if (reasonBadge) {
        reasonBadge.textContent = G.match.resultReason === 'max_ply'
          ? `⏱️ 規定手数（${G.match.maxPly || 80}手）到達による盤面優勢判定`
          : '🏁 大上り（終着）到達による決着';
      }
      if (title) title.textContent = humanWon ? '見事、大上り達成！' : '惜敗 ─ 同行者が先に上りました';
      if (sub) {
        sub.textContent = humanWon
          ? `「${board.title}」を踏破し、見事に一番乗りを果たしました！`
          : `次は12種の懐中護符と戦術選択を活かして雪辱を果たしましょう。`;
      }
      if (unlocksBox) {
        const uCards = lastSettlementUnlocks?.newlyUnlockedCards || [];
        const uAchs = lastSettlementUnlocks?.newlyUnlockedAchievements || [];
        if (uCards.length || uAchs.length) {
          const cardNames = uCards.map(id => getCardById(id)?.title || id).join(' / ');
          const achNames = uAchs.map(id => ACHIEVEMENTS.find(a => a.id === id)?.title || id).join(' / ');
          unlocksBox.innerHTML = [
            uCards.length ? `<div>🖼️ 新規開帳錦絵: <strong>${cardNames}</strong></div>` : '',
            uAchs.length ? `<div>🏅 達成称号: <strong>${achNames}</strong></div>` : '',
          ].join('');
          unlocksBox.classList.remove('hidden');
        } else {
          unlocksBox.innerHTML = `<div>📜 蒐集済み錦絵: ${G.collection.size} / ${UKIYOE_CARDS.length} 枚</div>`;
          unlocksBox.classList.remove('hidden');
        }
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

  // Custom Hand Card Picker modal sync with G.showHandPicker
  const handModal = document.getElementById('hand-card-modal');
  if (handModal) {
    handModal.classList.toggle('hidden', !G.showHandPicker);
    if (G.showHandPicker) renderHandCardPickerDOM();
  }

  // 12-Charm Picker modal sync with G.showCharmPicker
  const charmModal = document.getElementById('charm-picker-modal');
  if (charmModal) {
    charmModal.classList.toggle('hidden', !G.showCharmPicker);
    if (G.showCharmPicker) renderCharmPickerDOM();
  }
}

function equipCustomHandCard(cardId, options = {}) {
  const card = getCardById(cardId);
  if (!card) return { ok: false, reason: 'invalid_card' };
  if (!G.collection.has(card.id) && !options.allowUncollected) {
    showToast('🔒 この錦絵はまだ開帳（蒐集）されていません', '対局完走やAI撃破・巻別目標の達成で開帳されます');
    return { ok: false, reason: 'not_collected' };
  }

  setCustomHandCard(card.id);
  const preGame = isPreGameMatch();
  const shouldApplyToCurrentMatch = preGame || Boolean(options.restartMatch);

  if (shouldApplyToCurrentMatch) {
    resetMatchState();
    invalidateScene();
    G.match.turn = G.humanSide;
    G.phase = 'ROLL';
    G.aiTimer = 0;
    statusForTurn();
    showStamp(`手札【${card.buff.seal}】`, `${card.title}・${card.buff.name}`);
    showToast(
      `🃏 自定义手札「${card.title}」を装備！（${card.buff.name}）`,
      `初期Buff適用: ${card.buff.shortDesc}`,
    );
  } else {
    showStamp(`次局手札【${card.buff.seal}】`, `${card.title}を予約`);
    showToast(
      `🃏 自定义手札「${card.title}」を選択しました`,
      '対局進行中のため次局から発動（または「最初から始める」で即時適用）',
    );
  }

  galleryRendered = false;
  syncHudDOM();
  return {
    ok: true,
    appliedImmediately: shouldApplyToCurrentMatch,
    cardId: card.id,
    buff: card.buff,
  };
}

function renderHandCardPickerDOM() {
  const handCard = currentHandCard();
  const preGame = isPreGameMatch();
  const sealEl = document.getElementById('hand-equipped-seal');
  const titleEl = document.getElementById('hand-equipped-title');
  const detailEl = document.getElementById('hand-equipped-detail');
  const pillEl = document.getElementById('hand-phase-pill');
  const restartBtn = document.getElementById('btn-hand-restart-apply');
  const subEl = document.getElementById('hand-modal-subtitle');

  if (handCard && handCard.buff) {
    if (sealEl) {
      sealEl.textContent = handCard.buff.seal;
      sealEl.style.background = handCard.buff.color || '#bf3426';
    }
    if (titleEl) titleEl.textContent = `${handCard.title} — ${handCard.buff.name}（${handCard.buff.shortDesc}）`;
    if (detailEl) detailEl.textContent = handCard.buff.detail;
  }
  if (pillEl) {
    pillEl.textContent = preGame ? '✨ 開幕前・選択すると即時適用' : '⏳ 対局進行中・次局適用または再始動で即時発動';
  }
  if (restartBtn) {
    restartBtn.classList.toggle('hidden', preGame);
  }
  if (subEl) {
    subEl.textContent = `蒐集済み錦絵: ${G.collection.size} / ${UKIYOE_CARDS.length} 枚 · 対局開始前に1枚選ぶと初期Buff（開幕前進・初手加速・追突強化・奇襲短縮など）が発動します。`;
  }

  document.querySelectorAll('.hand-filter-btn[data-hand-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.handFilter === String(G.handPickerFilter || 'all'));
  });

  const grid = document.getElementById('hand-card-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const filter = G.handPickerFilter || 'all';
  const cards = UKIYOE_CARDS.filter(c => filter === 'all' || String(c.board) === String(filter));
  cards.sort((a, b) => {
    const aCol = G.collection.has(a.id) ? 1 : 0;
    const bCol = G.collection.has(b.id) ? 1 : 0;
    if (aCol !== bCol) return bCol - aCol;
    return a.board - b.board || a.number - b.number;
  });

  cards.forEach(card => {
    const collected = G.collection.has(card.id);
    const isEquipped = G.customHandCard === card.id;
    const item = document.createElement('div');
    item.className = `gallery-card-item${isEquipped ? ' equipped' : ''}${collected ? '' : ' locked'}`;
    item.dataset.cardId = card.id;

    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 200;
    const g = c.getContext('2d');
    const boardId = BOARDS[card.board]?.id || 'tokaido';
    renderNishikieScene(g, boardId, { art: card.art, id: card.number, kind: card.rarity === '特大判' ? 'goal' : 'normal' }, 320, 200);

    const meta = document.createElement('div');
    meta.className = 'gallery-card-meta';
    const volName = BOARDS[card.board]?.volume || '巻';
    meta.innerHTML = `<strong>#${String(card.number).padStart(2, '0')} ${card.title}</strong><span>${volName}・${card.artist}</span>`;

    const buffBox = document.createElement('div');
    buffBox.className = 'card-buff-box';
    buffBox.innerHTML = `<strong>【${card.buff.seal}】${card.buff.name}</strong><span>${card.buff.shortDesc}</span>`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `card-equip-btn${isEquipped ? ' equipped' : ''}`;
    btn.dataset.equipCard = card.id;
    if (!collected) {
      btn.disabled = true;
      btn.textContent = `🔒 未開帳（${card.unlockCondition?.label || '対局達成で解放'}）`;
    } else if (isEquipped) {
      btn.textContent = preGame ? '✓ 懐中手札に装備中（初期Buff発動）' : '✓ 懐中手札に装備中';
    } else {
      btn.textContent = preGame ? '🃏 この錦絵を初期Buff手札に選ぶ' : '🃏 この錦絵を手札に選ぶ';
    }
    btn.addEventListener('click', () => {
      unlockAudioOnce();
      audio.select();
      equipCustomHandCard(card.id);
      if (isPreGameMatch()) {
        G.showHandPicker = false;
      }
      syncHudDOM();
    });

    item.appendChild(c);
    item.appendChild(meta);
    item.appendChild(buffBox);
    item.appendChild(btn);
    grid.appendChild(item);
  });
}

function renderGalleryDOM() {
  const countLabel = document.getElementById('gallery-count-label');
  if (countLabel) {
    countLabel.textContent = `蒐集状況: ${G.collection.size} / ${UKIYOE_CARDS.length} 枚 開帳済み · 達成称号: ${G.achievements.size} / ${ACHIEVEMENTS.length} · 開帳済みの錦絵は「自定义手札（初期Buff）」として装備できます`;
  }
  if (galleryRendered) return;
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  galleryRendered = true;
  grid.innerHTML = '';

  UKIYOE_CARDS.forEach(card => {
    const collected = G.collection.has(card.id);
    const isEquipped = G.customHandCard === card.id;
    const item = document.createElement('div');
    item.className = `gallery-card-item${isEquipped ? ' equipped' : ''}${collected ? '' : ' locked'}`;
    item.dataset.cardId = card.id;

    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 220;
    const g = c.getContext('2d');
    const boardId = BOARDS[card.board]?.id || 'tokaido';
    renderNishikieScene(g, boardId, { art: card.art, id: card.number, kind: card.rarity === '特大判' ? 'goal' : 'normal' }, 320, 220);

    const meta = document.createElement('div');
    meta.className = 'gallery-card-meta';
    meta.innerHTML = `<strong>#${String(card.number).padStart(2, '0')} ${card.title}</strong><span>${card.artist}</span>`;

    const buffBox = document.createElement('div');
    buffBox.className = 'card-buff-box';
    buffBox.innerHTML = `<strong>初期Buff【${card.buff.seal}】${card.buff.name}</strong><span>${card.buff.shortDesc}</span>`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `card-equip-btn${isEquipped ? ' equipped' : ''}`;
    btn.dataset.galleryEquip = card.id;
    if (!collected) {
      btn.disabled = true;
      btn.textContent = `🔒 未開帳（${card.unlockCondition?.label || '対局で解放'}）`;
    } else if (isEquipped) {
      btn.textContent = '✓ 自定义手札に装備中';
    } else {
      btn.textContent = '🃏 自定义手札に装備する';
    }
    btn.addEventListener('click', () => {
      unlockAudioOnce();
      audio.select();
      equipCustomHandCard(card.id);
    });

    item.appendChild(c);
    item.appendChild(meta);
    item.appendChild(buffBox);
    item.appendChild(btn);
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
  lastSettlementUnlocks = null;
  resetMatchState();
  invalidateScene();
  audio.paper();
  G.aiTimer = isSideControlledByHuman(G.match.turn) ? 0 : 1.0;
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

function handleEvents(result, roll) {
  const board = currentBoard();
  const human = G.match.humanSide;
  const mover = result.events.find(e => e.player !== undefined)?.player ?? human;
  const finalPos = result.state.pos[mover];
  const node = board.nodes[finalPos];
  let usedJump = false;

  for (const ev of result.events) {
    if (ev.type === 'jump') {
      usedJump = true;
      G.stats.jumps++;
      audio.jump();
      showToast(`⚡ 名物跳び！ ${board.nodes[ev.from]?.title || ''} → ${board.nodes[ev.to]?.title || ''}`, `出目 ${roll} の跳躍効果`);
    } else if (ev.type === 'bounce') {
      audio.bounce(1.2);
      showToast('↩️ 上りを超過 ─ 点点一致のため折り返し', 'ぴったり止まると大上り達成');
    } else if (ev.type === 'token') {
      audio.token();
      showStamp('討入備え', ev.label || '義士印');
      showToast(`⚔️ 討入備え「${ev.label || '印'}」を獲得！`, '三つ揃えば御前の上りが開門');
    } else if (ev.type === 'stay') {
      audio.stay();
      showToast(`🏮 宿場泊 ─ ${ev.turns} 手休み`, board.nodes[ev.to]?.title || '');
    } else if (ev.type === 'gourmet') {
      audio.token();
      showStamp('宿場名物', `${board.nodes[ev.square]?.title || '名物'}＋旅銭1枚`);
      showToast(`🍱 宿場名物「${board.nodes[ev.square]?.title || ''}」を堪能！旅銭＋1枚（計${ev.coins}枚）`, '旅銭は宿場泊や関所の突破に使えます');
    } else if (ev.type === 'coin_spent') {
      audio.charm();
      showToast(`🪙 旅銭を1枚支払い、${ev.reason === 'stay' ? '宿場泊' : '関所の押し戻し'}を突破！（残り${ev.coinsLeft}枚）`, '東海道・旅銭の知恵');
    } else if (ev.type === 'lantern') {
      audio.lantern();
      const litCount = [1, 2, 4, 8].filter(b => (ev.mask & b) !== 0).length;
      showToast(`🏮 青行灯マス（#${ev.square}）を点灯！（${litCount} / 4 灯）`, '四灯すべて灯すと次回の前進跳びが百鬼夜行（2倍/3倍）に！');
    } else if (ev.type === 'frenzy_ready') {
      audio.lantern();
      showStamp('百鬼夜行', '次回の前進怪異跳びが倍化！');
      showToast('🏮 四つの青行灯が揃った！「百鬼夜行」待機状態に突入！', '次回の前進ジャンプ距離が2倍（青行灯護符なら3倍）になります！');
    } else if (ev.type === 'frenzy_used') {
      audio.jump();
      showStamp('百鬼夜行発動', `飛距離 ${ev.multiplier} 倍！`);
      showToast(`👹 百鬼夜行発動！怪異跳びが ${ev.multiplier} 倍に増幅された！`, '四灯の妖力が解放されました');
    } else if (ev.type === 'duel') {
      G.stats.duels++;
      audio.duel();
      const pushSteps = ev.pushSteps ?? 2;
      const stanceLabels = { assault: '猛攻', feint: '牽制', defend: '固守' };
      const stName = stanceLabels[ev.stance] || '追突';
      if (ev.stolenBit) {
        const stolenName = ev.stolenBit === 1 ? '兜' : ev.stolenBit === 2 ? '太刀' : '陣太鼓';
        showStamp('武具奪取', `【${stName}】${stolenName}を奪取！`);
        showToast(`⚔️ 一騎討ち【${stName}】勝利！相手を ${pushSteps} 格弾き飛ばし「${stolenName}」を奪取！`, '白熱の合戦攻防');
      } else {
        showToast(`⚔️ 同格合戦【${stName}】！相手を ${pushSteps} 格後ろへ弾き飛ばした！`, '道中の攻防拉鋸');
      }
    } else if (ev.type === 'recharge') {
      audio.charm();
      showToast('✨ 懐中護符の霊力が再充填されました！', '再び護符の加護を発動できます');
    } else if (ev.type === 'charm') {
      audio.charm();
      const cDef = CHARM_BY_ID[ev.charm];
      showToast(
        `🛡️ 懐中護符「${cDef?.name || ev.charm}」が発動！`,
        cDef?.effect || '懐中守り札の加護',
      );
    } else if (ev.type === 'custom_buff') {
      audio.charm();
      if (ev.effect === 'first_roll') {
        showToast(`🃏 自定义手札「${ev.buffName || '初期加護'}」発動！初手＋${ev.bonus}歩加速！`, '懐中錦絵の初期Buff効果');
      } else if (ev.effect === 'jump_boost') {
        showToast(`🃏 自定义手札「${ev.buffName || '駿足'}」が前進跳びを＋${ev.bonus}格強化！`, '懐中錦絵の初期Buff効果');
      } else if (ev.effect === 'duel_master') {
        showToast(`🃏 自定义手札「${ev.buffName || '荒武者'}」で追突弾き強化＆自駒＋1格前進！`, '懐中錦絵の初期Buff効果');
      }
    } else if (ev.type === 'goal_locked') {
      audio.stay();
      showStamp('御前返し', `備え ${ev.required} 枚が必要`);
      showToast('🔒 御前の上りはまだ開かない！', '先に兜・太刀・陣太鼓を三つ揃えよう');
    } else if (ev.type === 'branch_good') {
      showToast('🌸 金色の「雅道（善道）」へ進む！', '近道・前進ルートへ入りました');
    } else if (ev.type === 'branch_evil') {
      showToast('🌑 紫の「修羅道（悪道）」へ進む！', '波乱の奇襲ルートへ入りました');
    } else if (ev.type === 'skip') {
      showToast('🏮 宿場泊のためこの手番は一休み', '次の手番から再開します');
    } else if (ev.type === 'timeout') {
      showStamp('規定手数到達', '盤面優勢判定');
      showToast('⏱️ 規定手数（maxPly）に到達！盤面進行度により勝敗が決しました', '長期戦の決着');
    }
  }

  if (node) {
    const c = nodeCenter(node);
    spawnLandingEffect(c.x, c.y, board.id === 'genji' ? 'sakura' : 'gold', node.title);
    if (tabletop) tabletop.spawnTileRipple(finalPos, usedJump ? '#ff5945' : '#f5cb5c');
  }

  syncDerivedHudFromMatch(G.match);

  if (G.match.pendingChoice && G.match.winner < 0) {
    G.phase = 'PENDING_CHOICE';
    G.aiTimer = isSideControlledByHuman(G.match.pendingChoice.player) ? 0 : 0.65;
    statusForTurn();
    syncHudDOM();
    return;
  }

  if (result.won || result.state.winner >= 0) {
    G.phase = 'SETTLEMENT';
    if (result.state.winner === G.match.humanSide) audio.win();
    else audio.lose();
    lastSettlementUnlocks = evaluateMatchProgression(G.boardIdx, G.match);
    galleryRendered = false;
    syncHudDOM();
    return;
  }
  statusForTurn();
  syncHudDOM();
}

function simulateWalk(board, from, steps, roll, matchState) {
  const mover = matchState?.turn ?? 0;
  const routeOverride = matchState?.boardState?.genji?.routeChoice?.[mover];
  const branchGood = routeOverride === 'good'
    ? true
    : routeOverride === 'evil'
      ? false
      : (roll % 2 === 0);
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
    : simulateWalk(board, oldState.pos[mover], steps, roll, oldState);

  const jump = result.events.find(e => e.type === 'jump');
  if (jump && indexes[indexes.length - 1] !== jump.to) indexes.push(jump.to);
  const final = result.state.pos[mover];
  if (indexes[indexes.length - 1] !== final) indexes.push(final);
  if (indexes.length < 2) indexes = [oldState.pos[mover], final];

  const path = pathToPoints(board, indexes, mover);
  const dur = Math.max(480, Math.min(2200, (indexes.length - 1) * 240 + (jump ? 320 : 0)));
  G.pieceAnim = { side: mover, path, indexes, t0: performance.now(), duration: dur, lastSeg: -1 };
  G.pendingResult = { result, roll, preRollState: oldState };
  G.phase = 'MOVE';
  setStatus(
    `出目「${KANJI_NUMS[roll]} (${roll}点)」に従って駒が ${indexes.length - 1} 歩進みます`,
    `${board.nodes[oldState.pos[mover]]?.title || ''} → ${board.nodes[final]?.title || ''}`,
  );
}

let turnSweepTimeout = 0;

function triggerTurnPageTurn(fromSide, toSide) {
  const humanSide = G.match?.humanSide ?? 0;
  const isToHuman = toSide === humanSide;
  const direction = isToHuman ? 'to-human' : 'to-ai';
  const label = isToHuman ? '手番交代 ─ あなたの番' : '手番交代 ─ 同行者の番';
  const subLabel = isToHuman ? '画帖めくり · 賽を振って進みましょう' : '画帖めくり · 相手が思考しています';

  G.turnTransition = {
    count: (G.turnTransition?.count || 0) + 1,
    fromSide,
    toSide,
    direction,
    label,
    active: true,
    timestamp: Math.round(performance.now()),
  };

  audio.paper();
  if (tabletop) {
    tabletop.onTurnTransition(fromSide, toSide);
  }

  const sweepEl = document.getElementById('turn-page-sweep');
  const sealEl = document.getElementById('turn-page-seal');
  const textEl = document.getElementById('turn-page-text');
  const subEl = document.getElementById('turn-page-sub');
  const coachEl = document.getElementById('coach-banner');
  const row0 = document.getElementById('player-row-0');
  const row1 = document.getElementById('player-row-1');

  if (sealEl) sealEl.textContent = isToHuman ? '旅' : '伴';
  if (textEl) textEl.textContent = label;
  if (subEl) subEl.textContent = subLabel;

  if (sweepEl) {
    sweepEl.dataset.direction = direction;
    sweepEl.classList.remove('active');
    void sweepEl.offsetWidth;
    sweepEl.classList.add('active');
  }

  if (coachEl) {
    coachEl.classList.remove('turn-handover-pulse');
    void coachEl.offsetWidth;
    coachEl.classList.add('turn-handover-pulse');
  }

  const activeRow = toSide === humanSide ? row0 : row1;
  const prevRow = toSide === humanSide ? row1 : row0;
  prevRow?.classList.remove('turn-handover-pulse');
  if (activeRow) {
    activeRow.classList.remove('turn-handover-pulse');
    void activeRow.offsetWidth;
    activeRow.classList.add('turn-handover-pulse');
  }

  if (turnSweepTimeout) window.clearTimeout(turnSweepTimeout);
  turnSweepTimeout = window.setTimeout(() => {
    if (G.turnTransition) G.turnTransition.active = false;
    sweepEl?.classList.remove('active');
    coachEl?.classList.remove('turn-handover-pulse');
    row0?.classList.remove('turn-handover-pulse');
    row1?.classList.remove('turn-handover-pulse');
  }, 680);
}

function finishMove() {
  if (!G.pendingResult) return;
  const { result, roll, preRollState } = G.pendingResult;
  const previousTurn = G.pieceAnim?.side ?? (preRollState ? preRollState.turn : 0);
  G.pendingResult = null;
  G.pieceAnim = null;
  G.lastPreRollSnapshot = preRollState;
  G.match = result.state;
  G.diceValue = roll;
  G.phase = result.won || result.state.winner >= 0
    ? 'SETTLEMENT'
    : result.state.pendingChoice
      ? 'PENDING_CHOICE'
      : 'ROLL';
  handleEvents(result, roll);
  if (G.phase === 'ROLL' && previousTurn !== G.match.turn) {
    triggerTurnPageTurn(previousTurn, G.match.turn);
    G.aiTimer = isSideControlledByHuman(G.match.turn) ? 0 : 0.85;
  }
}

function submitTacticalChoice(action) {
  if (!G.match || !G.match.pendingChoice) return { ok: false, reason: 'no_pending_choice' };
  const board = currentBoard();
  const prevPlayer = G.match.pendingChoice.player;
  const res = EsugorokuCore.applyChoice(board, G.match, action);
  if (!res.ok) return res;
  G.match = res.state;
  handleEvents(res, G.diceValue || 1);
  if (G.phase !== 'SETTLEMENT' && !G.match.pendingChoice) {
    G.phase = 'ROLL';
    if (prevPlayer !== G.match.turn) {
      triggerTurnPageTurn(prevPlayer, G.match.turn);
    }
    G.aiTimer = isSideControlledByHuman(G.match.turn) ? 0 : 0.85;
    statusForTurn();
    syncHudDOM();
  }
  return res;
}

function triggerRerollCharm() {
  if (!G.match || !G.lastPreRollSnapshot) return { ok: false, reason: 'no_preroll_snapshot' };
  const board = currentBoard();
  const player = G.lastPreRollSnapshot.turn;
  const restored = JSON.parse(JSON.stringify(G.lastPreRollSnapshot));
  restored.rerollsUsedThisTurn = (G.match.rerollsUsedThisTurn || 0);
  const res = EsugorokuCore.applyCharm(board, restored, 'reroll', { player });
  if (!res.ok) return res;
  G.match = res.state;
  G.phase = 'ROLL';
  G.aiTimer = isSideControlledByHuman(G.match.turn) ? 0 : 0.65;
  showStamp('重抽符', '賽をもう一度振り直す！');
  showToast('🎲 懐中護符「重抽符」を発動！今回の出目を破棄して振り直します', '1局につき1回限りの秘術');
  statusForTurn();
  syncHudDOM();
  return res;
}

function triggerActiveCharmSlot(slotIndex) {
  if (!G.match || G.screen !== 'PLAYING' || G.phase !== 'ROLL') return { ok: false };
  const board = currentBoard();
  const player = G.match.turn;
  if (!isSideControlledByHuman(player)) return { ok: false };
  const loadout = G.match.charmLoadout?.[player] || sanitizeCharmLoadout(G.charms);
  const cid = loadout[slotIndex];
  if (!cid) return { ok: false };

  if (cid === 'wind' || cid === 'purify') {
    const res = EsugorokuCore.applyCharm(board, G.match, cid, { player });
    if (res.ok) {
      G.match = res.state;
      audio.charm();
      const def = CHARM_BY_ID[cid];
      showStamp(def?.name || '護符発動', def?.effect || '');
      showToast(`🛡️ 懐中護符「${def?.name || cid}」を発動！`, def?.effect || '');
      syncHudDOM();
      return res;
    }
  } else if (cid === 'waka_slip' && board.id === 'genji') {
    const curRoute = G.match.boardState?.genji?.routeChoice?.[player];
    const nextRoute = curRoute === 'good' ? 'evil' : 'good';
    const res = EsugorokuCore.applyCharm(board, G.match, 'waka_slip', { player, route: nextRoute });
    if (res.ok) {
      G.match = res.state;
      audio.charm();
      showStamp('和歌懐紙', nextRoute === 'good' ? '雅道（善）を予約' : '修羅道（悪）を予約');
      showToast(`📜 懐中護符「和歌懐紙」を発動！#15 関屋の分岐を「${nextRoute === 'good' ? '雅道（善）' : '修羅道（悪）'}」に指定しました`, '源氏巻の道中制御');
      syncHudDOM();
      return res;
    }
  }

  // Otherwise open the 12-charm loadout modal if pre-game, or show info toast
  if (isPreGameMatch()) {
    G.showCharmPicker = true;
    audio.paper();
    syncHudDOM();
    return { ok: true, openedPicker: true };
  }
  const def = CHARM_BY_ID[cid];
  if (def) {
    showToast(`🛡️ 懐中護符「${def.name}」`, `${def.effect}（条件を満たすと発動します）`);
  }
  return { ok: false, reason: 'passive_charm' };
}

function targetRotation(value, yaw = 0.25) {
  return computeDieTargetEulerYXZ(value, yaw);
}

const BOWL_2D_CENTER = { x: 1120, y: 625 };
const BOWL_2D_RADIUS = 64;

function triggerHudBowlVibration(intensity = 1.0) {
  const btn = document.getElementById('btn-roll');
  if (btn) {
    const dx = ((Math.random() - 0.5) * 7 * intensity).toFixed(1);
    const dy = ((Math.random() - 0.5) * 5 * intensity).toFixed(1);
    btn.style.transform = `translate(${dx}px, ${dy}px) scale(${(1 + 0.035 * intensity).toFixed(3)})`;
    window.setTimeout(() => {
      btn.style.transform = '';
    }, 95);
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(Math.round(14 + intensity * 24));
    } catch {
      // Ignore if vibration is blocked by browser policy
    }
  }
}

function startRoll(forcedValue = null, isAiRoll = false) {
  unlockAudioOnce();
  if (G.screen !== 'PLAYING' || G.phase !== 'ROLL') return false;
  if (!G.match || G.match.winner >= 0 || G.match.pendingChoice) return false;
  if (!isSideControlledByHuman(G.match.turn) && forcedValue === null && !isAiRoll) return false;

  // V1.1 Fair Dice Guarantee: Both Human and AI use the exact same fair 1..6 generator!
  const value = (forcedValue !== null && forcedValue !== undefined)
    ? Math.max(1, Math.min(6, Number(forcedValue) | 0))
    : EsugorokuCore.rollDie(G.match);

  const target = targetRotation(value, Math.random() * 1.2 - 0.6);
  const die = G.physDice[0];
  G.phase = 'ANIM';
  G.rollResolved = false;
  G.resolveTimer = 0;
  G.pendingRoll = value;
  G.diceValue = value;
  G.dice[0] = value;
  G.tube.shake = 1;
  G.tube.tipped = true;
  G.rollPending = true;
  setStatus('🎲 骨骰が賽碗の磁壁を撃ち、水墨飛沫と朱墨の滲みが迸っています…', '止まった上面の目が今回の歩数になります');

  const launchAngle = Math.random() * Math.PI * 2;
  const launchSpeed = 340 + Math.random() * 85;
  die.settled = false;
  die.settling = false;
  die.settleHopDone = false;
  die.spinTime = 0;
  die.wallHits = 0;
  die.x = BOWL_2D_CENTER.x + Math.cos(launchAngle) * 52;
  die.y = BOWL_2D_CENTER.y + Math.sin(launchAngle) * 52;
  die.z = 36 + Math.random() * 14;
  die.vx = Math.cos(launchAngle + 0.38) * launchSpeed;
  die.vy = Math.sin(launchAngle + 0.38) * launchSpeed;
  die.vz = 32 + Math.random() * 22;
  die.wx = 15 + Math.random() * 9;
  die.wy = 12 + Math.random() * 9;
  die.wz = 11 + Math.random() * 8;
  die.target = target;
  die.value = value;
  die.active = true;

  audio.shake();
  audio.soulBurst(value);
  if (tabletop) tabletop.onDiceThrow(value);
  setTimeout(() => audio.throwDie(), 75);
  showStamp('投 骰', `${currentBoard().ui.diceDevice}より一擲`);
  syncHudDOM();
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
  setStatus(`🎲 出目は「${KANJI_NUMS[value]} (${value}点)」！朱墨・魂の気が満ちる`, '賽が静まり、木駒が一歩ずつ進み出します');
  audio.bounce(1.0);
  audio.soulBurst(value);
  if (tabletop) tabletop.onDiceSettled(value);
  triggerHudBowlVibration(0.9);
  syncHudDOM();
}

function resolvePendingRoll() {
  if (!G.rollResolved || G.resolveTimer > 0) return;
  const value = G.pendingRoll || G.diceValue;
  G.rollResolved = false;
  const board = currentBoard();
  const oldState = JSON.parse(JSON.stringify(G.match));
  const result = EsugorokuCore.applyRoll(board, oldState, value, { pauseOnChoice: true });
  beginMove(result, value, oldState);
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
          const bounceInt = Math.min(1.1, Math.abs(die.vz) / 155);
          die.vz = -die.vz * 0.54;
          die.wx += (Math.random() - 0.5) * bounceInt * 6.2;
          die.wz += (Math.random() - 0.5) * bounceInt * 6.2;
          audio.bounce(bounceInt);
          if (tabletop && bounceInt > 0.22) {
            tabletop.onBowlFloorBounce(
              ((die.x - BOWL_2D_CENTER.x) / BOWL_2D_RADIUS) * 1.86,
              ((die.y - BOWL_2D_CENTER.y) / BOWL_2D_RADIUS) * 1.86,
              bounceInt,
            );
          }
        } else {
          die.vz = 0;
        }
        die.vx *= 0.88;
        die.vy *= 0.88;
      }
      die.wx *= 0.986;
      die.wy *= 0.986;
      die.wz *= 0.986;
      die.rx += die.wx * dt;
      die.ry += die.wy * dt;
      die.rz += die.wz * dt;

      const dx = die.x - BOWL_2D_CENTER.x;
      const dy = die.y - BOWL_2D_CENTER.y;
      const dist = Math.hypot(dx, dy);
      if (dist > BOWL_2D_RADIUS) {
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        die.x = BOWL_2D_CENTER.x + nx * BOWL_2D_RADIUS;
        die.y = BOWL_2D_CENTER.y + ny * BOWL_2D_RADIUS;

        const vn = die.vx * nx + die.vy * ny;
        if (vn > 0) {
          const tx = -ny;
          const ty = nx;
          const vt = die.vx * tx + die.vy * ty;
          const restitution = 0.78;
          const tangDeflect = vt * 0.92 + (Math.random() - 0.5) * 48;
          die.vx = (-vn * restitution) * nx + tangDeflect * tx;
          die.vy = (-vn * restitution) * ny + tangDeflect * ty;
          die.vz = Math.max(die.vz, Math.min(135, vn * 0.38));
          die.wx += ny * vn * 0.085;
          die.wy += (Math.random() - 0.5) * 7.5;
          die.wz -= nx * vn * 0.085;

          const impactIntensity = Math.min(1.5, Math.max(0.32, vn / 145));
          die.wallHits = (die.wallHits || 0) + 1;
          audio.wallHit(impactIntensity);
          triggerHudBowlVibration(impactIntensity);
          if (tabletop) {
            tabletop.onBowlWallCollision(nx, ny, impactIntensity, die.z * 0.065, die.value);
          }
        }
      }

      if ((die.spinTime > 0.85 && die.z <= 0.1 && Math.hypot(die.vx, die.vy) < 38) || die.spinTime > 1.45) {
        die.settling = true;
        if (!die.settleHopDone) {
          die.settleHopDone = true;
          die.vz = Math.max(die.vz, 38);
        }
      }
    } else {
      die.z = Math.max(0, die.z + die.vz * dt);
      die.vz = die.z > 0 ? (die.vz - 820 * dt) : 0;

      const exactTarget = die.target || targetRotation(die.value || G.diceValue || 1, 0.25);
      const nearest = (cur, target) => target + Math.round((cur - target) / (Math.PI * 2)) * Math.PI * 2;
      const tx = nearest(die.rx, exactTarget.rx);
      const ty = nearest(die.ry, exactTarget.ry);
      const tz = nearest(die.rz, exactTarget.rz);
      const k = Math.min(1, dt * 14);
      die.rx += (tx - die.rx) * k;
      die.ry += (ty - die.ry) * k;
      die.rz += (tz - die.rz) * k;
      die.x += (BOWL_2D_CENTER.x - die.x) * k;
      die.y += (BOWL_2D_CENTER.y - die.y) * k;
      if (Math.abs(tx - die.rx) < 0.018 && Math.abs(ty - die.ry) < 0.018 && Math.abs(tz - die.rz) < 0.018 && die.z <= 0.05) {
        die.rx = tx;
        die.ry = ty;
        die.rz = tz;
        die.z = 0;
        die.vz = 0;
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

  // AI resolves pending tactical choice (stance, travel coin, Genji branch)
  if (G.phase === 'PENDING_CHOICE' && G.match?.pendingChoice && !isSideControlledByHuman(G.match.pendingChoice.player)) {
    if (G.aiTimer <= 0.001) {
      const board = currentBoard();
      const action = EsugorokuCore.aiSelectAction(board, G.match, G.aiDifficulty);
      submitTacticalChoice(action);
    } else {
      G.aiTimer -= dt;
    }
    return;
  }

  // AI pre-roll tactical decision + fair dice throw
  if (G.phase === 'ROLL' && G.match?.winner < 0 && !G.match?.pendingChoice && !isSideControlledByHuman(G.match?.turn)) {
    if (G.aiTimer <= 0.001) {
      const board = currentBoard();
      const ai = G.match.turn;
      const action = EsugorokuCore.aiSelectAction(board, G.match, G.aiDifficulty);

      if (action.type === 'strike') {
        const st = EsugorokuCore.applyTacticalStrike(board, G.match, ai);
        if (st.ok) {
          G.match = st.state;
          audio.duel();
          if (tabletop) tabletop.spawnTileRipple(st.to, '#a83279');
          showToast(`🌪️ 相手の「辻風奇襲」！あなたが #${st.from} → #${st.to} へ引き戻された！`, '激しい攻防の応酬');
          syncHudDOM();
        }
      } else if (action.type === 'charm') {
        const ch = EsugorokuCore.applyCharm(board, G.match, action.charmId, { player: ai });
        if (ch.ok) {
          G.match = ch.state;
          audio.charm();
          const cDef = CHARM_BY_ID[action.charmId];
          showToast(`🛡️ 相手が懐中護符「${cDef?.name || action.charmId}」を発動！`, cDef?.effect || '');
          syncHudDOM();
        }
      } else if (action.type === 'genji_branch') {
        const br = EsugorokuCore.applyChoice(board, G.match, { ...action, player: ai, completeTurn: false });
        if (br.ok) {
          G.match = br.state;
          syncHudDOM();
        }
      }

      // Fair random die throw — AI NEVER picks dice faces!
      startRoll(null, true);
      G.aiTimer = 0;
    } else {
      G.aiTimer -= dt;
    }
  }
}

function openLoupeModal(nodeIdx) {
  const board = currentBoard();
  const human = G.match?.humanSide ?? 0;
  const idx = nodeIdx !== undefined && nodeIdx >= 0 ? nodeIdx : (G.hoverNode >= 0 ? G.hoverNode : (G.match?.pos[human] ?? 0));
  const node = board.nodes[idx] || board.nodes[0];
  const modal = document.getElementById('loupe-modal');
  const titleEl = document.getElementById('loupe-title');
  const subEl = document.getElementById('loupe-sub');
  const ruleEl = document.getElementById('loupe-rule');
  const loupeCanvas = document.getElementById('loupe-canvas');
  if (!modal || !loupeCanvas) return;

  if (titleEl) titleEl.textContent = `#${node.id} ${node.title}`;
  if (subEl) subEl.textContent = `${board.volume}・${board.title}`;
  if (ruleEl) ruleEl.textContent = describeNodeRule(board, node);

  const tileCanvas = create3DTileCanvas(board, node);
  const g = loupeCanvas.getContext('2d');
  g.clearRect(0, 0, loupeCanvas.width, loupeCanvas.height);
  g.drawImage(tileCanvas, 0, 0, loupeCanvas.width, loupeCanvas.height);

  modal.classList.remove('hidden');
  audio.paper();
}

function triggerTacticalStrike() {
  unlockAudioOnce();
  if (G.screen !== 'PLAYING' || G.phase !== 'ROLL' || !G.match) return false;
  const actor = G.match.turn;
  if (!isSideControlledByHuman(actor)) return false;
  const board = currentBoard();
  const res = EsugorokuCore.applyTacticalStrike(board, G.match, actor);
  if (!res.ok) return false;
  G.match = res.state;
  audio.duel();
  if (tabletop) tabletop.spawnTileRipple(res.to, '#6ce0ff');
  showStamp('辻風奇襲', `相手を #${res.to} へ引き戻し`);
  showToast(`🌪️ 辻風奇襲を発動！相手を #${res.from} → #${res.to} へ引き戻した！`, '続けて賽を振って一気に追い抜こう');
  syncHudDOM();
  return true;
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

  // AI Difficulty & Local 2P selector in Top Bar
  const diffSelect = document.getElementById('select-ai-difficulty');
  diffSelect?.addEventListener('change', () => {
    unlockAudioOnce();
    const val = diffSelect.value;
    if (val === 'local2p') {
      G.mode = 'local2p';
      if (G.match) G.match.mode = 'local2p';
      showToast('👥 同席二人対戦モードに切り替えました', '先手・後手ともに手動で賽と戦術を操作します');
    } else {
      G.mode = 'ai';
      G.aiDifficulty = val;
      if (G.match) {
        G.match.mode = 'ai';
        G.match.aiDifficulty = val;
      }
      showToast(`🤖 AI難度を「${DIFFICULTY_LABELS[val] || val}」に設定しました`, '双方とも完全に同じ公平な骨骰（1〜6）を使用します');
    }
    saveProfile();
    statusForTurn();
    syncHudDOM();
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
    galleryRendered = false;
    audio.paper();
    syncHudDOM();
  });
  document.getElementById('btn-gallery-close')?.addEventListener('click', () => {
    G.showGallery = false;
    audio.paper();
    syncHudDOM();
  });

  // Custom Hand Card Slot & Selector Modal (自定义手札)
  const openHandPickerModal = () => {
    unlockAudioOnce();
    G.showHandPicker = true;
    audio.paper();
    syncHudDOM();
  };
  document.getElementById('custom-hand-slot')?.addEventListener('click', openHandPickerModal);
  document.getElementById('btn-lobby-change-hand')?.addEventListener('click', openHandPickerModal);
  document.getElementById('btn-hand-modal-close')?.addEventListener('click', () => {
    G.showHandPicker = false;
    audio.select();
    syncHudDOM();
  });
  document.getElementById('btn-hand-restart-apply')?.addEventListener('click', () => {
    unlockAudioOnce();
    if (G.customHandCard) {
      equipCustomHandCard(G.customHandCard, { restartMatch: true });
    }
    G.showHandPicker = false;
    audio.paper();
    syncHudDOM();
  });
  document.querySelectorAll('.hand-filter-btn[data-hand-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      unlockAudioOnce();
      G.handPickerFilter = btn.dataset.handFilter || 'all';
      audio.select();
      syncHudDOM();
    });
  });

  // 12-Charm Picker Modal & Active Charm Slots
  document.getElementById('btn-lobby-charms')?.addEventListener('click', () => {
    unlockAudioOnce();
    G.showCharmPicker = true;
    audio.paper();
    syncHudDOM();
  });
  document.getElementById('btn-charm-modal-close')?.addEventListener('click', () => {
    G.showCharmPicker = false;
    audio.select();
    syncHudDOM();
  });
  for (let i = 0; i < 3; i++) {
    document.getElementById(`charm-slot-${i}`)?.addEventListener('click', () => {
      unlockAudioOnce();
      triggerActiveCharmSlot(i);
    });
  }

  // Woodblock Card Loupe Modal
  const loupeModal = document.getElementById('loupe-modal');
  document.getElementById('inspector-art-frame')?.addEventListener('click', () => {
    unlockAudioOnce();
    openLoupeModal();
  });
  document.getElementById('btn-loupe-close')?.addEventListener('click', () => {
    loupeModal?.classList.add('hidden');
    audio.select();
  });

  // Tactical Strike Button
  document.getElementById('btn-strike')?.addEventListener('click', () => {
    triggerTacticalStrike();
  });

  // Ambient Shamisen / Koto BGM Toggle (Independent of SFX)
  const bgmBtn = document.getElementById('btn-bgm');
  const toggleBgmControl = () => {
    unlockAudioOnce();
    const next = !audio.isBgmEnabled();
    G.bgmEnabled = next;
    audio.setBgmBoard(currentBoard().id);
    audio.setBgmEnabled(next);
    saveProfile();
    syncHudDOM();
    const st = audio.getState();
    if (next) {
      audio.bgmPreviewFlourish();
      showToast(`🪕 和楽器BGM「${st.bgmTitle}」を再生中`, `三味線・十三絃箏 (${st.bgmScale}) · 効果音とは独立制御`);
    } else {
      showToast('🔇 三味線・箏の背景絃楽（BGM）を消音しました', '骨骰や木駒の効果音（SFX）はそのまま維持されます');
    }
    return st;
  };
  bgmBtn?.addEventListener('click', toggleBgmControl);

  // Sound Effects (SFX) Toggle (Independent of BGM)
  const audioBtn = document.getElementById('btn-audio');
  audioBtn?.addEventListener('click', () => {
    unlockAudioOnce();
    const next = !audio.isEnabled();
    G.audioEnabled = next;
    audio.setEnabled(next);
    saveProfile();
    syncHudDOM();
    if (next) {
      audio.toggle();
      showToast('🔊 骨骰・檜木駒の効果音（SFX）を開放', '三味線・箏BGMとは独立して効果音を制御します');
    } else {
      showToast('🔇 効果音（SFX）のみを消音しました', '三味線・箏の背景絃楽（BGM）はそのまま維持されます');
    }
  });

  // Ukiyo-e Woodblock Post-Processing Filter Toggle
  const ukiyoeBtn = document.getElementById('btn-ukiyoe-filter');
  const syncUkiyoeBtn = stats => {
    if (!ukiyoeBtn || !stats) return;
    ukiyoeBtn.dataset.mode = stats.mode;
    if (stats.mode === 'nishikie') {
      ukiyoeBtn.textContent = '🖌️ 版画: 錦絵摺';
    } else if (stats.mode === 'sumizuri') {
      ukiyoeBtn.textContent = '🖋️ 版画: 墨摺絵';
    } else {
      ukiyoeBtn.textContent = '🧊 版画: 原画3D';
    }
  };
  const triggerCycleUkiyoe = () => {
    unlockAudioOnce();
    if (!tabletop) return;
    const stats = tabletop.cycleUkiyoeFilterMode();
    syncUkiyoeBtn(stats);
    audio.paper();
    if (stats.mode === 'nishikie') {
      showStamp('錦絵木版摺', '墨線輪郭検出＋奉書紙・馬連肌理');
      showToast('🖌️ 浮世絵濾鏡「錦絵摺」を適用', '墨線エッジ検出と奉書紙・馬連摺りテクスチャで3D盤面を木版画化');
    } else if (stats.mode === 'sumizuri') {
      showStamp('墨摺重墨版', '太墨の主版輪郭と古和紙摺り');
      showToast('🖋️ 浮世絵濾鏡「墨摺絵・紅摺絵」を適用', '主版の太墨エッジと古和紙の繊維・かすれを強調した古典版画表現');
    } else {
      showStamp('原画立体表示', '木版シェーダー解除');
      showToast('🧊 浮世絵濾鏡を解除（原画3D）', '後期処理フィルターをオフにし、標準3Dライティングを表示中');
    }
  };
  ukiyoeBtn?.addEventListener('click', triggerCycleUkiyoe);
  window.__syncUkiyoeBtn = syncUkiyoeBtn;

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
      if (G.screen === 'PLAYING' && G.phase === 'ROLL' && isSideControlledByHuman(G.match?.turn)) {
        startRoll();
      }
    } else if (e.code === 'KeyH') {
      toggleDock();
    } else if (e.code === 'KeyU') {
      triggerCycleUkiyoe();
    } else if (e.code === 'KeyM') {
      toggleBgmControl();
    } else if (e.code === 'Escape') {
      if (loupeModal && !loupeModal.classList.contains('hidden')) {
        loupeModal.classList.add('hidden');
      } else if (G.showCharmPicker) {
        G.showCharmPicker = false;
        syncHudDOM();
      } else if (G.showHandPicker) {
        G.showHandPicker = false;
        syncHudDOM();
      } else if (G.showGallery) {
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
    frameId = window.setTimeout(cb, 28);
    return;
  }
  const gl = tabletop.renderer.getContext();
  if (!gl || typeof gl.fenceSync !== 'function') {
    frameId = window.setTimeout(cb, 28);
    return;
  }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (state === gl.UNSIGNALED) {
      frameId = window.setTimeout(poll, 4);
    } else {
      if (sync) gl.deleteSync(sync);
      frameId = window.setTimeout(cb, 24);
    }
  };
  frameId = window.setTimeout(poll, 4);
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
  const handCard = currentHandCard();
  if (G.match) syncDerivedHudFromMatch(G.match);
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
    ply: G.match?.ply ?? 0,
    maxPly: G.match?.maxPly ?? 80,
    pos: G.match ? [...G.match.pos] : [],
    tokens: G.match ? [...G.match.tokens] : [],
    skip: G.match ? [...G.match.skip] : [],
    winner: G.match?.winner ?? -1,
    resultReason: G.match?.resultReason ?? null,
    pendingChoice: G.match?.pendingChoice ? { ...G.match.pendingChoice } : null,
    events: Array.isArray(G.match?.events) ? [...G.match.events] : [],
    boardState: G.match?.boardState ? JSON.parse(JSON.stringify(G.match.boardState)) : null,
    aiDifficulty: G.aiDifficulty,
    mode: G.mode,
    lanterns: G.yokaiLanterns,
    previewTargets: board.id === 'yokai' && G.match
      ? [1, 2, 3, 4, 5, 6].map(roll => EsugorokuCore.previewDestinations(board, G.match, roll)[0])
      : [],
    frenzy: G.yokaiFrenzy,
    kesshuPieces: G.kesshuPieces,
    genjiBalance: G.genjiBalance,
    charms: [...G.charms],
    customHandCard: G.customHandCard,
    customBuff: G.match?.customBuff ? { ...G.match.customBuff } : (handCard?.buff ? { ...handCard.buff } : null),
    isPreGame: isPreGameMatch(),
    collection: G.collection.size,
    achievements: G.achievements.size,
    statusText: G.statusText,
    statusSub: G.statusSub,
    diceValue: G.diceValue,
    dice: [G.physDice[0]].map(d => {
      const eulerCheck = evaluateDieTopFaceYXZ(d.rx, d.ry, d.rz);
      return {
        x: d.x,
        y: d.y,
        z: d.z,
        vx: d.vx,
        vy: d.vy,
        rx: Number(d.rx.toFixed(4)),
        ry: Number(d.ry.toFixed(4)),
        rz: Number(d.rz.toFixed(4)),
        settled: d.settled,
        settling: Boolean(d.settling),
        active: d.active,
        value: d.value,
        eulerTopFace: eulerCheck.topFace,
        eulerAlignmentDot: eulerCheck.alignmentDot,
        wallHits: d.wallHits || 0,
      };
    }),
    dieValue: G.diceValue,
    diceEffects: tabletop ? tabletop.getDiceEffectStats() : null,
    turnTransition: {
      ...(G.turnTransition || { count: 0, fromSide: 0, toSide: 0, direction: 'to-human', active: false }),
      threeD: tabletop ? tabletop.getTurnTransitionStats() : null,
    },
    ukiyoeFilter: tabletop ? tabletop.getUkiyoeFilterStats() : null,
    audioState: audio.getState(),
    effects: G.effects.length,
    deviceRect: { ...TUBE_RECT },
    boardRect: { x: 190, y: 68, w: 800, h: 660 },
  };
}

window.__ESR__ = {
  get state() { return G; },
  core: EsugorokuCore,
  boards: BOARDS,
  cards: UKIYOE_CARDS,
  charms: CHARMS,
  achievements: ACHIEVEMENTS,
  snapshot,
  switchToBoard(index) {
    const i = Math.max(0, Math.min(3, Number(index) | 0));
    G.boardIdx = i;
    G.screen = 'PLAYING';
    G.humanSide = 0;
    G.charms = sanitizeCharmLoadout(G.charms);
    lastSettlementUnlocks = null;
    resetMatchState();
    invalidateScene();
    G.match.turn = G.humanSide;
    G.phase = 'ROLL';
    G.aiTimer = 0;
    audio.setBgmBoard(BOARDS[i].id);
    if (tabletop && tabletop.builtBoardIdx !== i) tabletop.buildBoard(i);
    statusForTurn();
    syncHudDOM();
    return snapshot();
  },
  openSide(index) { openSide(Number(index) | 0); return snapshot(); },
  beginMatch() { beginMatch(); return snapshot(); },
  roll(value) { return startRoll(value ?? undefined); },
  applyRollNow(value, options = {}) {
    const board = currentBoard();
    const old = JSON.parse(JSON.stringify(G.match));
    const prevTurn = old.turn;
    const rollVal = Number(value) || 1;
    G.lastPreRollSnapshot = old;
    const result = EsugorokuCore.applyRoll(board, old, rollVal, options);
    G.match = result.state;
    G.phase = result.won || result.state.winner >= 0
      ? 'SETTLEMENT'
      : result.state.pendingChoice
        ? 'PENDING_CHOICE'
        : 'ROLL';
    G.diceValue = rollVal;
    G.dice[0] = rollVal;
    if (G.physDice[0]) {
      const t = targetRotation(rollVal, 0.25);
      G.physDice[0].value = rollVal;
      G.physDice[0].target = t;
      G.physDice[0].rx = t.rx;
      G.physDice[0].ry = t.ry;
      G.physDice[0].rz = t.rz;
      G.physDice[0].x = BOWL_2D_CENTER.x;
      G.physDice[0].y = BOWL_2D_CENTER.y;
      G.physDice[0].z = 0;
      G.physDice[0].settled = true;
      G.physDice[0].settling = false;
    }
    if (tabletop) {
      tabletop.update(0.05, performance.now() / 1000);
    }
    handleEvents(result, rollVal);
    if (G.phase === 'ROLL' && prevTurn !== G.match.turn) {
      triggerTurnPageTurn(prevTurn, G.match.turn);
      G.aiTimer = isSideControlledByHuman(G.match.turn) ? 0 : 0.85;
    }
    syncHudDOM();
    return snapshot();
  },
  applyChoice(action) {
    const res = submitTacticalChoice(action);
    return { ...res, snapshot: snapshot() };
  },
  applyCharm(charmId, options = {}) {
    const board = currentBoard();
    const res = EsugorokuCore.applyCharm(board, G.match, charmId, options);
    if (res.ok) {
      G.match = res.state;
      syncHudDOM();
    }
    return { ...res, snapshot: snapshot() };
  },
  setCharms(charmIds) {
    G.charms = sanitizeCharmLoadout(charmIds);
    if (isPreGameMatch()) {
      resetMatchState();
      invalidateScene();
    }
    saveProfile();
    syncHudDOM();
    return snapshot();
  },
  openCharmPicker(on = true) {
    G.showCharmPicker = Boolean(on);
    syncHudDOM();
    return snapshot();
  },
  setAiDifficulty(difficulty) {
    if (['easy', 'normal', 'hard', 'master'].includes(difficulty)) {
      G.aiDifficulty = difficulty;
      G.mode = 'ai';
      if (G.match) {
        G.match.aiDifficulty = difficulty;
        G.match.mode = 'ai';
      }
      saveProfile();
      syncHudDOM();
    }
    return snapshot();
  },
  setMode(mode) {
    G.mode = mode === 'local2p' ? 'local2p' : 'ai';
    if (G.match) G.match.mode = G.mode;
    saveProfile();
    syncHudDOM();
    return snapshot();
  },
  settleDiceNow() {
    const d = G.physDice[0];
    if (d && !d.settled) {
      const t = d.target || targetRotation(d.value || G.diceValue || 1, 0.25);
      d.rx = t.rx;
      d.ry = t.ry;
      d.rz = t.rz;
      d.x = BOWL_2D_CENTER.x;
      d.y = BOWL_2D_CENTER.y;
      d.z = 0;
      d.vx = 0;
      d.vy = 0;
      d.vz = 0;
      d.settled = true;
      d.settling = false;
      onActiveSettled(d.value || G.diceValue || 1);
      if (tabletop) tabletop.update(0.05, performance.now() / 1000);
    }
    return snapshot();
  },
  settleMove() {
    if (G.pieceAnim) finishMove();
    return snapshot();
  },
  setTurn(side) {
    const prevTurn = G.match?.turn ?? 0;
    G.match.turn = side;
    G.aiTimer = 0;
    if (prevTurn !== side) {
      triggerTurnPageTurn(prevTurn, side);
    }
    statusForTurn();
    syncHudDOM();
    return snapshot();
  },
  triggerPageTurn(fromSide = 0, toSide = 1) {
    triggerTurnPageTurn(fromSide, toSide);
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
    if (on) galleryRendered = false;
    syncHudDOM();
  },
  openHandPicker(on = true, filter = 'all') {
    G.showHandPicker = Boolean(on);
    G.handPickerFilter = filter;
    syncHudDOM();
    return snapshot();
  },
  equipCustomCard(cardId, restartMatch = false) {
    const res = equipCustomHandCard(cardId, { restartMatch });
    return { ...res, snapshot: snapshot() };
  },
  availableHandCards() {
    return UKIYOE_CARDS.filter(c => G.collection.has(c.id)).map(c => ({
      id: c.id,
      title: c.title,
      board: c.board,
      buff: c.buff,
    }));
  },
  strike() {
    return triggerTacticalStrike();
  },
  clickTile(nodeId) {
    unlockAudioOnce();
    const id = Math.max(0, Number(nodeId) || 0);
    G.hoverNode = id;
    const clack = audio.tileClack(id);
    if (tabletop) {
      const tg = tabletop.tileMeshes[id];
      if (tg) tg.userData.currentLift = Math.min(0.55, (tg.userData.currentLift || 0) + 0.16);
      tabletop.spawnTileRipple(id, '#f5cb5c');
    }
    syncHudDOM();
    return { nodeId: id, clack, audioState: audio.getState(), snapshot: snapshot() };
  },
  openLoupe(nodeIdx) {
    openLoupeModal(nodeIdx);
  },
  setUkiyoeFilter(mode) {
    if (!tabletop) return null;
    const stats = tabletop.setUkiyoeFilterMode(mode);
    if (window.__syncUkiyoeBtn) window.__syncUkiyoeBtn(stats);
    return stats;
  },
  triggerWallCollision(nx = 0.8, nz = -0.6, intensity = 1.2) {
    if (!tabletop) return null;
    const len = Math.hypot(nx, nz) || 1;
    tabletop.onBowlWallCollision(nx / len, nz / len, intensity, 0.45, G.diceValue || 1);
    return tabletop.getDiceEffectStats();
  },
  setBgm(on) {
    unlockAudioOnce();
    G.bgmEnabled = Boolean(on);
    audio.setBgmBoard(currentBoard().id);
    audio.setBgmEnabled(G.bgmEnabled);
    saveProfile();
    syncHudDOM();
    return audio.getState();
  },
  toggleBgm() {
    return this.setBgm(!audio.isBgmEnabled());
  },
  setSfx(on) {
    unlockAudioOnce();
    G.audioEnabled = Boolean(on);
    audio.setEnabled(G.audioEnabled);
    saveProfile();
    syncHudDOM();
    return audio.getState();
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
      audio.tileClack(nodeId);
      syncHudDOM();
    },
    () => {
      unlockAudioOnce();
      startRoll();
    },
  );
}

audio.setEnabled(G.audioEnabled);
audio.setBgmBoard(currentBoard().id);
audio.setBgmEnabled(G.bgmEnabled);
setupDOMControls();
loadAllPrints();
preloadUkiyoeSheets(() => {
  G.printsReadyTick = (G.printsReadyTick || 0) + 1;
  galleryRendered = false;
  if (G.showGallery) renderGalleryDOM();
  syncHudDOM();
});
window.__ESR__.switchToBoard(0);
document.body.classList.add('ready');
tick();
