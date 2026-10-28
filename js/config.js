// Configuración general de BlackJack.
// Este archivo es el único que normalmente tendrás que tocar al desplegar.

export const APP_NAME = 'BlackJack';

// Prefijo de los identificadores de sala en el servidor de señalización.
// Cámbialo si haces un fork, para que tus salas no compartan espacio de nombres con otras copias.
export const ROOM_PREFIX = 'blackjack-ghp-v1-';

// Opciones de PeerJS. Vacío = servidor público gratuito de PeerJS (0.peerjs.com) y sus STUN/TURN por defecto.
// Si montas tu propio servidor (npm i peer), por ejemplo:
//   export const PEER_OPTIONS = { host: 'mi-servidor.example.com', port: 443, path: '/', secure: true };
export const PEER_OPTIONS = {};

export const MAX_SEATS = 7;
export const MAX_PLAYERS = 7;
export const CHAT_MAX_LEN = 280;
export const NAME_MAX_LEN = 18;

// Solo para desarrollo local: permite apuntar a otro servidor de señalización guardando
// un JSON en localStorage['bj.peerOverride']. No se puede activar desde un enlace.
export function peerOptions() {
  try {
    const raw = localStorage.getItem('bj.peerOverride');
    if (raw) return { ...PEER_OPTIONS, ...JSON.parse(raw) };
  } catch (_) { /* sin override */ }
  return { ...PEER_OPTIONS };
}
