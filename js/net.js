// Transporte P2P con PeerJS (WebRTC). El servidor de PeerJS solo presenta a los navegadores;
// las partidas y el chat viajan cifrados (DTLS) directamente entre jugadores.
import { ROOM_PREFIX, peerOptions } from './config.js';
import { secureRandomInt } from './shoe.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[secureRandomInt(CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(input) {
  // El alfabeto evita O/0 e I/1 para que el código se pueda dictar sin errores.
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-HJ-NP-Z2-9]{6}$/.test(s) ? s : null;
}

function getPeer() {
  if (typeof window === 'undefined' || !window.Peer) throw new Error('No se ha podido cargar la librería de red (PeerJS).');
  return window.Peer;
}

const ERROR_TEXT = {
  'unavailable-id': 'Ese código de sala ya está en uso.',
  'peer-unavailable': 'No hay ninguna sala abierta con ese código.',
  'network': 'No hay conexión con el servidor de salas. Revisa tu conexión a internet.',
  'server-error': 'El servidor de salas no responde. Prueba de nuevo en un momento.',
  'socket-error': 'Se ha perdido la conexión con el servidor de salas.',
  'socket-closed': 'Se ha perdido la conexión con el servidor de salas.',
  'browser-incompatible': 'Tu navegador no admite WebRTC, necesario para jugar en línea.',
  'webrtc': 'No se pudo establecer la conexión directa con la sala (WebRTC).',
  'timeout': 'La sala no responde. Puede que el anfitrión la haya cerrado.',
};
export const netErrorText = (type) => ERROR_TEXT[type] || 'Error de conexión.';

export class HostTransport {
  constructor(code, h) { this.code = code; this.h = h; this.closed = false; this.conns = new Set(); }

  open() {
    const Peer = getPeer();
    this.peer = new Peer(ROOM_PREFIX + this.code, peerOptions());
    this.peer.on('open', () => this.h.onOpen());
    this.peer.on('connection', (conn) => {
      conn.on('open', () => { this.conns.add(conn); this.h.onJoin(conn); });
      conn.on('data', (d) => this.h.onData(conn, d));
      const gone = () => { if (this.conns.delete(conn)) this.h.onLeave(conn); };
      conn.on('close', gone);
      conn.on('error', gone);
    });
    this.peer.on('disconnected', () => {
      // Perder el servidor de señalización no corta las partidas en curso, pero impide nuevas entradas.
      if (!this.closed) setTimeout(() => { try { if (!this.closed && this.peer.disconnected) this.peer.reconnect(); } catch (_) {} }, 2000);
    });
    this.peer.on('error', (err) => this.h.onError(err.type, err));
  }

  send(conn, msg) { try { if (conn.open) conn.send(msg); } catch (_) {} }
  broadcast(msg) { for (const c of this.conns) this.send(c, msg); }
  drop(conn) { try { conn.close(); } catch (_) {} this.conns.delete(conn); }

  close() {
    this.closed = true;
    try { this.peer && this.peer.destroy(); } catch (_) {}
  }
}

export class GuestTransport {
  constructor(code, h) { this.code = code; this.h = h; this.closed = false; this.conn = null; }

  open() {
    const Peer = getPeer();
    this.peer = new Peer(undefined, peerOptions());
    this.peer.on('open', () => this.connect());
    this.peer.on('error', (err) => {
      if (this.closed) return;
      this.h.onError(err.type, err);
    });
    this.peer.on('disconnected', () => {
      if (!this.closed) setTimeout(() => { try { if (!this.closed && this.peer.disconnected) this.peer.reconnect(); } catch (_) {} }, 2000);
    });
  }

  connect() {
    if (this.closed) return;
    clearTimeout(this.openTimer);
    const conn = this.peer.connect(ROOM_PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.conn = conn;
    let opened = false;
    this.openTimer = setTimeout(() => { if (!opened && !this.closed) this.h.onError('timeout'); }, 15000);
    conn.on('open', () => { opened = true; clearTimeout(this.openTimer); this.h.onOpen(); });
    conn.on('data', (d) => this.h.onData(d));
    conn.on('close', () => { if (!this.closed && this.conn === conn) this.h.onClose(); });
    conn.on('error', () => { if (!this.closed && this.conn === conn) this.h.onClose(); });
  }

  send(msg) { try { if (this.conn && this.conn.open) this.conn.send(msg); } catch (_) {} }

  close() {
    this.closed = true;
    clearTimeout(this.openTimer);
    try { this.conn && this.conn.close(); } catch (_) {}
    try { this.peer && this.peer.destroy(); } catch (_) {}
  }
}
