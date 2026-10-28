// Barra de controles inferior: fichas, decisiones, seguro, estado y contador.
import { fmtMoney, fmtSigned, handValue } from '../cards.js';
import { chipEl } from './table.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btn(text, cls, onClick, key) {
  const b = el('button', 'btn ' + (cls || ''));
  b.type = 'button';
  const label = el('span', 'btn-label', text);
  b.append(label);
  if (key) { const k = el('kbd', null, key); b.append(k); b.setAttribute('aria-keyshortcuts', key); }
  b.addEventListener('click', onClick);
  return b;
}

const ALL_DENOMS = [1, 5, 25, 100, 500, 1000, 5000];
const PLAY = [
  ['hit', 'Pedir', '1'],
  ['stand', 'Plantarse', '2'],
  ['double', 'Doblar', '3'],
  ['split', 'Dividir', '4'],
  ['surrender', 'Rendirse', '5'],
];

export class Dock {
  constructor(root, h) {
    this.root = root;
    this.h = h;
    this.build();
  }

  build() {
    const r = this.root;
    r.replaceChildren();
    this.timerBar = el('div', 'timer-bar');
    this.timerFill = el('span');
    this.timerBar.append(this.timerFill);

    this.left = el('div', 'dock-left');
    this.bankBox = el('div', 'bank');
    this.bankLabel = el('span', 'bank-label', 'Banca');
    this.bankValue = el('span', 'bank-value', '0');
    this.bankBox.append(this.bankLabel, this.bankValue);
    this.hud = el('button', 'hud');
    this.hud.type = 'button';
    this.hud.title = 'Contador Hi-Lo (pulsa para ocultarlo o mostrarlo)';
    this.hud.addEventListener('click', () => this.h.onToggleHud());
    this.left.append(this.bankBox, this.hud);

    this.center = el('div', 'dock-center');

    // Apuestas
    this.pBet = el('div', 'panel p-bet');
    this.rack = el('div', 'rack');
    this.rack.setAttribute('role', 'group');
    this.rack.setAttribute('aria-label', 'Fichas');
    const betBtns = el('div', 'btn-row');
    this.bClear = btn('Retirar', 'ghost', () => this.h.onAct('clear', {}));
    this.bRebet = btn('Repetir', 'ghost', () => this.h.onAct('rebet', { mult: 1 }));
    this.bDouble = btn('Repetir ×2', 'ghost', () => this.h.onAct('rebet', { mult: 2 }));
    this.bDeal = btn('Repartir', 'primary', () => this.h.onAct('ready', {}), 'Intro');
    this.bRebuy = btn('Recargar banca', 'primary', () => this.h.onAct('rebuy', {}));
    betBtns.append(this.bClear, this.bRebet, this.bDouble, this.bDeal, this.bRebuy);
    this.betMsg = el('p', 'dock-msg');
    this.pBet.append(this.rack, betBtns, this.betMsg);

    // Seguro
    this.pIns = el('div', 'panel p-ins');

    // Jugar
    this.pPlay = el('div', 'panel p-play');
    const playRow = el('div', 'btn-row');
    this.playBtns = {};
    for (const [a, label, key] of PLAY) {
      const b = btn(label, 'act act-' + a, () => this.h.onPlay(a), key);
      this.playBtns[a] = b;
      playRow.append(b);
    }
    this.bHint = btn('Consejo', 'ghost hint', () => this.h.onHint(), '?');
    playRow.append(this.bHint);
    this.playMsg = el('p', 'dock-msg');
    this.pPlay.append(playRow, this.playMsg);

    // Estado / espera / final
    this.pStatus = el('div', 'panel p-status');
    this.statusText = el('p', 'status-text');
    this.statusExtra = el('div', 'btn-row');
    this.pStatus.append(this.statusText, this.statusExtra);

    this.center.append(this.pBet, this.pIns, this.pPlay, this.pStatus);

    this.right = el('div', 'dock-right');
    this.feedback = el('p', 'feedback');
    this.feedback.setAttribute('aria-live', 'polite');
    this.right.append(this.feedback);

    r.append(this.timerBar, this.left, this.center, this.right);
  }

  show(panel) {
    for (const p of [this.pBet, this.pIns, this.pPlay, this.pStatus]) p.hidden = p !== panel;
  }

  setFeedback(text, kind = '') {
    this.feedback.textContent = text || '';
    this.feedback.className = 'feedback ' + kind;
    clearTimeout(this.fbTimer);
    if (text) this.fbTimer = setTimeout(() => { this.feedback.textContent = ''; }, 7000);
  }

  renderRack(rules, selected) {
    const denoms = ALL_DENOMS.filter(d => d <= rules.maxBet && d >= Math.min(5, rules.minBet) && d * 400 >= rules.minBet).slice(-6);
    const key = denoms.join(',') + '|' + selected;
    if (this.rackKey === key) return denoms;
    this.rackKey = key;
    this.rack.replaceChildren(...denoms.map(d => {
      const b = el('button', 'rack-chip' + (d === selected ? ' sel' : ''));
      b.type = 'button';
      b.setAttribute('aria-label', `Ficha de ${d}`);
      b.setAttribute('aria-pressed', d === selected ? 'true' : 'false');
      b.append(chipEl(d));
      b.addEventListener('click', () => this.h.onChip(d));
      return b;
    }));
    return denoms;
  }

  renderHud(ctx) {
    const { hudVisible, hudAllowed, count, state } = ctx;
    this.hud.hidden = !hudAllowed;
    if (!hudAllowed) return;
    this.hud.classList.toggle('collapsed', !hudVisible);
    if (!hudVisible) {
      this.hud.replaceChildren(el('span', 'hud-off', ctx.trainer ? 'Cuenta oculta: pulsa para verla' : 'Mostrar cuenta'));
      return;
    }
    const tc = count.trueCount(state);
    const decks = count.decksRemaining(state);
    const edge = 0.5 * tc - ctx.houseEdge;
    const item = (label, value, cls = '') => {
      const s = el('span', 'hud-item ' + cls);
      s.append(el('small', null, label), el('b', null, value));
      return s;
    };
    const fmt1 = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const sign = (n, f = (x) => String(x)) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));
    this.hud.replaceChildren(
      item('Corriente', sign(count.rc), count.rc > 0 ? 'pos' : count.rc < 0 ? 'neg' : ''),
      item('Verdadera', sign(Math.round(tc * 10) / 10, fmt1), tc >= 1 ? 'pos' : tc <= -1 ? 'neg' : ''),
      item('Barajas', fmt1(decks)),
      item('Ventaja', sign(Math.round(edge * 10) / 10, fmt1) + ' %', edge > 0 ? 'pos' : ''),
    );
    if (count.partial) this.hud.append(el('span', 'hud-note', 'cuenta parcial: llegaste a mitad de zapato'));
  }

  render(state, ctx) {
    const me = state.players.find(p => p.id === ctx.me);
    const mySeats = state.seats.filter(s => s.owner === ctx.me);
    const bank = me ? me.bankroll : 0;
    this.bankValue.textContent = fmtMoney(bank);
    this.renderHud(ctx);
    const players = new Map(state.players.map(p => [p.id, p]));
    const rules = state.rules;

    // Temporizador visible solo cuando afecta al jugador
    let showTimer = false;
    if (ctx.deadline && ctx.deadlineTotal) {
      if (state.phase === 'betting' && mySeats.length) showTimer = true;
      if (state.phase === 'insurance' && mySeats.some(s => s.hands.length && !s.insDecided)) showTimer = true;
      if (state.awaiting === 'action' && state.turn && state.seats[state.turn.seat].owner === ctx.me) showTimer = true;
    }
    this.timerBar.classList.toggle('show', showTimer);

    if (state.phase === 'waiting') {
      this.show(this.pStatus);
      this.statusExtra.replaceChildren();
      if (ctx.isHost) {
        this.statusText.textContent = 'Cuando estéis todos, empieza la partida. Puedes añadir bots para llenar la mesa.';
        this.statusExtra.append(btn('Empezar partida', 'primary', () => this.h.onStart()), btn('Añadir bot', 'ghost', () => this.h.onAddBot()));
      } else {
        this.statusText.textContent = 'Esperando a que el anfitrión empiece la partida.';
      }
      return;
    }

    if (state.phase === 'finished') {
      this.show(this.pStatus);
      const list = (state.standings || []).slice(0, 7).map(s => `${s.pos}.º ${s.name}${s.bot ? ' (bot)' : ''}: ${fmtMoney(s.bankroll)}`).join('   ');
      this.statusText.textContent = `Fin del torneo. ${list}`;
      this.statusExtra.replaceChildren();
      if (ctx.isHost) this.statusExtra.append(btn('Nueva partida', 'primary', () => this.h.onRestart(true)));
      else this.statusExtra.append(el('span', 'dock-msg', 'El anfitrión puede empezar una nueva partida.'));
      return;
    }

    if (!mySeats.length) {
      this.show(this.pStatus);
      this.statusExtra.replaceChildren();
      const free = state.seats.some(s => !s.owner);
      if (me && me.eliminated) this.statusText.textContent = 'Te has quedado sin fichas en este torneo. Puedes seguir mirando la partida.';
      else this.statusText.textContent = free ? 'Elige un asiento libre en la mesa para jugar.' : 'La mesa está llena. Puedes mirar la partida y chatear.';
      return;
    }

    if (state.phase === 'betting') {
      this.show(this.pBet);
      const denoms = this.renderRack(rules, ctx.chip);
      if (!denoms.includes(ctx.chip)) this.h.onChip(denoms.find(d => d >= rules.minBet) || denoms[0], true);
      const myBet = mySeats.reduce((a, s) => a + s.bet, 0);
      const hasLast = mySeats.some(s => s.lastBet > 0);
      const valid = mySeats.some(s => s.bet >= rules.minBet);
      const broke = bank + myBet < rules.minBet;
      this.bClear.disabled = myBet === 0;
      this.bRebet.hidden = !hasLast;
      this.bDouble.hidden = !hasLast;
      this.bRebet.disabled = !hasLast || me.ready;
      this.bDouble.disabled = !hasLast || me.ready;
      this.bDeal.disabled = !valid || me.ready;
      this.bRebuy.hidden = !(broke && state.format.type !== 'torneo');
      this.bDeal.hidden = !this.bRebuy.hidden;
      const others = state.players.filter(p => !p.bot && p.id !== ctx.me && state.seats.some(s => s.owner === p.id) && p.connected);
      let msg;
      if (me.ready) msg = others.length ? `Esperando a ${others.filter(p => !p.ready).map(p => p.name).join(', ') || 'los demás'}…` : 'Repartiendo…';
      else if (broke) msg = state.format.type === 'torneo' ? 'No te quedan fichas suficientes.' : 'Te has quedado sin fichas.';
      else if (!valid) msg = mySeats.length > 1 ? `Elige ficha y pulsa tu círculo de apuesta. Mesa de ${fmtMoney(rules.minBet)} a ${fmtMoney(rules.maxBet)}.` : `Elige una ficha para apostar. Mesa de ${fmtMoney(rules.minBet)} a ${fmtMoney(rules.maxBet)}.`;
      else msg = others.length ? `Listos: ${others.filter(p => p.ready).length + (me.ready ? 1 : 0)} de ${others.length + 1}` : `Apuesta: ${fmtMoney(myBet)}`;
      if (state.format.type === 'torneo') msg += `   Mano ${state.handsPlayed + 1} de ${state.format.hands}`;
      this.betMsg.textContent = msg;
      return;
    }

    if (state.phase === 'insurance') {
      const pending = mySeats.filter(s => s.hands.length && !s.insDecided);
      if (pending.length) {
        this.show(this.pIns);
        const rows = pending.map(s => {
          const h = s.hands[0];
          const cost = h.bet / 2;
          const row = el('div', 'ins-row');
          const even = h.bj;
          row.append(el('p', 'dock-msg', even
            ? `Asiento ${s.i + 1}: tienes blackjack. ¿Cobrar dinero par (1 a 1) ahora?`
            : `Asiento ${s.i + 1}: ¿asegurar por ${fmtMoney(cost)}? El seguro paga 2 a 1 si el crupier tiene blackjack.`));
          const yes = btn(even ? 'Dinero par' : `Asegurar ${fmtMoney(cost)}`, 'primary', () => this.h.onAct('ins', { seat: s.i, take: true }), 'S');
          const no = btn('No, gracias', 'ghost', () => this.h.onAct('ins', { seat: s.i, take: false }), 'N');
          yes.disabled = cost > bank;
          const b = el('div', 'btn-row');
          b.append(yes, no);
          row.append(b);
          return row;
        });
        this.pIns.replaceChildren(...rows);
        return;
      }
      this.show(this.pStatus);
      this.statusExtra.replaceChildren();
      this.statusText.textContent = 'Esperando a que el resto decida sobre el seguro…';
      return;
    }

    const myTurn = state.awaiting === 'action' && state.turn && state.seats[state.turn.seat].owner === ctx.me;
    if (myTurn) {
      this.show(this.pPlay);
      const L = state.legal || {};
      for (const [a] of PLAY) {
        this.playBtns[a].disabled = !L[a] || ctx.busy;
        this.playBtns[a].hidden = (a === 'surrender' && rules.surrender === 'none');
      }
      this.bHint.hidden = !ctx.hintsAllowed;
      const seat = state.seats[state.turn.seat];
      const hand = seat.hands[state.turn.hand];
      const v = handValue(hand.cards);
      const multi = mySeats.length > 1 || seat.hands.length > 1;
      const where = multi ? `Asiento ${seat.i + 1}${seat.hands.length > 1 ? `, mano ${state.turn.hand + 1} de ${seat.hands.length}` : ''}: ` : '';
      const what = v.soft && v.total < 21 ? `un ${v.total} blando` : String(v.total);
      this.playMsg.textContent = where ? `${where}tienes ${what}.` : `Tu turno: tienes ${what}.`;
      return;
    }

    // Estado general
    this.show(this.pStatus);
    this.statusExtra.replaceChildren();
    let text = '';
    switch (state.phase) {
      case 'dealing': text = 'Repartiendo…'; break;
      case 'playing': {
        if (state.turn) {
          const o = players.get(state.seats[state.turn.seat].owner);
          text = o ? `Juega ${o.name}${o.bot ? ' (bot)' : ''}…` : 'Siguiente mano…';
        } else text = 'Siguiente mano…';
        break;
      }
      case 'dealer': text = 'Juega el crupier…'; break;
      case 'shuffling': text = 'El crupier baraja el zapato y quema una carta.'; break;
      case 'settle': {
        let net = 0;
        let any = false;
        for (const s of mySeats) { for (const h of s.hands) { net += h.net || 0; any = true; } net += s.insNet || 0; }
        text = any ? (net > 0 ? `Ganas ${fmtSigned(net)} en esta mano.` : net < 0 ? `Pierdes ${fmtSigned(net)} en esta mano.` : 'Te quedas como estabas.') : 'Fin de la mano.';
        break;
      }
      default: text = '';
    }
    this.statusText.textContent = text;
  }

  updateTimer(fraction) {
    this.timerFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction)).toFixed(3)})`;
    this.timerBar.classList.toggle('low', fraction < 0.25);
  }
}
