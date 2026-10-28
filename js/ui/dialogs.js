// Diálogos: configurar partida, personalizar, unirse por enlace, preguntas de conteo y confirmaciones.
import { PRESETS, FORMATS, DEFAULT_RULES, DEFAULT_FORMAT, sanitizeRules, sanitizeFormat, presetRules, houseEdge, payoutLabel } from '../rules.js';
import { FELTS, RAILS, BACKS, BACK_COLORS, FACES, SPEEDS } from '../prefs.js';
import { staticCard } from './cardview.js';
import { chipEl } from './table.js';
import { NAME_MAX_LEN } from '../config.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

export function makeDialog(title, { cls = '', closable = true } = {}) {
  const dlg = el('dialog', 'dlg ' + cls);
  const head = el('header', 'dlg-head');
  const h = el('h2', null, title);
  h.id = nextId('dlg-title');
  dlg.setAttribute('aria-labelledby', h.id);
  head.append(h);
  if (closable) {
    const x = el('button', 'dlg-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cerrar');
    x.addEventListener('click', () => dlg.close('cancel'));
    head.append(x);
  } else {
    dlg.addEventListener('cancel', (e) => e.preventDefault());
  }
  const body = el('div', 'dlg-body');
  const foot = el('footer', 'dlg-foot');
  dlg.append(head, body, foot);
  dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 50));
  document.body.append(dlg);
  return { dlg, body, foot, title: h };
}

function button(text, cls, onClick, type = 'button') {
  const b = el('button', 'btn ' + cls, text);
  b.type = type;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function field(labelText, control, hint) {
  const wrap = el('label', 'field');
  wrap.append(el('span', 'field-label', labelText), control);
  if (hint) wrap.append(el('span', 'field-hint', hint));
  return wrap;
}

function select(options, value) {
  const s = el('select');
  for (const [v, label] of options) {
    const o = el('option', null, label);
    o.value = String(v);
    if (String(v) === String(value)) o.selected = true;
    s.append(o);
  }
  return s;
}

function toggle(labelText, checked, hint) {
  const wrap = el('label', 'toggle');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = !!checked;
  const txt = el('span', 'toggle-text');
  txt.append(el('span', null, labelText));
  if (hint) txt.append(el('small', null, hint));
  wrap.append(cb, el('span', 'switch'), txt);
  return { wrap, cb };
}

function radioCards(name, items, value, render) {
  const group = el('div', 'radio-cards');
  group.setAttribute('role', 'radiogroup');
  const inputs = [];
  for (const it of items) {
    const lab = el('label', 'rcard');
    const inp = el('input');
    inp.type = 'radio';
    inp.name = name;
    inp.value = it.id;
    inp.checked = it.id === value;
    inputs.push(inp);
    lab.append(inp, render(it));
    group.append(lab);
  }
  return { group, inputs, get value() { return (inputs.find(i => i.checked) || inputs[0]).value; } };
}

// ------------------------------------------------------------------ configurar partida
export function openSetup({ mode, initial = {}, onSubmit }) {
  const titles = { solo: 'Partida en solitario', host: 'Crear sala privada', edit: 'Reglas de la mesa' };
  const { dlg, body, foot } = makeDialog(titles[mode], { cls: 'dlg-setup' });
  const form = el('form', 'setup-form');
  form.id = nextId('setup');
  body.append(form);

  let rules = sanitizeRules(initial.rules || presetRules(initial.preset || 'vegas'));
  let preset = initial.preset || 'vegas';
  const fmt = sanitizeFormat({ ...DEFAULT_FORMAT, ...(initial.format || {}) });

  // Modo (reglas)
  const modeSec = el('fieldset', 'sec');
  modeSec.append(el('legend', null, 'Mesa'));
  const presetCards = radioCards('preset', PRESETS, preset, (p) => {
    const box = el('span', 'rcard-body');
    box.append(el('strong', null, p.name), el('span', 'rcard-text', p.blurb));
    if (p.id !== 'custom') box.append(el('span', 'rcard-meta', `Ventaja de la casa ≈ ${houseEdge(presetRules(p.id)).toLocaleString('es-ES')} %`));
    else { const m = el('span', 'rcard-meta edge-custom'); box.append(m); }
    return box;
  });
  modeSec.append(presetCards.group);

  // Reglas detalladas
  const det = el('details', 'rules-edit');
  det.append(el('summary', null, 'Ajustar las reglas una a una'));
  const grid = el('div', 'field-grid');
  const f = {
    decks: select([[1, '1 baraja'], [2, '2 barajas'], [4, '4 barajas'], [6, '6 barajas'], [8, '8 barajas']], rules.decks),
    penetration: el('input'),
    bjPayout: select([[1.5, '3 a 2'], [1.2, '6 a 5'], [1, '1 a 1']], rules.bjPayout),
    h17: select([['false', 'Se planta con 17 blando (S17)'], ['true', 'Pide con 17 blando (H17)']], String(rules.h17)),
    doubleOn: select([['any', 'Dos cartas cualesquiera'], ['9-11', 'Solo 9, 10 u 11'], ['10-11', 'Solo 10 u 11']], rules.doubleOn),
    maxHands: select([[1, 'No se puede dividir'], [2, 'Una vez (2 manos)'], [3, 'Hasta 3 manos'], [4, 'Hasta 4 manos']], rules.maxHands),
    surrender: select([['none', 'No'], ['late', 'Tardía']], rules.surrender),
    holeCard: select([['true', 'Con carta tapada (americano)'], ['false', 'Sin carta tapada (europeo)']], String(rules.holeCard)),
    minBet: select([[1, '1'], [5, '5'], [10, '10'], [25, '25'], [100, '100']], rules.minBet),
    maxBet: select([[200, '200'], [500, '500'], [1000, '1.000'], [2500, '2.500'], [5000, '5.000'], [10000, '10.000']], rules.maxBet),
  };
  f.penetration.type = 'range';
  f.penetration.min = '50'; f.penetration.max = '90'; f.penetration.step = '5';
  f.penetration.value = String(Math.round(rules.penetration * 100));
  const penOut = el('output', 'range-out', `${f.penetration.value} %`);
  const penWrap = el('div', 'range-wrap');
  penWrap.append(f.penetration, penOut);
  const t = {
    das: toggle('Doblar tras dividir', rules.das),
    resplitAces: toggle('Redividir ases', rules.resplitAces),
    hitSplitAces: toggle('Pedir con ases divididos', rules.hitSplitAces),
    insurance: toggle('Ofrecer seguro', rules.insurance),
    enhcOBO: toggle('Europeo: perder solo la apuesta original', rules.enhcOBO, 'Ante blackjack del crupier se devuelven dobles y divisiones'),
  };
  grid.append(
    field('Barajas', f.decks),
    field('Penetración (carta de corte)', penWrap, 'Cuánto zapato se reparte antes de barajar. Más penetración, mejor para contar.'),
    field('Blackjack paga', f.bjPayout),
    field('Crupier con 17 blando', f.h17),
    field('Doblar con', f.doubleOn),
    field('Dividir', f.maxHands),
    field('Rendición', f.surrender),
    field('Carta del crupier', f.holeCard),
    field('Apuesta mínima', f.minBet),
    field('Apuesta máxima', f.maxBet),
  );
  const toggles = el('div', 'toggle-grid');
  for (const k of Object.keys(t)) toggles.append(t[k].wrap);
  det.append(grid, toggles);
  modeSec.append(det);
  form.append(modeSec);

  const readRules = () => sanitizeRules({
    ...DEFAULT_RULES,
    decks: Number(f.decks.value),
    penetration: Number(f.penetration.value) / 100,
    bjPayout: Number(f.bjPayout.value),
    h17: f.h17.value === 'true',
    doubleOn: f.doubleOn.value,
    maxHands: Number(f.maxHands.value),
    surrender: f.surrender.value,
    holeCard: f.holeCard.value === 'true',
    minBet: Number(f.minBet.value),
    maxBet: Number(f.maxBet.value),
    das: t.das.cb.checked,
    resplitAces: t.resplitAces.cb.checked,
    hitSplitAces: t.hitSplitAces.cb.checked,
    insurance: t.insurance.cb.checked,
    enhcOBO: t.enhcOBO.cb.checked,
  });
  const writeRules = (r) => {
    f.decks.value = String(r.decks);
    f.penetration.value = String(Math.round(r.penetration * 100));
    penOut.textContent = `${f.penetration.value} %`;
    f.bjPayout.value = String(r.bjPayout);
    f.h17.value = String(r.h17);
    f.doubleOn.value = r.doubleOn;
    f.maxHands.value = String(r.maxHands);
    f.surrender.value = r.surrender;
    f.holeCard.value = String(r.holeCard);
    f.minBet.value = String(r.minBet);
    f.maxBet.value = String(r.maxBet);
    t.das.cb.checked = r.das;
    t.resplitAces.cb.checked = r.resplitAces;
    t.hitSplitAces.cb.checked = r.hitSplitAces;
    t.insurance.cb.checked = r.insurance;
    t.enhcOBO.cb.checked = r.enhcOBO;
  };
  const edgeCustom = modeSec.querySelector('.edge-custom');
  const refreshEdge = () => { edgeCustom.textContent = `Ventaja de la casa ≈ ${houseEdge(readRules()).toLocaleString('es-ES')} %`; };
  writeRules(rules);
  refreshEdge();
  if (preset === 'custom') det.open = true;
  presetCards.inputs.forEach(inp => inp.addEventListener('change', () => {
    if (inp.value !== 'custom') {
      const keep = readRules();
      const r = presetRules(inp.value);
      r.minBet = keep.minBet; r.maxBet = keep.maxBet;
      writeRules(r);
    } else det.open = true;
    refreshEdge();
  }));
  const toCustom = () => {
    const cur = presetCards.inputs.find(i => i.value === 'custom');
    if (!cur.checked) cur.checked = true;
    refreshEdge();
  };
  for (const c of [...Object.values(f), ...Object.values(t).map(x => x.cb)]) {
    c.addEventListener('input', () => {
      if (c === f.penetration) penOut.textContent = `${f.penetration.value} %`;
      if (c === f.minBet || c === f.maxBet) { refreshEdge(); return; }
      toCustom();
    });
  }

  // Formato
  const fmtSec = el('fieldset', 'sec');
  fmtSec.append(el('legend', null, 'Formato'));
  const fmtCards = radioCards('format', FORMATS, fmt.type, (x) => {
    const box = el('span', 'rcard-body');
    box.append(el('strong', null, x.name), el('span', 'rcard-text', x.blurb));
    return box;
  });
  fmtSec.append(fmtCards.group);
  const fGrid = el('div', 'field-grid');
  const bankroll = select([[500, '500'], [1000, '1.000'], [2500, '2.500'], [5000, '5.000'], [10000, '10.000'], [50000, '50.000']], fmt.bankroll);
  const hands = select([[10, '10 manos'], [20, '20 manos'], [30, '30 manos'], [50, '50 manos'], [100, '100 manos']], fmt.hands);
  const handsField = field('Duración del torneo', hands);
  fGrid.append(field(mode === 'solo' ? 'Banca inicial (si no tienes una guardada)' : 'Banca inicial de cada jugador', bankroll), handsField);
  fmtSec.append(fGrid);
  const syncFmt = () => { handsField.hidden = fmtCards.value !== 'torneo'; };
  fmtCards.inputs.forEach(i => i.addEventListener('change', syncFmt));
  syncFmt();
  form.append(fmtSec);

  // Sala o bots
  let extra = {};
  if (mode === 'host' || mode === 'edit') {
    const sec = el('fieldset', 'sec');
    sec.append(el('legend', null, 'Sala'));
    const g = el('div', 'field-grid');
    const pass = el('input');
    pass.type = 'text';
    pass.maxLength = 32;
    pass.autocomplete = 'off';
    pass.placeholder = 'Sin contraseña';
    pass.value = initial.password || '';
    const betTime = select([[15, '15 s'], [25, '25 s'], [40, '40 s'], [0, 'Sin límite']], initial.format ? fmt.betTime : 25);
    const actionTime = select([[15, '15 s'], [25, '25 s'], [40, '40 s'], [0, 'Sin límite']], initial.format ? fmt.actionTime : 25);
    const pace = select(Object.entries(SPEEDS).map(([k, v]) => [v.pace, v.name]), fmt.pace);
    const seats = select([[1, '1 asiento'], [2, '2 asientos'], [3, '3 asientos']], Math.min(3, fmt.maxSeatsPerPlayer));
    const hud = toggle('Permitir el contador en pantalla', fmt.allowHud, 'En torneo siempre está desactivado');
    if (mode === 'host') g.append(field('Contraseña (opcional)', pass, 'Se pedirá a quien entre con el enlace'));
    g.append(field('Tiempo para apostar', betTime), field('Tiempo por decisión', actionTime), field('Ritmo del crupier', pace), field('Asientos por jugador', seats));
    sec.append(g, hud.wrap);
    form.append(sec);
    extra = { pass, betTime, actionTime, pace, seats, hud };
  } else {
    const sec = el('fieldset', 'sec');
    sec.append(el('legend', null, 'Compañeros de mesa'));
    const bots = select([[0, 'Ninguno: solo tú y el crupier'], [1, '1 bot'], [2, '2 bots'], [3, '3 bots'], [4, '4 bots'], [6, 'Mesa llena (6 bots)']], initial.bots ?? 2);
    const g = el('div', 'field-grid');
    g.append(field('Bots que juegan con estrategia básica', bots, 'Más jugadores, más cartas vistas por ronda: el zapato avanza como en un casino'));
    sec.append(g);
    form.append(sec);
    extra = { bots };
  }

  const cancel = button('Cancelar', 'ghost', () => dlg.close('cancel'));
  const ok = button(mode === 'host' ? 'Crear sala' : mode === 'edit' ? 'Aplicar reglas' : 'Empezar', 'primary', null, 'submit');
  ok.setAttribute('form', form.id);
  foot.append(cancel, ok);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = readRules();
    const type = fmtCards.value;
    const out = {
      preset: presetCards.value,
      rules: r,
      format: {
        ...fmt,
        type,
        bankroll: Number(bankroll.value),
        hands: Number(hands.value),
      },
    };
    if (extra.bots) out.bots = Number(extra.bots.value);
    if (extra.betTime) {
      out.format.betTime = Number(extra.betTime.value);
      out.format.actionTime = Number(extra.actionTime.value);
      out.format.pace = Number(extra.pace.value);
      out.format.maxSeatsPerPlayer = Number(extra.seats.value);
      out.format.allowHud = type !== 'torneo' && extra.hud.cb.checked;
      out.password = extra.pass.value.trim();
    }
    out.format = sanitizeFormat(out.format);
    dlg.close('ok');
    onSubmit(out);
  });

  dlg.showModal();
  return dlg;
}

// ------------------------------------------------------------------ personalizar
export function openCustomize(prefs, onChange) {
  const { dlg, body, foot } = makeDialog('Personalizar', { cls: 'dlg-custom' });
  const p = { ...prefs };
  const push = () => onChange({ ...p });

  const preview = el('div', 'preview');
  const pvFelt = el('div', 'pv-felt');
  const cards = el('div', 'pv-cards');
  cards.append(staticCard('A', 'S'), staticCard('10', 'H'), staticCard('K', 'D'), staticCard('7', 'C'), staticCard('Q', 'S', true));
  const chips = el('div', 'pv-chips');
  for (const d of [5, 25, 100, 500]) chips.append(chipEl(d));
  pvFelt.append(cards, chips);
  preview.append(pvFelt);
  body.append(preview);

  const swatchGroup = (legend, entries, key, render) => {
    const fs = el('fieldset', 'sec');
    fs.append(el('legend', null, legend));
    const row = el('div', 'swatches');
    row.setAttribute('role', 'radiogroup');
    for (const [k, v] of entries) {
      const lab = el('label', 'swatch');
      const inp = el('input');
      inp.type = 'radio';
      inp.name = key + uid;
      inp.value = k;
      inp.checked = p[key] === k;
      inp.addEventListener('change', () => { p[key] = k; push(); });
      lab.append(inp, render(k, v));
      row.append(lab);
    }
    fs.append(row);
    return fs;
  };

  const cols = el('div', 'custom-cols');
  const c1 = el('div');
  const c2 = el('div');
  cols.append(c1, c2);
  body.append(cols);

  c1.append(swatchGroup('Cartas', Object.entries(FACES), 'face', (k, v) => el('span', 'sw-text', v)));
  const four = toggle('Baraja de cuatro colores', p.fourColor, 'Diamantes azules y tréboles verdes: se leen más rápido');
  four.cb.addEventListener('change', () => { p.fourColor = four.cb.checked; push(); });
  c1.lastChild.append(four.wrap);
  c1.append(swatchGroup('Reverso', Object.entries(BACKS), 'back', (k, v) => {
    const s = el('span', 'sw-back');
    s.dataset.back = k;
    s.title = v;
    s.setAttribute('aria-label', v);
    return s;
  }));
  c1.append(swatchGroup('Color del reverso', Object.entries(BACK_COLORS), 'backColor', (k, v) => {
    const s = el('span', 'sw-dot');
    s.style.background = k;
    s.title = v;
    s.setAttribute('aria-label', v);
    return s;
  }));
  c2.append(swatchGroup('Tapete', Object.entries(FELTS), 'felt', (k, v) => {
    const s = el('span', 'sw-dot big');
    s.style.background = `radial-gradient(circle at 40% 35%, ${v.hi}, ${v.base} 60%, ${v.lo})`;
    s.title = v.name;
    s.setAttribute('aria-label', v.name);
    return s;
  }));
  c2.append(swatchGroup('Baranda', Object.entries(RAILS), 'rail', (k, v) => {
    const s = el('span', 'sw-dot');
    s.style.background = `linear-gradient(${v.hi}, ${v.base})`;
    s.title = v.name;
    s.setAttribute('aria-label', v.name);
    return s;
  }));
  const print = toggle('Reglas impresas en el tapete', p.feltPrint);
  print.cb.addEventListener('change', () => { p.feltPrint = print.cb.checked; push(); });
  c2.lastChild.append(print.wrap);
  c2.append(swatchGroup('Fichas', [['clasicas', 'Clásicas'], ['planas', 'Planas']], 'chips', (k, v) => el('span', 'sw-text', v)));

  const game = el('fieldset', 'sec');
  game.append(el('legend', null, 'Juego'));
  const speed = select(Object.entries(SPEEDS).map(([k, v]) => [k, v.name]), p.speed);
  speed.addEventListener('change', () => { p.speed = speed.value; push(); });
  const vol = el('input');
  vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.value = String(p.volume);
  vol.addEventListener('input', () => { p.volume = Number(vol.value); push(); });
  const quiz = select([[0, 'Nunca'], [4, 'Cada 4 manos'], [6, 'Cada 6 manos'], [10, 'Cada 10 manos']], p.quizEvery);
  quiz.addEventListener('change', () => { p.quizEvery = Number(quiz.value); push(); });
  const g = el('div', 'field-grid');
  g.append(field('Velocidad de las animaciones', speed, 'En solitario también marca el ritmo del crupier'), field('Volumen', vol), field('Preguntas del entrenador de conteo', quiz));
  game.append(g);
  const tg = el('div', 'toggle-grid');
  const mk = (label, key, hint) => {
    const x = toggle(label, p[key], hint);
    x.cb.addEventListener('change', () => { p[key] = x.cb.checked; push(); });
    tg.append(x.wrap);
  };
  mk('Sonido', 'sound');
  mk('Mostrar el total de cada mano', 'showTotals', 'Desactívalo para practicar sumando tú');
  mk('Contador Hi-Lo en pantalla', 'hud', 'Si la sala lo permite');
  mk('Botón de consejo', 'hints', 'Estrategia básica y desviaciones');
  game.append(tg);
  body.append(game);

  foot.append(button('Listo', 'primary', () => dlg.close('ok')));
  dlg.showModal();
  return dlg;
}

// ------------------------------------------------------------------ unirse por enlace
export function openJoin({ code, name = '', needPassword = false, error = '', onSubmit, onCancel }) {
  const { dlg, body, foot } = makeDialog(`Sala ${code}`, { cls: 'dlg-join' });
  const form = el('form');
  form.id = nextId('join');
  body.append(el('p', 'lead', needPassword ? 'Esta sala tiene contraseña. Pídesela a quien te invitó.' : 'Te han invitado a una mesa de BlackJack. ¿Con qué nombre te sientas?'));
  if (error) body.append(el('p', 'form-error', error));
  const nm = el('input');
  nm.type = 'text'; nm.required = true; nm.maxLength = NAME_MAX_LEN; nm.value = name; nm.autocomplete = 'nickname';
  form.append(field('Tu nombre', nm));
  const pw = el('input');
  pw.type = 'password'; pw.maxLength = 64; pw.autocomplete = 'off';
  if (needPassword) form.append(field('Contraseña de la sala', pw));
  body.append(form);
  let done = false;
  foot.append(button('Cancelar', 'ghost', () => dlg.close('cancel')));
  const ok = button('Entrar en la sala', 'primary', null, 'submit');
  ok.setAttribute('form', form.id);
  foot.append(ok);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = nm.value.trim();
    if (!n) { nm.focus(); return; }
    done = true;
    dlg.close('ok');
    onSubmit({ name: n, password: pw.value });
  });
  dlg.addEventListener('close', () => { if (!done && onCancel) onCancel(); });
  dlg.showModal();
  (needPassword && name ? pw : nm).focus();
  return dlg;
}

// ------------------------------------------------------------------ pregunta de conteo
export function openQuiz({ rc, tc, decks, onDone }) {
  const { dlg, body, foot } = makeDialog('Control de cuenta', { cls: 'dlg-quiz' });
  const form = el('form');
  form.id = nextId('quiz');
  body.append(el('p', 'lead', '¿Cuál es la cuenta corriente Hi-Lo ahora mismo?'));
  const inp = el('input');
  inp.type = 'number'; inp.step = '1'; inp.min = '-200'; inp.max = '200'; inp.required = true; inp.inputMode = 'numeric';
  form.append(field('Cuenta corriente', inp));
  body.append(form);
  const res = el('p', 'quiz-result');
  res.setAttribute('aria-live', 'polite');
  body.append(res);
  const ok = button('Comprobar', 'primary', null, 'submit');
  ok.setAttribute('form', form.id);
  const skip = button('Saltar', 'ghost', () => dlg.close('skip'));
  foot.append(skip, ok);
  let answered = false;
  let correct = false;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (answered) { dlg.close('ok'); return; }
    const v = Math.round(Number(inp.value));
    if (!Number.isFinite(v)) return;
    answered = true;
    correct = v === rc;
    const fmt = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('es-ES', { maximumFractionDigits: 1 });
    res.textContent = correct
      ? `Correcto: ${fmt(rc)}. Con ${decks.toLocaleString('es-ES', { maximumFractionDigits: 1 })} barajas por jugar, la cuenta verdadera es ${fmt(Math.round(tc * 10) / 10)}.`
      : `La cuenta era ${fmt(rc)} y has dicho ${fmt(v)}. Cuenta verdadera: ${fmt(Math.round(tc * 10) / 10)}.`;
    res.className = 'quiz-result ' + (correct ? 'ok' : 'bad');
    ok.textContent = 'Seguir jugando';
    skip.hidden = true;
    inp.disabled = true;
    ok.focus();
  });
  dlg.addEventListener('close', () => onDone(answered ? correct : null));
  dlg.showModal();
  inp.focus();
  return dlg;
}

// ------------------------------------------------------------------ confirmación
export function confirmDialog(text, okLabel = 'Aceptar', cancelLabel = 'Cancelar') {
  return new Promise((resolve) => {
    const { dlg, body, foot } = makeDialog('Confirmar', { cls: 'dlg-confirm' });
    body.append(el('p', 'lead', text));
    let val = false;
    foot.append(button(cancelLabel, 'ghost', () => dlg.close()), button(okLabel, 'primary', () => { val = true; dlg.close(); }));
    dlg.addEventListener('close', () => resolve(val));
    dlg.showModal();
  });
}

export function infoDialog(title, text, okLabel = 'Entendido') {
  return new Promise((resolve) => {
    const { dlg, body, foot } = makeDialog(title, { cls: 'dlg-confirm' });
    body.append(el('p', 'lead', text));
    foot.append(button(okLabel, 'primary', () => dlg.close()));
    dlg.addEventListener('close', () => resolve());
    dlg.showModal();
  });
}

// Enlace de invitación para copiar a mano cuando el portapapeles no está disponible.
export function linkDialog(link) {
  const { dlg, body, foot } = makeDialog('Enlace de invitación', { cls: 'dlg-confirm' });
  body.append(el('p', 'lead', 'Comparte este enlace. Quien lo abra entrará directamente en tu sala.'));
  const inp = el('input');
  inp.type = 'text';
  inp.readOnly = true;
  inp.value = link;
  inp.setAttribute('aria-label', 'Enlace de invitación');
  inp.addEventListener('focus', () => inp.select());
  body.append(inp);
  const copy = button('Copiar', 'primary', async () => {
    inp.select();
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch (_) {
      try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
    }
    copy.textContent = ok ? 'Copiado' : 'Selecciona y copia';
  });
  foot.append(button('Cerrar', 'ghost', () => dlg.close()), copy);
  dlg.showModal();
  inp.focus();
}

export { payoutLabel };
