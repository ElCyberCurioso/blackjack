// Controladores de sala: solo (local), anfitrión (motor + red) e invitado (solo red).
// Los tres exponen la misma interfaz a la interfaz gráfica: act(), chat(), leave().
import { TableEngine } from './engine.js';
import { HostTransport, GuestTransport } from './net.js';
import { validateGuestMsg, applyAct, cleanText, RateLimiter, PROTOCOL_VERSION } from './protocol.js';
import { randomId } from './shoe.js';
import { MAX_PLAYERS, CHAT_MAX_LEN, NAME_MAX_LEN } from './config.js';

const SEAT_ORDER = [3, 2, 4, 1, 5, 0, 6];
const normAct = (a, payload) => ({ a, seat: null, hand: null, amount: null, n: null, take: false, mult: 1, ...payload });

function batched(fn) {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; fn(); });
  };
}

// ------------------------------------------------------------------ solo
export class LocalRoom {
  constructor({ rules, format, name, bots = 0, bankroll = null, cb }) {
    this.kind = 'solo';
    this.isHost = true;
    this.me = 'me';
    this.cb = cb;
    this.engine = new TableEngine({ rules, format, onUpdate: batched(() => this.cb.onState(this.engine.publicState())) });
    const p = this.engine.addPlayer({ id: this.me, name, host: true });
    if (bankroll != null && bankroll > 0 && this.engine.format.type !== 'torneo') p.bankroll = bankroll;
    this.engine.sit(this.me, 3);
    for (let i = 0; i < bots; i++) this.engine.addBot();
  }
  open() { this.engine.start(); this.cb.onJoined({ you: this.me }); }
  act(a, payload = {}) {
    const r = applyAct(this.engine, this.me, normAct(a, payload));
    if (!r.ok) this.cb.onToast(r.error, 'error');
    return r;
  }
  chat() {}
  addBot() { const r = this.engine.addBot(); if (!r.ok) this.cb.onToast(r.error, 'error'); }
  removeBot(id) { this.engine.removeBot(id); }
  restart() { const r = this.engine.restart(); if (!r.ok) this.cb.onToast(r.error, 'error'); }
  updateSettings(rules, format) { const r = this.engine.updateSettings(rules, format); if (!r.ok) this.cb.onToast(r.error, 'error'); return r; }
  leave() { this.engine.destroy(); }
}

// ------------------------------------------------------------------ anfitrión
export class HostRoom {
  constructor({ code, password = '', rules, format, name, cb }) {
    this.kind = 'host';
    this.isHost = true;
    this.code = code;
    this.password = password;
    this.cb = cb;
    this.me = 'h-' + randomId(8);
    this.guests = new Map();      // conexión -> { playerId, rl, chatRl, fails }
    this.tokens = new Map();      // token secreto del invitado -> playerId público
    this.banned = new Set();
    this.chatLog = [];
    this.chatSeq = 0;
    this.grace = new Map();
    this.opened = false;
    this.engine = new TableEngine({ rules, format, onUpdate: batched(() => this.flush()) });
    this.engine.addPlayer({ id: this.me, name, host: true });
    this.engine.sit(this.me, 3);
    this.net = new HostTransport(code, {
      onOpen: () => { this.opened = true; clearTimeout(this.openTimer); this.cb.onJoined({ you: this.me, code }); this.sys('Sala abierta. Comparte el enlace para invitar.'); this.flush(); },
      onError: (type) => this.onNetError(type),
      onJoin: (conn) => this.onJoin(conn),
      onData: (conn, d) => this.onData(conn, d),
      onLeave: (conn) => this.onLeave(conn),
    });
  }

  open() {
    this.net.open();
    this.openTimer = setTimeout(() => { if (!this.opened) { this.net.close(); this.cb.onClosed('network'); } }, 15000);
  }

  onNetError(type) {
    if (!this.opened) { clearTimeout(this.openTimer); this.net.close(); this.cb.onClosed(type); return; }
    if (type === 'peer-unavailable') return;
    this.cb.onToast('Problema de red con el servidor de salas. Las partidas en curso siguen funcionando.', 'error');
  }

  flush() {
    const s = this.engine.publicState();
    for (const [conn, g] of this.guests) if (g.playerId) this.net.send(conn, { t: 'state', s });
    this.cb.onState(s);
  }

  onJoin(conn) {
    const g = { playerId: null, rl: new RateLimiter(30, 12), chatRl: new RateLimiter(5, 0.6), fails: 0 };
    this.guests.set(conn, g);
    g.helloTimer = setTimeout(() => { if (!g.playerId) this.net.drop(conn); }, 12000);
  }

  onData(conn, raw) {
    const g = this.guests.get(conn);
    if (!g || !g.rl.take()) return;
    const m = validateGuestMsg(raw);
    if (!m) return;
    if (!g.playerId) { if (m.t === 'hello') this.hello(conn, g, m); return; }
    const p = this.engine.players.get(g.playerId);
    if (!p) return;
    if (m.t === 'act') {
      const r = applyAct(this.engine, g.playerId, m);
      if (!r.ok) this.net.send(conn, { t: 'err', text: r.error });
    } else if (m.t === 'chat') {
      if (!g.chatRl.take()) { this.net.send(conn, { t: 'err', text: 'Espera un momento antes de escribir otra vez.' }); return; }
      this.pushChat({ from: g.playerId, name: p.name, text: m.text });
    } else if (m.t === 'ping') {
      this.net.send(conn, { t: 'pong' });
    }
  }

  uniqueName(name) {
    const base = name || 'Invitado';
    const taken = new Set([...this.engine.players.values()].map(p => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let k = 2; k < 99; k++) {
      const n = `${base.slice(0, NAME_MAX_LEN - 3)} ${k}`;
      if (!taken.has(n.toLowerCase())) return n;
    }
    return base;
  }

  hello(conn, g, m) {
    const deny = (reason) => { this.net.send(conn, { t: 'deny', reason }); };
    if (m.v !== PROTOCOL_VERSION) { deny('version'); setTimeout(() => this.net.drop(conn), 300); return; }
    if (m.token && this.banned.has(m.token)) { deny('kicked'); setTimeout(() => this.net.drop(conn), 300); return; }
    if (this.password && m.pass !== this.password) {
      g.fails++;
      deny('password');
      if (g.fails >= 5) setTimeout(() => this.net.drop(conn), 300);
      return;
    }
    clearTimeout(g.helloTimer);
    let pid = m.token ? this.tokens.get(m.token) : null;
    const existing = pid ? this.engine.players.get(pid) : null;
    if (existing && !existing.leaving) {
      for (const [c, gi] of this.guests) {
        if (c !== conn && gi.playerId === pid) { gi.playerId = null; this.guests.delete(c); this.net.drop(c); }
      }
      clearTimeout(this.grace.get(pid));
      this.grace.delete(pid);
      g.playerId = pid;
      this.engine.setConnected(pid, true);
      this.sys(`${existing.name} ha vuelto a la mesa.`);
    } else {
      const humans = [...this.engine.players.values()].filter(p => !p.bot && !p.leaving).length;
      if (humans >= MAX_PLAYERS) { deny('full'); setTimeout(() => this.net.drop(conn), 300); return; }
      const name = this.uniqueName(m.name);
      pid = 'p-' + randomId(8);
      this.engine.addPlayer({ id: pid, name });
      if (m.token) this.tokens.set(m.token, pid);
      g.playerId = pid;
      const free = SEAT_ORDER.find(i => !this.engine.seats[i].owner);
      if (free !== undefined) this.engine.sit(pid, free);
      this.sys(`${name} se ha sentado a la mesa.`);
    }
    this.net.send(conn, { t: 'welcome', v: PROTOCOL_VERSION, you: pid, code: this.code, chat: this.chatLog.slice(-60) });
    this.net.send(conn, { t: 'state', s: this.engine.publicState() });
  }

  onLeave(conn) {
    const g = this.guests.get(conn);
    this.guests.delete(conn);
    if (!g) return;
    clearTimeout(g.helloTimer);
    if (!g.playerId) return;
    const pid = g.playerId;
    const p = this.engine.players.get(pid);
    if (!p) return;
    this.engine.setConnected(pid, false);
    this.sys(`${p.name} se ha desconectado.`);
    // Se guarda su sitio un rato por si recarga la página.
    this.grace.set(pid, setTimeout(() => {
      const still = this.engine.players.get(pid);
      if (still && !still.connected) { this.engine.removePlayer(pid); this.sys(`${still.name} deja la mesa.`); }
      this.grace.delete(pid);
    }, 90000));
  }

  act(a, payload = {}) {
    const r = applyAct(this.engine, this.me, normAct(a, payload));
    if (!r.ok) this.cb.onToast(r.error, 'error');
    return r;
  }

  chat(text) {
    const t = cleanText(text, CHAT_MAX_LEN);
    if (!t) return;
    const p = this.engine.players.get(this.me);
    this.pushChat({ from: this.me, name: p ? p.name : 'Anfitrión', text: t });
  }

  sys(text) { this.pushChat({ from: null, name: '', text, sys: true }); }

  pushChat({ from, name, text, sys = false }) {
    const m = { id: ++this.chatSeq, from, name, text, ts: Date.now(), sys };
    this.chatLog.push(m);
    if (this.chatLog.length > 120) this.chatLog.shift();
    for (const [conn, g] of this.guests) if (g.playerId) this.net.send(conn, { t: 'chat', m });
    this.cb.onChat(m);
  }

  kick(pid) {
    if (pid === this.me) return;
    const p = this.engine.players.get(pid);
    if (!p) return;
    for (const [token, id] of this.tokens) if (id === pid) this.banned.add(token);
    for (const [conn, g] of this.guests) {
      if (g.playerId === pid) {
        this.net.send(conn, { t: 'kicked' });
        g.playerId = null;
        setTimeout(() => this.net.drop(conn), 300);
        this.guests.delete(conn);
      }
    }
    this.engine.removePlayer(pid);
    this.sys(`${p.name} ha sido expulsado de la sala.`);
  }

  start() { const r = this.engine.start(); if (!r.ok) this.cb.onToast(r.error, 'error'); }
  addBot() { const r = this.engine.addBot(); if (!r.ok) this.cb.onToast(r.error, 'error'); }
  removeBot(id) { this.engine.removeBot(id); }
  restart() { const r = this.engine.restart(); if (!r.ok) this.cb.onToast(r.error, 'error'); }
  updateSettings(rules, format) {
    const r = this.engine.updateSettings(rules, format);
    if (!r.ok) this.cb.onToast(r.error, 'error'); else this.sys('El anfitrión ha cambiado las reglas de la mesa.');
    return r;
  }

  leave() {
    for (const [conn] of this.guests) this.net.send(conn, { t: 'closed' });
    for (const t of this.grace.values()) clearTimeout(t);
    setTimeout(() => { this.net.close(); }, 150);
    this.engine.destroy();
  }
}

// ------------------------------------------------------------------ invitado
export class GuestRoom {
  constructor({ code, name, password = '', token, cb }) {
    this.kind = 'guest';
    this.isHost = false;
    this.code = code;
    this.name = name;
    this.password = password;
    this.token = token;
    this.cb = cb;
    this.me = null;
    this.joined = false;
    this.leaving = false;
    this.retries = 0;
  }

  open() {
    this.net = new GuestTransport(this.code, {
      onOpen: () => this.net.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name, token: this.token, pass: this.password }),
      onData: (d) => this.onData(d),
      onClose: () => this.lost(),
      onError: (type) => this.fail(type),
    });
    this.net.open();
  }

  onData(d) {
    if (!d || typeof d !== 'object') return;
    switch (d.t) {
      case 'welcome':
        this.me = typeof d.you === 'string' ? d.you : null;
        this.retries = 0;
        if (!this.joined) { this.joined = true; this.cb.onJoined({ you: this.me, code: this.code }); }
        else this.cb.onToast('Conexión recuperada.', 'ok');
        this.cb.onChatHistory(Array.isArray(d.chat) ? d.chat : []);
        break;
      case 'state': if (d.s && typeof d.s === 'object') this.cb.onState(d.s); break;
      case 'chat': if (d.m && typeof d.m === 'object') this.cb.onChat(d.m); break;
      case 'err': this.cb.onToast(cleanText(d.text, 200), 'error'); break;
      case 'deny': this.end(typeof d.reason === 'string' ? d.reason : 'denied'); break;
      case 'kicked': this.end('kicked'); break;
      case 'closed': this.end('host-left'); break;
      default: break;
    }
  }

  end(reason) {
    if (this.leaving) return;
    this.leaving = true;
    this.net.close();
    this.cb.onClosed(reason);
  }

  fail(type) {
    if (this.leaving) return;
    if (this.joined) { this.retry(); return; }
    this.end(type === 'peer-unavailable' ? 'notfound' : type);
  }

  lost() {
    if (this.leaving) return;
    if (!this.joined) { this.end('timeout'); return; }
    this.retry();
  }

  retry() {
    if (this.leaving || this.retrying) return;
    if (this.retries >= 6) { this.end('host-left'); return; }
    this.retrying = true;
    this.retries++;
    this.cb.onStatus('reconnecting');
    setTimeout(() => {
      this.retrying = false;
      if (this.leaving) return;
      try { this.net.close(); } catch (_) {}
      this.open();
    }, 1200 * this.retries);
  }

  act(a, payload = {}) { this.net.send({ t: 'act', a, ...payload }); return { ok: true }; }
  chat(text) { const t = cleanText(text, CHAT_MAX_LEN); if (t) this.net.send({ t: 'chat', text: t }); }
  leave() { this.leaving = true; if (this.net) this.net.close(); }
}
