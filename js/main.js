// Arranque de la aplicación y coordinación entre salas, motor y vistas.
import { APP_NAME, NAME_MAX_LEN } from './config.js';
import { PRESETS, FORMATS, describeRules, houseEdge, presetIdFor, sanitizeFormat } from './rules.js';
import { LocalRoom, HostRoom, GuestRoom } from './room.js';
import { makeRoomCode, normalizeCode, netErrorText } from './net.js';
import { loadPrefs, savePrefs, applyPrefs, store, SPEEDS } from './prefs.js';
import { CountTracker } from './count.js';
import { recommend, insuranceAdvice, actionName } from './strategy.js';
import { fmtMoney } from './cards.js';
import { configureAudio, unlockAudio, sfx } from './audio.js';
import { TableView, STAGE_W, STAGE_H } from './ui/table.js';
import { Dock } from './ui/dock.js';
import { SidePanel } from './ui/side.js';
import { openSetup, openCustomize, openJoin, openQuiz, confirmDialog, infoDialog, linkDialog } from './ui/dialogs.js';
import { openGuide } from './ui/guide.js';

const $ = (sel) => document.querySelector(sel);

const CLOSE_TEXT = {
  notfound: 'No hay ninguna sala abierta con ese código. Comprueba el enlace o pide uno nuevo a quien te invitó.',
  timeout: 'La sala no responde. Puede que el anfitrión la haya cerrado o que su conexión no permita jugar en línea.',
  'host-left': 'El anfitrión ha cerrado la sala.',
  kicked: 'El anfitrión te ha expulsado de la sala.',
  full: 'La sala está llena.',
  version: 'Tu versión del juego no coincide con la del anfitrión. Recarga la página.',
  denied: 'No se ha podido entrar en la sala.',
};

class App {
  constructor() {
    this.prefs = loadPrefs();
    applyPrefs(this.prefs);
    configureAudio(this.prefs);
    this.room = null;
    this.state = null;
    this.count = new CountTracker();
    this.chip = 25;
    this.selectedSeat = null;
    this.busy = false;
    this.trainerReveal = false;
    this.lastQuizRound = 0;
    this.prevPhase = null;
    this.prevMyTurn = false;
    this.unread = 0;
    this.deadline = 0;
    this.deadlineTotal = 0;
    this.setupMeta = null;
    this.bindHome();
    this.bindGame();
    this.loopTimer();
    this.fromLink();
  }

  // ---------------------------------------------------------------- inicio
  bindHome() {
    document.title = APP_NAME;
    const nameInput = $('#home-name');
    nameInput.maxLength = NAME_MAX_LEN;
    nameInput.value = store.name();
    nameInput.addEventListener('change', () => store.setName(nameInput.value.trim().slice(0, NAME_MAX_LEN)));
    const saved = store.soloBankroll();
    $('#solo-bank').textContent = saved ? `Tu banca guardada: ${fmtMoney(saved)}` : '';
    $('#btn-solo').addEventListener('click', () => { unlockAudio(); this.askSetup('solo'); });
    $('#btn-create').addEventListener('click', () => { unlockAudio(); this.askSetup('host'); });
    $('#join-form').addEventListener('submit', (e) => {
      e.preventDefault();
      unlockAudio();
      const code = normalizeCode($('#join-code').value);
      const err = $('#join-error');
      if (!code) { err.textContent = 'El código tiene 6 caracteres, por ejemplo K7Q2XM.'; return; }
      err.textContent = '';
      const name = this.homeName();
      if (!name) { nameInput.focus(); err.textContent = 'Escribe tu nombre antes de entrar.'; return; }
      this.startGuest(code, name, '');
    });
    $('#btn-guide').addEventListener('click', () => openGuide(null));
    $('#btn-custom').addEventListener('click', () => this.customize());
  }

  homeName() {
    const n = $('#home-name').value.trim().slice(0, NAME_MAX_LEN);
    if (n) store.setName(n);
    return n;
  }

  askSetup(mode) {
    const name = this.homeName();
    if (!name) {
      $('#home-name').focus();
      $('#home-name').setAttribute('aria-invalid', 'true');
      $('#name-hint').textContent = 'Escribe tu nombre para sentarte a la mesa.';
      return;
    }
    $('#home-name').removeAttribute('aria-invalid');
    $('#name-hint').textContent = '';
    const last = store.lastSetup() || {};
    const initial = { preset: last.preset || 'vegas', rules: last.rules, format: { ...(last.format || {}) }, bots: last.bots };
    if (mode === 'solo') { initial.format.betTime = 0; initial.format.actionTime = 0; }
    openSetup({
      mode,
      initial,
      onSubmit: (cfg) => {
        store.setLastSetup({ preset: cfg.preset, rules: cfg.rules, format: cfg.format, bots: cfg.bots ?? last.bots });
        if (mode === 'solo') this.startSolo(name, cfg);
        else this.startHost(name, cfg);
      },
    });
  }

  fromLink() {
    const params = new URLSearchParams(location.search);
    const raw = params.get('sala');
    if (!raw) return;
    const code = normalizeCode(raw);
    if (!code) { this.toast('El enlace de invitación no es válido.', 'error'); this.cleanUrl(); return; }
    const name = store.name();
    if (name) this.startGuest(code, name, '');
    else openJoin({ code, onSubmit: ({ name: n, password }) => { store.setName(n); $('#home-name').value = n; this.startGuest(code, n, password); }, onCancel: () => this.cleanUrl() });
  }

  cleanUrl() { history.replaceState(null, '', location.pathname); }

  inviteLink() { return `${location.origin}${location.pathname}?sala=${this.room.code}`; }

  // ---------------------------------------------------------------- salas
  callbacks() {
    return {
      onState: (s) => this.onState(s),
      onChat: (m) => this.onChat(m),
      onChatHistory: (list) => this.side.setHistory(list, this.room && this.room.me),
      onToast: (t, k) => this.toast(t, k),
      onStatus: (st) => { if (st === 'reconnecting') this.toast('Conexión perdida. Reconectando con la sala…', 'error'); },
      onJoined: () => this.onJoined(),
      onClosed: (reason) => this.onClosed(reason),
    };
  }

  startSolo(name, cfg) {
    const pace = SPEEDS[this.prefs.speed].pace;
    const format = sanitizeFormat({ ...cfg.format, betTime: 0, actionTime: 0, pace, maxSeatsPerPlayer: 3 });
    this.setupMeta = { preset: cfg.preset };
    const bankroll = format.type === 'torneo' ? null : store.soloBankroll();
    this.room = new LocalRoom({ rules: cfg.rules, format, name, bots: cfg.bots ?? 2, bankroll, cb: this.callbacks() });
    this.enterGame();
    this.room.open();
  }

  startHost(name, cfg, attempt = 0) {
    const code = makeRoomCode();
    this.setupMeta = { preset: cfg.preset, cfg, name, attempt };
    this.room = new HostRoom({ code, password: cfg.password, rules: cfg.rules, format: cfg.format, name, cb: this.callbacks() });
    this.showConnecting(`Abriendo la sala ${code}…`);
    try { this.room.open(); } catch (e) { this.hideConnecting(); this.room = null; this.toast(e.message, 'error'); }
  }

  startGuest(code, name, password) {
    this.setupMeta = { code, name };
    this.room = new GuestRoom({ code, name, password, token: store.token(), cb: this.callbacks() });
    this.showConnecting(`Conectando con la sala ${code}…`);
    try { this.room.open(); } catch (e) { this.hideConnecting(); this.room = null; this.toast(e.message, 'error'); }
  }

  onJoined() {
    this.hideConnecting();
    if (this.room.kind !== 'solo') {
      history.replaceState(null, '', this.room.kind === 'guest' ? `?sala=${this.room.code}` : location.pathname);
    }
    if (!$('#screen-game').classList.contains('on')) this.enterGame();
    if (this.room.kind === 'host') {
      this.copyInvite(true);
    }
  }

  onClosed(reason) {
    const room = this.room;
    this.hideConnecting();
    if (room && room.kind === 'host' && reason === 'unavailable-id' && (this.setupMeta.attempt || 0) < 3) {
      const { name, cfg, attempt } = this.setupMeta;
      this.room = null;
      this.startHost(name, cfg, attempt + 1);
      return;
    }
    if (room && room.kind === 'guest' && reason === 'password') {
      const { code, name } = this.setupMeta;
      const wasTrying = !!room.password;
      this.room = null;
      this.exitGame(false);
      openJoin({ code, name, needPassword: true, error: wasTrying ? 'Contraseña incorrecta.' : '', onSubmit: ({ name: n, password }) => this.startGuest(code, n, password), onCancel: () => this.cleanUrl() });
      return;
    }
    const text = CLOSE_TEXT[reason] || netErrorText(reason);
    this.room = null;
    this.exitGame(false);
    this.cleanUrl();
    infoDialog(room && room.kind === 'host' ? 'No se pudo abrir la sala' : 'Sala cerrada', text);
  }

  async leave() {
    if (!this.room) { this.exitGame(true); return; }
    if (this.room.kind === 'host' && this.state && this.state.players.some(p => !p.bot && p.id !== this.room.me)) {
      const ok = await confirmDialog('Si sales, la sala se cerrará para todos los jugadores.', 'Cerrar la sala', 'Seguir jugando');
      if (!ok) return;
    }
    this.room.leave();
    this.room = null;
    this.exitGame(true);
    this.cleanUrl();
  }

  // ---------------------------------------------------------------- pantalla de juego
  bindGame() {
    this.table = new TableView($('#stage'), {
      onSeatClick: (i) => this.seatClick(i),
      onStandUp: (i) => this.room && this.room.act('leave', { seat: i }),
    });
    this.dock = new Dock($('#dock'), {
      onAct: (a, payload) => this.act(a, payload),
      onPlay: (a) => this.play(a),
      onChip: (d, silent) => this.pickChip(d, silent),
      onHint: () => this.hint(),
      onToggleHud: () => this.toggleHud(),
      onStart: () => this.room && this.room.start(),
      onAddBot: () => this.room && this.room.addBot(),
      onRestart: () => this.room && this.room.restart(),
    });
    this.side = new SidePanel($('#side'), {
      onSendChat: (t) => this.room && this.room.chat(t),
      onKick: async (id, name) => { if (await confirmDialog(`¿Expulsar a ${name} de la sala? No podrá volver a entrar.`, 'Expulsar')) this.room.kick(id); },
      onRemoveBot: (id) => this.room && this.room.removeBot(id),
      onAddBot: () => this.room && this.room.addBot(),
      onInvite: () => this.copyInvite(false),
      onSettings: () => this.editRules(),
      onRestart: async () => { if (await confirmDialog('¿Empezar de nuevo? Las bancas vuelven al valor inicial y se usa un zapato nuevo.', 'Nueva partida')) this.room.restart(); },
    });
    $('#tb-guide').addEventListener('click', () => openGuide(this.state ? this.state.rules : null, 'basico'));
    $('#tb-custom').addEventListener('click', () => this.customize());
    $('#tb-leave').addEventListener('click', () => this.leave());
    $('#tb-invite').addEventListener('click', () => this.copyInvite(false));
    $('#tb-side').addEventListener('click', () => this.toggleSide());
    $('#side-close').addEventListener('click', () => this.toggleSide(false));
    $('#rotate-ok').addEventListener('click', () => { this.prefs.rotateHintDismissed = true; savePrefs(this.prefs); this.layout(); });

    const ro = new ResizeObserver(() => this.layout());
    ro.observe($('#stage-wrap'));
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('beforeunload', (e) => {
      if (this.room && this.room.kind === 'host' && this.state && this.state.players.some(p => !p.bot && p.id !== this.room.me)) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.layout(); });
  }

  enterGame() {
    $('#screen-home').classList.remove('on');
    $('#screen-game').classList.add('on');
    $('#screen-home').hidden = true;
    $('#screen-game').hidden = false;
    this.table.reset();
    this.count = new CountTracker();
    this.state = null;
    this.lastQuizRound = 0;
    this.prevPhase = null;
    this.trainerReveal = false;
    this.side.setHistory([], null);
    const kind = this.room.kind;
    $('#tb-invite').hidden = kind === 'solo';
    $('#tb-side').hidden = false;
    $('#tb-room').textContent = kind === 'solo' ? 'Solitario' : `Sala ${this.room.code}`;
    document.body.dataset.kind = kind;
    this.layout();
  }

  exitGame(toHome) {
    $('#screen-game').classList.remove('on');
    $('#screen-game').hidden = true;
    $('#screen-home').hidden = false;
    $('#screen-home').classList.add('on');
    document.body.dataset.kind = '';
    this.state = null;
    const saved = store.soloBankroll();
    $('#solo-bank').textContent = saved ? `Tu banca guardada: ${fmtMoney(saved)}` : '';
    if (toHome) $('#btn-solo').focus();
  }

  layout() {
    const wrap = $('#stage-wrap');
    if (!wrap || $('#screen-game').hidden) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    const s = Math.min(w / STAGE_W, h / STAGE_H);
    document.documentElement.style.setProperty('--stage-scale', s.toFixed(4));
    const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 700;
    $('#rotate-hint').hidden = !portrait || this.prefs.rotateHintDismissed;
  }

  toggleSide(force) {
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('side-open');
    document.body.classList.toggle('side-open', open);
    $('#tb-side').setAttribute('aria-expanded', String(open));
    if (open) { this.unread = 0; this.updateUnread(); }
  }

  updateUnread() {
    const b = $('#tb-side-badge');
    b.textContent = this.unread > 9 ? '9+' : String(this.unread);
    b.hidden = this.unread === 0;
  }

  // ---------------------------------------------------------------- estado
  me() { return this.room ? this.room.me : null; }

  ctx() {
    const s = this.state;
    const fmt = s.format;
    const trainer = fmt.type === 'entrenador';
    const hudAllowed = fmt.allowHud && fmt.type !== 'torneo';
    const me = s.players.find(p => p.id === this.me());
    const mySeats = s.seats.filter(x => x.owner === this.me());
    const maxSeats = fmt.type === 'torneo' ? 1 : fmt.maxSeatsPerPlayer;
    return {
      me: this.me(),
      isHost: this.room && this.room.isHost,
      moveMs: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--move'), 10) || 0,
      selectedSeat: this.selectedSeat,
      canSit: !!me && !me.eliminated && mySeats.length < maxSeats && s.phase !== 'finished',
      chip: this.chip,
      busy: this.busy,
      count: this.count,
      state: s,
      trainer,
      hudAllowed,
      hudVisible: trainer ? this.trainerReveal : this.prefs.hud,
      hintsAllowed: this.prefs.hints && fmt.type !== 'torneo',
      houseEdge: houseEdge(s.rules),
      deadline: this.deadline,
      deadlineTotal: this.deadlineTotal,
    };
  }

  onState(s) {
    if (!s || !Array.isArray(s.seats) || !Array.isArray(s.players) || !s.dealer || !s.shoe) return;
    const first = !this.state;
    const prevRules = this.state ? JSON.stringify(this.state.rules) + JSON.stringify(this.state.format) : '';
    this.state = s;
    this.busy = false;
    this.count.update(s);
    const me = this.me();
    const mySeats = s.seats.filter(x => x.owner === me);
    if (!mySeats.some(x => x.i === this.selectedSeat)) this.selectedSeat = mySeats.length ? mySeats[0].i : null;

    // Plazos
    let total = 0;
    if (s.deadlineIn > 0) {
      if (s.phase === 'betting') total = s.format.betTime * 1000;
      else if (s.phase === 'insurance') total = s.format.insuranceTime * 1000;
      else if (s.awaiting === 'action') total = s.format.actionTime * 1000;
    }
    this.deadline = total ? performance.now() + s.deadlineIn : 0;
    this.deadlineTotal = total;

    if (first || prevRules !== JSON.stringify(s.rules) + JSON.stringify(s.format)) this.refreshRoomInfo();

    const ctx = this.ctx();
    this.table.render(s, ctx);
    this.dock.render(s, ctx);
    this.side.renderPlayers(s, me, this.room && this.room.isHost);

    // Sonidos y avisos
    const myTurn = s.awaiting === 'action' && s.turn && s.seats[s.turn.seat].owner === me;
    if (myTurn && !this.prevMyTurn && this.room.kind !== 'solo') sfx.turn();
    this.prevMyTurn = myTurn;
    if (s.phase === 'settle' && this.prevPhase !== 'settle') {
      let net = 0, bj = false, any = false;
      for (const x of mySeats) for (const h of x.hands) { net += h.net || 0; any = true; if (h.result === 'bj') bj = true; }
      if (any) { if (bj) sfx.blackjack(); else if (net > 0) sfx.win(); else if (net < 0) sfx.lose(); }
    }

    // Banca del modo solo
    if (this.room.kind === 'solo' && s.format.type !== 'torneo') {
      const p = s.players.find(x => x.id === me);
      if (p) {
        const onTable = mySeats.reduce((a, x) => a + x.bet + x.hands.reduce((b, h) => b + h.bet, 0), 0);
        store.setSoloBankroll(Math.round((p.bankroll + onTable) * 100) / 100);
      }
    }

    // Entrenador: pregunta de control
    if (ctx.trainer && this.prefs.quizEvery > 0 && s.phase === 'betting' && this.prevPhase !== 'betting' &&
      s.round > 0 && s.round - this.lastQuizRound >= this.prefs.quizEvery && !document.querySelector('dialog[open]')) {
      this.lastQuizRound = s.round;
      const tc = this.count.trueCount(s);
      openQuiz({
        rc: this.count.rc, tc, decks: this.count.decksRemaining(s),
        onDone: (ok) => {
          if (ok === null) return;
          const t = store.trainer();
          t.quizzes++; if (ok) t.quizOk++;
          store.setTrainer(t);
        },
      });
    }
    this.prevPhase = s.phase;
  }

  refreshRoomInfo() {
    const s = this.state;
    const pid = presetIdFor(s.rules);
    const preset = pid === 'custom' ? null : PRESETS.find(p => p.id === pid);
    const fmt = FORMATS.find(f => f.id === s.format.type) || FORMATS[0];
    this.side.setRoom({
      kind: this.room.kind,
      code: this.room.code,
      modeName: preset ? preset.name : 'Mesa personalizada',
      formatName: fmt.name,
      rulesLines: describeRules(s.rules),
      houseEdge: houseEdge(s.rules),
      isHost: this.room.isHost,
    });
    $('#tb-mode').textContent = `${preset ? preset.name : 'Personalizada'}, ${fmt.name.toLowerCase()}`;
    if (this.chip < s.rules.minBet / 10 || this.chip > s.rules.maxBet) this.chip = s.rules.minBet;
  }

  onChat(m) {
    this.side.addChat(m, this.me());
    if (m && !m.sys && m.from !== this.me()) {
      sfx.chat();
      if (!document.body.classList.contains('side-open') && window.matchMedia('(max-width: 1100px)').matches) {
        this.unread++;
        this.updateUnread();
      }
    }
  }

  // ---------------------------------------------------------------- acciones
  act(a, payload = {}) {
    if (!this.room || !this.state) return;
    unlockAudio();
    if (a === 'ins' && this.state.format.type === 'entrenador') {
      const adv = insuranceAdvice(this.count.trueCount(this.state));
      const hand = this.state.seats[payload.seat].hands[0];
      if (!(hand && hand.bj)) this.trainerFeedback(adv.take === payload.take, adv.take ? 'Con esta cuenta, el seguro compensa.' : adv.why);
    }
    if (a === 'clear' && this.selectedSeat != null) payload = { seat: this.selectedSeat, ...payload };
    this.room.act(a, payload);
  }

  pickChip(d, silent) {
    this.chip = d;
    if (silent || !this.state) { if (this.state) this.dock.render(this.state, this.ctx()); return; }
    if (this.state.phase === 'betting' && this.selectedSeat != null) {
      sfx.chip();
      this.room.act('bet', { seat: this.selectedSeat, amount: d });
    } else {
      this.dock.render(this.state, this.ctx());
    }
  }

  seatClick(i) {
    const s = this.state;
    if (!s || !this.room) return;
    unlockAudio();
    const seat = s.seats[i];
    if (!seat.owner) { this.room.act('sit', { seat: i }); this.selectedSeat = i; return; }
    if (seat.owner === this.me() && s.phase === 'betting') {
      this.selectedSeat = i;
      sfx.chip();
      this.room.act('bet', { seat: i, amount: this.chip });
    }
  }

  myTurnHand() {
    const s = this.state;
    if (!s || s.awaiting !== 'action' || !s.turn) return null;
    const seat = s.seats[s.turn.seat];
    if (seat.owner !== this.me()) return null;
    return { seat, hand: seat.hands[s.turn.hand] };
  }

  useCountForAdvice() {
    const c = this.ctx();
    return c.trainer || (c.hudAllowed && c.hudVisible);
  }

  play(a) {
    const t = this.myTurnHand();
    if (!t || this.busy || !this.state.legal || !this.state.legal[a]) return;
    unlockAudio();
    const s = this.state;
    if (s.format.type === 'entrenador') {
      const tc = this.count.trueCount(s);
      const rec = recommend(t.hand.cards, s.dealer.cards[0], s.rules, s.legal, tc);
      if (rec.action === a) this.trainerFeedback(true, rec.deviation ? `Bien visto: ${rec.deviation.text}` : '');
      else this.trainerFeedback(false, `Lo correcto era ${actionName(rec.action).toLowerCase()}. ${rec.why}`);
    }
    this.busy = true;
    this.dock.render(s, this.ctx());
    this.room.act(a, { seat: t.seat.i, hand: s.turn.hand, n: t.hand.cards.length });
    // Si la jugada no cambia nada (rechazada), desbloquea
    setTimeout(() => { if (this.busy) { this.busy = false; if (this.state) this.dock.render(this.state, this.ctx()); } }, 2500);
  }

  trainerFeedback(ok, extra) {
    const t = store.trainer();
    t.decisions++;
    if (ok) t.correct++;
    store.setTrainer(t);
    const pct = Math.round((t.correct / t.decisions) * 100);
    const parts = [ok ? 'Correcto.' : '', extra || '', `Aciertos: ${pct} %`].filter(Boolean);
    this.dock.setFeedback(parts.join(' '), ok ? 'ok' : 'bad');
  }

  hint() {
    const s = this.state;
    const t = this.myTurnHand();
    if (!t) return;
    const tc = this.useCountForAdvice() ? this.count.trueCount(s) : null;
    const rec = recommend(t.hand.cards, s.dealer.cards[0], s.rules, s.legal, tc);
    this.dock.setFeedback(`${actionName(rec.action)}. ${rec.why}`, 'hint');
  }

  toggleHud() {
    if (!this.state) return;
    if (this.state.format.type === 'entrenador') this.trainerReveal = !this.trainerReveal;
    else { this.prefs.hud = !this.prefs.hud; savePrefs(this.prefs); }
    this.dock.render(this.state, this.ctx());
  }

  key(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!this.state || !this.room) return;
    const s = this.state;
    const k = e.key.toLowerCase();
    const map = { '1': 'hit', '2': 'stand', '3': 'double', '4': 'split', '5': 'surrender' };
    if (map[k] && this.myTurnHand()) { e.preventDefault(); this.play(map[k]); return; }
    if (k === '?' && this.myTurnHand() && this.ctx().hintsAllowed) { this.hint(); return; }
    if (k === 'c') { this.toggleHud(); return; }
    if (k === 'enter' && s.phase === 'betting' && (e.target === document.body || (e.target.closest && e.target.closest('.rack, .stage')))) {
      // Evita que Intro sobre una ficha enfocada la vuelva a apostar
      e.preventDefault();
      this.act('ready');
      return;
    }
    if (s.phase === 'insurance' && (k === 's' || k === 'n')) {
      const seat = s.seats.find(x => x.owner === this.me() && x.hands.length && !x.insDecided);
      if (seat) this.act('ins', { seat: seat.i, take: k === 's' });
    }
  }

  loopTimer() {
    const tick = () => {
      if (this.deadline && this.deadlineTotal) {
        const f = (this.deadline - performance.now()) / this.deadlineTotal;
        this.dock.updateTimer(f);
        this.table.updateTimer(Math.max(0, f));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- utilidades
  async copyInvite(auto) {
    if (!this.room || this.room.kind === 'solo') return;
    const link = this.inviteLink();
    let copied = false;
    try { await navigator.clipboard.writeText(link); copied = true; } catch (_) { copied = false; }
    if (!auto && !copied && navigator.share) {
      try { await navigator.share({ title: APP_NAME, text: 'Siéntate en mi mesa de BlackJack', url: link }); return; } catch (_) {}
    }
    if (copied) this.toast(auto ? `Sala ${this.room.code} abierta. Enlace de invitación copiado.` : 'Enlace de invitación copiado.', 'ok');
    else if (auto) this.toast(`Sala ${this.room.code} abierta. Pulsa «Invitar» para compartir el enlace.`, 'ok');
    else linkDialog(link);
  }

  editRules() {
    if (!this.state || !this.room || !this.room.isHost) return;
    const s = this.state;
    openSetup({
      mode: this.room.kind === 'solo' ? 'solo' : 'edit',
      initial: { preset: presetIdFor(s.rules), rules: s.rules, format: s.format, bots: s.players.filter(p => p.bot).length },
      onSubmit: (cfg) => {
        let format = cfg.format;
        if (this.room.kind === 'solo') format = sanitizeFormat({ ...format, betTime: 0, actionTime: 0, pace: SPEEDS[this.prefs.speed].pace });
        const r = this.room.updateSettings(cfg.rules, format);
        if (r && r.ok && this.room.kind === 'solo' && typeof cfg.bots === 'number') {
          const bots = this.state.players.filter(p => p.bot);
          for (let k = bots.length; k < cfg.bots; k++) this.room.addBot();
          for (let k = bots.length; k > cfg.bots; k--) this.room.removeBot(bots[k - 1].id);
        }
      },
    });
  }

  customize() {
    openCustomize(this.prefs, (p) => {
      this.prefs = p;
      savePrefs(p);
      applyPrefs(p);
      configureAudio(p);
      if (this.room && this.room.kind === 'solo') {
        // En solitario la velocidad también marca el ritmo del crupier
        this.room.engine.format.pace = SPEEDS[p.speed].pace;
      }
      if (this.state) { this.table.render(this.state, this.ctx()); this.dock.render(this.state, this.ctx()); }
    });
  }

  showConnecting(text) {
    $('#connecting-text').textContent = text;
    $('#connecting').hidden = false;
    $('#connecting-cancel').onclick = () => {
      if (this.room) this.room.leave();
      this.room = null;
      this.hideConnecting();
      this.exitGame(true);
      this.cleanUrl();
    };
  }
  hideConnecting() { $('#connecting').hidden = true; }

  toast(text, kind = 'info') {
    if (!text) return;
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    t.textContent = text;
    box.append(t);
    while (box.childElementCount > 3) box.firstElementChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, kind === 'error' ? 4200 : 3200);
  }
}

window.addEventListener('DOMContentLoaded', () => { window.__bj = new App(); });
