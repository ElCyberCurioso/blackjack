// Zapato de cartas con barajado criptográfico, carta de corte y penetración.
import { RANKS, SUITS } from './cards.js';

// Entero uniforme en [0, n) sin sesgo de módulo.
export function secureRandomInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  let x;
  do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
  return x % n;
}

export function randomId(len = 10) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[secureRandomInt(alphabet.length)];
  return s;
}

function buildDecks(decks) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (const r of RANKS) cards.push({ r, s });
  }
  return cards;
}

function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Shoe {
  constructor(decks = 6, penetration = 0.75) {
    this.decks = decks;
    this.penetration = penetration;
    this.shuffle();
  }

  get total() { return this.decks * 52; }
  get remaining() { return this.cards.length - this.pos; }

  shuffle() {
    this.cards = fisherYates(buildDecks(this.decks));
    this.pos = 0;
    this.id = randomId(8);
    // El jugador "corta": posición de la carta de corte con una pequeña variación natural.
    const base = Math.round(this.cards.length * this.penetration);
    const jitter = this.decks > 1 ? secureRandomInt(Math.max(1, Math.round(this.decks * 2))) - this.decks : 0;
    this.cut = Math.max(10, Math.min(this.cards.length - 8, base + jitter));
    this.cutReached = false;
  }

  // Se usa solo si un zapato se agota en mitad de una mano (raro, una baraja con mesa llena):
  // se barajan todas las cartas excepto las que hay sobre la mesa.
  rebuildExcluding(onTable) {
    const pool = buildDecks(this.decks);
    for (const c of onTable) {
      const k = pool.findIndex(x => x.r === c.r && x.s === c.s);
      if (k >= 0) pool.splice(k, 1);
    }
    this.cards = fisherYates(pool);
    this.pos = 0;
    this.id = randomId(8);
    this.cut = this.cards.length;
    this.cutReached = true;
  }

  draw() {
    if (this.pos >= this.cards.length) return null;
    const c = this.cards[this.pos];
    const card = { id: `${this.id}.${this.pos}`, r: c.r, s: c.s };
    this.pos++;
    if (this.pos >= this.cut) this.cutReached = true;
    return card;
  }
}
