// Motor autoritativo de la mesa. Sin DOM: lo ejecuta el anfitrión (o el modo solo).
// Los invitados nunca ven el zapato ni la carta tapada: solo el estado público.
import { Shoe, randomId } from './shoe.js';
import { handValue, isBlackjack, rankValue } from './cards.js';
import { sanitizeRules, sanitizeFormat } from './rules.js';
import { recommend } from './strategy.js';
import { MAX_SEATS } from './config.js';

const defaultScheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h),
};

const round2 = (n) => Math.round(n * 100) / 100;

function emptySeat(i) {
  return { i, owner: null, bet: 0, lastBet: 0, hands: [], insurance: 0, insDecided: true, insNet: 0 };
}

function newHand(bet) {
  return { cards: [], bet, doubled: false, fromSplit: false, splitAces: false, done: false, surrendered: false, busted: false, bj: false, result: null, net: 0, actions: 0 };
}

const BOT_NAMES = ['Lucía', 'Mateo', 'Carmen', 'Hugo', 'Elena', 'Bruno', 'Inés', 'Darío'];

export class TableEngine {
  constructor(o = {}) {
    this.rules = sanitizeRules(o.rules);
    this.format = sanitizeFormat(o.format);
    this.onUpdate = o.onUpdate || (() => {});
    this.onLog = o.onLog || (() => {});
    this.sched = o.scheduler || defaultScheduler;
    this.now = o.now || (() => Date.now());
    this.seats = Array.from({ length: MAX_SEATS }, (_, i) => emptySeat(i));
    this.players = new Map();
    this.dealer = { cards: [] };
    this.phase = 'waiting';
    this.awaiting = null;
    this.turn = null;
    this.deadline = 0;
    this.round = 0;
    this.handsPlayed = 0;
    this.notice = null;
    this.noticeSeq = 0;
    this.timer = null;
    this.gen = 0;
    this.destroyed = false;
    this.standings = null;
    this.botCount = 0;
    this.newShoe();
  }

  // ---------------------------------------------------------------- utilidades
  later(fn, ms) {
    this.clearTimer();
    const g = this.gen;
    this.timer = this.sched.set(() => {
      this.timer = null;
      if (!this.destroyed && g === this.gen) fn();
    }, Math.max(0, ms | 0));
  }
  clearTimer() { if (this.timer != null) { this.sched.clear(this.timer); this.timer = null; } }
  emit() { if (!this.destroyed) this.onUpdate(); }
  say(text, kind = 'info') { this.notice = { id: ++this.noticeSeq, text, kind }; this.onLog(text, kind); }
  pace(f = 1) { return Math.round(this.format.pace * f); }
  destroy() { this.destroyed = true; this.gen++; this.clearTimer(); }
  inRound() { return ['dealing', 'insurance', 'playing', 'dealer', 'settle'].includes(this.phase); }
  ownedSeats(id) { return this.seats.filter(s => s.owner === id); }
  ok(extra) { return { ok: true, ...extra }; }
  err(msg) { return { ok: false, error: msg }; }

  newShoe() {
    this.shoe = new Shoe(this.rules.decks, this.rules.penetration);
    this.discard = 0;
    this.cutAnnounced = false;
    this.burn();
  }
  burn() { if (this.shoe.draw()) this.discard++; }

  draw() {
    if (this.shoe.remaining === 0) this.emergencyReshuffle();
    const c = this.shoe.draw();
    if (this.shoe.cutReached && !this.cutAnnounced) {
      this.cutAnnounced = true;
      this.say('Ha salido la carta de corte: se baraja al terminar esta mano.', 'cut');
    }
    return c;
  }

  tableCards() {
    const out = [...this.dealer.cards];
    for (const s of this.seats) for (const h of s.hands) out.push(...h.cards);
    return out;
  }

  emergencyReshuffle() {
    this.shoe.rebuildExcluding(this.tableCards());
    this.discard = 0;
    this.cutAnnounced = true;
    this.say('Se acabó el zapato: el crupier baraja los descartes y sigue repartiendo.', 'shuffle');
  }

  // ---------------------------------------------------------------- jugadores
  addPlayer({ id, name, bot = false, host = false }) {
    if (this.players.has(id)) return this.players.get(id);
    const p = {
      id, name, bot, host, bankroll: this.format.bankroll, connected: true, ready: false,
      eliminated: false, leaving: false, rebuys: 0,
      stats: { hands: 0, won: 0, lost: 0, push: 0, bj: 0, net: 0 },
    };
    this.players.set(id, p);
    this.emit();
    return p;
  }

  addBot(preferred) {
    const order = preferred != null ? [preferred, 1, 5, 0, 6, 2, 4, 3] : [1, 5, 0, 6, 2, 4, 3];
    const free = order.map(i => this.seats[i]).find(s => s && !s.owner);
    if (!free) return this.err('No quedan asientos libres');
    const id = 'bot-' + randomId(6);
    const name = BOT_NAMES[this.botCount++ % BOT_NAMES.length];
    this.addPlayer({ id, name, bot: true });
    free.owner = id;
    if (this.phase === 'betting') this.botBet(free);
    this.emit();
    return this.ok({ id });
  }

  removeBot(id) {
    const p = this.players.get(id);
    if (!p || !p.bot) return this.err('No es un bot');
    return this.removePlayer(id);
  }

  setConnected(id, connected) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (!connected && this.turn && this.awaiting === 'action') {
      const seat = this.seats[this.turn.seat];
      if (seat.owner === id) this.later(() => this.autoStand('desconectado'), 1500);
    }
    if (!connected && this.phase === 'insurance') this.checkInsuranceDone();
    if (!connected && this.phase === 'betting') this.maybeDeal();
    this.emit();
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return this.err('Jugador desconocido');
    p.connected = false;
    p.leaving = true;
    let busy = false;
    for (const s of this.ownedSeats(id)) {
      if (this.inRound() && s.hands.length) { busy = true; continue; }
      if (s.bet) { p.bankroll = round2(p.bankroll + s.bet); s.bet = 0; }
      Object.assign(s, emptySeat(s.i));
    }
    if (!busy) this.players.delete(id);
    if (busy && this.turn && this.awaiting === 'action' && this.seats[this.turn.seat].owner === id) {
      this.later(() => this.autoStand('se ha ido'), 600);
    }
    if (this.phase === 'insurance') this.checkInsuranceDone();
    if (this.phase === 'betting') this.maybeDeal();
    this.emit();
    return this.ok();
  }

  // ---------------------------------------------------------------- asientos y apuestas
  sit(id, i) {
    const p = this.players.get(id);
    const seat = this.seats[i];
    if (!p || !seat) return this.err('Asiento no válido');
    if (p.eliminated) return this.err('Has quedado eliminado del torneo');
    if (seat.owner) return this.err('Ese asiento está ocupado');
    const max = this.format.type === 'torneo' ? 1 : this.format.maxSeatsPerPlayer;
    if (this.ownedSeats(id).length >= max) return this.err(`Puedes ocupar como máximo ${max} ${max === 1 ? 'asiento' : 'asientos'}`);
    Object.assign(seat, emptySeat(i), { owner: id });
    p.ready = false;
    this.emit();
    return this.ok();
  }

  leaveSeat(id, i) {
    const p = this.players.get(id);
    const seat = this.seats[i];
    if (!p || !seat || seat.owner !== id) return this.err('No es tu asiento');
    if (this.inRound() && seat.hands.length) return this.err('Termina la mano antes de levantarte');
    if (seat.bet) p.bankroll = round2(p.bankroll + seat.bet);
    Object.assign(seat, emptySeat(i));
    if (this.phase === 'betting') this.maybeDeal();
    this.emit();
    return this.ok();
  }

  bet(id, i, amount) {
    if (this.phase !== 'betting') return this.err('Ahora no se puede apostar');
    const p = this.players.get(id);
    const seat = this.seats[i];
    if (!p || !seat || seat.owner !== id) return this.err('No es tu asiento');
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) return this.err('Apuesta no válida');
    const room = this.rules.maxBet - seat.bet;
    if (room <= 0) return this.err(`La apuesta máxima es ${this.rules.maxBet}`);
    amount = Math.min(amount, room);
    if (amount > p.bankroll) return this.err('No tienes fichas suficientes');
    p.bankroll = round2(p.bankroll - amount);
    seat.bet += amount;
    p.ready = false;
    this.emit();
    return this.ok();
  }

  clearBet(id, i) {
    if (this.phase !== 'betting') return this.err('Ahora no se puede retirar la apuesta');
    const p = this.players.get(id);
    const seats = i == null ? this.ownedSeats(id) : [this.seats[i]];
    for (const seat of seats) {
      if (!seat || seat.owner !== id) continue;
      p.bankroll = round2(p.bankroll + seat.bet);
      seat.bet = 0;
    }
    p.ready = false;
    this.emit();
    return this.ok();
  }

  rebet(id, mult = 1) {
    if (this.phase !== 'betting') return this.err('Ahora no se puede apostar');
    const p = this.players.get(id);
    if (!p) return this.err('Jugador desconocido');
    mult = mult === 2 ? 2 : 1;
    const seats = this.ownedSeats(id).filter(s => s.lastBet > 0);
    if (!seats.length) return this.err('No hay apuesta anterior que repetir');
    for (const s of seats) { p.bankroll = round2(p.bankroll + s.bet); s.bet = 0; }
    let short = false;
    for (const s of seats) {
      const target = Math.min(this.rules.maxBet, Math.max(this.rules.minBet, s.lastBet * mult));
      if (target > p.bankroll) { short = true; continue; }
      p.bankroll = round2(p.bankroll - target);
      s.bet = target;
    }
    p.ready = false;
    this.emit();
    return short ? this.err('No tienes fichas para repetir todas las apuestas') : this.ok();
  }

  ready(id) {
    if (this.phase !== 'betting') return this.err('Ahora no se puede repartir');
    const p = this.players.get(id);
    if (!p) return this.err('Jugador desconocido');
    for (const s of this.ownedSeats(id)) {
      if (s.bet > 0 && s.bet < this.rules.minBet) return this.err(`La apuesta mínima es ${this.rules.minBet}`);
    }
    p.ready = true;
    this.emit();
    this.maybeDeal();
    return this.ok();
  }

  rebuy(id) {
    if (this.format.type === 'torneo') return this.err('En el torneo no hay recargas');
    const p = this.players.get(id);
    if (!p) return this.err('Jugador desconocido');
    const onTable = this.ownedSeats(id).reduce((a, s) => a + s.bet + s.hands.reduce((b, h) => b + h.bet, 0), 0);
    if (p.bankroll + onTable >= this.rules.minBet) return this.err('Aún tienes fichas para jugar');
    p.bankroll = this.format.bankroll;
    p.rebuys++;
    this.say(`${p.name} recarga la banca.`, 'info');
    this.emit();
    return this.ok();
  }

  humansSeated() {
    return [...this.players.values()].filter(p => !p.bot && !p.leaving && this.ownedSeats(p.id).length > 0);
  }

  maybeDeal() {
    if (this.phase !== 'betting') return;
    const humans = this.humansSeated();
    if (!humans.length) return;
    const allReady = humans.every(p => p.ready || !p.connected);
    const anyHumanBet = humans.some(p => p.connected && this.ownedSeats(p.id).some(s => s.bet >= this.rules.minBet));
    if (allReady && anyHumanBet) this.deal();
  }

  start() {
    if (this.phase !== 'waiting') return this.err('La partida ya ha empezado');
    this.startBetting();
    return this.ok();
  }

  startBetting() {
    this.phase = 'betting';
    this.awaiting = 'bets';
    this.turn = null;
    for (const p of this.players.values()) p.ready = !!p.bot;
    for (const s of this.seats) {
      const p = this.players.get(s.owner);
      if (p && p.bot) this.botBet(s);
    }
    const humans = this.humansSeated();
    if (this.format.betTime > 0 && humans.length) {
      this.deadline = this.now() + this.format.betTime * 1000;
      this.later(() => this.betTimeout(), this.format.betTime * 1000);
    } else {
      this.deadline = 0;
      this.clearTimer();
    }
    this.emit();
  }

  betTimeout() {
    if (this.phase !== 'betting') return;
    const anyBet = this.humansSeated().some(p => this.ownedSeats(p.id).some(s => s.bet >= this.rules.minBet));
    if (anyBet) this.deal();
    else this.startBetting();
  }

  botBet(seat) {
    const p = this.players.get(seat.owner);
    if (!p || p.eliminated) return;
    if (p.bankroll < this.rules.minBet) {
      if (this.format.type === 'torneo') return;
      p.bankroll = this.format.bankroll;
    }
    if (seat.bet) return;
    const units = 1 + Math.floor(Math.random() * 3);
    const amt = Math.min(this.rules.maxBet, this.rules.minBet * units, p.bankroll);
    p.bankroll = round2(p.bankroll - amt);
    seat.bet = amt;
    p.ready = true;
  }

  // ---------------------------------------------------------------- reparto
  deal() {
    this.clearTimer();
    this.awaiting = null;
    this.deadline = 0;
    const active = [];
    for (const s of this.seats) {
      s.hands = [];
      s.insurance = 0; s.insNet = 0; s.insDecided = true;
      if (!s.owner) continue;
      const p = this.players.get(s.owner);
      if (s.bet > 0 && (s.bet < this.rules.minBet || !p || p.leaving)) {
        if (p) p.bankroll = round2(p.bankroll + s.bet);
        s.bet = 0;
      }
      if (s.bet > 0) {
        s.hands = [newHand(s.bet)];
        s.lastBet = s.bet;
        s.bet = 0;
        active.push(s);
      }
    }
    if (!active.length) { this.startBetting(); return; }
    this.round++;
    this.phase = 'dealing';
    this.turn = null;
    this.dealer = { cards: [] };
    this.dealQueue = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const s of active) this.dealQueue.push({ seat: s.i });
      if (pass === 0) this.dealQueue.push({ dealer: true });
      else if (this.rules.holeCard) this.dealQueue.push({ dealer: true, hidden: true });
    }
    this.emit();
    this.later(() => this.dealStep(), this.pace(0.6));
  }

  dealStep() {
    const step = this.dealQueue.shift();
    if (!step) { this.afterDeal(); return; }
    const c = this.draw();
    if (step.dealer) {
      if (step.hidden) c.hidden = true;
      this.dealer.cards.push(c);
    } else {
      this.seats[step.seat].hands[0].cards.push(c);
    }
    this.emit();
    this.later(() => this.dealStep(), this.pace());
  }

  allHands() { return this.seats.flatMap(s => s.hands); }

  afterDeal() {
    for (const h of this.allHands()) {
      if (isBlackjack(h.cards)) { h.bj = true; h.done = true; }
    }
    const up = this.dealer.cards[0];
    if (up && up.r === 'A' && this.rules.insurance) {
      this.phase = 'insurance';
      this.awaiting = 'insurance';
      for (const s of this.seats) {
        if (!s.hands.length) continue;
        const p = this.players.get(s.owner);
        s.insDecided = !p || p.bot || !p.connected || p.leaving;
      }
      this.say('El crupier muestra un as. ¿Seguro?', 'insurance');
      if (this.checkInsuranceDone()) return;
      if (this.format.betTime > 0 || this.format.actionTime > 0) {
        this.deadline = this.now() + this.format.insuranceTime * 1000;
        this.later(() => this.resolveInsurance(), this.format.insuranceTime * 1000);
      } else {
        this.deadline = 0;
        this.clearTimer();
      }
      this.emit();
      return;
    }
    this.afterInsurance();
  }

  insurance(id, i, take) {
    if (this.phase !== 'insurance') return this.err('Ahora no se ofrece seguro');
    const seat = this.seats[i];
    const p = this.players.get(id);
    if (!seat || !p || seat.owner !== id || !seat.hands.length) return this.err('No es tu asiento');
    if (seat.insDecided) return this.err('Ya has decidido');
    if (take) {
      const cost = round2(seat.hands[0].bet / 2);
      if (cost > p.bankroll) return this.err('No tienes fichas para el seguro');
      p.bankroll = round2(p.bankroll - cost);
      seat.insurance = cost;
    }
    seat.insDecided = true;
    this.emit();
    this.checkInsuranceDone();
    return this.ok();
  }

  checkInsuranceDone() {
    if (this.phase !== 'insurance') return false;
    for (const s of this.seats) {
      if (!s.hands.length || s.insDecided) continue;
      const p = this.players.get(s.owner);
      if (!p || !p.connected || p.leaving) s.insDecided = true;
    }
    if (this.seats.every(s => !s.hands.length || s.insDecided)) {
      this.resolveInsurance();
      return true;
    }
    return false;
  }

  resolveInsurance() {
    if (this.phase !== 'insurance') return;
    for (const s of this.seats) s.insDecided = true;
    this.awaiting = null;
    this.deadline = 0;
    this.clearTimer();
    this.afterInsurance();
  }

  afterInsurance() {
    const up = this.dealer.cards[0];
    if (this.rules.holeCard && up && rankValue(up.r) >= 10) {
      // El crupier revisa su carta tapada.
      if (isBlackjack(this.dealer.cards)) {
        this.phase = 'dealer';
        this.dealer.cards[1].hidden = false;
        this.say('El crupier tiene blackjack.', 'dealerbj');
        this.emit();
        this.later(() => this.settle(), this.pace(2.2));
        return;
      }
      this.say('El crupier revisa su carta: no tiene blackjack.', 'peek');
    }
    this.phase = 'playing';
    this.turn = null;
    this.emit();
    this.later(() => this.advance(), this.pace(0.6));
  }

  // ---------------------------------------------------------------- turnos
  advance() {
    for (const s of this.seats) {
      for (let h = 0; h < s.hands.length; h++) {
        if (!s.hands[h].done) { this.beginTurn(s.i, h); return; }
      }
    }
    this.turn = null;
    this.dealerTurn();
  }

  beginTurn(si, hi) {
    const hand = this.seats[si].hands[hi];
    this.turn = { seat: si, hand: hi };
    this.phase = 'playing';
    if (hand.cards.length === 1) {
      // Mano procedente de una división: recibe su segunda carta al empezar a jugarse.
      this.awaiting = null;
      this.deadline = 0;
      this.emit();
      this.later(() => { hand.cards.push(this.draw()); this.afterSplitCard(si, hi); }, this.pace());
      return;
    }
    this.awaitAction(si, hi);
  }

  afterSplitCard(si, hi) {
    const seat = this.seats[si];
    const hand = seat.hands[hi];
    const v = handValue(hand.cards);
    if (hand.splitAces && !this.rules.hitSplitAces) {
      if (hand.cards[1].r === 'A' && this.legal(si, hi).split) { this.awaitAction(si, hi); return; }
      hand.done = true;
      this.emit();
      this.later(() => this.advance(), this.pace());
      return;
    }
    if (v.total >= 21) {
      hand.done = true;
      hand.busted = v.total > 21;
      this.emit();
      this.later(() => this.advance(), this.pace());
      return;
    }
    this.awaitAction(si, hi);
  }

  awaitAction(si, hi) {
    this.awaiting = 'action';
    this.turn = { seat: si, hand: hi };
    const p = this.players.get(this.seats[si].owner);
    if (p && p.bot) {
      this.deadline = 0;
      this.emit();
      this.later(() => this.botAct(si, hi), Math.max(250, this.pace(1.3)));
      return;
    }
    if (!p || !p.connected || p.leaving) {
      this.deadline = 0;
      this.emit();
      this.later(() => this.autoStand(p ? 'desconectado' : ''), 1200);
      return;
    }
    if (this.format.actionTime > 0) {
      this.deadline = this.now() + this.format.actionTime * 1000;
      this.later(() => this.autoStand('tiempo agotado'), this.format.actionTime * 1000);
    } else {
      this.deadline = 0;
      this.clearTimer();
    }
    this.emit();
  }

  autoStand(reason) {
    if (this.awaiting !== 'action' || !this.turn) return;
    const { seat, hand } = this.turn;
    const p = this.players.get(this.seats[seat].owner);
    if (reason && p) this.say(`${p.name} se planta (${reason}).`, 'info');
    this.perform(seat, hand, 'stand');
  }

  botAct(si, hi) {
    if (this.awaiting !== 'action') return;
    const seat = this.seats[si];
    const hand = seat.hands[hi];
    const legal = this.legal(si, hi);
    const rec = recommend(hand.cards, this.dealer.cards[0], this.rules, legal, null);
    const a = legal[rec.action] ? rec.action : (legal.stand ? 'stand' : 'hit');
    this.perform(si, hi, a);
  }

  legal(si, hi) {
    const none = { hit: false, stand: false, double: false, split: false, surrender: false };
    const seat = this.seats[si];
    const hand = seat && seat.hands[hi];
    if (!hand || hand.done) return none;
    const r = this.rules;
    const p = this.players.get(seat.owner);
    const bank = p ? p.bankroll : 0;
    const v = handValue(hand.cards);
    const two = hand.cards.length === 2;
    const aceLocked = hand.splitAces && !r.hitSplitAces;
    const doubleTotalOk = r.doubleOn === 'any' || (r.doubleOn === '9-11' ? (v.total >= 9 && v.total <= 11) : (v.total >= 10 && v.total <= 11));
    const pair = two && (r.splitByValue ? rankValue(hand.cards[0].r) === rankValue(hand.cards[1].r) : hand.cards[0].r === hand.cards[1].r);
    const isAces = two && hand.cards[0].r === 'A' && hand.cards[1].r === 'A';
    return {
      hit: !aceLocked && v.total < 21,
      stand: true,
      double: two && !aceLocked && v.total < 21 && doubleTotalOk && (!hand.fromSplit || r.das) && bank >= hand.bet,
      split: pair && seat.hands.length < r.maxHands && bank >= hand.bet && (!isAces || !hand.fromSplit || r.resplitAces),
      surrender: r.surrender === 'late' && two && !hand.fromSplit && seat.hands.length === 1 && hand.actions === 0,
    };
  }

  // expectCards: nº de cartas que veía el cliente al pulsar. Evita que un doble clic
  // o un mensaje duplicado pida una carta de más.
  act(id, si, hi, action, expectCards) {
    if (this.awaiting !== 'action' || !this.turn) return this.err('No es momento de jugar');
    if (this.turn.seat !== si || this.turn.hand !== hi) return this.err('No es el turno de esa mano');
    const seat = this.seats[si];
    if (!seat || seat.owner !== id) return this.err('No es tu asiento');
    if (expectCards != null && seat.hands[hi].cards.length !== expectCards) return this.err('Jugada duplicada ignorada');
    const legal = this.legal(si, hi);
    if (!legal[action]) return this.err('Esa jugada no está permitida aquí');
    this.perform(si, hi, action);
    return this.ok();
  }

  perform(si, hi, action) {
    const seat = this.seats[si];
    const hand = seat.hands[hi];
    const p = this.players.get(seat.owner);
    this.clearTimer();
    this.awaiting = null;
    this.deadline = 0;
    hand.actions++;
    switch (action) {
      case 'stand':
        hand.done = true;
        this.emit();
        this.later(() => this.advance(), this.pace(0.5));
        break;
      case 'hit': {
        hand.cards.push(this.draw());
        const v = handValue(hand.cards);
        if (v.total > 21) { hand.busted = true; hand.done = true; }
        else if (v.total === 21) hand.done = true;
        if (hand.done) { this.emit(); this.later(() => this.advance(), this.pace()); }
        else this.awaitAction(si, hi);
        break;
      }
      case 'double':
        if (p) p.bankroll = round2(p.bankroll - hand.bet);
        hand.bet *= 2;
        hand.doubled = true;
        this.emit();
        this.later(() => {
          hand.cards.push(this.draw());
          hand.busted = handValue(hand.cards).total > 21;
          hand.done = true;
          this.emit();
          this.later(() => this.advance(), this.pace());
        }, this.pace(0.7));
        break;
      case 'split': {
        if (p) p.bankroll = round2(p.bankroll - hand.bet);
        const moved = hand.cards.pop();
        const nh = newHand(hand.bet);
        nh.cards = [moved];
        nh.fromSplit = true;
        hand.fromSplit = true;
        if (moved.r === 'A' && hand.cards[0].r === 'A') { hand.splitAces = true; nh.splitAces = true; }
        seat.hands.splice(hi + 1, 0, nh);
        this.emit();
        this.later(() => { hand.cards.push(this.draw()); this.afterSplitCard(si, hi); }, this.pace());
        break;
      }
      case 'surrender':
        hand.surrendered = true;
        hand.done = true;
        this.emit();
        this.later(() => this.advance(), this.pace(0.5));
        break;
      default:
        this.awaitAction(si, hi);
    }
  }

  // ---------------------------------------------------------------- crupier
  dealerTurn() {
    this.phase = 'dealer';
    this.awaiting = null;
    this.turn = null;
    this.deadline = 0;
    const hands = this.allHands();
    const live = hands.some(h => !h.busted && !h.surrendered && !h.bj);
    if (this.rules.holeCard) {
      if (this.dealer.cards[1]) this.dealer.cards[1].hidden = false;
      this.emit();
      if (live) this.later(() => this.dealerLoop(), this.pace(1.2));
      else this.later(() => this.settle(), this.pace(1.4));
      return;
    }
    // Europeo: el crupier recibe ahora su segunda carta (si hace falta).
    const anyBJ = hands.some(h => h.bj);
    const anyIns = this.seats.some(s => s.insurance > 0);
    if (!live && !anyBJ && !anyIns) { this.emit(); this.later(() => this.settle(), this.pace()); return; }
    this.emit();
    this.later(() => {
      this.dealer.cards.push(this.draw());
      this.emit();
      if (isBlackjack(this.dealer.cards)) {
        this.say('El crupier tiene blackjack.', 'dealerbj');
        this.emit();
        this.later(() => this.settle(), this.pace(1.6));
      } else if (live) this.later(() => this.dealerLoop(), this.pace());
      else this.later(() => this.settle(), this.pace());
    }, this.pace());
  }

  dealerMustHit() {
    const v = handValue(this.dealer.cards);
    return v.total < 17 || (v.total === 17 && v.soft && this.rules.h17);
  }

  dealerLoop() {
    if (this.dealerMustHit()) {
      this.dealer.cards.push(this.draw());
      this.emit();
      this.later(() => this.dealerLoop(), this.pace());
    } else {
      this.later(() => this.settle(), this.pace(0.8));
    }
  }

  // ---------------------------------------------------------------- liquidación
  settle() {
    this.phase = 'settle';
    this.awaiting = null;
    this.turn = null;
    for (const c of this.dealer.cards) c.hidden = false;
    const dealerBJ = isBlackjack(this.dealer.cards);
    const dv = handValue(this.dealer.cards).total;
    const dBust = dv > 21;
    const r = this.rules;
    for (const s of this.seats) {
      if (!s.hands.length) continue;
      const p = this.players.get(s.owner);
      let ret = 0;
      if (s.insurance > 0) {
        if (dealerBJ) { ret += s.insurance * 3; s.insNet = s.insurance * 2; }
        else s.insNet = -s.insurance;
      }
      s.hands.forEach((h, idx) => {
        let back = 0;
        let result;
        if (h.surrendered) { back = h.bet / 2; result = 'surrender'; }
        else if (h.busted) { back = 0; result = 'bust'; }
        else if (dealerBJ) {
          if (h.bj) { back = h.bet; result = 'push'; }
          else if (!r.holeCard && r.enhcOBO) { back = h.bet - (idx === 0 ? s.lastBet : 0); result = 'lose'; }
          else { back = 0; result = 'lose'; }
        } else if (h.bj) { back = h.bet + h.bet * r.bjPayout; result = 'bj'; }
        else {
          const pv = handValue(h.cards).total;
          if (dBust || pv > dv) { back = h.bet * 2; result = 'win'; }
          else if (pv === dv) { back = h.bet; result = 'push'; }
          else { back = 0; result = 'lose'; }
        }
        back = round2(back);
        h.result = result;
        h.net = round2(back - h.bet);
        ret += back;
        if (p) {
          p.stats.hands++;
          if (h.net > 0) p.stats.won++;
          else if (h.net < 0) p.stats.lost++;
          else p.stats.push++;
          if (result === 'bj') p.stats.bj++;
          p.stats.net = round2(p.stats.net + h.net);
        }
      });
      if (p) {
        p.bankroll = round2(p.bankroll + ret);
        p.stats.net = round2(p.stats.net + s.insNet);
      }
    }
    this.handsPlayed++;
    const wait = Math.max(1800, this.pace(5.5));
    this.deadline = this.now() + wait;
    this.emit();
    this.later(() => this.endRound(), wait);
  }

  endRound() {
    let n = this.dealer.cards.length;
    for (const s of this.seats) { for (const h of s.hands) n += h.cards.length; s.hands = []; s.insurance = 0; s.insNet = 0; }
    this.discard += n;
    this.dealer = { cards: [] };
    this.deadline = 0;
    // Jugadores que se fueron durante la mano
    for (const [id, p] of this.players) {
      if (p.leaving) {
        for (const s of this.ownedSeats(id)) Object.assign(s, emptySeat(s.i));
        this.players.delete(id);
      }
    }
    if (this.format.type === 'torneo') {
      if (this.handsPlayed >= this.format.hands) { this.finishTournament(); return; }
      for (const p of this.players.values()) {
        if (!p.eliminated && p.bankroll < this.rules.minBet) {
          p.eliminated = true;
          for (const s of this.ownedSeats(p.id)) Object.assign(s, emptySeat(s.i));
          this.say(`${p.name} se queda sin fichas y abandona el torneo.`, 'info');
        }
      }
      const alive = [...this.players.values()].filter(p => !p.bot && !p.eliminated);
      if (alive.length === 0) { this.finishTournament(); return; }
    }
    const seated = this.seats.filter(s => s.owner).length;
    if (this.shoe.cutReached || this.shoe.remaining < seated * 4 + 6) { this.shuffleShoe(); return; }
    this.startBetting();
  }

  shuffleShoe() {
    this.phase = 'shuffling';
    this.awaiting = null;
    this.say('El crupier baraja el zapato.', 'shuffle');
    this.shoe = new Shoe(this.rules.decks, this.rules.penetration);
    this.discard = 0;
    this.cutAnnounced = false;
    this.emit();
    this.later(() => {
      this.burn();
      this.emit();
      this.later(() => this.startBetting(), 500);
    }, Math.max(1200, this.pace(5)));
  }

  finishTournament() {
    this.phase = 'finished';
    this.awaiting = null;
    this.clearTimer();
    this.standings = [...this.players.values()]
      .sort((a, b) => b.bankroll - a.bankroll)
      .map((p, k) => ({ pos: k + 1, id: p.id, name: p.name, bankroll: p.bankroll, bot: p.bot }));
    const w = this.standings[0];
    this.say(w ? `Fin del torneo. Gana ${w.name} con ${w.bankroll} fichas.` : 'Fin del torneo.', 'tournament');
    this.emit();
  }

  restart() {
    if (this.inRound()) return this.err('Espera a que termine la mano');
    for (const s of this.seats) {
      const p = this.players.get(s.owner);
      if (p && s.bet) p.bankroll = round2(p.bankroll + s.bet);
      s.bet = 0; s.lastBet = 0;
    }
    for (const p of this.players.values()) {
      p.bankroll = this.format.bankroll;
      p.eliminated = false;
      p.stats = { hands: 0, won: 0, lost: 0, push: 0, bj: 0, net: 0 };
    }
    this.handsPlayed = 0;
    this.standings = null;
    this.gen++;
    this.newShoe();
    this.say('Nueva partida: bancas reiniciadas y zapato nuevo.', 'shuffle');
    this.startBetting();
    return this.ok();
  }

  updateSettings(rules, format) {
    if (this.inRound() || this.phase === 'shuffling') return this.err('Cambia las reglas entre manos');
    const oldType = this.format.type;
    for (const s of this.seats) {
      const p = this.players.get(s.owner);
      if (p && s.bet) p.bankroll = round2(p.bankroll + s.bet);
      s.bet = 0;
    }
    this.rules = sanitizeRules(rules);
    this.format = sanitizeFormat(format);
    if (this.format.type === 'torneo') {
      // un asiento por jugador
      const seen = new Set();
      for (const s of this.seats) {
        if (!s.owner) continue;
        const p = this.players.get(s.owner);
        if (p && !p.bot && seen.has(s.owner)) Object.assign(s, emptySeat(s.i));
        else seen.add(s.owner);
      }
    }
    this.gen++;
    this.newShoe();
    if (oldType !== this.format.type) this.restart();
    else {
      this.say('Reglas actualizadas. Zapato nuevo.', 'shuffle');
      if (this.phase !== 'waiting') this.startBetting(); else this.emit();
    }
    return this.ok();
  }

  // ---------------------------------------------------------------- estado público
  publicState() {
    const pub = (c) => (c.hidden ? { id: c.id, h: 1 } : { id: c.id, r: c.r, s: c.s });
    const legal = this.turn && this.awaiting === 'action' ? this.legal(this.turn.seat, this.turn.hand) : null;
    return {
      phase: this.phase,
      awaiting: this.awaiting,
      round: this.round,
      turn: this.turn ? { ...this.turn } : null,
      legal,
      deadlineIn: this.deadline ? Math.max(0, this.deadline - this.now()) : 0,
      rules: { ...this.rules },
      format: { ...this.format },
      handsPlayed: this.handsPlayed,
      seats: this.seats.map(s => ({
        i: s.i, owner: s.owner, bet: s.bet, lastBet: s.lastBet, ins: s.insurance, insNet: s.insNet, insDecided: s.insDecided,
        hands: s.hands.map(h => ({
          cards: h.cards.map(pub), bet: h.bet, doubled: h.doubled, fromSplit: h.fromSplit, done: h.done,
          surrendered: h.surrendered, busted: h.busted, bj: h.bj, result: h.result, net: h.net,
        })),
      })),
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, bankroll: p.bankroll, connected: p.connected, bot: p.bot, host: p.host,
        ready: p.ready, eliminated: p.eliminated, rebuys: p.rebuys, stats: { ...p.stats },
      })),
      dealer: { cards: this.dealer.cards.map(pub) },
      shoe: { id: this.shoe.id, total: this.shoe.total, remaining: this.shoe.remaining, cut: this.shoe.cut, discard: this.discard, cutReached: this.shoe.cutReached },
      notice: this.notice,
      standings: this.standings,
    };
  }
}
