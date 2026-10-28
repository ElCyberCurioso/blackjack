// Vista de la mesa: tapete, asientos, zapato, bandeja de descartes y cartas animadas.
import { createCardEl, setCardFace } from './cardview.js';
import { handValue, fmtMoney, fmtSigned } from '../cards.js';
import { feltLines } from '../rules.js';
import { sfx } from '../audio.js';

export const STAGE_W = 1280;
export const STAGE_H = 760;
const CW = 72;
const CH = 101;
const ARC = { cx: 640, cy: 36, r: 604 };
const DEALER = { x: 640, y: 158 };
const SHOE = { x: 1150, y: 74 };
const DISCARD = { x: 128, y: 74 };
const SVGNS = 'http://www.w3.org/2000/svg';

export function seatGeom(i) {
  const deg = 32 + i * (116 / 6);
  const th = (deg * Math.PI) / 180;
  return { x: ARC.cx + ARC.r * Math.cos(th), y: ARC.cy + ARC.r * Math.sin(th), rot: (deg - 90) * 0.42 };
}

function local(g, lx, ly) {
  const a = (g.rot * Math.PI) / 180;
  return { x: g.x + lx * Math.cos(a) - ly * Math.sin(a), y: g.y + lx * Math.sin(a) + ly * Math.cos(a) };
}

// Separación y escala de las manos de un asiento tras dividir.
const handLayout = (n) => (n === 1 ? { spacing: 0, sc: 1 } : n === 2 ? { spacing: 108, sc: 0.86 } : n === 3 ? { spacing: 80, sc: 0.72 } : { spacing: 66, sc: 0.64 });

const tf = (x, y, rot = 0, sc = 1) => `translate(${(x - CW / 2).toFixed(1)}px, ${(y - CH / 2).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sc})`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const DENOMS = [5000, 1000, 500, 100, 25, 5, 1];
export function chipBreakdown(amount, max = 10) {
  const out = [];
  let a = Math.floor(amount + 1e-9);
  for (const d of DENOMS) {
    while (a >= d && out.length < max) { out.push(d); a -= d; }
  }
  return out.reverse();
}

export function chipEl(d, withLabel = true) {
  const c = el('span', `chip d${d}`);
  if (withLabel) c.append(el('span', 'chip-face', d >= 1000 ? `${d / 1000}K` : String(d)));
  return c;
}

function renderStack(container, amount) {
  if (container._amt === amount) return;
  container._amt = amount;
  const chips = chipBreakdown(amount);
  container.replaceChildren(...chips.map((d, k) => {
    const c = chipEl(d, k === chips.length - 1);
    c.style.setProperty('--k', k);
    return c;
  }));
}

const RESULT_TEXT = {
  win: (n) => `Gana ${fmtSigned(n)}`,
  bj: (n) => `Blackjack ${fmtSigned(n)}`,
  push: () => 'Empate',
  lose: (n) => `Pierde ${fmtSigned(n)}`,
  bust: (n) => `Se pasa ${fmtSigned(n)}`,
  surrender: (n) => `Rendición ${fmtSigned(n)}`,
};

export class TableView {
  constructor(stage, handlers) {
    this.stage = stage;
    this.h = handlers;
    this.cardEls = new Map();
    this.badgeEls = new Map();
    this.first = true;
    this.lastNotice = null;
    this.printKey = '';
    this.build();
  }

  build() {
    const s = this.stage;
    s.replaceChildren();
    this.felt = el('div', 'felt');
    this.print = document.createElementNS(SVGNS, 'svg');
    this.print.setAttribute('class', 'print');
    this.print.setAttribute('viewBox', `0 0 ${STAGE_W} ${STAGE_H}`);
    this.print.setAttribute('aria-hidden', 'true');
    this.felt.append(this.print);

    // Zapato
    this.shoe = el('div', 'shoe');
    this.shoe.style.left = SHOE.x - 78 + 'px';
    this.shoe.style.top = SHOE.y - 46 + 'px';
    const shoeBody = el('div', 'shoe-body');
    this.shoeStack = el('div', 'shoe-stack');
    this.shoeCut = el('div', 'shoe-cut');
    shoeBody.append(this.shoeStack, this.shoeCut);
    this.shoe.append(shoeBody, el('div', 'shoe-mouth'));
    this.shoe.title = 'Zapato';

    // Descartes
    this.discard = el('div', 'discard');
    this.discard.style.left = DISCARD.x - 52 + 'px';
    this.discard.style.top = DISCARD.y - 46 + 'px';
    this.discardStack = el('div', 'discard-stack');
    this.discard.append(this.discardStack);
    this.discard.title = 'Bandeja de descartes';

    // Crupier
    this.dealerTotal = el('div', 'total dealer-total');
    this.dealerTotal.style.left = DEALER.x + 'px';
    this.dealerTotal.style.top = DEALER.y + 82 + 'px';

    this.seatsLayer = el('div', 'seats');
    this.seatEls = [];
    for (let i = 0; i < 7; i++) {
      const g = seatGeom(i);
      const seat = el('div', 'seat empty');
      seat.dataset.i = i;
      seat.style.left = g.x + 'px';
      seat.style.top = g.y + 'px';
      const spot = el('button', 'spot');
      spot.type = 'button';
      const label = el('span', 'spot-label', 'Sentarse');
      const stack = el('div', 'stack');
      const amt = el('span', 'bet-amt');
      spot.append(label, stack, amt);
      spot.addEventListener('click', () => this.h.onSeatClick(i));
      const ins = el('div', 'ins');
      const insStack = el('div', 'stack');
      ins.append(insStack, el('span', 'ins-label', 'Seguro'));
      const pl = local(g, 0, 66);
      const plate = el('div', 'plate');
      plate.style.left = pl.x - g.x + 'px';
      plate.style.top = pl.y - g.y + 'px';
      const name = el('span', 'pname');
      const bank = el('span', 'pbank');
      const tag = el('span', 'ptag');
      const up = el('button', 'standup', '×');
      up.type = 'button';
      up.title = 'Levantarse de este asiento';
      up.setAttribute('aria-label', 'Levantarse de este asiento');
      up.addEventListener('click', (e) => { e.stopPropagation(); this.h.onStandUp(i); });
      plate.append(name, bank, tag, up, el('span', 'ring'));
      seat.append(spot, ins, plate);
      this.seatsLayer.append(seat);
      this.seatEls.push({ seat, spot, label, stack, amt, ins, insStack, plate, name, bank, tag, up, g });
    }

    this.cardsLayer = el('div', 'cards-layer');
    this.badges = el('div', 'badges');
    this.notice = el('div', 'notice');
    this.notice.setAttribute('role', 'status');
    this.notice.setAttribute('aria-live', 'polite');
    s.append(this.felt, this.shoe, this.discard, this.seatsLayer, this.dealerTotal, this.cardsLayer, this.badges, this.notice);
  }

  renderPrint(rules) {
    const L = feltLines(rules);
    const key = JSON.stringify(L);
    if (key === this.printKey) return;
    this.printKey = key;
    const svg = this.print;
    svg.replaceChildren();
    const defs = document.createElementNS(SVGNS, 'defs');
    const arc = (id, r) => {
      const p = document.createElementNS(SVGNS, 'path');
      const a1 = (152 * Math.PI) / 180, a2 = (28 * Math.PI) / 180;
      const x1 = ARC.cx + r * Math.cos(a1), y1 = ARC.cy + r * Math.sin(a1);
      const x2 = ARC.cx + r * Math.cos(a2), y2 = ARC.cy + r * Math.sin(a2);
      p.setAttribute('id', id);
      p.setAttribute('d', `M ${x1} ${y1} A ${r} ${r} 0 0 0 ${x2} ${y2}`);
      defs.append(p);
      return p;
    };
    arc('arc-main', 376);
    arc('arc-dealer', 336);
    arc('arc-ins', 268);
    svg.append(defs);
    const ring = (r, w) => {
      const c = document.createElementNS(SVGNS, 'path');
      const a1 = (148 * Math.PI) / 180, a2 = (32 * Math.PI) / 180;
      c.setAttribute('d', `M ${ARC.cx + r * Math.cos(a1)} ${ARC.cy + r * Math.sin(a1)} A ${r} ${r} 0 0 0 ${ARC.cx + r * Math.cos(a2)} ${ARC.cy + r * Math.sin(a2)}`);
      c.setAttribute('class', 'print-line');
      c.setAttribute('stroke-width', w);
      svg.append(c);
    };
    ring(246, 2);
    ring(292, 2);
    const text = (href, str, cls) => {
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('class', cls);
      const tp = document.createElementNS(SVGNS, 'textPath');
      tp.setAttribute('href', '#' + href);
      tp.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#' + href);
      tp.setAttribute('startOffset', '50%');
      tp.setAttribute('text-anchor', 'middle');
      tp.textContent = str;
      t.append(tp);
      svg.append(t);
    };
    text('arc-main', L.main, 'print-main');
    text('arc-dealer', L.dealer, 'print-sub');
    text('arc-ins', L.insurance, 'print-ins');
    const limits = document.createElementNS(SVGNS, 'text');
    limits.setAttribute('class', 'print-limits');
    limits.setAttribute('x', DEALER.x);
    limits.setAttribute('y', 36);
    limits.setAttribute('text-anchor', 'middle');
    limits.textContent = `MÍNIMO ${fmtMoney(rules.minBet)}  ·  MÁXIMO ${fmtMoney(rules.maxBet)}`;
    svg.append(limits);
  }

  cardTargets(state) {
    const out = [];
    const dc = state.dealer.cards;
    dc.forEach((c, k) => {
      const x = DEALER.x + (k - (dc.length - 1) / 2) * 60;
      out.push({ card: c, x, y: DEALER.y, rot: 0, sc: 1, z: 10 + k, key: 'd' });
    });
    for (const s of state.seats) {
      if (!s.hands.length) continue;
      const g = seatGeom(s.i);
      const { spacing, sc } = handLayout(s.hands.length);
      const n = s.hands.length;
      s.hands.forEach((h, hi) => {
        const hx = (hi - (n - 1) / 2) * spacing;
        h.cards.forEach((c, k) => {
          const p = local(g, hx + k * 17 * sc, -112 - k * 21 * sc);
          out.push({ card: c, x: p.x, y: p.y, rot: g.rot + (h.doubled && k === 2 ? 90 : 0), sc, z: 100 + s.i * 40 + hi * 10 + k, key: `${s.i}-${hi}` });
        });
      });
    }
    return out;
  }

  render(state, ctx) {
    this.renderPrint(state.rules);
    const move = ctx.moveMs;
    const instant = this.first || move === 0;
    const players = new Map(state.players.map(p => [p.id, p]));
    const inRound = ['dealing', 'insurance', 'playing', 'dealer', 'settle'].includes(state.phase);

    // Zapato y descartes
    const sh = state.shoe;
    const remFrac = sh.remaining / sh.total;
    this.shoeStack.style.width = (remFrac * 100).toFixed(1) + '%';
    // La boca del zapato mira al crupier (izquierda): la carta de corte está a (corte − repartidas) del frente.
    const cutFromFront = Math.max(0, (sh.cut - (sh.total - sh.remaining)) / sh.total);
    this.shoeCut.style.display = sh.cutReached ? 'none' : '';
    this.shoeCut.style.left = ((1 - remFrac + cutFromFront) * 100).toFixed(1) + '%';
    this.shoe.classList.toggle('shuffling', state.phase === 'shuffling');
    this.discardStack.style.height = ((sh.discard / sh.total) * 100).toFixed(1) + '%';

    // Asientos
    const turn = state.awaiting === 'action' ? state.turn : null;
    for (const s of state.seats) {
      const v = this.seatEls[s.i];
      const owner = s.owner ? players.get(s.owner) : null;
      const mine = !!owner && owner.id === ctx.me;
      v.seat.classList.toggle('empty', !owner);
      v.seat.classList.toggle('mine', mine);
      v.seat.classList.toggle('selected', mine && ctx.selectedSeat === s.i && state.phase === 'betting');
      v.seat.classList.toggle('active', !!turn && turn.seat === s.i);
      v.seat.classList.toggle('away', !!owner && !owner.connected);
      v.seat.classList.toggle('bot', !!owner && owner.bot);
      const handBets = s.hands.reduce((a, h) => a + h.bet, 0);
      const amount = inRound ? handBets : s.bet;
      renderStack(v.stack, amount);
      v.amt.textContent = amount ? fmtMoney(amount) : '';
      v.label.textContent = owner ? (mine && state.phase === 'betting' && !amount ? 'Apuesta' : '') : (ctx.canSit ? 'Sentarse' : '');
      renderStack(v.insStack, s.ins || 0);
      v.ins.classList.toggle('show', (s.ins || 0) > 0);
      v.name.textContent = owner ? owner.name : '';
      v.bank.textContent = owner ? fmtMoney(owner.bankroll) : '';
      let tag = '';
      if (owner) {
        if (!owner.connected && !owner.bot) tag = 'desconectado';
        else if (state.phase === 'betting' && owner.ready && !owner.bot && s.bet > 0) tag = 'listo';
        else if (owner.bot) tag = 'bot';
      }
      v.tag.textContent = tag;
      v.up.hidden = !(mine && !inRound && state.phase !== 'finished' && !(s.hands && s.hands.length));
      let aria;
      if (!owner) aria = ctx.canSit ? `Asiento ${s.i + 1} libre: pulsa para sentarte` : `Asiento ${s.i + 1} libre`;
      else if (mine) aria = `Tu asiento ${s.i + 1}${amount ? `, apuesta ${fmtMoney(amount)}` : ''}${state.phase === 'betting' ? '. Pulsa para añadir la ficha seleccionada' : ''}`;
      else aria = `Asiento ${s.i + 1}: ${owner.name}`;
      v.spot.setAttribute('aria-label', aria);
      v.spot.disabled = !(!owner ? ctx.canSit : mine && state.phase === 'betting');
    }

    // Cartas
    const targets = this.cardTargets(state);
    const alive = new Set();
    const turnKey = turn ? `${turn.seat}-${turn.hand}` : null;
    for (const t of targets) {
      const id = String(t.card.id);
      alive.add(id);
      let e = this.cardEls.get(id);
      const transform = tf(t.x, t.y, t.rot, t.sc);
      const faceUp = !!t.card.r;
      if (!e) {
        e = createCardEl(t.card);
        this.cardEls.set(id, e);
        e.style.zIndex = t.z;
        if (instant) {
          e.style.transform = transform;
          if (faceUp) e.classList.remove('down');
          this.cardsLayer.append(e);
        } else {
          e.style.transition = 'none';
          e.style.transform = tf(SHOE.x - 40, SHOE.y + 12, -12, 0.9);
          this.cardsLayer.append(e);
          void e.offsetWidth;
          e.style.transition = '';
          e.style.transform = transform;
          sfx.card();
          if (faceUp) {
            e._pendingFlip = true;
            setTimeout(() => { e._pendingFlip = false; if (e.dataset.face) e.classList.remove('down'); }, Math.round(move * 0.7));
          }
        }
      } else {
        e.style.transform = transform;
        e.style.zIndex = t.z;
        const revealed = setCardFace(e, t.card);
        if (faceUp && !e._pendingFlip && e.classList.contains('down')) {
          e.classList.remove('down');
          if (revealed && !instant) sfx.flip();
        }
      }
      e.classList.toggle('turn', t.key === turnKey);
    }
    for (const [id, e] of this.cardEls) {
      if (alive.has(id)) continue;
      this.cardEls.delete(id);
      if (instant) { e.remove(); continue; }
      e.style.zIndex = 5;
      e.classList.add('down', 'leaving');
      e.style.transform = tf(DISCARD.x + (Math.random() * 10 - 5), DISCARD.y - 6, 90 + (Math.random() * 8 - 4), 0.9);
      setTimeout(() => e.remove(), move + 120);
    }

    this.renderBadges(state, turnKey);
    this.renderNotice(state, instant);
    this.first = false;
  }

  renderBadges(state, turnKey) {
    const want = new Map();
    // Crupier
    const dv = handValue(state.dealer.cards);
    const dHidden = state.dealer.cards.some(c => !c.r);
    if (state.dealer.cards.length) {
      let txt = String(dv.total);
      if (dv.soft && dv.total < 21 && !dHidden && state.phase !== 'settle') txt = `${dv.total - 10}/${dv.total}`;
      if (dv.total > 21) txt = `${dv.total} · se pasa`;
      if (state.dealer.cards.length === 2 && dv.total === 21 && !dHidden) txt = 'Blackjack';
      this.dealerTotal.textContent = txt;
      this.dealerTotal.classList.add('show');
      this.dealerTotal.classList.toggle('bust', dv.total > 21);
    } else {
      this.dealerTotal.classList.remove('show');
    }
    for (const s of state.seats) {
      if (!s.hands.length) continue;
      const g = seatGeom(s.i);
      const n = s.hands.length;
      const { spacing, sc } = handLayout(n);
      s.hands.forEach((h, hi) => {
        const key = `${s.i}-${hi}`;
        const hx = (hi - (n - 1) / 2) * spacing;
        if (!h.cards.length) return;
        const v = handValue(h.cards);
        let total = String(v.total);
        if (v.soft && v.total < 21 && !h.done) total = `${v.total - 10}/${v.total}`;
        if (h.bj) total = 'BJ';
        const pT = local(g, hx - 46 * sc, -86);
        want.set('t' + key, { x: pT.x, y: pT.y, text: total, cls: 'total' + (h.busted ? ' bust' : '') + (key === turnKey ? ' turn' : '') });
        let res = null;
        let rcls = '';
        if (h.result) { res = (RESULT_TEXT[h.result] || (() => ''))(h.net); rcls = h.result; }
        else if (h.busted) { res = 'Se pasa'; rcls = 'bust'; }
        else if (h.surrendered) { res = 'Rendición'; rcls = 'surrender'; }
        else if (h.bj) { res = 'Blackjack'; rcls = 'bj'; }
        if (res) {
          const k = h.cards.length - 1;
          const pR = local(g, hx + k * 17 * sc, -112 - k * 21 * sc - 74 * sc);
          want.set('r' + key, { x: pR.x, y: pR.y, text: res, cls: 'result ' + rcls });
        }
      });
      if (state.phase === 'settle' && s.ins > 0) {
        const p = local(g, -96, -84);
        want.set('i' + s.i, { x: p.x, y: p.y, text: s.insNet > 0 ? `Seguro ${fmtSigned(s.insNet)}` : 'Seguro perdido', cls: 'result ' + (s.insNet > 0 ? 'win' : 'lose') });
      }
    }
    for (const [k, b] of this.badgeEls) {
      if (!want.has(k)) { b.remove(); this.badgeEls.delete(k); }
    }
    for (const [k, w] of want) {
      let b = this.badgeEls.get(k);
      if (!b) { b = el('div'); this.badges.append(b); this.badgeEls.set(k, b); }
      b.className = 'badge ' + w.cls;
      b.textContent = w.text;
      b.style.left = w.x.toFixed(1) + 'px';
      b.style.top = w.y.toFixed(1) + 'px';
    }
  }

  renderNotice(state, instant) {
    const n = state.notice;
    if (!n || n.id === this.lastNotice) return;
    this.lastNotice = n.id;
    if (instant) return;
    if (n.kind === 'peek' && state.phase === 'playing') {
      // aviso discreto
    }
    this.notice.textContent = typeof n.text === 'string' ? n.text.slice(0, 160) : '';
    this.notice.className = 'notice show ' + (typeof n.kind === 'string' ? 'k-' + n.kind.replace(/[^a-z]/g, '') : '');
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.classList.remove('show'), 2600);
    if (n.kind === 'shuffle') sfx.shuffle();
  }

  updateTimer(fraction) {
    for (const v of this.seatEls) {
      if (v.seat.classList.contains('active')) v.plate.style.setProperty('--t', fraction.toFixed(3));
    }
  }

  reset() {
    for (const e of this.cardEls.values()) e.remove();
    this.cardEls.clear();
    for (const b of this.badgeEls.values()) b.remove();
    this.badgeEls.clear();
    this.first = true;
    this.printKey = '';
  }
}
