// Construcción de cartas en el DOM. Todo con textContent: nada que venga de la red se interpreta como HTML.
import { isRank, isSuit, SUIT_GLYPH, SUIT_NAME } from '../cards.js';

const RANK_NAME = { A: 'As', J: 'Jota', Q: 'Reina', K: 'Rey' };
export const rankName = (r) => RANK_NAME[r] || r;

// Posiciones de los símbolos (x %, y %) dentro del área central de la carta.
const PIPS = {
  '2': [[50, 0], [50, 100]],
  '3': [[50, 0], [50, 50], [50, 100]],
  '4': [[0, 0], [100, 0], [0, 100], [100, 100]],
  '5': [[0, 0], [100, 0], [50, 50], [0, 100], [100, 100]],
  '6': [[0, 0], [100, 0], [0, 50], [100, 50], [0, 100], [100, 100]],
  '7': [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [0, 100], [100, 100]],
  '8': [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [50, 75], [0, 100], [100, 100]],
  '9': [[0, 0], [100, 0], [0, 33.3], [100, 33.3], [50, 50], [0, 66.6], [100, 66.6], [0, 100], [100, 100]],
  '10': [[0, 0], [100, 0], [50, 16.6], [0, 33.3], [100, 33.3], [0, 66.6], [100, 66.6], [50, 83.3], [0, 100], [100, 100]],
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function index(r, g, cls) {
  const s = el('span', 'idx ' + cls);
  s.append(el('b', null, r), el('i', null, g));
  return s;
}

function buildFace(r, s) {
  const g = SUIT_GLYPH[s];
  const frag = document.createDocumentFragment();
  frag.append(index(r, g, 'tl'), index(r, g, 'br'));
  // Clásica: símbolos o figura
  const art = el('div', 'art');
  if (r === 'A') {
    art.classList.add('ace');
    art.append(el('span', 'pip big', g));
  } else if (r === 'J' || r === 'Q' || r === 'K') {
    art.classList.add('court');
    const frame = el('div', 'court-frame');
    frame.append(el('span', 'court-suit top', g), el('span', 'court-letter', r), el('span', 'court-suit bottom', g));
    art.append(frame);
  } else {
    art.classList.add('pips');
    for (const [x, y] of PIPS[r]) {
      const p = el('span', 'pip' + (y > 50 ? ' flip' : ''), g);
      p.style.left = x + '%';
      p.style.top = y + '%';
      art.append(p);
    }
  }
  frag.append(art);
  // Moderna: rango grande al centro
  const mod = el('div', 'modern');
  mod.append(el('b', null, r), el('i', null, g));
  frag.append(mod);
  return frag;
}

export function createCardEl(card) {
  const root = el('div', 'card down');
  root.dataset.id = String(card.id);
  const inner = el('div', 'card-inner');
  const front = el('div', 'face front');
  const back = el('div', 'face back');
  back.append(el('span', 'back-art'));
  inner.append(front, back);
  root.append(inner);
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Carta boca abajo');
  setCardFace(root, card);
  return root;
}

// Devuelve true si la carta ha pasado a estar boca arriba en esta llamada.
export function setCardFace(root, card) {
  const front = root.querySelector('.front');
  const r = card && isRank(card.r) ? card.r : null;
  const s = card && isSuit(card.s) ? card.s : null;
  if (!r || !s) {
    root.dataset.face = '';
    root.setAttribute('aria-label', 'Carta boca abajo');
    return false;
  }
  const key = r + s;
  if (root.dataset.face === key) return false;
  root.dataset.face = key;
  front.replaceChildren(buildFace(r, s));
  front.className = 'face front suit-' + s + (s === 'H' || s === 'D' ? ' red' : ' black');
  root.setAttribute('aria-label', `${rankName(r)} de ${SUIT_NAME[s]}`);
  return true;
}

// Carta estática para previsualizaciones (personalización, guía)
export function staticCard(r, s, faceDown = false) {
  const c = createCardEl({ id: 'x', r, s });
  if (!faceDown) c.classList.remove('down');
  c.classList.add('static');
  return c;
}
