// Authentic Edo WebAudio Synthesizer:
// Tactile hinoki wood clacks, bone dice on porcelain chawan, shamisen/koto Yo-scale plucks, and taiko drums.

let ac = null;
let master = null;
let enabled = true;
let lastStepIndex = 0;

function ctx() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();
    master = ac.createGain();
    master.gain.value = 0.48;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
  return ac;
}

function env(gainNode, t0, attack, decay, peak = 1) {
  const t = Number.isFinite(t0) ? t0 : 0;
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0005, peak), t + Math.max(0.002, attack));
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.002, attack) + Math.max(0.01, decay));
}

function tone(freq, dur = 0.2, type = 'sine', vol = 0.22, slide = 0, delay = 0) {
  if (!enabled) return;
  if (![freq, dur, vol, slide, delay].every(Number.isFinite)) return;
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime + Math.max(0, delay);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (slide) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  }
  env(g, t0, 0.006, dur, vol);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function woodClack(pitch = 680, vol = 0.34, delay = 0) {
  if (!enabled) return;
  const a = ctx();
  if (!a) return;
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
  g.connect(master);
  o1.start(t0);
  o2.start(t0);
  o1.stop(t0 + 0.08);
  o2.stop(t0 + 0.08);

  // Crisp transient click
  noise(0.025, vol * 0.65, 1400, 6200, delay);
}

function noise(dur = 0.12, vol = 0.16, highpass = 700, lowpass = 5200, delay = 0) {
  if (!enabled) return;
  if (![dur, vol, highpass, lowpass, delay].every(Number.isFinite)) return;
  const a = ctx();
  if (!a) return;
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
  src.connect(hp).connect(lp).connect(g).connect(master);
  src.start(t0);
}

// Japanese Yo-scale pentatonic frequencies: D4, E4, G4, A4, B4, D5, E5, G5, A5
const YO_SCALE = [293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25, 783.99, 880.00];

export const audio = {
  setEnabled(on) {
    enabled = !!on;
    if (enabled) ctx();
  },
  isEnabled() {
    return enabled;
  },
  unlock() {
    ctx();
  },
  paper() {
    noise(0.11, 0.14, 1500, 6800);
    tone(320, 0.07, 'triangle', 0.08, -90);
  },
  select() {
    woodClack(740, 0.25, 0);
    tone(587.33, 0.11, 'sine', 0.14, 60, 0.02);
  },
  shake() {
    // Multi-grain bamboo cup rattle
    for (let i = 0; i < 4; i++) {
      const d = i * 0.055;
      woodClack(820 + (i % 2) * 190 + Math.random() * 80, 0.24, d);
    }
  },
  throwDie() {
    lastStepIndex = 0;
    // Cup whoosh + initial porcelain bowl impact
    noise(0.14, 0.22, 320, 3200, 0);
    tone(210, 0.11, 'triangle', 0.16, -80, 0);
    woodClack(1120, 0.32, 0.06);
    tone(1480, 0.12, 'sine', 0.14, -120, 0.06);
  },
  bounce(intensity = 1) {
    const v = Math.max(0.08, Math.min(0.36, 0.28 * intensity));
    // Bone die striking porcelain bowl (clear high ring + bone click)
    const p = 980 + Math.random() * 340;
    woodClack(p, v, 0);
    tone(p * 1.9, 0.08, 'sine', v * 0.45, -40, 0);
  },
  step(stepIdx = null) {
    const idx = stepIdx !== null ? stepIdx : lastStepIndex++;
    const scaleNote = YO_SCALE[idx % YO_SCALE.length];
    // Tactile hinoki pawn hop clack + subtle koto harmonic
    woodClack(540 + (idx % 6) * 45, 0.36, 0);
    tone(scaleNote, 0.12, 'triangle', 0.14, 0, 0.01);
  },
  jump() {
    // Shamisen/Koto upward glissando + tsuzumi drum
    woodClack(420, 0.35, 0);
    [293.66, 392.00, 493.88, 587.33, 783.99].forEach((f, i) => {
      tone(f, 0.22, 'triangle', 0.18, 15, i * 0.045);
    });
  },
  token() {
    // Shrine bell chime
    tone(880, 0.28, 'sine', 0.22, 0, 0);
    tone(1318.5, 0.36, 'sine', 0.18, 0, 0.06);
    tone(1760, 0.45, 'sine', 0.14, 0, 0.12);
  },
  stay() {
    // Deep temple bronze bell
    tone(196, 0.55, 'sine', 0.26, -18, 0);
    tone(392, 0.35, 'triangle', 0.12, -12, 0.02);
  },
  duel() {
    // Taiko strike + katana clash
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
    // Edo festival Taiko + Yo-scale Koto fanfare
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
};
