// Protocolo entre invitado y anfitrión. Todo lo que llega por la red se valida aquí
// antes de tocar el motor: tipos, rangos, longitudes y lista blanca de acciones.
import { CHAT_MAX_LEN, NAME_MAX_LEN } from './config.js';

export const PROTOCOL_VERSION = 1;

const ACTS = new Set(['sit', 'leave', 'bet', 'clear', 'rebet', 'ready', 'ins', 'rebuy', 'hit', 'stand', 'double', 'split', 'surrender']);
export const PLAY_ACTS = new Set(['hit', 'stand', 'double', 'split', 'surrender']);

// Quita caracteres de control, de formato bidi y espacios de ancho cero.
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

export function approxSize(m) {
  try { return JSON.stringify(m).length; } catch (_) { return Infinity; }
}

export function validateGuestMsg(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  if (approxSize(m) > 2048) return null;
  switch (m.t) {
    case 'hello':
      return {
        t: 'hello',
        v: int(m.v, 0, 99),
        name: cleanText(m.name, NAME_MAX_LEN),
        token: typeof m.token === 'string' && /^[a-z0-9]{16,64}$/.test(m.token) ? m.token : null,
        pass: typeof m.pass === 'string' ? m.pass.slice(0, 64) : '',
      };
    case 'chat': {
      const text = cleanText(m.text, CHAT_MAX_LEN);
      return text ? { t: 'chat', text } : null;
    }
    case 'act':
      if (!ACTS.has(m.a)) return null;
      return {
        t: 'act',
        a: m.a,
        seat: int(m.seat, 0, 6),
        hand: int(m.hand, 0, 3),
        amount: int(m.amount, 1, 1000000),
        n: int(m.n, 0, 30),
        take: m.take === true,
        mult: m.mult === 2 ? 2 : 1,
      };
    case 'ping':
      return { t: 'ping' };
    default:
      return null;
  }
}

// Limitador de ritmo por conexión (cubo de fichas).
export class RateLimiter {
  constructor(capacity, perSecond) { this.capacity = capacity; this.rate = perSecond; this.tokens = capacity; this.last = Date.now(); }
  take() {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

// Aplica una acción ya validada sobre el motor.
export function applyAct(engine, playerId, m) {
  const need = (v) => v !== null && v !== undefined;
  switch (m.a) {
    case 'sit': return need(m.seat) ? engine.sit(playerId, m.seat) : engine.err('Asiento no válido');
    case 'leave': return need(m.seat) ? engine.leaveSeat(playerId, m.seat) : engine.err('Asiento no válido');
    case 'bet': return need(m.seat) && need(m.amount) ? engine.bet(playerId, m.seat, m.amount) : engine.err('Apuesta no válida');
    case 'clear': return engine.clearBet(playerId, need(m.seat) ? m.seat : null);
    case 'rebet': return engine.rebet(playerId, m.mult);
    case 'ready': return engine.ready(playerId);
    case 'ins': return need(m.seat) ? engine.insurance(playerId, m.seat, m.take) : engine.err('Asiento no válido');
    case 'rebuy': return engine.rebuy(playerId);
    default:
      if (PLAY_ACTS.has(m.a) && need(m.seat) && need(m.hand)) return engine.act(playerId, m.seat, m.hand, m.a, need(m.n) ? m.n : undefined);
      return engine.err('Acción desconocida');
  }
}
