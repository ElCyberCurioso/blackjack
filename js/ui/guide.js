// Guía de BlackJack: reglas, pagos, modos, estrategia básica generada y conteo de cartas.
import { PRESETS, FORMATS, presetRules, houseEdge, payoutLabel, describeRules } from '../rules.js';
import { chartCode, DEVIATIONS } from '../strategy.js';
import { makeDialog } from './dialogs.js';
import { staticCard } from './cardview.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function p(text) { return el('p', null, text); }
function h(text) { return el('h3', null, text); }
function list(items, ordered = false) {
  const l = el(ordered ? 'ol' : 'ul');
  for (const it of items) {
    const li = el('li');
    if (Array.isArray(it)) { li.append(el('strong', null, it[0] + ' '), document.createTextNode(it[1])); }
    else li.textContent = it;
    l.append(li);
  }
  return l;
}
function cardsRow(spec) {
  const row = el('div', 'guide-cards');
  for (const [r, s] of spec) row.append(staticCard(r, s));
  return row;
}

// Etiquetas españolas de la tabla
const CODE = {
  H: ['P', 'Pedir', 'c-hit'],
  S: ['Q', 'Plantarse', 'c-stand'],
  D: ['D', 'Doblar; si no se puede, pedir', 'c-double'],
  Ds: ['Dq', 'Doblar; si no se puede, plantarse', 'c-double'],
  P: ['S', 'Separar (dividir)', 'c-split'],
  Rh: ['R', 'Rendirse; si no se puede, pedir', 'c-surr'],
  Rs: ['Rq', 'Rendirse; si no se puede, plantarse', 'c-surr'],
  Rp: ['Rs', 'Rendirse; si no se puede, separar', 'c-surr'],
};

const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const upCardFor = (u) => (u === 11 ? 'A' : u === 10 ? 'K' : String(u));

function chartTable(title, rows, rules) {
  const wrap = el('div', 'chart-wrap');
  const t = el('table', 'chart');
  const cap = el('caption', null, title);
  t.append(cap);
  const thead = el('thead');
  const hr = el('tr');
  hr.append(el('th', 'corner', 'Tú \\ Crupier'));
  for (const u of UPS) hr.append(el('th', null, u === 11 ? 'A' : String(u)));
  thead.append(hr);
  t.append(thead);
  const tb = el('tbody');
  for (const [label, cards] of rows) {
    const tr = el('tr');
    tr.append(el('th', null, label));
    for (const u of UPS) {
      const { code } = chartCode(cards, u, rules);
      const [txt, desc, cls] = CODE[code] || ['?', '', ''];
      const td = el('td', cls, txt);
      td.title = desc;
      tr.append(td);
    }
    tb.append(tr);
  }
  t.append(tb);
  wrap.append(t);
  return wrap;
}

const C = (r) => ({ r, s: 'S' });
function hardRows() {
  const rows = [['5 a 8', [C('2'), C('6')]]];
  const combos = { 9: ['2', '7'], 10: ['3', '7'], 11: ['4', '7'], 12: ['3', '9'], 13: ['4', '9'], 14: ['5', '9'], 15: ['6', '9'], 16: ['7', '9'], 17: ['8', '9'] };
  for (let t = 9; t <= 17; t++) rows.push([t === 17 ? '17 o más' : String(t), combos[t].map(C)]);
  return rows;
}
function softRows() {
  const out = [];
  for (let k = 2; k <= 9; k++) out.push([`A,${k}`, [C('A'), C(String(k))]]);
  return out;
}
function pairRows() {
  const out = [];
  for (const r of ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']) out.push([`${r},${r}`, [C(r), C(r)]]);
  return out;
}

function strategySection(container, initialRules) {
  const sec = el('div');
  sec.append(p('La estrategia básica es la jugada matemáticamente mejor para cada mano contra cada carta visible del crupier, sin contar cartas. Bien jugada, deja la ventaja de la casa por debajo del 1 %. La tabla cambia un poco con las reglas: elige la mesa y se recalcula.'));
  const pick = el('select', 'chart-pick');
  const opts = [['current', 'La mesa actual'], ...PRESETS.filter(x => x.id !== 'custom').map(x => [x.id, x.name])];
  for (const [v, l] of opts) { const o = el('option', null, l); o.value = v; pick.append(o); }
  if (!initialRules) pick.querySelector('option[value="current"]').remove();
  const lab = el('label', 'field inline');
  lab.append(el('span', 'field-label', 'Reglas'), pick);
  sec.append(lab);
  const legend = el('div', 'chart-legend');
  for (const k of ['H', 'S', 'D', 'Ds', 'P', 'Rh', 'Rs', 'Rp']) {
    const [txt, desc, cls] = CODE[k];
    const item = el('span', 'lg');
    item.append(el('b', cls, txt), document.createTextNode(desc));
    legend.append(item);
  }
  sec.append(legend);
  const host = el('div', 'charts');
  sec.append(host);
  const draw = () => {
    const rules = pick.value === 'current' ? initialRules : presetRules(pick.value);
    host.replaceChildren(
      el('p', 'chart-rules', describeRules(rules).slice(0, 6).join('. ') + '.'),
      chartTable('Manos duras (sin as, o con el as valiendo 1)', hardRows(), rules),
      chartTable('Manos blandas (un as que vale 11)', softRows(), rules),
      chartTable('Parejas', pairRows(), rules),
    );
  };
  pick.addEventListener('change', draw);
  draw();
  sec.append(p('Cómo leerla: busca tu mano en la fila y la carta del crupier en la columna. Una pareja de 5 nunca se separa: juégala como un 10 duro. Si la tabla dice separar y ya no puedes (límite de manos), juega el total como mano dura o blanda.'));
  container.append(sec);
}

function countingSection(c) {
  c.append(
    p('Contar cartas no es memorizarlas: es llevar una cuenta sencilla que te dice si lo que queda en el zapato favorece al jugador. Cuando quedan muchas cartas altas (dieces y ases) salen más blackjacks, que pagan 3 a 2, y el crupier se pasa más a menudo porque está obligado a pedir hasta 17. En BlackJack el zapato es real: se baraja una vez, se reparte hasta la carta de corte y todas las cartas que ves cuentan, también las de los demás jugadores y la carta tapada del crupier cuando se descubre. La carta quemada al empezar el zapato no se ve, como en un casino.'),
    h('El sistema Hi-Lo'),
    cardsRow([['2', 'H'], ['3', 'C'], ['4', 'D'], ['5', 'S'], ['6', 'H']]),
    p('Del 2 al 6 suman +1.'),
    cardsRow([['7', 'C'], ['8', 'D'], ['9', 'S']]),
    p('Del 7 al 9 valen 0.'),
    cardsRow([['10', 'H'], ['J', 'C'], ['Q', 'D'], ['K', 'S'], ['A', 'H']]),
    p('Los dieces, figuras y ases restan −1.'),
    p('La cuenta corriente es la suma de todas las cartas vistas desde el último barajado. Una baraja completa suma 0, así que si la cuenta es positiva, lo que queda tiene más cartas altas de lo normal.'),
    h('Cuenta verdadera'),
    p('Un +6 no significa lo mismo con una baraja por delante que con cinco. Por eso se divide la cuenta corriente entre las barajas que quedan por repartir: cuenta verdadera = cuenta corriente ÷ barajas restantes. Mira la bandeja de descartes para estimar cuántas barajas han salido y réstalas del total del zapato. Cada punto de cuenta verdadera vale aproximadamente un 0,5 % de ventaja para el jugador.'),
    h('Cuándo subir la apuesta'),
    p('Con cuenta verdadera +1 la partida suele estar igualada; a partir de +2 el jugador tiene ventaja. Una progresión habitual: apuesta mínima hasta +1, y una unidad más por cada punto a partir de ahí (2 unidades con +2, 4 con +4...). En negativo, apuesta lo mínimo o levántate de la mesa. La diferencia entre tu apuesta mínima y la máxima se llama horquilla.'),
    h('La penetración lo es todo'),
    p('Cuanto más se reparte antes de barajar, más tiempo pasas con cuentas altas. Con 75 % de penetración en seis barajas se reparten 4,5 barajas; con 50 % solo 3. En la mesa puedes ver la carta de corte dentro del zapato (la línea amarilla). En el modo personalizado puedes ajustarla.'),
    h('Desviaciones de la estrategia básica'),
    p('Con la cuenta en la mano algunas jugadas cambian. Estas son las más rentables (las 18 «ilustres» y las cuatro rendiciones de las «Fab 4»), calculadas para varias barajas:'),
    list(DEVIATIONS.map(d => d.text)),
    h('Practicar aquí'),
    list([
      ['Entrenador de conteo:', 'muestra la cuenta Hi-Lo bajo demanda, te avisa cuando te desvías de la estrategia y cada pocas manos te pregunta la cuenta corriente.'],
      ['Contador en pantalla:', 'actívalo en Personalizar para ver cuenta corriente, verdadera, barajas restantes y ventaja estimada. El anfitrión puede prohibirlo en su sala; en torneo siempre está desactivado.'],
      ['Velocidad turbo:', 'cuando cuentes bien a ritmo normal, sube la velocidad. En un casino real se reparten unas 60-80 manos por hora.'],
      ['Totales ocultos:', 'quita el total de las manos en Personalizar para practicar como en una mesa de verdad.'],
    ]),
    p('Contar cartas mentalmente es legal, pero los casinos pueden negarse a dejarte jugar si sospechan que cuentas. Aquí solo te jugarás fichas de mentira.'),
  );
}

export function openGuide(currentRules = null, startTab = 'basico') {
  const { dlg, body, foot } = makeDialog('Cómo se juega al blackjack', { cls: 'dlg-guide' });
  const layout = el('div', 'guide');
  const nav = el('nav', 'guide-nav');
  nav.setAttribute('aria-label', 'Secciones de la guía');
  const content = el('div', 'guide-content');
  content.tabIndex = -1;
  layout.append(nav, content);
  body.append(layout);

  const sections = [
    ['basico', 'Lo básico', (c) => {
      c.append(
        p('Juegas contra el crupier, no contra los demás jugadores. Ganas si tu mano se acerca más a 21 que la suya sin pasarte, o si el crupier se pasa de 21 y tú no.'),
        h('Valor de las cartas'),
        list([
          ['Del 2 al 10:', 'valen lo que marcan.'],
          ['Jota, reina y rey:', 'valen 10.'],
          ['As:', 'vale 11 o 1, lo que más te convenga. Una mano con un as que vale 11 se llama blanda (as y 6 es un 17 blando): no puedes pasarte pidiendo una carta.'],
        ]),
        cardsRow([['A', 'S'], ['K', 'H']]),
        h('Blackjack'),
        p('Un as y una carta de valor 10 con tus dos primeras cartas es un blackjack: la mejor mano. Normalmente paga 3 a 2 (ganas 15 por cada 10 apostados). Si el crupier también tiene blackjack, es empate. Un 21 hecho con más cartas, o tras separar, es un 21 normal y paga 1 a 1.'),
        h('El crupier no decide'),
        p('El crupier sigue una regla fija: pide carta con 16 o menos y se planta con 17 o más. En algunas mesas pide también con 17 blando (H17), lo que favorece un poco a la casa. La regla está impresa en el tapete.'),
      );
    }],
    ['mano', 'Una mano paso a paso', (c) => {
      c.append(list([
        ['Apuesta.', 'Elige ficha y pulsa en tu círculo de apuesta. Respeta el mínimo y el máximo de la mesa. Puedes ocupar más de un asiento.'],
        ['Reparto.', 'El crupier da una carta boca arriba a cada asiento empezando por su izquierda (el asiento 1, a tu derecha), una para él boca arriba, una segunda carta a cada jugador y otra para él boca abajo (la carta tapada). En el modo europeo no recibe la segunda hasta el final.'],
        ['Seguro.', 'Si la carta visible del crupier es un as, puedes asegurar tu mano pagando la mitad de tu apuesta. Si tiene blackjack, el seguro paga 2 a 1.'],
        ['Revisión.', 'Con un as o un 10 visible, el crupier mira su carta tapada. Si tiene blackjack, la mano termina ahí y solo pierdes la apuesta original.'],
        ['Tu turno.', 'Cada jugador decide por orden, del asiento 1 al 7. Pide, plántate, dobla, separa o ríndete.'],
        ['El crupier.', 'Descubre su carta y pide hasta llegar a 17 o pasarse.'],
        ['Pagos.', 'Se pagan las manos ganadoras, se recogen las perdedoras y las cartas van a la bandeja de descartes. Cuando sale la carta de corte, se termina la mano y se baraja el zapato.'],
      ], true));
    }],
    ['decisiones', 'Tus decisiones', (c) => {
      c.append(list([
        ['Pedir (1):', 'recibes otra carta. Puedes pedir tantas como quieras hasta plantarte o pasarte de 21.'],
        ['Plantarse (2):', 'te quedas con lo que tienes y pasa el turno.'],
        ['Doblar (3):', 'con tus dos primeras cartas, duplicas la apuesta y recibes exactamente una carta más. Es la jugada que más dinero gana a la larga con 10 u 11. Algunas mesas solo dejan doblar con 9, 10 u 11, o con 10 u 11.'],
        ['Separar (4):', 'si tus dos cartas tienen el mismo valor, las separas en dos manos y pones otra apuesta igual. Cada mano recibe su segunda carta y se juega por separado. Los ases separados reciben una sola carta cada uno. En la mayoría de mesas puedes doblar después de separar.'],
        ['Rendirse (5):', 'con tus dos primeras cartas, abandonas la mano y recuperas la mitad de la apuesta. Solo después de que el crupier haya revisado si tiene blackjack (rendición tardía).'],
        ['Seguro y dinero par:', 'apuesta lateral cuando el crupier muestra un as. Si tienes blackjack, el seguro se llama dinero par: cobras 1 a 1 en el acto. Sin contar cartas, el seguro es mala apuesta.'],
      ]));
    }],
    ['pagos', 'Pagos', (c) => {
      const t = el('table', 'pay');
      const rows = [
        ['Ganas la mano', '1 a 1', 'Apuestas 10, cobras 10 y recuperas tu apuesta'],
        ['Blackjack (mesa 3 a 2)', '3 a 2', 'Apuestas 10, cobras 15'],
        ['Blackjack (mesa 6 a 5)', '6 a 5', 'Apuestas 10, cobras 12: evita estas mesas'],
        ['Seguro', '2 a 1', 'Aseguras 5, cobras 10 si el crupier tiene blackjack'],
        ['Empate', 'Se devuelve', 'Recuperas la apuesta'],
        ['Rendición', 'Mitad', 'Recuperas 5 de cada 10'],
      ];
      const head = el('tr');
      for (const x of ['Situación', 'Paga', 'Ejemplo']) head.append(el('th', null, x));
      t.append(head);
      for (const r of rows) { const tr = el('tr'); for (const x of r) tr.append(el('td', null, x)); t.append(tr); }
      c.append(t);
    }],
    ['modos', 'Modos de juego', (c) => {
      c.append(p('Cada mesa reproduce reglas reales de casino. La ventaja de la casa es aproximada y supone que juegas estrategia básica perfecta.'));
      for (const pr of PRESETS.filter(x => x.id !== 'custom')) {
        const r = presetRules(pr.id);
        const box = el('div', 'mode-box');
        box.append(el('h4', null, `${pr.name}: ventaja de la casa ≈ ${houseEdge(r).toLocaleString('es-ES')} %`), p(pr.blurb), el('p', 'mode-rules', describeRules(r).join('. ') + '.'));
        c.append(box);
      }
      c.append(h('Personalizado'), p('Elige cada regla: número de barajas, penetración, pago del blackjack (3 a 2, 6 a 5 o 1 a 1), si el crupier pide con 17 blando, cuándo se puede doblar, cuántas veces separar, rendición, seguro, mesa europea y límites de apuesta.'));
      c.append(h('Formatos'));
      c.append(list(FORMATS.map(f => [f.name + ':', f.blurb])));
      c.append(h('Salas privadas'), p('Crea una sala, copia el enlace de invitación y compártelo. Quien lo abra entra directamente en tu mesa, con chat incluido. Tu navegador hace de mesa: si cierras la pestaña, la sala se cierra para todos. Si un invitado recarga la página, recupera su asiento.'));
    }],
    ['estrategia', 'Estrategia básica', (c) => strategySection(c, currentRules)],
    ['conteo', 'Contar cartas', countingSection],
    ['teclado', 'Atajos de teclado', (c) => {
      c.append(list([
        ['1 a 5:', 'pedir, plantarse, doblar, separar y rendirse.'],
        ['Intro:', 'repartir cuando ya has apostado.'],
        ['S / N:', 'aceptar o rechazar el seguro.'],
        ['?:', 'pedir consejo de estrategia.'],
        ['C:', 'mostrar u ocultar el contador.'],
        ['Esc:', 'cerrar ventanas.'],
      ]));
    }],
    ['glosario', 'Glosario', (c) => {
      c.append(list([
        ['Zapato:', 'caja de la que se reparten las cartas cuando se juega con varias barajas.'],
        ['Carta de corte:', 'tarjeta de plástico que se coloca en el zapato. Cuando sale, se termina la mano en curso y se baraja.'],
        ['Penetración:', 'porcentaje del zapato que se reparte antes de barajar.'],
        ['Carta quemada:', 'primera carta del zapato, que se descarta sin enseñarla.'],
        ['Carta tapada:', 'la segunda carta del crupier, boca abajo.'],
        ['Mano dura / blanda:', 'sin as que valga 11 / con un as que vale 11.'],
        ['S17 / H17:', 'el crupier se planta / pide con 17 blando.'],
        ['DAS:', 'se permite doblar después de separar.'],
        ['Primera base / tercera base:', 'el primer / último asiento en jugar.'],
        ['Cuenta corriente / verdadera:', 'suma Hi-Lo de las cartas vistas / esa suma dividida entre las barajas restantes.'],
        ['Horquilla de apuestas:', 'diferencia entre tu apuesta mínima y máxima cuando cuentas.'],
      ]));
    }],
  ];

  const buttons = [];
  const show = (id) => {
    const sec = sections.find(s => s[0] === id) || sections[0];
    content.replaceChildren(el('h2', 'guide-h', sec[1]));
    sec[2](content);
    content.scrollTop = 0;
    for (const b of buttons) b.setAttribute('aria-current', b.dataset.id === sec[0] ? 'page' : 'false');
  };
  for (const [id, title] of sections) {
    const b = el('button', 'guide-tab', title);
    b.type = 'button';
    b.dataset.id = id;
    b.addEventListener('click', () => { show(id); content.focus({ preventScroll: true }); });
    buttons.push(b);
    nav.append(b);
  }
  show(startTab);
  const close = el('button', 'btn primary', 'Cerrar la guía');
  close.type = 'button';
  close.addEventListener('click', () => dlg.close());
  foot.append(close);
  dlg.showModal();
  return dlg;
}

export { payoutLabel };
