// Tiny WebAudio synthesizer: wooden dice, washi cards, temple bells, wind.
let ac = null;
let master = null;
let enabled = true;

function ctx() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();
    master = ac.createGain();
    master.gain.value = 0.28;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function env(a, attack, decay, peak = 1) {
  const t = Number.isFinite(a.currentTime) ? a.currentTime : 0;
  if (!Number.isFinite(attack) || !Number.isFinite(decay)) return;
  a.gain.setValueAtTime(0.0001, t);
  a.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  a.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq, dur = 0.2, type = 'sine', vol = 0.18, slide = 0) {
  if (!enabled) return;
  if (![freq, dur, vol, slide].every(Number.isFinite)) return;
  const a = ctx();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), a.currentTime + dur);
  g.gain.value = 0;
  env(g, 0.01, dur, vol);
  o.connect(g).connect(master);
  o.start();
  o.stop(a.currentTime + dur + 0.04);
}

function noise(dur = 0.14, vol = 0.12, highpass = 700, lowpass = 5000) {
  if (!enabled) return;
  if (![dur, vol, highpass, lowpass].every(Number.isFinite)) return;
  const a = ctx();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buffer = a.createBuffer(1, len, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
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
  src.start();
}

export const audio = {
  setEnabled(on) {
    enabled = on;
  },
  isEnabled() {
    return enabled;
  },
  paper() {
    noise(0.16, 0.1, 1300, 6000);
    tone(260, 0.08, 'triangle', 0.04, -80);
  },
  select() {
    tone(520, 0.1, 'sine', 0.08, -60);
    tone(780, 0.12, 'sine', 0.05, 40);
  },
  shake() {
    noise(0.09, 0.11, 180, 1500);
    tone(110 + Math.random() * 40, 0.06, 'square', 0.03, -20);
  },
  throwDie() {
    noise(0.18, 0.17, 220, 2400);
    tone(190, 0.12, 'triangle', 0.07, -70);
  },
  bounce() {
    noise(0.05, 0.12, 1200, 5400);
    tone(340 + Math.random() * 120, 0.05, 'square', 0.04, -20);
  },
  step() {
    tone(620, 0.06, 'triangle', 0.04, -80);
  },
  jump() {
    tone(330, 0.2, 'sine', 0.09, 380);
    tone(660, 0.28, 'sine', 0.05, 220);
  },
  token() {
    tone(880, 0.25, 'sine', 0.09, 0);
    tone(1320, 0.35, 'sine', 0.06, 0);
  },
  stay() {
    tone(220, 0.26, 'triangle', 0.08, -60);
  },
  duel() {
    noise(0.2, 0.16, 400, 5000);
    tone(180, 0.18, 'sawtooth', 0.07, 120);
    tone(760, 0.16, 'square', 0.04, -100);
  },
  charm() {
    tone(1040, 0.45, 'sine', 0.08, 180);
    tone(1560, 0.6, 'sine', 0.04, 0);
  },
  lantern() {
    noise(0.22, 0.1, 500, 2800);
    tone(160, 0.4, 'sine', 0.06, -80);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => tone(f, 0.7, 'sine', 0.11, 0), i * 150);
    });
    setTimeout(() => tone(1568, 1.2, 'sine', 0.06, 0), 650);
  },
  lose() {
    [440, 392, 330, 262].forEach((f, i) => {
      setTimeout(() => tone(f, 0.55, 'triangle', 0.08, -10), i * 160);
    });
  },
  toggle() {
    tone(600, 0.16, 'sine', 0.08, 200);
  },
};
