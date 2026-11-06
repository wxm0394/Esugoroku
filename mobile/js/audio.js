// Authentic Edo WebAudio Synthesizer & Ambient Shamisen/Koto BGM Engine:
import AssetManager from '../../assets/asset-manager.js';
// - Independent SFX Bus: Tactile hinoki wood clacks, bone dice on porcelain chawan, and taiko drums.
// - Independent BGM Bus: Traditional Japanese Shamisen (三味線) & 13-String Koto (箏) procedural compositions
//   tailored to each of the 4 Ukiyo-e volumes (Yo-sen, Miyako-bushi In-sen, Tsugaru Ritsu, Heian Hira-joshi).

let ac = null;
let sfxMaster = null;
let bgmMaster = null;

let sfxEnabled = true;
let bgmEnabled = true;
let lastStepIndex = 0;

let currentBgmBoardId = 'tokaido';
let bgmStepCursor = 0;
let bgmTimerId = null;
let bgmNotesPlayed = 0;
let lastPluckInstrument = 'koto';

// Traditional Japanese scales & 16-step compositions per board volume
export const BGM_THEMES = {
  tokaido: {
    id: 'tokaido',
    title: '東海道・三味線道中曲',
    scaleName: '陽旋法 (Yo-sen Pentatonic)',
    tempoMs: 420,
    // D4, E4, G4, A4, B4, D5, E5, G5, A5
    scale: [293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25, 783.99, 880.00],
    bass: [146.83, 196.00, 220.00, 146.83],
    // 16-step Koto melody index into scale (-1 = rest)
    kotoPattern:     [0, 2, 3, 5,  4, 3, 2, -1,  5, 6, 7, 5,  4, 2, 0, -1],
    // 16-step Shamisen counter-rhythm index into scale (-1 = rest)
    shamisenPattern: [0, -1, 2, 3,  -1, 4, 2, 0,  3, -1, 5, 4,  2, 3, 0, 2],
    oshideSteps: [3, 10],
    slideSteps: [5, 13],
  },
  yokai: {
    id: 'yokai',
    title: '百物語・都節夜想曲',
    scaleName: '都節・陰旋法 (Miyako-bushi In-sen)',
    tempoMs: 480,
    // D4, Eb4, G4, A4, Bb4, D5, Eb5, G5, A5
    scale: [293.66, 311.13, 392.00, 440.00, 466.16, 587.33, 622.25, 783.99, 880.00],
    bass: [146.83, 155.56, 196.00, 146.83],
    kotoPattern:     [0, 1, 2, -1,  4, 3, 1, 0,   5, 6, 4, -1,  3, 2, 1, -1],
    shamisenPattern: [-1, 0, -1, 2,  3, -1, 1, -1, 0, -1, 4, 3,  -1, 1, 0, -1],
    oshideSteps: [1, 6, 10],
    slideSteps: [4, 11],
  },
  kesshu: {
    id: 'kesshu',
    title: '武将決集・津軽三味線陣楽',
    scaleName: '律旋法・武士調 (Ritsu / Tsugaru Mode)',
    tempoMs: 360,
    // A3, B3, D4, E4, G4, A4, B4, D5, E5
    scale: [220.00, 246.94, 293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25],
    bass: [110.00, 146.83, 164.81, 110.00],
    kotoPattern:     [0, -1, 3, 5,  4, 3, 2, -1,  5, 7, 5, 3,   4, 2, 0, -1],
    shamisenPattern: [0, 0, 2, 3,   5, 3, 2, 0,   3, 3, 5, 7,   5, 3, 2, 0],
    oshideSteps: [3, 9],
    slideSteps: [2, 6, 10, 14],
  },
  genji: {
    id: 'genji',
    title: '源氏絵合・平調子箏曲',
    scaleName: '平調子・六段調 (Heian Hira-joshi)',
    tempoMs: 460,
    // B3, C4, E4, F#4, A4, B4, C5, E5, F#5
    scale: [246.94, 261.63, 329.63, 369.99, 440.00, 493.88, 523.25, 659.25, 739.99],
    bass: [123.47, 164.81, 185.00, 164.81],
    kotoPattern:     [0, 1, 2, 3,  5, 6, 5, 3,  2, 3, 5, 7,  6, 5, 2, -1],
    shamisenPattern: [0, -1, 2, -1, 3, -1, 2, 1, 0, -1, 3, -1, 5, 3, 2, -1],
    oshideSteps: [5, 11],
    slideSteps: [7, 13],
  },
};

export function getBgmTheme(boardId = 'tokaido') {
  return BGM_THEMES[boardId] || BGM_THEMES.tokaido;
}

export function computeBgmStepNotes(boardId = 'tokaido', stepIndex = 0) {
  const theme = getBgmTheme(boardId);
  const step = ((stepIndex % 16) + 16) % 16;
  const kotoIdx = theme.kotoPattern[step];
  const shamisenIdx = theme.shamisenPattern[step];
  const bassFreq = step % 4 === 0 ? theme.bass[(step / 4) % theme.bass.length | 0] : null;

  return {
    themeId: theme.id,
    step,
    kotoFreq: kotoIdx >= 0 ? theme.scale[kotoIdx % theme.scale.length] : null,
    shamisenFreq: shamisenIdx >= 0 ? theme.scale[shamisenIdx % theme.scale.length] : null,
    bassFreq,
    hasOshide: theme.oshideSteps.includes(step),
    hasSlide: theme.slideSteps.includes(step),
  };
}

let userUnlocked = false;

function ctx() {
  if (typeof window === 'undefined' || !userUnlocked) return null;
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();

    sfxMaster = ac.createGain();
    sfxMaster.gain.value = sfxEnabled ? 0.48 : 0.0001;
    sfxMaster.connect(ac.destination);

    bgmMaster = ac.createGain();
    bgmMaster.gain.value = bgmEnabled ? 0.34 : 0.0001;
    bgmMaster.connect(ac.destination);
  }
  if (ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
  return ac;
}

function syncBusGains() {
  if (!ac) return;
  const now = ac.currentTime;
  if (sfxMaster) {
    sfxMaster.gain.cancelScheduledValues(now);
    sfxMaster.gain.setTargetAtTime(sfxEnabled ? 0.48 : 0.0001, now, 0.02);
  }
  if (bgmMaster) {
    bgmMaster.gain.cancelScheduledValues(now);
    bgmMaster.gain.setTargetAtTime(bgmEnabled ? 0.34 : 0.0001, now, 0.04);
  }
}

function env(gainNode, t0, attack, decay, peak = 1) {
  const t = Number.isFinite(t0) ? t0 : 0;
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0005, peak), t + Math.max(0.002, attack));
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.002, attack) + Math.max(0.01, decay));
}

/* ------------------------------------------------------------------ */
/* SFX Synthesizer Primitives (Routed to sfxMaster)                   */
/* ------------------------------------------------------------------ */

function tone(freq, dur = 0.2, type = 'sine', vol = 0.22, slide = 0, delay = 0) {
  if (!sfxEnabled) return;
  if (![freq, dur, vol, slide, delay].every(Number.isFinite)) return;
  const a = ctx();
  if (!a || !sfxMaster) return;
  const t0 = a.currentTime + Math.max(0, delay);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (slide) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  }
  env(g, t0, 0.006, dur, vol);
  o.connect(g).connect(sfxMaster);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function woodClack(pitch = 680, vol = 0.34, delay = 0) {
  if (!sfxEnabled) return;
  const a = ctx();
  if (!a || !sfxMaster) return;
  const t0 = a.currentTime + Math.max(0, delay);

  // Resonant hinoki wood body
  const o1 = a.createOscillator();
  const o2 = a.createOscillator();
  const g = a.createGain();
  o1.type = 'triangle';
  o2.type = 'sine';
  o1.frequency.setValueAtTime(pitch, t0);
  o1.frequency.exponentialRampToValueAtTime(pitch * 0.48, t0 + 0.055);
  o2.frequency.setValueAtTime(pitch * 1.58, t0);
  o2.frequency.exponentialRampToValueAtTime(pitch * 0.85, t0 + 0.04);

  env(g, t0, 0.002, 0.065, vol);
  o1.connect(g);
  o2.connect(g);
  g.connect(sfxMaster);
  o1.start(t0);
  o2.start(t0);
  o1.stop(t0 + 0.08);
  o2.stop(t0 + 0.08);

  // Crisp transient click
  noise(0.025, vol * 0.65, 1400, 6200, delay);
}

let lastSfx = null;
let lastTileClackInfo = null;

export function tileWoodClack(nodeId = 0, volOverride = null) {
  const vol = volOverride !== null && Number.isFinite(volOverride)
    ? Math.max(0.04, Math.min(0.40, volOverride))
    : 0.20;
  // Natural micro-pitch variation per board tile (475Hz - 559Hz warm hinoki wood resonance)
  const pitch = 475 + (((Number(nodeId) || 0) % 7) * 14);
  lastSfx = 'tileClack';
  lastTileClackInfo = {
    nodeId: Number(nodeId) || 0,
    pitch,
    vol,
    timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  };

  if (!sfxEnabled) return { played: false, reason: 'sfx_disabled', pitch, vol };
  const a = ctx();
  if (!a || !sfxMaster) return { played: true, pitch, vol, synthesized: false };

  const t0 = a.currentTime;
  const o1 = a.createOscillator();
  const o2 = a.createOscillator();
  const g = a.createGain();

  // Primary resonant wood body (decay ~42ms)
  o1.type = 'triangle';
  o2.type = 'sine';
  o1.frequency.setValueAtTime(pitch, t0);
  o1.frequency.exponentialRampToValueAtTime(pitch * 0.52, t0 + 0.038);
  o2.frequency.setValueAtTime(pitch * 1.95, t0);
  o2.frequency.exponentialRampToValueAtTime(pitch * 0.90, t0 + 0.028);

  env(g, t0, 0.0012, 0.042, vol);
  o1.connect(g);
  o2.connect(g);
  g.connect(sfxMaster);

  o1.start(t0);
  o2.start(t0);
  o1.stop(t0 + 0.055);
  o2.stop(t0 + 0.055);

  // Soft, warm transient wood tap (bandpass 1100Hz - 3600Hz, avoids harsh digital click)
  noise(0.015, vol * 0.32, 1100, 3600, 0);

  return { played: true, pitch, vol, synthesized: true };
}

function noise(dur = 0.12, vol = 0.16, highpass = 700, lowpass = 5200, delay = 0) {
  if (!sfxEnabled) return;
  if (![dur, vol, highpass, lowpass, delay].every(Number.isFinite)) return;
  const a = ctx();
  if (!a || !sfxMaster) return;
  const t0 = a.currentTime + Math.max(0, delay);
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buffer = a.createBuffer(1, len, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const fade = Math.pow(1 - i / len, 1.8);
    data[i] = (Math.random() * 2 - 1) * fade;
  }
  const src = a.createBufferSource();
  src.buffer = buffer;
  const hp = a.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = highpass;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lowpass;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(hp).connect(lp).connect(g).connect(sfxMaster);
  src.start(t0);
}

/* ------------------------------------------------------------------ */
/* Traditional Japanese String Synthesizer (Routed to bgmMaster)      */
/* ------------------------------------------------------------------ */

// 13-String Paulownia Koto (箏) with ivory Tsume pick transient & Oshide pitch bend
function playKotoPluck(freq, dur = 0.82, vol = 0.22, delay = 0, oshideBend = false) {
  if (!bgmEnabled) return;
  const a = ctx();
  if (!a || !bgmMaster) return;
  const t0 = a.currentTime + Math.max(0, delay);

  const bodyFilter = a.createBiquadFilter();
  bodyFilter.type = 'lowpass';
  bodyFilter.frequency.setValueAtTime(Math.min(7200, freq * 6.0), t0);
  bodyFilter.frequency.exponentialRampToValueAtTime(Math.max(480, freq * 1.85), t0 + dur);
  bodyFilter.Q.value = 1.6;

  const outGain = a.createGain();
  env(outGain, t0, 0.005, dur, vol);
  bodyFilter.connect(outGain).connect(bgmMaster);

  // Fundamental silk string + 2nd & 3rd paulownia body harmonics
  const o1 = a.createOscillator();
  const o2 = a.createOscillator();
  const o3 = a.createOscillator();
  const g2 = a.createGain();
  const g3 = a.createGain();

  o1.type = 'triangle';
  o2.type = 'sine';
  o3.type = 'sine';
  g2.gain.value = 0.36;
  g3.gain.value = 0.14;

  o1.frequency.setValueAtTime(freq, t0);
  o2.frequency.setValueAtTime(freq * 2, t0);
  o3.frequency.setValueAtTime(freq * 3, t0);

  // Oshide (押し手): expressive left-hand string press raising pitch ~1 semitone mid-sustain
  if (oshideBend) {
    const bendRatio = 1.05946;
    o1.frequency.setValueAtTime(freq, t0 + 0.09);
    o1.frequency.exponentialRampToValueAtTime(freq * bendRatio, t0 + 0.24);
    o1.frequency.exponentialRampToValueAtTime(freq, t0 + 0.48);
    o2.frequency.setValueAtTime(freq * 2, t0 + 0.09);
    o2.frequency.exponentialRampToValueAtTime(freq * 2 * bendRatio, t0 + 0.24);
  }

  o1.connect(bodyFilter);
  o2.connect(g2).connect(bodyFilter);
  o3.connect(g3).connect(bodyFilter);

  o1.start(t0);
  o2.start(t0);
  o3.start(t0);
  o1.stop(t0 + dur + 0.04);
  o2.stop(t0 + dur + 0.04);
  o3.stop(t0 + dur + 0.04);
  bgmNotesPlayed++;
  lastPluckInstrument = 'koto';
}

// Edo Shamisen (三味線) with Bachi skin-snap transient, nasal formant, Sawari buzz & Suri neck slide
function playShamisenPluck(freq, dur = 0.46, vol = 0.20, delay = 0, suriSlide = false) {
  if (!bgmEnabled) return;
  const a = ctx();
  if (!a || !bgmMaster) return;
  const t0 = a.currentTime + Math.max(0, delay);

  // Shamisen dou (胴) skin-membrane resonant formant around 1100-1450 Hz
  const formant = a.createBiquadFilter();
  formant.type = 'bandpass';
  formant.frequency.setValueAtTime(Math.min(2400, Math.max(680, freq * 2.6)), t0);
  formant.Q.value = 1.35;

  const outGain = a.createGain();
  env(outGain, t0, 0.003, dur, vol);
  formant.connect(outGain).connect(bgmMaster);

  const oMain = a.createOscillator();
  const oSawari = a.createOscillator();
  const gSawari = a.createGain();

  oMain.type = 'sawtooth';
  oSawari.type = 'triangle';
  // Sawari (さわり): characteristic sympathetic buzz harmonic
  gSawari.gain.setValueAtTime(0.28, t0);
  gSawari.gain.exponentialRampToValueAtTime(0.02, t0 + dur * 0.85);

  const startFreq = suriSlide ? freq * 0.8909 : freq;
  oMain.frequency.setValueAtTime(startFreq, t0);
  oSawari.frequency.setValueAtTime(startFreq * 1.004, t0);
  if (suriSlide) {
    oMain.frequency.exponentialRampToValueAtTime(freq, t0 + 0.085);
    oSawari.frequency.exponentialRampToValueAtTime(freq * 1.004, t0 + 0.085);
  }

  oMain.connect(formant);
  oSawari.connect(gSawari).connect(formant);

  oMain.start(t0);
  oSawari.start(t0);
  oMain.stop(t0 + dur + 0.04);
  oSawari.stop(t0 + dur + 0.04);

  // Bachi (撥) plectrum strike against the shamisen skin
  const clickLen = Math.max(1, Math.floor(a.sampleRate * 0.018));
  const buf = a.createBuffer(1, clickLen, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < clickLen; i++) {
    d[i] = (Math.random() * 2 - 1) * (1 - i / clickLen);
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1850;
  const cg = a.createGain();
  cg.gain.value = vol * 0.45;
  src.connect(bp).connect(cg).connect(bgmMaster);
  src.start(t0);

  bgmNotesPlayed++;
  lastPluckInstrument = 'shamisen';
}

function tickBgmStep() {
  if (!bgmEnabled) return;
  const a = ctx();
  if (!a) return;

  const stepInfo = computeBgmStepNotes(currentBgmBoardId, bgmStepCursor);
  bgmStepCursor = (bgmStepCursor + 1) % 16;

  // Low Koto bass string fifth on downbeats
  if (stepInfo.bassFreq) {
    playKotoPluck(stepInfo.bassFreq, 1.25, 0.16, 0, false);
  }
  // Lead 13-string Koto melody note
  if (stepInfo.kotoFreq) {
    playKotoPluck(stepInfo.kotoFreq, 0.78, 0.19, 0.01, stepInfo.hasOshide);
    // Occasional delicate Koto octave grace note on step 0 or 8
    if (stepInfo.step === 0 || stepInfo.step === 8) {
      playKotoPluck(stepInfo.kotoFreq * 1.5, 0.52, 0.10, 0.14, false);
    }
  }
  // Interlocking Shamisen pluck
  if (stepInfo.shamisenFreq) {
    const shamisenDelay = stepInfo.kotoFreq ? 0.19 : 0.02;
    playShamisenPluck(stepInfo.shamisenFreq, 0.42, 0.17, shamisenDelay, stepInfo.hasSlide);
  }
}

function restartBgmScheduler() {
  if (typeof window === 'undefined') return;
  if (bgmTimerId !== null) {
    window.clearInterval(bgmTimerId);
    bgmTimerId = null;
  }
  if (!bgmEnabled) return;
  const theme = getBgmTheme(currentBgmBoardId);
  bgmTimerId = window.setInterval(tickBgmStep, theme.tempoMs);
}

// Japanese Yo-scale pentatonic frequencies: D4, E4, G4, A4, B4, D5, E5, G5, A5
const YO_SCALE = [293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25, 783.99, 880.00];

export const audio = {
  // SFX Controls (Independent of BGM)
  setEnabled(on) {
    sfxEnabled = !!on;
    if (sfxEnabled) ctx();
    syncBusGains();
  },
  isEnabled() {
    return sfxEnabled;
  },

  // BGM Controls (Independent of SFX)
  setBgmEnabled(on) {
    bgmEnabled = !!on;
    if (bgmEnabled) {
      ctx();
      syncBusGains();
      restartBgmScheduler();
      tickBgmStep();
    } else {
      syncBusGains();
      if (bgmTimerId !== null && typeof window !== 'undefined') {
        window.clearInterval(bgmTimerId);
        bgmTimerId = null;
      }
    }
    return bgmEnabled;
  },
  isBgmEnabled() {
    return bgmEnabled;
  },
  toggleBgm() {
    return this.setBgmEnabled(!bgmEnabled);
  },
  setBgmBoard(boardId) {
    const nextId = BGM_THEMES[boardId] ? boardId : 'tokaido';
    const changed = nextId !== currentBgmBoardId;
    currentBgmBoardId = nextId;
    if (changed) {
      bgmStepCursor = 0;
      if (bgmEnabled) {
        restartBgmScheduler();
      }
    }
    return getBgmTheme(currentBgmBoardId);
  },
  getState() {
    const theme = getBgmTheme(currentBgmBoardId);
    return {
      sfxEnabled,
      sfxMuted: !sfxEnabled,
      bgmEnabled,
      bgmMuted: !bgmEnabled,
      bgmPlaying: bgmEnabled && bgmTimerId !== null,
      bgmBoardId: currentBgmBoardId,
      bgmTitle: theme.title,
      bgmScale: theme.scaleName,
      bgmTempoMs: theme.tempoMs,
      bgmStepCursor,
      bgmNotesPlayed,
      lastPluckInstrument,
      lastSfx,
      lastTileClack: lastTileClackInfo,
      instruments: ['koto', 'shamisen'],
    };
  },

  unlock() {
    const firstUnlock = !userUnlocked;
    userUnlocked = true;
    const a = ctx();
    syncBusGains();
    if (bgmEnabled) {
      if (bgmTimerId === null) restartBgmScheduler();
      if (firstUnlock) tickBgmStep();
    }
    return a;
  },
  // Subtle wood-on-wood 'clack' for 3D board tile clicks
  tileClack(nodeId = 0, vol = null) {
    return tileWoodClack(nodeId, vol);
  },
  woodTileClack(nodeId = 0, vol = null) {
    return tileWoodClack(nodeId, vol);
  },
  paper() {
    lastSfx = 'paper';
    noise(0.11, 0.14, 1500, 6800);
    tone(320, 0.07, 'triangle', 0.08, -90);
  },
  select() {
    lastSfx = 'select';
    woodClack(740, 0.25, 0);
    tone(587.33, 0.11, 'sine', 0.14, 60, 0.02);
  },
  shake() {
    for (let i = 0; i < 4; i++) {
      const d = i * 0.055;
      woodClack(820 + (i % 2) * 190 + Math.random() * 80, 0.24, d);
    }
  },
  throwDie() {
    lastStepIndex = 0;
    noise(0.14, 0.22, 320, 3200, 0);
    tone(210, 0.11, 'triangle', 0.16, -80, 0);
    woodClack(1120, 0.32, 0.06);
    tone(1480, 0.12, 'sine', 0.14, -120, 0.06);
  },
  bounce(intensity = 1) {
    const v = Math.max(0.08, Math.min(0.36, 0.28 * intensity));
    const p = 980 + Math.random() * 340;
    woodClack(p, v, 0);
    tone(p * 1.9, 0.08, 'sine', v * 0.45, -40, 0);
  },
  wallHit(intensity = 1) {
    const v = Math.max(0.12, Math.min(0.45, 0.34 * intensity));
    const ringFreq = 1320 + Math.random() * 420;
    woodClack(860 + Math.random() * 220, v, 0);
    tone(ringFreq, 0.16, 'sine', v * 0.62, -65, 0);
    tone(ringFreq * 1.62, 0.11, 'triangle', v * 0.35, -30, 0.008);
    noise(0.045, v * 0.42, 1800, 6800, 0);
  },
  soulBurst(value = 1) {
    const isHeavenOne = value === 1;
    const base = isHeavenOne ? 587.33 : YO_SCALE[(value - 1) % YO_SCALE.length];
    noise(0.16, 0.18, 600, 4200, 0);
    tone(base, 0.28, 'sine', 0.20, 40, 0);
    tone(base * 1.5, 0.34, 'triangle', 0.15, 80, 0.035);
    if (isHeavenOne || value === 6) {
      tone(base * 2, 0.42, 'sine', 0.16, 120, 0.07);
    }
  },
  step(stepIdx = null) {
    const idx = stepIdx !== null ? stepIdx : lastStepIndex++;
    const scaleNote = YO_SCALE[idx % YO_SCALE.length];
    woodClack(540 + (idx % 6) * 45, 0.36, 0);
    tone(scaleNote, 0.12, 'triangle', 0.14, 0, 0.01);
  },
  jump() {
    woodClack(420, 0.35, 0);
    [293.66, 392.00, 493.88, 587.33, 783.99].forEach((f, i) => {
      tone(f, 0.22, 'triangle', 0.18, 15, i * 0.045);
    });
  },
  token() {
    tone(880, 0.28, 'sine', 0.22, 0, 0);
    tone(1318.5, 0.36, 'sine', 0.18, 0, 0.06);
    tone(1760, 0.45, 'sine', 0.14, 0, 0.12);
  },
  stay() {
    tone(196, 0.55, 'sine', 0.26, -18, 0);
    tone(392, 0.35, 'triangle', 0.12, -12, 0.02);
  },
  duel() {
    tone(110, 0.28, 'sine', 0.34, -45, 0);
    noise(0.18, 0.26, 1800, 7500, 0.02);
    tone(1240, 0.18, 'sawtooth', 0.14, -320, 0.02);
  },
  charm() {
    [587.33, 880, 1174.66].forEach((f, i) => {
      tone(f, 0.36, 'sine', 0.18, 20, i * 0.05);
    });
  },
  lantern() {
    noise(0.24, 0.18, 450, 2600, 0);
    tone(220, 0.42, 'sine', 0.16, -90, 0);
  },
  win() {
    tone(98, 0.38, 'sine', 0.36, -30, 0);
    tone(98, 0.38, 'sine', 0.36, -30, 0.22);
    [293.66, 392.00, 440.00, 587.33, 783.99, 880.00].forEach((f, i) => {
      tone(f, 0.55, 'triangle', 0.22, 0, 0.12 + i * 0.11);
      tone(f * 2, 0.45, 'sine', 0.09, 0, 0.12 + i * 0.11);
    });
  },
  lose() {
    [440, 392, 329.63, 293.66].forEach((f, i) => {
      tone(f, 0.48, 'triangle', 0.18, -12, i * 0.15);
    });
  },
  toggle() {
    woodClack(680, 0.28, 0);
    tone(587.33, 0.18, 'sine', 0.16, 120, 0.03);
  },
  bgmPreviewFlourish() {
    // Immediate Shamisen + Koto chord flourish when BGM is toggled ON
    const theme = getBgmTheme(currentBgmBoardId);
    playShamisenPluck(theme.scale[0], 0.38, 0.22, 0, true);
    playKotoPluck(theme.scale[2], 0.65, 0.22, 0.07, false);
    playKotoPluck(theme.scale[4], 0.85, 0.24, 0.14, true);
  },
};
