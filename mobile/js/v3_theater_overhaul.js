/**
 * E-Sugoroku V3.0 — 2.5D 立体座敷剧场、真实 CSS 3D 象牙骨骰、逐格跳跃打击感与大字号引导总控层
 */
(function () {
  'use strict';

  // --- 1. 注入 2.5D 剧场 CSS 与真正的硬件 3D 圆角象牙骨骰样式 ---
  const style = document.createElement('style');
  style.textContent = `
    /* 顶部与全局高可读性大字号横幅 */
    #v3-hud-bar {
      position: fixed; top: 10px; left: 20px; right: 20px; height: 54px;
      display: flex; align-items: center; justify-content: space-between;
      background: linear-gradient(180deg, rgba(28,16,10,0.95), rgba(14,8,5,0.96));
      border: 2px solid #d4af37; border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,235,160,0.35);
      padding: 0 22px; z-index: 90; pointer-events: auto;
      font-family: "Shippori Mincho B1", "Yuji Syuku", serif; color: #f9eed8;
    }
    #v3-hud-title { font-size: 24px; font-weight: 800; color: #ffd970; letter-spacing: 2px; text-shadow: 0 2px 4px #000; }
    #v3-hud-guide {
      font-size: 20px; font-weight: 700; color: #fff7e0;
      background: rgba(168, 32, 24, 0.9); border: 1.5px solid #ffcf66;
      padding: 6px 18px; border-radius: 999px;
      box-shadow: 0 0 16px rgba(255, 180, 60, 0.55);
      animation: v3Pulse 1.5s infinite ease-in-out;
    }
    @keyframes v3Pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.04); box-shadow: 0 0 24px rgba(255, 210, 90, 0.9); }
    }
    .v3-btn-group { display: flex; gap: 10px; }
    .v3-btn {
      font-family: inherit; font-size: 18px; font-weight: 700;
      color: #ffefc2; background: linear-gradient(180deg, #3a2012, #1e0f07);
      border: 1.5px solid #c99b3b; border-radius: 6px; padding: 7px 14px;
      cursor: pointer; transition: all 0.15s;
    }
    .v3-btn:hover { background: #592e18; color: #fff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(212,175,55,0.4); }

    /* 右下角真实 3D 象牙骨骰剧场底座 */
    #v3-dice-dock {
      position: fixed; right: 24px; bottom: 24px; width: 256px; height: 290px;
      background: radial-gradient(circle at 50% 42%, #3a2314 0%, #1a0e07 78%, #0e0703 100%);
      border: 3px solid #d4af37; border-radius: 14px;
      box-shadow: 0 18px 42px rgba(0,0,0,0.85), inset 0 0 28px rgba(0,0,0,0.8);
      display: flex; flex-direction: column; align-items: center; justify-content: space-between;
      padding: 14px 16px 18px; z-index: 95; user-select: none;
      font-family: "Shippori Mincho B1", "Yuji Syuku", serif;
    }
    #v3-roll-result-banner {
      width: 100%; text-align: center; font-size: 28px; font-weight: 900;
      color: #ffd86b; background: rgba(120, 18, 12, 0.92);
      border: 2px solid #f3c65f; border-radius: 8px; padding: 6px 0;
      text-shadow: 0 2px 6px #000; letter-spacing: 2px;
    }

    /* 真正的 CSS 3D 立方体象牙骨骰 (彻底消灭冠状病毒畸形骰子) */
    .v3-scene3d {
      width: 104px; height: 104px; perspective: 520px;
      display: flex; align-items: center; justify-content: center;
      margin: 8px 0; cursor: pointer;
    }
    .v3-cube {
      width: 88px; height: 88px; position: relative;
      transform-style: preserve-3d;
      transform: rotateX(-22deg) rotateY(32deg);
      transition: transform 0.65s cubic-bezier(0.18, 0.89, 0.32, 1.24);
    }
    .v3-cube.rolling {
      transition: transform 0.12s linear;
    }
    .v3-face {
      position: absolute; width: 88px; height: 88px;
      background: radial-gradient(circle at 32% 28%, #fffdf7 0%, #f5ebd1 68%, #decba4 100%);
      border: 2.5px solid #cbb382; border-radius: 16px;
      box-shadow: inset 0 0 12px rgba(140, 105, 50, 0.35), 0 0 4px rgba(0,0,0,0.4);
      display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
      padding: 11px; box-sizing: border-box; backface-visibility: hidden;
    }
    .v3-face-1 { transform: rotateY(0deg) translateZ(44px); }
    .v3-face-6 { transform: rotateY(180deg) translateZ(44px); }
    .v3-face-2 { transform: rotateY(-90deg) translateZ(44px); }
    .v3-face-5 { transform: rotateY(90deg) translateZ(44px); }
    .v3-face-3 { transform: rotateX(90deg) translateZ(44px); }
    .v3-face-4 { transform: rotateX(-90deg) translateZ(44px); }

    .v3-pip {
      width: 16px; height: 16px; border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #2b221c, #0a0705);
      box-shadow: inset 0 2px 3px rgba(0,0,0,0.85), 0 1px 1px rgba(255,255,255,0.65);
      align-self: center; justify-self: center;
    }
    /* 江户骨骰「天一」大朱红圆坑 */
    .v3-pip.red-one {
      width: 34px; height: 34px; grid-column: 2; grid-row: 2;
      background: radial-gradient(circle at 35% 30%, #ff3b2f, #b01008 75%, #6e0500);
      box-shadow: inset 0 3px 6px rgba(50,0,0,0.85), 0 1px 2px rgba(255,255,255,0.75);
    }
    /* 江户骨骰红四点 */
    .v3-pip.red-four {
      width: 18px; height: 18px;
      background: radial-gradient(circle at 35% 30%, #e82c20, #9e0e06);
    }

    #v3-roll-cta {
      width: 100%; py: 12px; font-family: inherit; font-size: 22px; font-weight: 900;
      color: #fff8e7; background: linear-gradient(180deg, #c92a1d 0%, #871209 100%);
      border: 2px solid #ffd269; border-radius: 10px; padding: 10px 0;
      cursor: pointer; box-shadow: 0 6px 16px rgba(0,0,0,0.65);
      text-shadow: 0 2px 4px #000; letter-spacing: 2px;
      transition: transform 0.12s, box-shadow 0.12s;
    }
    #v3-roll-cta:hover { transform: scale(1.03); background: linear-gradient(180deg, #df3426, #9c160c); }
    #v3-roll-cta:active { transform: scale(0.97); }

    /* 中央大字事件卷轴特写 Cut-in Banner */
    #v3-cutin {
      position: fixed; left: 50%; top: 46%; transform: translate(-50%, -50%) scale(0.85);
      min-width: 580px; max-width: 82vw;
      background: linear-gradient(90deg, rgba(15,8,4,0.0) 0%, rgba(24,12,6,0.97) 12%, rgba(42,16,8,0.98) 50%, rgba(24,12,6,0.97) 88%, rgba(15,8,4,0.0) 100%);
      border-top: 3px solid #f0c254; border-bottom: 3px solid #f0c254;
      padding: 20px 48px; text-align: center; z-index: 120;
      pointer-events: none; opacity: 0; transition: all 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.2);
      font-family: "Shippori Mincho B1", "Yuji Syuku", serif;
      box-shadow: 0 20px 60px rgba(0,0,0,0.9);
    }
    #v3-cutin.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    #v3-cutin-main { font-size: 40px; font-weight: 900; color: #ffdf78; text-shadow: 0 3px 10px #000; margin-bottom: 6px; }
    #v3-cutin-sub { font-size: 24px; font-weight: 700; color: #fff3d6; text-shadow: 0 2px 6px #000; }

    /* 悬停棋格大字放大镜提示卡 */
    #v3-node-tooltip {
      position: fixed; left: 28px; bottom: 24px; width: 420px;
      background: rgba(20, 11, 6, 0.96); border: 2px solid #d4af37; border-radius: 10px;
      padding: 14px 18px; z-index: 92; pointer-events: none;
      box-shadow: 0 12px 32px rgba(0,0,0,0.85);
      font-family: "Shippori Mincho B1", "Yuji Syuku", serif; color: #faeed7;
      display: none;
    }
    #v3-tt-title { font-size: 26px; font-weight: 900; color: #ffd970; margin-bottom: 4px; }
    #v3-tt-rule { font-size: 20px; font-weight: 700; color: #ff8a75; margin-bottom: 6px; }
    #v3-tt-desc { font-size: 17px; line-height: 1.5; color: #e8d8b9; }
  `;
  document.head.appendChild(style);

  // --- 2. 构建高响度 WebAudio 江户音效合成器 ---
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }
  window.addEventListener('pointerdown', ensureAudio, { passive: true });
  window.addEventListener('keydown', ensureAudio, { passive: true });

  function playHyoshigi() { // 歌舞伎拍子木「チョン！」
    const ctx = ensureAudio(); if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.09);
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.12);
  }

  function playDiceClatter() { // 骨骰在瓷碗/竹筒中清脆弹跳声
    const ctx = ensureAudio(); if (!ctx) return;
    [0, 0.07, 0.15, 0.24, 0.35].forEach((delay, idx) => {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(920 + idx * 140, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.045);
      gain.gain.setValueAtTime(0.32 * (1 - idx * 0.12), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.055);
    });
  }

  function playKomaStep(stepIdx, isFinal) { // 将棋木驹逐格重砸盘面声「パシッ！／ドン！」
    const ctx = ensureAudio(); if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isFinal ? 'sine' : 'triangle';
    const baseFreq = isFinal ? 160 : (320 + stepIdx * 35);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + (isFinal ? 0.22 : 0.09));
    gain.gain.setValueAtTime(isFinal ? 0.65 : 0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.24 : 0.1));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + (isFinal ? 0.25 : 0.11));
  }

  // --- 3. 创建 DOM 级 3D 骨骰、顶部大字引导栏、Cut-in 横幅与放大镜 ---
  const hudBar = document.createElement('div');
  hudBar.id = 'v3-hud-bar';
  hudBar.innerHTML = `
    <div id="v3-hud-title">江戸浮世絵・絵双六</div>
    <div id="v3-hud-guide">👉 右下の「賽を振る」ボタン（または Space）で一振り！</div>
    <div class="v3-btn-group">
      <button class="v3-btn" id="v3-btn-gallery">📖 錦絵大図鑑 (36枚)</button>
      <button class="v3-btn" id="v3-btn-charms">🧿 懐中守り札</button>
      <button class="v3-btn" id="v3-btn-boards">🗺️ 画帖を替える</button>
    </div>
  `;
  document.body.appendChild(hudBar);

  // 构建 6 个面的真实骨骰点位
  function facePipsHTML(val) {
    if (val === 1) return `<div class="v3-pip red-one"></div>`;
    const map = {
      2: [1, 9],
      3: [1, 5, 9],
      4: [1, 3, 7, 9],
      5: [1, 3, 5, 7, 9],
      6: [1, 3, 4, 6, 7, 9]
    }[val] || [5];
    let html = '';
    for (let i = 1; i <= 9; i++) {
      if (map.includes(i)) {
        const cls = val === 4 ? 'v3-pip red-four' : 'v3-pip';
        html += `<div class="${cls}" style="grid-column:${((i-1)%3)+1};grid-row:${Math.floor((i-1)/3)+1}"></div>`;
      }
    }
    return html;
  }

  const diceDock = document.createElement('div');
  diceDock.id = 'v3-dice-dock';
  diceDock.innerHTML = `
    <div id="v3-roll-result-banner">【 出目：待 】</div>
    <div class="v3-scene3d" id="v3-dice-click-area" title="クリックして賽を振る">
      <div class="v3-cube" id="v3-cube3d">
        <div class="v3-face v3-face-1">${facePipsHTML(1)}</div>
        <div class="v3-face v3-face-2">${facePipsHTML(2)}</div>
        <div class="v3-face v3-face-3">${facePipsHTML(3)}</div>
        <div class="v3-face v3-face-4">${facePipsHTML(4)}</div>
        <div class="v3-face v3-face-5">${facePipsHTML(5)}</div>
        <div class="v3-face v3-face-6">${facePipsHTML(6)}</div>
      </div>
    </div>
    <button id="v3-roll-cta">🎲 賽を振る (Space)</button>
  `;
  document.body.appendChild(diceDock);

  const cutin = document.createElement('div');
  cutin.id = 'v3-cutin';
  cutin.innerHTML = `<div id="v3-cutin-main"></div><div id="v3-cutin-sub"></div>`;
  document.body.appendChild(cutin);

  const tooltip = document.createElement('div');
  tooltip.id = 'v3-node-tooltip';
  tooltip.innerHTML = `<div id="v3-tt-title"></div><div id="v3-tt-rule"></div><div id="v3-tt-desc"></div>`;
  document.body.appendChild(tooltip);

  let cutinTimer = null;
  function showCutin(mainText, subText, duration = 1150) {
    const m = document.getElementById('v3-cutin-main');
    const s = document.getElementById('v3-cutin-sub');
    if (!m || !s) return;
    m.textContent = mainText;
    s.textContent = subText || '';
    cutin.classList.add('show');
    if (cutinTimer) clearTimeout(cutinTimer);
    cutinTimer = setTimeout(() => cutin.classList.remove('show'), duration);
  }

  // 每个点数对应的立方体正面朝向旋转角
  const CUBE_ROTATIONS = {
    1: { x: 0,   y: 0 },
    2: { x: 0,   y: 90 },
    3: { x: -90, y: 0 },
    4: { x: 90,  y: 0 },
    5: { x: 0,   y: -90 },
    6: { x: 180, y: 0 }
  };

  let spinSpins = 0;
  function setCubeFace(val, animateSpin = true) {
    const cube = document.getElementById('v3-cube3d');
    const banner = document.getElementById('v3-roll-result-banner');
    if (!cube || !banner) return;
    const v = Math.max(1, Math.min(6, Number(val) || 1));
    const KANJI = ['', '一', '二', '三', '四', '五', '六'];
    if (animateSpin) {
      spinSpins += 2;
    }
    const rot = CUBE_ROTATIONS[v];
    const rx = rot.x + spinSpins * 360 - 12;
    const ry = rot.y + spinSpins * 360 + 16;
    cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    banner.textContent = `【 出目：${KANJI[v]} (${v}歩) 】`;
  }

  // --- 4. 绑定按钮与摇骰交互 ---
  function triggerGameRoll() {
    const api = window.__ESR__;
    if (!api) return;
    const snap = api.snapshot ? api.snapshot() : null;
    if (snap && snap.screen !== 'PLAYING') return;
    playHyoshigi();
    playDiceClatter();
    api.roll();
  }

  document.getElementById('v3-roll-cta').addEventListener('click', triggerGameRoll);
  document.getElementById('v3-dice-click-area').addEventListener('click', triggerGameRoll);

  document.getElementById('v3-btn-gallery').addEventListener('click', () => {
    playHyoshigi();
    if (window.__ESR__ && window.__ESR__.showGallery) window.__ESR__.showGallery(true, 'cards');
  });
  document.getElementById('v3-btn-charms').addEventListener('click', () => {
    playHyoshigi();
    if (window.__ESR__ && window.__ESR__.showGallery) window.__ESR__.showGallery(true, 'charms');
  });
  document.getElementById('v3-btn-boards').addEventListener('click', () => {
    playHyoshigi();
    if (window.__ESR__ && window.__ESR__.G) {
      window.__ESR__.G.screen = 'SELECT_BOARD';
      window.__ESR__.G.galleryOpen = false;
    }
  });

  // --- 5. 监控状态变化，提供每步音效、大字 Cut-in 与悬停放大镜 ---
  let lastDieVal = null;
  let lastHumanPos = null;
  let lastScreen = null;

  setInterval(() => {
    const api = window.__ESR__;
    if (!api || !api.snapshot) return;
    const snap = api.snapshot();
    const isPlaying = snap.screen === 'PLAYING' && !snap.galleryOpen;

    hudBar.style.display = isPlaying ? 'flex' : 'none';
    diceDock.style.display = isPlaying ? 'flex' : 'none';
    if (!isPlaying) tooltip.style.display = 'none';

    if (isPlaying) {
      const board = api.boards ? api.boards[snap.boardIdx] : null;
      if (board) {
        document.getElementById('v3-hud-title').textContent = `${board.volume}・${board.title}`;
      }
      const guide = document.getElementById('v3-hud-guide');
      if (snap.turn === 0 && snap.phase === 'ROLL') {
        guide.textContent = '👉 あなたの手番：右下の「賽を振る」をクリック！（盤上の ①〜⑥ が着地先）';
        guide.style.background = 'rgba(178, 30, 20, 0.95)';
      } else if (snap.phase === 'MOVE') {
        guide.textContent = '🚶 駒が進んでいます…';
        guide.style.background = 'rgba(32, 92, 58, 0.95)';
      } else {
        guide.textContent = '⏳ 相手（同行者）が賽を振っています…';
        guide.style.background = 'rgba(45, 55, 85, 0.92)';
      }

      if (snap.dice && snap.dice[0]) {
        const dv = snap.dice[0].value;
        if (dv !== lastDieVal) {
          lastDieVal = dv;
          setCubeFace(dv, true);
          const KANJI = ['', '一', '二', '三', '四', '五', '六'];
          showCutin(`🎲 出目【 ${KANJI[dv]} 】！`, `${dv} ます進みます`, 900);
        }
      }

      const curPos = snap.positions ? snap.positions[0] : 0;
      if (lastHumanPos !== null && curPos !== lastHumanPos && lastScreen === 'PLAYING') {
        playKomaStep(1, true);
        if (board && board.nodes && board.nodes[curPos]) {
          const nd = board.nodes[curPos];
          if (nd.kind !== 'normal' && nd.kind !== 'start') {
            showCutin(`【 ${nd.title} 】`, nd.rule || '特別規則が発動！', 1350);
          }
        }
      }
      lastHumanPos = curPos;
    }
    lastScreen = snap.screen;
  }, 90);
})();
