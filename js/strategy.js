// Estrategia básica según reglas + desviaciones por cuenta verdadera (Hi-Lo).
import { handValue, rankValue } from './cards.js';

// Códigos: H pedir, S plantarse, D doblar (si no, pedir), Ds doblar (si no, plantarse),
// P dividir, Ph dividir si se puede doblar tras dividir (si no, pedir),
// Rh rendirse (si no, pedir), Rs rendirse (si no, plantarse), Rp rendirse (si no, dividir)

const range = (up, lo, hi) => up >= lo && up <= hi;

function hardCode(total, up, r) {
  const few = r.decks <= 2;
  if (total <= 7) return 'H';
  if (total === 8) return r.decks === 1 && range(up, 5, 6) ? 'D' : 'H';
  if (total === 9) return range(up, few ? 2 : 3, 6) ? 'D' : 'H';
  if (total === 10) return range(up, 2, 9) ? 'D' : 'H';
  if (total === 11) return up === 11 ? (r.h17 || few ? 'D' : 'H') : 'D';
  if (total === 12) return range(up, 4, 6) ? 'S' : 'H';
  if (total === 13 || total === 14) return range(up, 2, 6) ? 'S' : 'H';
  if (total === 15) {
    if (range(up, 2, 6)) return 'S';
    if (up === 10 && !(r.decks === 1)) return 'Rh';
    if (up === 11 && r.h17) return 'Rh';
    return 'H';
  }
  if (total === 16) {
    if (range(up, 2, 6)) return 'S';
    if (up === 10 || up === 11) return 'Rh';
    if (up === 9 && r.decks > 1) return 'Rh';
    return 'H';
  }
  if (total === 17) return up === 11 && r.h17 && r.decks > 1 ? 'Rs' : 'S';
  return 'S';
}

function softCode(total, up, r) {
  if (total <= 14) return range(up, 5, 6) ? 'D' : 'H';       // A2, A3
  if (total <= 16) return range(up, 4, 6) ? 'D' : 'H';       // A4, A5
  if (total === 17) return range(up, r.decks === 1 ? 2 : 3, 6) ? 'D' : 'H'; // A6
  if (total === 18) {                                         // A7
    if (range(up, r.h17 ? 2 : 3, 6)) return 'Ds';
    if (up === 2 || up === 7 || up === 8) return 'S';
    if (up === 11 && r.decks === 1 && !r.h17) return 'S';
    return 'H';
  }
  if (total === 19) return up === 6 && (r.h17 || r.decks === 1) ? 'Ds' : 'S'; // A8
  return 'S';
}

function pairCode(pv, up, r) {
  const das = r.das;
  switch (pv) {
    case 11: return 'P';
    case 10: return 'S';
    case 9: return (range(up, 2, 6) || up === 8 || up === 9) ? 'P' : 'S';
    case 8: return up === 11 && r.h17 && r.surrender === 'late' && r.decks > 1 ? 'Rp' : 'P';
    case 7: return range(up, 2, 7) ? 'P' : (r.decks === 1 && up === 8 && das ? 'P' : 'H');
    case 6: return das ? (range(up, 2, 6) ? 'P' : 'H') : (range(up, 3, 6) ? 'P' : 'H');
    case 5: return null;
    case 4: return das && range(up, 5, 6) ? 'P' : null;
    case 3:
    case 2: return das ? (range(up, 2, 7) ? 'P' : 'H') : (range(up, 4, 7) ? 'P' : 'H');
    default: return null;
  }
}

// Desviaciones Hi-Lo más rentables (Illustrious 18 y Fab 4), calibradas para varias barajas.
// cond: 'ge' = aplicar si TC >= n · 'lt' = aplicar si TC < n
export const DEVIATIONS = [
  { kind: 'ins', label: 'Seguro', tc: 3, cond: 'ge', act: 'insurance', text: 'Toma el seguro con cuenta verdadera +3 o más.' },
  { kind: 'hard', total: 16, up: 10, tc: 0, cond: 'ge', act: 'S', text: '16 contra 10: plántate con cuenta verdadera 0 o más.' },
  { kind: 'hard', total: 15, up: 10, tc: 4, cond: 'ge', act: 'S', text: '15 contra 10: plántate con +4 o más.' },
  { kind: 'pair', pv: 10, up: 5, tc: 5, cond: 'ge', act: 'P', text: 'Dos dieces contra 5: divide con +5 o más.' },
  { kind: 'pair', pv: 10, up: 6, tc: 4, cond: 'ge', act: 'P', text: 'Dos dieces contra 6: divide con +4 o más.' },
  { kind: 'hard', total: 10, up: 10, tc: 4, cond: 'ge', act: 'D', text: '10 contra 10: dobla con +4 o más.' },
  { kind: 'hard', total: 12, up: 3, tc: 2, cond: 'ge', act: 'S', text: '12 contra 3: plántate con +2 o más.' },
  { kind: 'hard', total: 12, up: 2, tc: 3, cond: 'ge', act: 'S', text: '12 contra 2: plántate con +3 o más.' },
  { kind: 'hard', total: 11, up: 11, tc: 1, cond: 'ge', act: 'D', text: '11 contra as: dobla con +1 o más.' },
  { kind: 'hard', total: 9, up: 2, tc: 1, cond: 'ge', act: 'D', text: '9 contra 2: dobla con +1 o más.' },
  { kind: 'hard', total: 10, up: 11, tc: 4, cond: 'ge', act: 'D', text: '10 contra as: dobla con +4 o más.' },
  { kind: 'hard', total: 9, up: 7, tc: 3, cond: 'ge', act: 'D', text: '9 contra 7: dobla con +3 o más.' },
  { kind: 'hard', total: 16, up: 9, tc: 5, cond: 'ge', act: 'S', text: '16 contra 9: plántate con +5 o más.' },
  { kind: 'hard', total: 13, up: 2, tc: -1, cond: 'lt', act: 'H', text: '13 contra 2: pide si la cuenta verdadera baja de −1.' },
  { kind: 'hard', total: 12, up: 4, tc: 0, cond: 'lt', act: 'H', text: '12 contra 4: pide con cuenta verdadera negativa.' },
  { kind: 'hard', total: 12, up: 5, tc: -2, cond: 'lt', act: 'H', text: '12 contra 5: pide si la cuenta baja de −2.' },
  { kind: 'hard', total: 12, up: 6, tc: -1, cond: 'lt', act: 'H', text: '12 contra 6: pide si la cuenta baja de −1.' },
  { kind: 'hard', total: 13, up: 3, tc: -2, cond: 'lt', act: 'H', text: '13 contra 3: pide si la cuenta baja de −2.' },
  // Fab 4 (rendición)
  { kind: 'hard', total: 14, up: 10, tc: 3, cond: 'ge', act: 'R', text: '14 contra 10: ríndete con +3 o más.' },
  { kind: 'hard', total: 15, up: 9, tc: 2, cond: 'ge', act: 'R', text: '15 contra 9: ríndete con +2 o más.' },
  { kind: 'hard', total: 15, up: 11, tc: 1, cond: 'ge', act: 'R', text: '15 contra as: ríndete con +1 o más.' },
];

const ACTION_NAME = { hit: 'Pedir', stand: 'Plantarse', double: 'Doblar', split: 'Dividir', surrender: 'Rendirse' };
export const actionName = (a) => ACTION_NAME[a] || a;

// Código "ideal" de la tabla sin tener en cuenta lo que se puede hacer en esta mano.
export function chartCode(cards, upValue, rules) {
  const v = handValue(cards);
  if (cards.length === 2) {
    const a = rankValue(cards[0].r), b = rankValue(cards[1].r);
    if (a === b) {
      const pc = pairCode(a, upValue, rules);
      if (pc) return { code: pc, kind: 'pair', pv: a };
    }
  }
  if (v.soft) return { code: softCode(v.total, upValue, rules), kind: 'soft', total: v.total };
  return { code: hardCode(v.total, upValue, rules), kind: 'hard', total: v.total };
}

function resolve(code, legal) {
  const can = (a) => !!legal[a];
  switch (code) {
    case 'H': return 'hit';
    case 'S': return 'stand';
    case 'D': return can('double') ? 'double' : 'hit';
    case 'Ds': return can('double') ? 'double' : 'stand';
    case 'P': return can('split') ? 'split' : null;
    case 'Rh': return can('surrender') ? 'surrender' : 'hit';
    case 'Rs': return can('surrender') ? 'surrender' : 'stand';
    case 'Rp': return can('surrender') ? 'surrender' : (can('split') ? 'split' : null);
    default: return null;
  }
}

// Recomendación para una mano concreta.
// legal: { hit, stand, double, split, surrender }; tc: cuenta verdadera o null.
export function recommend(cards, upCard, rules, legal, tc = null) {
  const up = rankValue(upCard.r);
  let chart = chartCode(cards, up, rules);
  let action = resolve(chart.code, legal);
  if (!action) {
    // No se puede dividir: se juega el total de la mano
    const v = handValue(cards);
    chart = v.soft ? { code: softCode(v.total, up, rules), kind: 'soft', total: v.total } : { code: hardCode(v.total, up, rules), kind: 'hard', total: v.total };
    action = resolve(chart.code, legal) || 'stand';
  }
  let deviation = null;
  if (tc !== null && Number.isFinite(tc)) {
    const v = handValue(cards);
    const isPair = cards.length === 2 && rankValue(cards[0].r) === rankValue(cards[1].r);
    for (const d of DEVIATIONS) {
      if (d.kind === 'ins') continue;
      if (d.up !== up) continue;
      if (d.kind === 'pair' && !(isPair && rankValue(cards[0].r) === d.pv)) continue;
      if (d.kind === 'hard' && (v.soft || v.total !== d.total || (isPair && d.act !== 'R' && chart.kind === 'pair'))) continue;
      const hit = d.cond === 'ge' ? tc >= d.tc : tc < d.tc;
      if (!hit) continue;
      let a = null;
      if (d.act === 'S' && legal.stand) a = 'stand';
      else if (d.act === 'H' && legal.hit) a = 'hit';
      else if (d.act === 'D' && legal.double) a = 'double';
      else if (d.act === 'P' && legal.split) a = 'split';
      else if (d.act === 'R' && legal.surrender) a = 'surrender';
      if (a) {
        // Si la estrategia básica ya pide rendirse y la desviación es plantarse, la rendición manda.
        if (action === 'surrender' && a === 'stand') continue;
        if (a !== action) { action = a; deviation = d; }
        break;
      }
    }
  }
  return { action, code: chart.code, deviation, why: explain(chart, up, action, deviation) };
}

export function insuranceAdvice(tc) {
  if (tc !== null && Number.isFinite(tc) && tc >= 3) return { take: true, why: DEVIATIONS[0].text };
  return { take: false, why: 'El seguro es una apuesta perdedora salvo con cuenta verdadera +3 o más.' };
}

function upName(up) { return up === 11 ? 'as' : String(up); }

function explain(chart, up, action, dev) {
  if (dev) return `Desviación por cuenta: ${dev.text}`;
  const handName = chart.kind === 'pair' ? `pareja de ${chart.pv === 11 ? 'ases' : chart.pv}` : `${chart.kind === 'soft' ? 'blando' : 'duro'} ${chart.total}`;
  return `Estrategia básica: con ${handName} contra ${upName(up)}, ${actionName(action).toLowerCase()}.`;
}
