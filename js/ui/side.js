// Panel lateral: datos de la sala, jugadores y chat.
import { fmtMoney } from '../cards.js';
import { CHAT_MAX_LEN } from '../config.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const NAME_COLORS = ['#e7c987', '#f0a97a', '#9fd3b5', '#a9c4f0', '#e3a4c8', '#c9b4f2', '#f2d27a', '#8fd0d6'];
function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

const QUICK = ['👍', '🔥', '😬', '🍀', '¡Buena!', 'GG'];

export class SidePanel {
  constructor(root, h) {
    this.root = root;
    this.h = h;
    this.unread = 0;
    this.build();
  }

  build() {
    const r = this.root;
    r.replaceChildren();

    this.roomBox = el('section', 'side-sec room-box');
    this.roomTitle = el('h2', 'room-title');
    this.roomMode = el('p', 'room-mode');
    this.inviteBtn = el('button', 'btn primary invite', 'Copiar enlace de invitación');
    this.inviteBtn.type = 'button';
    this.inviteBtn.addEventListener('click', () => this.h.onInvite());
    this.rules = el('details', 'rules');
    const sum = el('summary', null, 'Reglas de esta mesa');
    this.rulesList = el('ul', 'rules-list');
    this.rules.append(sum, this.rulesList);
    this.hostRow = el('div', 'btn-row host-row');
    this.roomBox.append(this.roomTitle, this.roomMode, this.inviteBtn, this.rules, this.hostRow);

    this.playersBox = el('section', 'side-sec players-box');
    this.playersBox.append(el('h3', 'side-h', 'En la mesa'));
    this.playerList = el('ul', 'player-list');
    this.playersBox.append(this.playerList);

    this.chatBox = el('section', 'side-sec chat-box');
    this.chatBox.append(el('h3', 'side-h', 'Chat de la sala'));
    this.log = el('div', 'chat-log');
    this.log.setAttribute('role', 'log');
    this.log.setAttribute('aria-live', 'polite');
    this.log.tabIndex = 0;
    const quick = el('div', 'quick');
    for (const q of QUICK) {
      const b = el('button', 'quick-btn', q);
      b.type = 'button';
      b.addEventListener('click', () => this.h.onSendChat(q));
      quick.append(b);
    }
    this.form = el('form', 'chat-form');
    this.input = el('input', 'chat-input');
    this.input.type = 'text';
    this.input.maxLength = CHAT_MAX_LEN;
    this.input.placeholder = 'Escribe un mensaje';
    this.input.setAttribute('aria-label', 'Mensaje para la sala');
    this.input.autocomplete = 'off';
    const send = el('button', 'btn ghost', 'Enviar');
    send.type = 'submit';
    this.form.append(this.input, send);
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = this.input.value.trim();
      if (!t) return;
      this.h.onSendChat(t);
      this.input.value = '';
    });
    this.chatBox.append(this.log, quick, this.form);

    r.append(this.roomBox, this.playersBox, this.chatBox);
  }

  setRoom({ kind, code, modeName, formatName, rulesLines, houseEdge, isHost }) {
    this.kind = kind;
    this.roomTitle.textContent = kind === 'solo' ? 'Partida en solitario' : `Sala ${code}`;
    this.roomMode.textContent = `${modeName}, ${formatName.toLowerCase()}. Ventaja de la casa ≈ ${houseEdge.toLocaleString('es-ES')} %`;
    this.inviteBtn.hidden = kind === 'solo';
    this.chatBox.hidden = kind === 'solo';
    this.rulesList.replaceChildren(...rulesLines.map(l => el('li', null, l)));
    this.hostRow.replaceChildren();
    if (isHost) {
      const mk = (t, fn) => { const b = el('button', 'btn ghost small', t); b.type = 'button'; b.addEventListener('click', fn); return b; };
      this.hostRow.append(mk('Añadir bot', () => this.h.onAddBot()), mk('Cambiar reglas', () => this.h.onSettings()), mk('Nueva partida', () => this.h.onRestart()));
    }
  }

  renderPlayers(state, me, isHost) {
    const items = state.players
      .filter(p => !p.eliminated || !p.bot)
      .sort((a, b) => (b.host - a.host) || (a.bot - b.bot) || a.name.localeCompare(b.name))
      .map(p => {
        const li = el('li', 'player' + (p.id === me ? ' me' : '') + (!p.connected ? ' away' : ''));
        const dot = el('span', 'dot');
        dot.style.background = colorFor(p.id);
        const name = el('span', 'pl-name', p.name + (p.id === me ? ' (tú)' : ''));
        const seats = state.seats.filter(s => s.owner === p.id).map(s => s.i + 1);
        const meta = [];
        if (p.host) meta.push('anfitrión');
        if (p.bot) meta.push('bot');
        if (!p.connected && !p.bot) meta.push('desconectado');
        if (p.eliminated) meta.push('eliminado');
        if (seats.length) meta.push(seats.length > 1 ? `asientos ${seats.join(' y ')}` : `asiento ${seats[0]}`);
        else if (!p.bot) meta.push('mirando');
        const info = el('span', 'pl-meta', meta.join(', '));
        const bank = el('span', 'pl-bank', fmtMoney(p.bankroll));
        li.append(dot, name, bank, info);
        if (isHost && p.id !== me) {
          const k = el('button', 'pl-kick', p.bot ? 'Quitar' : 'Expulsar');
          k.type = 'button';
          k.setAttribute('aria-label', `${p.bot ? 'Quitar' : 'Expulsar'} a ${p.name}`);
          k.addEventListener('click', () => (p.bot ? this.h.onRemoveBot(p.id) : this.h.onKick(p.id, p.name)));
          li.append(k);
        }
        return li;
      });
    this.playerList.replaceChildren(...items);
  }

  chatMsg(m, me) {
    if (!m || typeof m !== 'object') return null;
    const text = typeof m.text === 'string' ? m.text.slice(0, CHAT_MAX_LEN) : '';
    if (!text) return null;
    const row = el('div', 'msg' + (m.sys ? ' sys' : '') + (m.from === me ? ' mine' : ''));
    if (!m.sys) {
      const who = el('span', 'who', typeof m.name === 'string' ? m.name.slice(0, 24) : '');
      who.style.color = colorFor(m.from);
      row.append(who);
    }
    row.append(el('span', 'txt', text));
    const ts = Number(m.ts);
    if (Number.isFinite(ts)) {
      const t = el('time', null, new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
      row.append(t);
    }
    return row;
  }

  addChat(m, me) {
    const row = this.chatMsg(m, me);
    if (!row) return;
    const stick = this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 30;
    this.log.append(row);
    while (this.log.childElementCount > 150) this.log.firstElementChild.remove();
    if (stick) this.log.scrollTop = this.log.scrollHeight;
  }

  setHistory(list, me) {
    this.log.replaceChildren();
    for (const m of list.slice(-100)) this.addChat(m, me);
    this.log.scrollTop = this.log.scrollHeight;
  }
}
