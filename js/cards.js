// Utilidades de cartas: valores, manos y sistema de conteo Hi-Lo.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME = { S: 'picas', H: 'corazones', D: 'diamantes', C: 'tréboles' };

export function isRank(r) { return RANKS.includes(r); }
export function isSuit(s) { return SUITS.includes(s); }

export function rankValue(r) {
  if (r === 'A') return 11;
  if (r === 'K' || r === 'Q' || r === 'J' || r === '10') return 10;
  return Number(r);
}

// Valor de una mano. Las cartas sin rango (ocultas para el cliente) no cuentan. soft = hay un as contando como 11.
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (!c || !c.r) continue; // carta oculta en el estado público ({ id, h: 1 })
    total += rankValue(c.r);
    if (c.r === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards) {
  return cards.length === 2 && cards.every(c => c && c.r) && handValue(cards).total === 21;
}

// Hi-Lo: 2-6 = +1, 7-9 = 0, 10-A = -1
export function hiLo(r) {
  if (r === '2' || r === '3' || r === '4' || r === '5' || r === '6') return 1;
  if (r === '7' || r === '8' || r === '9') return 0;
  return -1;
}

export function dealerUpValue(card) { return card ? rankValue(card.r) : 0; }

// Número formateado al estilo español: 1.234,5
export function fmtMoney(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}

export function fmtSigned(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + fmtMoney(Math.abs(v));
}
