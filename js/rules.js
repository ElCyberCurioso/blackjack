// Reglas, modos de juego y formatos.

export const DEFAULT_RULES = {
  decks: 6,
  penetration: 0.75,
  h17: false,            // el crupier pide con 17 blando
  das: true,             // doblar después de dividir
  doubleOn: 'any',       // 'any' | '9-11' | '10-11'
  surrender: 'late',     // 'none' | 'late'
  maxHands: 4,           // manos máximas tras dividir
  resplitAces: false,
  hitSplitAces: false,
  splitByValue: true,    // se puede dividir J-Q, 10-K...
  bjPayout: 1.5,         // 1.5 = 3:2 · 1.2 = 6:5 · 1 = 1:1
  insurance: true,
  holeCard: true,        // false = europeo (sin carta tapada)
  enhcOBO: false,        // europeo: solo se pierde la apuesta original ante blackjack
  minBet: 10,
  maxBet: 1000,
};

export const PRESETS = [
  {
    id: 'vegas', name: 'Las Vegas Strip',
    blurb: 'Seis barajas, el crupier se planta con 17 blando y puedes rendirte. La mesa de referencia.',
    rules: { decks: 6, penetration: 0.75, h17: false, das: true, doubleOn: 'any', surrender: 'late', maxHands: 4, resplitAces: false, bjPayout: 1.5, holeCard: true },
  },
  {
    id: 'atlantic', name: 'Atlantic City',
    blurb: 'Ocho barajas en un zapato largo, rendición tardía y re-división hasta cuatro manos.',
    rules: { decks: 8, penetration: 0.75, h17: false, das: true, doubleOn: 'any', surrender: 'late', maxHands: 4, resplitAces: false, bjPayout: 1.5, holeCard: true },
  },
  {
    id: 'downtown', name: 'Doble baraja',
    blurb: 'Dos barajas repartidas a mano. El crupier pide con 17 blando y se pueden redividir ases.',
    rules: { decks: 2, penetration: 0.70, h17: true, das: true, doubleOn: 'any', surrender: 'none', maxHands: 4, resplitAces: true, bjPayout: 1.5, holeCard: true },
  },
  {
    id: 'single', name: 'Una baraja',
    blurb: 'Una sola baraja: solo se dobla con 10 u 11 y el crupier pide con 17 blando. Cada carta pesa mucho en la cuenta.',
    rules: { decks: 1, penetration: 0.65, h17: true, das: false, doubleOn: '10-11', surrender: 'none', maxHands: 2, resplitAces: false, bjPayout: 1.5, holeCard: true },
  },
  {
    id: 'europeo', name: 'Europeo',
    blurb: 'Sin carta tapada: el crupier recibe su segunda carta al final. Si saca blackjack se lleva también dobles y divisiones.',
    rules: { decks: 6, penetration: 0.75, h17: false, das: true, doubleOn: '9-11', surrender: 'none', maxHands: 3, resplitAces: false, bjPayout: 1.5, holeCard: false, enhcOBO: false },
  },
  {
    id: 'custom', name: 'Personalizado',
    blurb: 'Ajusta cada regla de la mesa a tu gusto.',
    rules: {},
  },
];

export const FORMATS = [
  { id: 'libre', name: 'Partida libre', blurb: 'Juega a tu ritmo. Si te quedas sin fichas, puedes recargar la banca.' },
  { id: 'torneo', name: 'Torneo', blurb: 'Misma banca para todos y un número fijo de manos. Gana quien acabe con más fichas. Sin recargas ni ayudas.' },
  { id: 'entrenador', name: 'Entrenador de conteo', blurb: 'Cuenta Hi-Lo a la vista, consejos con desviaciones y preguntas de control sobre la cuenta.' },
];

export const DEFAULT_FORMAT = {
  type: 'libre',
  bankroll: 1000,
  hands: 30,              // manos del torneo
  betTime: 0,             // segundos para apostar (0 = sin límite)
  actionTime: 0,          // segundos por decisión (0 = sin límite)
  insuranceTime: 10,
  pace: 450,              // ms entre cartas
  allowHud: true,         // permitir el contador en pantalla
  maxSeatsPerPlayer: 3,
};

const clampNum = (v, lo, hi, def) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
};
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);

export function sanitizeRules(input = {}) {
  const d = DEFAULT_RULES;
  const r = {
    decks: Math.round(clampNum(input.decks, 1, 8, d.decks)),
    penetration: clampNum(input.penetration, 0.5, 0.9, d.penetration),
    h17: bool(input.h17, d.h17),
    das: bool(input.das, d.das),
    doubleOn: oneOf(input.doubleOn, ['any', '9-11', '10-11'], d.doubleOn),
    surrender: oneOf(input.surrender, ['none', 'late'], d.surrender),
    maxHands: Math.round(clampNum(input.maxHands, 1, 4, d.maxHands)),
    resplitAces: bool(input.resplitAces, d.resplitAces),
    hitSplitAces: bool(input.hitSplitAces, d.hitSplitAces),
    splitByValue: bool(input.splitByValue, d.splitByValue),
    bjPayout: oneOf(Number(input.bjPayout), [1.5, 1.2, 1], d.bjPayout),
    insurance: bool(input.insurance, d.insurance),
    holeCard: bool(input.holeCard, d.holeCard),
    enhcOBO: bool(input.enhcOBO, d.enhcOBO),
    minBet: Math.round(clampNum(input.minBet, 1, 10000, d.minBet)),
    maxBet: Math.round(clampNum(input.maxBet, 1, 100000, d.maxBet)),
  };
  if (r.maxBet < r.minBet) r.maxBet = r.minBet;
  return r;
}

export function sanitizeFormat(input = {}) {
  const d = DEFAULT_FORMAT;
  return {
    type: oneOf(input.type, ['libre', 'torneo', 'entrenador'], d.type),
    bankroll: Math.round(clampNum(input.bankroll, 10, 1000000, d.bankroll)),
    hands: Math.round(clampNum(input.hands, 5, 200, d.hands)),
    betTime: Math.round(clampNum(input.betTime, 0, 120, d.betTime)),
    actionTime: Math.round(clampNum(input.actionTime, 0, 120, d.actionTime)),
    insuranceTime: Math.round(clampNum(input.insuranceTime, 3, 60, d.insuranceTime)),
    pace: Math.round(clampNum(input.pace, 0, 1500, d.pace)),
    allowHud: input.type === 'torneo' ? false : bool(input.allowHud, d.allowHud),
    maxSeatsPerPlayer: Math.round(clampNum(input.maxSeatsPerPlayer, 1, 7, d.maxSeatsPerPlayer)),
  };
}

export function presetRules(id) {
  const p = PRESETS.find(x => x.id === id) || PRESETS[0];
  return sanitizeRules({ ...DEFAULT_RULES, ...p.rules });
}

// Modo predefinido que coincide con unas reglas (ignorando los límites de apuesta), o 'custom'.
export function presetIdFor(rules) {
  const hit = PRESETS.find(p => {
    if (p.id === 'custom') return false;
    const r = presetRules(p.id);
    return Object.keys(r).every(k => k === 'minBet' || k === 'maxBet' || r[k] === rules[k]);
  });
  return hit ? hit.id : 'custom';
}

export const payoutLabel = (p) => (p === 1.5 ? '3 a 2' : p === 1.2 ? '6 a 5' : '1 a 1');

// Texto impreso en el tapete, como en un casino.
export function feltLines(r) {
  return {
    main: `BLACKJACK PAGA ${payoutLabel(r.bjPayout).toUpperCase()}`,
    dealer: r.h17 ? 'EL CRUPIER PIDE CON 17 BLANDO' : 'EL CRUPIER SE PLANTA EN TODOS LOS 17',
    insurance: r.insurance ? 'EL SEGURO PAGA 2 A 1' : 'SIN SEGURO',
  };
}

// Resumen legible de las reglas.
export function describeRules(r) {
  const lines = [];
  lines.push(`${r.decks} ${r.decks === 1 ? 'baraja' : 'barajas'}, penetración del ${Math.round(r.penetration * 100)} %`);
  lines.push(r.h17 ? 'El crupier pide con 17 blando (H17)' : 'El crupier se planta con 17 blando (S17)');
  lines.push(`Blackjack paga ${payoutLabel(r.bjPayout)}`);
  lines.push(r.doubleOn === 'any' ? 'Doblar con dos cartas cualesquiera' : `Doblar solo con ${r.doubleOn === '9-11' ? '9, 10 u 11' : '10 u 11'}`);
  lines.push(r.das ? 'Se puede doblar tras dividir' : 'No se puede doblar tras dividir');
  lines.push(r.maxHands > 1 ? `Dividir hasta ${r.maxHands} manos${r.resplitAces ? ', ases incluidos' : ''}` : 'No se puede dividir');
  lines.push(r.hitSplitAces ? 'Ases divididos pueden pedir' : 'Ases divididos reciben una sola carta');
  lines.push(r.surrender === 'late' ? 'Rendición tardía permitida' : 'Sin rendición');
  lines.push(r.insurance ? 'Seguro disponible (paga 2 a 1)' : 'Sin seguro');
  if (!r.holeCard) lines.push(r.enhcOBO ? 'Sin carta tapada; ante blackjack solo se pierde la apuesta original' : 'Sin carta tapada; ante blackjack se pierden también dobles y divisiones');
  lines.push(`Límites de mesa: ${r.minBet} – ${r.maxBet}`);
  return lines;
}

// Ventaja aproximada de la casa con estrategia básica (en %), según efectos de reglas publicados.
export function houseEdge(r) {
  const deckEffect = { 1: 0, 2: 0.32, 3: 0.43, 4: 0.48, 5: 0.52, 6: 0.54, 7: 0.56, 8: 0.57 };
  let e = deckEffect[r.decks] ?? 0.54;
  if (r.h17) e += r.decks <= 2 ? 0.19 : 0.22;
  if (r.das) e -= 0.14;
  if (r.doubleOn === '10-11') e += r.decks === 1 ? 0.26 : 0.18;
  if (r.doubleOn === '9-11') e += 0.09;
  if (r.surrender === 'late') e -= r.decks === 1 ? 0.02 : 0.08;
  if (r.resplitAces) e -= 0.08;
  if (r.hitSplitAces) e -= 0.19;
  if (r.maxHands <= 2) e += 0.05;
  if (r.maxHands === 1) e += 0.3;
  if (!r.holeCard && !r.enhcOBO) e += 0.11;
  if (r.bjPayout === 1.2) e += 1.39;
  if (r.bjPayout === 1) e += 2.27;
  return Math.round(e * 100) / 100;
}
