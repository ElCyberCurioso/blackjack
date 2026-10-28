// Preferencias del jugador (aspecto, sonido, ayudas) y datos locales persistentes.
import { randomId } from './shoe.js';

const KEY = 'bj.prefs.v1';

export const FELTS = {
  jade: { name: 'Verde casino', base: '#1d5a45', hi: '#2b765b', lo: '#0f3528' },
  azul: { name: 'Azul medianoche', base: '#1b3f66', hi: '#2a5784', lo: '#0e2440' },
  burdeos: { name: 'Burdeos', base: '#5f1b26', hi: '#7a2633', lo: '#380e15' },
  grafito: { name: 'Grafito', base: '#2b3034', hi: '#3c4348', lo: '#16191b' },
  violeta: { name: 'Violeta', base: '#3e2558', hi: '#563479', lo: '#221333' },
  arena: { name: 'Arena', base: '#8a6a3d', hi: '#a5824f', lo: '#5c4426' },
};

export const RAILS = {
  cuero: { name: 'Cuero marrón', base: '#4a2a1a', hi: '#6b3f27' },
  negro: { name: 'Cuero negro', base: '#1f1a18', hi: '#3a322e' },
  nogal: { name: 'Nogal', base: '#5a3a1e', hi: '#8a5c32' },
  granate: { name: 'Granate', base: '#521a1c', hi: '#7a2a2c' },
};

export const BACKS = {
  celosia: 'Celosía',
  rayas: 'Rayas',
  sol: 'Sol',
  puntos: 'Puntos',
  liso: 'Liso con monograma',
};

export const BACK_COLORS = {
  '#8c1d2a': 'Rojo',
  '#1d3f7a': 'Azul',
  '#1f5a3a': 'Verde',
  '#222222': 'Negro',
  '#5a2d7a': 'Morado',
  '#a0782a': 'Oro',
};

export const FACES = {
  clasica: 'Clásica',
  moderna: 'Moderna',
  grande: 'Índice grande',
};

export const SPEEDS = {
  lenta: { name: 'Lenta', pace: 750, move: 520 },
  normal: { name: 'Normal', pace: 450, move: 360 },
  rapida: { name: 'Rápida', pace: 240, move: 200 },
  turbo: { name: 'Turbo', pace: 90, move: 80 },
};

export const DEFAULT_PREFS = {
  face: 'clasica',
  fourColor: false,
  back: 'celosia',
  backColor: '#8c1d2a',
  felt: 'jade',
  feltPrint: true,
  rail: 'cuero',
  chips: 'clasicas',
  speed: 'normal',
  sound: true,
  volume: 0.6,
  showTotals: true,
  hud: false,
  hints: true,
  quizEvery: 6,
  rotateHintDismissed: false,
};

export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const p = { ...DEFAULT_PREFS };
    for (const k of Object.keys(DEFAULT_PREFS)) {
      if (raw[k] !== undefined && typeof raw[k] === typeof DEFAULT_PREFS[k]) p[k] = raw[k];
    }
    if (!FELTS[p.felt]) p.felt = DEFAULT_PREFS.felt;
    if (!RAILS[p.rail]) p.rail = DEFAULT_PREFS.rail;
    if (!BACKS[p.back]) p.back = DEFAULT_PREFS.back;
    if (!BACK_COLORS[p.backColor]) p.backColor = DEFAULT_PREFS.backColor;
    if (!FACES[p.face]) p.face = DEFAULT_PREFS.face;
    if (!SPEEDS[p.speed]) p.speed = DEFAULT_PREFS.speed;
    return p;
  } catch (_) {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
}

export function applyPrefs(p, root = document.documentElement) {
  const f = FELTS[p.felt];
  const r = RAILS[p.rail];
  root.style.setProperty('--felt', f.base);
  root.style.setProperty('--felt-hi', f.hi);
  root.style.setProperty('--felt-lo', f.lo);
  root.style.setProperty('--rail', r.base);
  root.style.setProperty('--rail-hi', r.hi);
  root.style.setProperty('--back-color', p.backColor);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const move = reduce ? 0 : SPEEDS[p.speed].move;
  root.style.setProperty('--move', move + 'ms');
  root.style.setProperty('--flip', Math.round(move * 0.8) + 'ms');
  root.dataset.face = p.face;
  root.dataset.colors = p.fourColor ? '4' : '2';
  root.dataset.back = p.back;
  root.dataset.chips = p.chips;
  root.dataset.print = p.feltPrint ? 'on' : 'off';
  root.dataset.totals = p.showTotals ? 'on' : 'off';
}

// ---------------------------------------------------------------- datos locales
const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

export const store = {
  name: () => { const n = get('bj.name', ''); return typeof n === 'string' ? n : ''; },
  setName: (n) => set('bj.name', n),
  // Token secreto para recuperar el asiento al recargar; solo lo conoce este navegador y el anfitrión.
  token: () => {
    let t = get('bj.token', '');
    if (typeof t !== 'string' || !/^[a-z0-9]{24}$/.test(t)) { t = randomId(24); set('bj.token', t); }
    return t;
  },
  soloBankroll: () => { const v = get('bj.solo.bankroll', null); return typeof v === 'number' && v > 0 ? v : null; },
  setSoloBankroll: (v) => set('bj.solo.bankroll', v),
  lastSetup: () => get('bj.setup', null),
  setLastSetup: (v) => set('bj.setup', v),
  trainer: () => get('bj.trainer', { decisions: 0, correct: 0, quizzes: 0, quizOk: 0 }),
  setTrainer: (v) => set('bj.trainer', v),
};
