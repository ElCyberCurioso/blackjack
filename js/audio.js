// Sonidos sintetizados con Web Audio: no hay archivos de audio que descargar.
let ctx = null;
let enabled = true;
let volume = 0.6;

export function configureAudio({ sound, volume: v }) { enabled = !!sound; volume = typeof v === 'number' ? v : 0.6; }

function ac() {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (_) { return null; }
}

// Llamar desde un gesto del usuario para desbloquear el audio en móviles.
export function unlockAudio() { ac(); }

function noise(c, dur, { freq = 2500, q = 0.8, gain = 0.25, when = 0, type = 'bandpass' } = {}) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain * volume;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + when);
}

function tone(c, freq, dur, { gain = 0.15, when = 0, type = 'sine' } = {}) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t = c.currentTime + when;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

let lastCard = 0;
export const sfx = {
  card() {
    const c = ac(); if (!c) return;
    const now = performance.now();
    if (now - lastCard < 35) return;
    lastCard = now;
    noise(c, 0.07, { freq: 3200, q: 0.6, gain: 0.35 });
  },
  flip() { const c = ac(); if (!c) return; noise(c, 0.05, { freq: 1800, q: 1.2, gain: 0.25 }); },
  chip() {
    const c = ac(); if (!c) return;
    tone(c, 2900, 0.05, { gain: 0.12, type: 'triangle' });
    tone(c, 4100, 0.04, { gain: 0.08, type: 'triangle', when: 0.025 });
    noise(c, 0.03, { freq: 5000, q: 2, gain: 0.12 });
  },
  shuffle() {
    const c = ac(); if (!c) return;
    for (let i = 0; i < 18; i++) noise(c, 0.04, { freq: 2600 + Math.random() * 1500, q: 0.7, gain: 0.14, when: i * 0.035 });
  },
  win() { const c = ac(); if (!c) return; [523, 659, 784].forEach((f, i) => tone(c, f, 0.22, { gain: 0.09, when: i * 0.08 })); },
  blackjack() { const c = ac(); if (!c) return; [523, 659, 784, 1046].forEach((f, i) => tone(c, f, 0.28, { gain: 0.1, when: i * 0.07 })); },
  lose() { const c = ac(); if (!c) return; tone(c, 220, 0.25, { gain: 0.08, type: 'triangle' }); },
  turn() { const c = ac(); if (!c) return; tone(c, 880, 0.12, { gain: 0.07 }); tone(c, 1175, 0.14, { gain: 0.06, when: 0.09 }); },
  chat() { const c = ac(); if (!c) return; tone(c, 1320, 0.07, { gain: 0.05 }); },
};
