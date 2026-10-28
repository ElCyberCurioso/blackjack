// Conteo Hi-Lo calculado en el cliente a partir de las cartas que realmente ha visto.
// Si entras a mitad de zapato, tu cuenta empieza a mitad, como en un casino.
import { hiLo, isRank } from './cards.js';

export class CountTracker {
  constructor() { this.reset(null); }

  reset(shoeId) {
    this.shoeId = shoeId;
    this.seen = new Set();
    this.rc = 0;
    this.partial = false;
    this.cardsSeen = 0;
  }

  visibleCards(state) {
    const out = [];
    for (const c of state.dealer.cards) out.push(c);
    for (const s of state.seats) for (const h of s.hands) for (const c of h.cards) out.push(c);
    return out;
  }

  update(state) {
    if (!state || !state.shoe) return;
    const cards = this.visibleCards(state);
    if (state.shoe.id !== this.shoeId) {
      const first = this.shoeId === null;
      this.reset(state.shoe.id);
      // Cartas fuera del zapato que no estás viendo (más la quemada) = has llegado tarde.
      const outOfShoe = state.shoe.total - state.shoe.remaining;
      if (first && outOfShoe - cards.length > 1) this.partial = true;
    }
    for (const c of cards) {
      if (!c || !c.r || !isRank(c.r) || this.seen.has(c.id)) continue;
      this.seen.add(c.id);
      this.rc += hiLo(c.r);
      this.cardsSeen++;
    }
  }

  decksRemaining(state) { return Math.max(0.25, state.shoe.remaining / 52); }

  trueCount(state) { return this.rc / this.decksRemaining(state); }
}
