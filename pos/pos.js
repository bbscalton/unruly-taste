/* Unruly Taste POS. Staff-only page. Data lives on the shop PC (Unruly bot), reached through the
 * same public API path as the ordering assistant. No keys or data in this file; staff PIN is kept in this
 * browser only (localStorage). Menu + options come from ../menu.js (same as the ordering page). */
(function () {
  'use strict';
  const CFG = window.UT_CONFIG || {}, RAW = window.UT_MENU;
  const API = String(CFG.ASSISTANT_API || '').replace(/\/$/, '') + '/pos/';
  const TOKEN_KEY = 'ut_pos_token';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => (n < 0 ? '−' : '') + 'G$' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-US');
  const r2 = (n) => Math.round(n * 100) / 100;
  const pct = (p, s) => (s > 0 ? Math.round(p / s * 100) + '%' : '–');
  const pm = (n) => '<span class="' + (n < 0 ? 'neg' : 'pos') + '">' + money(n) + '</span>';
  const SRC = { 'walk-in': 'Walk-in', whatsapp: 'WhatsApp', web: 'Web' };
  // Cost labels: example (made up) · estimate (public Guyana market price, source + date) · real (owner-confirmed)
  const LBL = { example: ['ex', 'example'], estimate: ['est', 'market estimate'], real: ['real', 'real (owner)'] };
  const labelOf = (i) => (LBL[i.costLabel] ? i.costLabel : (i.costExample ? 'example' : 'real'));
  const srcText = (s) => (s ? [s.name, s.pack && s.price ? s.pack + ': ' + s.price : '', s.calc, s.date ? 'seen ' + s.date : '', s.note].filter(Boolean).join(' · ') : '');
  const costTag = (i) => { const l = labelOf(i), t = srcText(i.costSource); return '<span class="tag ' + LBL[l][0] + '"' + (t ? ' title="' + esc(t) + '"' : '') + '>' + LBL[l][1] + '</span>'; };
  const recTag = (r) => { const l = r && LBL[r.label] ? r.label : (r && r.example === false ? 'real' : 'example'); return '<span class="tag ' + LBL[l][0] + '">' + (l === 'estimate' ? 'estimated portions' : LBL[l][1]) + '</span>'; };
  const BOT = { phone: 'WhatsApp call', 'web-chat': 'web chat', 'web-voice': 'web voice', 'web-checkout': 'website Buy' };
  const time = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: CFG.TIME_ZONE || 'America/Guyana', hour: 'numeric', minute: '2-digit' });
  const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: CFG.TIME_ZONE || 'America/Guyana' });
  const today = () => dayOf(new Date().toISOString());

  // ---------- menu (same resolution + summary format as the page / bot) ----------
  const M = { ...RAW, items: RAW.items.map(it => ({ ...it, groups: (it.groups || []).map(g => ({ ...g, opts: typeof g.opts === 'string' ? RAW.lists[g.opts] : g.opts })) })) };
  const byId = (id) => M.items.find(i => i.id === id);
  const visible = (item, g, ch) => { if (!g.showIf) return true; const gi = item.groups.findIndex(x => x.key === g.showIf[0]); return ch[gi] === g.showIf[1]; };
  const FMT = {
    db: (v) => 'Box 1: ' + v.b1 + ' w/ ' + v.p1 + (v.f1 ? ' (' + v.f1 + ')' : '') + '; Box 2: ' + v.b2 + ' w/ ' + v.p2 + (v.f2 ? ' (' + v.f2 + ')' : ''),
    mm: (v) => 'Box 1: ' + v.b1 + ' w/ ' + v.p1 + (v.f1 ? ' (' + v.f1 + ')' : '') + '; Box 2: ' + v.b2 + ' w/ ' + v.p2 + (v.f2 ? ' (' + v.f2 + ')' : '') + '; Refreshers: ' + v.r1 + ' + ' + v.r2,
  };
  // day-only items (Thursday / Friday deals, Rasta Pasta Fridays): gentle notice, never blocks the sale
  const GYWD = () => ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[new Intl.DateTimeFormat('en-US', { timeZone: CFG.TIME_ZONE || 'America/Guyana', weekday: 'short' }).format(new Date())];
  const dayWarn = (it) => (it && it.day != null && GYWD() !== it.day ? it.dayName + 's only: today is ' + new Intl.DateTimeFormat('en-US', { timeZone: CFG.TIME_ZONE || 'America/Guyana', weekday: 'long' }).format(new Date()) + '. OK as a pre-order or if the owner allows it.' : '');
  const thumb = (it) => it.img ? '<img src="../images/' + esc(it.img) + '" alt="" loading="lazy" width="640" height="480">' : '<span class="nophoto"><span class="np-i">' + esc(it.icon || '🍽️') + '</span><small>Photo coming soon</small></span>';
  function summary(item, ch) {
    if (!item.groups.length) return '';
    const v = {}; item.groups.forEach((g, i) => { v[g.key] = visible(item, g, ch) && ch[i] >= 0 ? g.opts[ch[i]] : ''; });
    if (FMT[item.id]) return FMT[item.id](v);
    return item.groups.filter((g, i) => visible(item, g, ch) && ch[i] >= 0).map(g => (g.short === 'Flavour' ? '' : g.short + ': ') + g.opts[ch[item.groups.indexOf(g)]]).join(', ');
  }

  // ---------- state ----------
  let D = null, tab = 'orders', fSrc = 'all', fStat = 'open', ticket = [], tendered = '', custName = '', custNote = '', pollT = null, busy = false, lastOk = 0, dirtySettings = false;
  const ING = () => { const o = {}; (D ? D.ingredients : []).forEach(i => { o[i.id] = i; }); return o; };
  const count = (h, n) => { if (!n) return 1; let c = 0, i = 0; while ((i = h.indexOf(n, i)) >= 0) { c++; i += n.length; } return c; };
  // Cashier (staff) never sees cost or profit; owner and manager do. Page-only: the server still sends these numbers.
  const SEE = () => !!(D && D.me && (D.me.role === 'owner' || D.me.role === 'manager'));
  function lineCost(id, choices, qty) {   // same rules as the server (lib/pos.js usage())
    const rec = D && D.recipes[id]; if (!rec) return { cost: 0, noRecipe: true };
    const ing = ING(); let c = 0;
    for (const r of rec.rules) { const n = r.qty * count(choices || '', r.match) * qty; if (ing[r.ing]) c += n * ing[r.ing].costPerUnit; }
    return { cost: Math.round(c), noRecipe: false };
  }

  // ---------- api ----------
  async function api(action, body = {}) {
    const r = await fetch(API + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token: localStorage.getItem(TOKEN_KEY) || '' }) });
    let j = {}; try { j = await r.json(); } catch {}
    if (r.status === 401) { showLogin(j.error || 'Please sign in.'); throw new Error(j.error || 'Wrong staff PIN'); }
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  function toast(t, ms = 3200) { const el = $('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), ms); }
  async function sync(force) {
    if (busy && !force) return;
    try {
      const j = await api('sync');
      const seen = D && D.orders ? new Set(D.orders.map(o => o.no)) : null;
      const fresh = seen ? j.orders.filter(o => !seen.has(o.no) && o.source !== 'walk-in') : [];
      D = j; lastOk = Date.now();
      if (fresh.length) { toast('🔔 New order ' + fresh.map(o => o.no).join(', '), 8000); try { const a = new (window.AudioContext || window.webkitAudioContext)(), g = a.createGain(), os = a.createOscillator(); os.frequency.value = 880; g.gain.value = 0.15; os.connect(g); g.connect(a.destination); os.start(); os.stop(a.currentTime + 0.35); } catch (x) {} }
      $('syncState').textContent = 'live · ' + time(j.serverTime); $('syncState').className = 'sync ok';
      renderAll();
    } catch (e) { $('syncState').textContent = 'offline: ' + e.message.slice(0, 40); $('syncState').className = 'sync bad'; }
  }
  function startPoll() { clearInterval(pollT); pollT = setInterval(() => { if (!document.hidden) sync(); }, 5000); sync(true); }

  // ---------- login ----------
  function showLogin(msg) { $('login').classList.remove('hidden'); $('loginErr').textContent = msg && localStorage.getItem(TOKEN_KEY) ? msg : ''; localStorage.removeItem(TOKEN_KEY); clearInterval(pollT); setTimeout(() => $('pin').focus(), 50); }
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const v = $('pin').value.trim(); if (!v) return;
    $('loginErr').textContent = '';
    try {
      const r = await fetch(API + 'auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: v }) });
      let j = {}; try { j = await r.json(); } catch {}
      if (!r.ok || !j.session) throw new Error(j.error || 'Wrong staff PIN');
      localStorage.setItem(TOKEN_KEY, j.session);
      $('login').classList.add('hidden'); $('pin').value = ''; startPoll();
    } catch (err) { $('loginErr').textContent = err.message; localStorage.removeItem(TOKEN_KEY); }
  });

  const so = $('signOutBtn'); if (so) so.addEventListener('click', () => { localStorage.removeItem(TOKEN_KEY); location.reload(); });
  const abtn = $('adminBtn'); if (abtn) abtn.addEventListener('click', () => {
    openSheet('<h3>Open Admin</h3><p>Enter an <b>owner or manager</b> PIN. This is checked on the shop PC. A staff PIN does not open Admin, even if this till is already signed in.</p><div class="field"><label>PIN</label><input id="adminPin" type="password" autocomplete="current-password"></div><p class="err" id="adminPinErr"></p><div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="adminGo" type="button">Continue</button></div>');
    setTimeout(() => { const i = $('adminPin'); if (i) i.focus(); }, 50);
    $('adminGo').onclick = async () => {
      $('adminGo').disabled = true; $('adminPinErr').textContent = '';
      try {
        const r = await fetch(API + 'auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('adminPin').value.trim(), admin: true }) });
        let j = {}; try { j = await r.json(); } catch {}
        if (!r.ok || !j.session) { $('adminPinErr').textContent = j.error || 'That PIN cannot open Admin.'; $('adminGo').disabled = false; return; }
        sessionStorage.setItem('ut_admin_session', j.session);
        location.href = 'admin/';
      } catch (e) { $('adminPinErr').textContent = e.message; $('adminGo').disabled = false; }
    };
  });

  // ---------- tabs ----------
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
  $('bell').addEventListener('click', () => { if (SEE()) setTab('stock'); });
  function setTab(t) {
    if ((t === 'stock' || t === 'today') && D && !SEE()) t = 'orders';   // cashier: no Stock / Today
    tab = t; document.querySelectorAll('#tabs button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + t));
    if (t !== 'settings') dirtySettings = false;
    renderAll(true); window.scrollTo(0, 0);
  }
  function renderAll(forceSettings) {
    if (!D) return;
    const open = D.orders.filter(o => o.status !== 'collected').length, low = D.ingredients.filter(i => i.low).length;
    $('openCount').textContent = open; $('openCount').classList.toggle('hidden', !open);
    $('lowCount').textContent = low; $('lowCount').classList.toggle('hidden', !low);
    $('bellCount').textContent = low; $('bellCount').classList.toggle('hidden', !low);
    const pq = D.printQueued || 0; $('pqCount').textContent = pq; $('pqCount').classList.toggle('hidden', !pq);
    applyCatalog();
    document.body.classList.toggle('ut-staff', !SEE());
    { const see = SEE(); document.querySelectorAll('#tabs [data-tab="stock"], #tabs [data-tab="today"]').forEach(b => b.classList.toggle('hidden', !see)); $('bell').classList.toggle('hidden', !see);
      if (!see && (tab === 'stock' || tab === 'today')) setTab('orders'); }   // lets help text / guide hide cost and profit wording for cashiers
    const showAdmin = !(D.settings && D.settings.pos && D.settings.pos.showAdminButton === false);
    const ab = $('adminBtn'); if (ab) ab.classList.toggle('hidden', !showAdmin);
    processPrintQueue();
    if (tab === 'orders') renderOrders();
    else if (tab === 'walkin') renderWalkin();
    else if (tab === 'stock') renderStock();
    else if (tab === 'today') renderToday();
  }
  function applyCatalog() {
    if (D && Array.isArray(D.categories) && D.categories.length) M.sections = D.categories.filter(c => !c.deleted).map(c => ({ id: c.id, title: c.title }));   // owner categories
    for (const c of (D && D.catalog) || []) {
      let it = M.items.find(i => i.id === c.id);
      if (!it && c.custom && !c.deleted) { it = { id: c.id, name: c.name, price: c.price, sec: c.category || 'sides', groups: [], custom: true }; M.items.push(it); }   // owner-added product
      if (!it) continue;
      if (c.deleted) { it.available = false; continue; }
      if (c.name) it.name = c.name;
      if (c.price === null || typeof c.price === 'number') it.price = c.price;
      it.available = c.available !== false;
      if (c.category) it.sec = c.category;
    }
  }
  const exampleNote = () => { if (!SEE()) return ''; const n = { example: 0, estimate: 0, real: 0 }; D.ingredients.forEach(i => n[labelOf(i)]++);
    return '<div class="note">🧪 <b>Costs are not the restaurant\'s real numbers yet.</b> ' + n.estimate + ' ingredients use a <span class="tag est">market estimate</span> (public Guyana shop price; source + date on the Stock tab), ' + n.example + ' are <span class="tag ex">example</span> (made up), ' + n.real + ' are <span class="tag real">real (owner)</span>. Portions are typical fast-food estimates and vendors are placeholders until the owner fills in the ingredient sheet. Profit shown is an estimate.</div>'; };
  const lowBar = () => { if (!SEE()) return ''; const low = D.ingredients.filter(i => i.low); return low.length ? '<div class="alertbar">⚠️ <b>Low stock:</b> ' + low.map(i => esc(i.name) + ' (' + i.stock + ' ' + esc(i.unit) + ')').join(', ') + ' · <u data-go="stock">open Stock</u></div>' : ''; };
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) setTab(g.dataset.go); });

  // ---------- ORDERS ----------
  function renderOrders() {
    const el = $('tab-orders');
    let list = D.orders.filter(o => (fSrc === 'all' || o.source === fSrc) && (fStat === 'all' || (fStat === 'open' ? o.status !== 'collected' : o.status === 'collected')));
    const chip = (k, v, l) => '<button class="chip ' + (v === k ? 'on' : '') + '" data-' + l + '="' + k + '">';
    let h = lowBar() + '<h2>Orders</h2><div class="chips">' +
      chip('all', fSrc, 'src') + 'All</button>' + chip('walk-in', fSrc, 'src') + 'Walk-in</button>' + chip('whatsapp', fSrc, 'src') + 'WhatsApp</button>' + chip('web', fSrc, 'src') + 'Web</button></div>' +
      '<div class="chips">' + chip('open', fStat, 'st') + 'Open</button>' + chip('collected', fStat, 'st') + 'Collected</button>' + chip('all', fStat, 'st') + 'All</button></div>';
    if (D.settings.readyTestMode) h += '<div class="note blue">🧪 <b>Ready messages: TEST MODE.</b> Tapping <b>Ready</b> sends the "ready for pickup" WhatsApp to the shop\'s own test chat (' + esc(D.settings.ownChat) + '), labelled TEST, not to the customer. Live customer messages need Calton\'s OK.</div>';
    h += '<p class="muted small">WhatsApp and website orders from the AI assistant appear here automatically (checked every few seconds).</p>';
    if (!list.length) h += '<div class="empty card">No orders here yet.</div>';
    h += '<div class="orders">' + list.map(orderCard).join('') + '</div>';
    el.innerHTML = h;
  }
  function orderCard(o) {
    const lines = o.lines.map((l, i) => '<div class="ln"><span>' + l.qty + '× ' + esc(l.name) + (l.id ? ' <span class="muted small">[' + esc(String(l.id).toUpperCase()) + ']</span>' : '') + '</span><b>' + (l.lineTotal == null ? '<span class="neg">price TBC</span>' : money(l.lineTotal)) + '</b>' +
      (l.choices ? '<span class="ch">' + esc(l.choices) + '</span>' : '') +
      (SEE() ? '<span class="cp muted">cost ' + money(l.cost) + (l.noRecipe ? ' (no recipe)' : '') + (l.profit == null ? '' : ' · profit ' + pm(l.profit)) + (l.manualPrice ? ' · <i>manual price</i>' : '') + '</span>' : (l.manualPrice ? '<span class="cp muted"><i>manual price</i></span>' : '')) +
      (l.lineTotal == null && o.status !== 'collected' ? '<span class="cp"><button class="btn sm" data-price="' + esc(o.no) + '" data-idx="' + i + '">Set ' + esc(l.name) + ' price</button></span>' : '') + '</div>').join('');
    const who = o.source === 'walk-in' ? (o.name ? esc(o.name) : 'Counter customer') + ' · cash' + (o.cash ? ' ' + money(o.cash.tendered) + ', change ' + money(o.cash.change) : '')
      : esc(o.name || 'Customer') + (o.number ? ' · ' + esc(o.number) : '') + ' · ' + esc(o.fulfilment) + (o.address ? ' · ' + esc(o.address) : '');
    let acts = '';
    if (o.status === 'new') acts = '<button class="btn" data-st="preparing" data-no="' + esc(o.no) + '">Start preparing</button>';
    if (o.status === 'new' || o.status === 'preparing') acts += '<button class="btn green" data-ready="' + esc(o.no) + '">✅ Ready</button>';
    if (o.status === 'ready') acts = '<button class="btn primary" data-st="collected" data-no="' + esc(o.no) + '">Collected</button>';
    acts += '<button class="btn" data-rcpt="' + esc(o.no) + '">🧾 ' + (printedNos().has(o.no) ? 'Reprint' : 'Print receipt') + '</button>';
    return '<div class="card order"><div class="oh"><span class="ono">' + esc(o.no) + '</span>' + (o.test ? '<span class="tag test">test</span>' : '') +
      '<span class="tag ' + o.source + '">' + SRC[o.source] + '</span><span class="tag ' + o.status + '">' + o.status + '</span></div>' +
      '<div class="who">' + who + '<br><span class="muted small">' + time(o.createdAt) + (dayOf(o.createdAt) !== today() ? ' · ' + dayOf(o.createdAt) : '') + (o.botSource ? ' · via ' + (BOT[o.botSource] || o.botSource) : '') + '</span></div>' +
      (o.payment ? '<div class="note small">💵 ' + esc(o.payment.method === 'pay-on-pickup' ? 'Pay on ' + (o.fulfilment === 'delivery' ? 'delivery' : 'pickup') + ' (cash)' : o.payment.method) + ' · ' + esc(o.payment.status) + '</div>' : '') +
      (o.note ? '<div class="note">📝 ' + esc(o.note) + '</div>' : '') +
      (o.preImport ? '<div class="muted small">Placed before the POS was switched on: stock was not deducted for this one.</div>' : '') +
      '<div class="lines">' + lines + '</div>' +
      '<div class="tot big"><span>Total</span><span>' + money(o.total) + (o.tbc ? ' + TBC' : '') + '</span></div>' +
      (SEE() ? '<div class="tot muted"><span>Est. cost' + (o.tbc ? ', priced lines' : '') + '</span><span>' + money(o.cost) + '</span></div>' +
      '<div class="tot"><span>Est. profit</span><span>' + pm(o.profit) + ' <span class="muted small">' + pct(o.profit, o.total) + '</span></span></div>' : '') +
      (o.ready ? '<div class="note blue small">Ready at ' + time(o.ready.at) + ': ' + esc(o.ready.result) + '</div>' : '') +
      (acts ? '<div class="acts">' + acts + '</div>' : '') + '</div>';
  }
  $('tab-orders').addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.src) { fSrc = t.dataset.src; return renderOrders(); }
    if (t.dataset.st && t.dataset.no) return act('status', { no: t.dataset.no, status: t.dataset.st }, 'Order ' + t.dataset.no + ': ' + t.dataset.st);
    if (t.dataset.ready) return readyDialog(t.dataset.ready);
    if (t.dataset.price) return priceDialog(t.dataset.price, +t.dataset.idx);
    if (t.dataset.rcpt) { const o = D.orders.find(x => x.no === t.dataset.rcpt); if (o) receiptSheet(o); }
  });
  $('tab-orders').addEventListener('click', (e) => { const t = e.target.closest('button[data-st]:not([data-no])'); if (t) { fStat = t.dataset.st; renderOrders(); } });
  async function act(action, body, okMsg) {
    busy = true;
    try { const j = await api(action, body); toast(okMsg); await sync(true); return j; }
    catch (e) { toast('⚠️ ' + e.message, 5000); return null; } finally { busy = false; }
  }
  function fill(tpl, o) { return String(tpl || '').replace(/\{name\}/g, (o.name || 'there').split(' ')[0]).replace(/\{no\}/g, o.no).replace(/\{total\}/g, money(o.total) + (o.tbc ? ' + box price' : '')); }
  function readyDialog(no) {
    const o = D.orders.find(x => x.no === no); if (!o) return;
    const msg = fill(o.fulfilment === 'delivery' ? D.settings.readyTextDelivery : D.settings.readyText, o);
    let what;
    if (o.source === 'walk-in') what = '<div class="note">Walk-in order: no WhatsApp message. Call the customer at the counter.</div>';
    else if (D.settings.readyTestMode) what = '<div class="note blue">🧪 <b>TEST MODE:</b> this message goes to the shop\'s own test chat (' + esc(D.settings.ownChat) + ') labelled TEST, <b>not</b> to the customer (' + esc(o.number || 'no number') + ').</div><div class="preview">' + esc(msg) + '</div>';
    else what = '<div class="note">This sends the WhatsApp below to the customer (' + esc(o.number) + '), only if their number was confirmed on the call.</div><div class="preview">' + esc(msg) + '</div>';
    openSheet('<h3>Mark ' + esc(no) + ' ready?</h3><p class="muted small">' + esc(o.name || 'Customer') + ' · ' + SRC[o.source] + ' · ' + money(o.total) + '</p>' + what +
      '<div class="acts"><button class="btn" data-close>Cancel</button><button class="btn green" id="confirmReady">Yes, it\'s ready</button></div>');
    $('confirmReady').onclick = async () => { $('confirmReady').disabled = true; const j = await act('ready', { no, confirm: true }, 'Order ' + no + ' is ready'); closeSheet(); if (j && j.order && j.order.ready) toast('✅ ' + no + ' ready · ' + j.order.ready.result, 6000); };
  }
  function priceDialog(no, idx) {
    const o = D.orders.find(x => x.no === no); const l = o && o.lines[idx]; if (!l) return;
    openSheet('<h3>Price for ' + esc(l.name) + '</h3><p class="muted small">' + esc(no) + ' · ' + l.qty + '× · ' + esc(l.choices) + '</p><p class="small">No posted solo price on the menu. Enter the price per box you charged.</p>' +
      '<div class="field"><label>Price per box (G$)</label><input id="pp" type="number" inputmode="numeric" min="1" placeholder="e.g. 3000"></div><div class="acts"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ppOk">Save price</button></div>');
    $('pp').focus(); $('ppOk').onclick = async () => { const p = +$('pp').value; if (!(p > 0)) return toast('Enter a price'); await act('price', { no, idx, price: p }, 'Price saved'); closeSheet(); };
  }

  // ---------- sheet ----------
  function openSheet(html) { $('sheetPanel').innerHTML = html; $('sheet').classList.remove('hidden'); }
  function closeSheet() { $('sheet').classList.add('hidden'); $('sheetPanel').innerHTML = ''; }
  $('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' || e.target.closest('[data-close]')) closeSheet(); });

  // ---------- WALK-IN ----------
  const total = () => ticket.reduce((s, l) => s + (l.unit == null ? 0 : l.unit * l.qty), 0);
  function renderWalkin() {
    const el = $('tab-walkin');
    if (el.dataset.built && el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { renderTicketTotals(); return; }
    const secs = M.sections || [];
    let h = '<div class="wk"><div><h2>Walk-in sale</h2>';
    for (const s of secs) {
      const items = M.items.filter(i => i.sec === s.id && i.available !== false); if (!items.length) continue;
      h += '<div class="sec-title">' + esc(s.title || s.name || s.id) + '</div><div class="grid">' + items.map(it => {
        const c = defaultCost(it);
        const out = !SEE() && (D.soldOut || []).includes(it.id);   // cashier: sold out = greyed + blocked, no numbers
        if (out) return '<button class="item" disabled aria-disabled="true" style="opacity:.45;filter:grayscale(1);cursor:not-allowed">' + thumb(it) + '<div class="ib"><b>' + esc(it.name) + '</b><div><span class="tag collected">Sold out</span></div></div></button>';
        return '<button class="item" data-item="' + it.id + '">' + thumb(it) + '<div class="ib"><b>' + esc(it.name) + '</b>' + (it.day != null ? ' <span class="tag ' + (dayWarn(it) ? 'ph' : 'ready') + '">' + esc(it.dayName) + 's</span>' : '') + '<div class="pr">' + (it.price ? money(it.price) : 'Price to confirm') + '</div>' +
          (SEE() ? '<div class="mg">est. cost ' + money(c) + (it.price ? ' · margin ' + pct(it.price - c, it.price) : '') + '</div>' : '') + '</div></button>';
      }).join('') + '</div>';
    }
    h += '</div><div class="card ticket" id="ticket"></div></div>';
    el.innerHTML = h; el.dataset.built = '1'; renderTicket();
  }
  function defaultCost(it) { const ch = it.groups.map(() => 0); return lineCost(it.id, summary(it, ch), 1).cost; }
  function renderTicket() {
    const t = $('ticket'); if (!t) return;
    let h = '<h3>🧾 Ticket <span class="tag walk-in">Walk-in · cash</span></h3>';
    if (!ticket.length) h += '<p class="muted small">Tap menu items to add them.</p>';
    h += ticket.map((l, i) => { const c = lineCost(l.id, l.choices, l.qty).cost, lt = l.unit == null ? null : l.unit * l.qty;
      return '<div class="tl"><b>' + l.qty + '×</b><div>' + esc(l.name) + (l.choices ? '<div class="muted small">' + esc(l.choices) + '</div>' : '') + (dayWarn(byId(l.id)) ? '<div class="small neg">📅 ' + esc(byId(l.id).dayName) + 's only</div>' : '') +
        (SEE() ? '<div class="small muted">cost ' + money(c) + (lt == null ? '' : ' · profit ' + pm(lt - c)) + (l.manual ? ' · manual price' : '') + '</div>' : (l.manual ? '<div class="small muted">manual price</div>' : '')) + '</div><div style="text-align:right"><b>' + (lt == null ? '–' : money(lt)) + '</b><br><button class="x" data-rm="' + i + '" title="Remove">✕</button></div></div>'; }).join('');
    h += '<div id="ttot"></div>';
    h += '<div class="field"><label>Customer name (optional)</label><input id="cName" maxlength="40" value="' + esc(custName) + '" placeholder="For calling out the order"></div>' +
      '<div class="field"><label>Note (optional)</label><input id="cNote" maxlength="100" value="' + esc(custNote) + '" placeholder="e.g. extra sauce"></div>' +
      '<div class="cash"><label class="small"><b>Cash tendered (G$)</b> · cash only, no card</label><input id="tend" type="number" inputmode="numeric" min="0" value="' + esc(tendered) + '" placeholder="Amount received">' +
      '<div class="quick"><button class="btn" data-q="exact">Exact</button><button class="btn" data-q="1000">1,000</button><button class="btn" data-q="5000">5,000</button><button class="btn" data-q="10000">10,000</button><button class="btn" data-q="20000">20,000</button></div><div id="chg"></div>' +
      '<button class="btn red big" id="complete">Complete cash sale</button>' + (ticket.length ? '<button class="btn sm" id="clearT" style="margin-top:4px">Clear ticket</button>' : '') + '</div>';
    t.innerHTML = h; renderTicketTotals();
  }
  function renderTicketTotals() {
    const tt = $('ttot'); if (!tt) return;
    const tot = total(), cost = ticket.reduce((s, l) => s + lineCost(l.id, l.choices, l.qty).cost, 0);
    tt.innerHTML = '<div class="tot big" style="margin-top:8px"><span>Total</span><span>' + money(tot) + '</span></div>' + (SEE() ? '<div class="tot muted"><span>Est. cost (estimates)</span><span>' + money(cost) + '</span></div><div class="tot"><span>Est. profit</span><span>' + pm(tot - cost) + ' <span class="muted small">' + pct(tot - cost, tot) + '</span></span></div>' : '');
    const t = +tendered || 0, chg = $('chg');
    if (chg) chg.innerHTML = !ticket.length ? '' : (t >= tot && t > 0 ? '<div class="change">Change: ' + money(t - tot) + '</div>' : '<div class="change short">' + (t ? 'Short by ' + money(tot - t) : 'Enter cash received') + '</div>');
    const c = $('complete'); if (c) c.disabled = !ticket.length || t < tot || ticket.some(l => l.unit == null);
  }
  $('tab-walkin').addEventListener('input', (e) => { if (e.target.id === 'tend') { tendered = e.target.value; renderTicketTotals(); } if (e.target.id === 'cName') custName = e.target.value; if (e.target.id === 'cNote') custNote = e.target.value; });
  $('tab-walkin').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.item) return itemSheet(byId(b.dataset.item));
    if (b.dataset.rm) { ticket.splice(+b.dataset.rm, 1); return renderTicket(); }
    if (b.dataset.q) { tendered = String(b.dataset.q === 'exact' ? total() : b.dataset.q); $('tend').value = tendered; return renderTicketTotals(); }
    if (b.id === 'clearT') { ticket = []; tendered = ''; custName = ''; custNote = ''; return renderTicket(); }
    if (b.id === 'complete') {
      b.disabled = true;
      const j = await act('walkin', { lines: ticket.map(l => ({ id: l.id, qty: l.qty, ch: l.ch, price: l.manual ? l.unit : undefined })), tendered: +tendered, name: custName, note: custNote }, 'Sale saved');
      if (j && j.order) { toast('✅ ' + j.order.no + ' saved · change ' + money(j.order.cash.change), 6000); ticket = []; tendered = ''; custName = ''; custNote = ''; renderTicket();
        receiptSheet(j.order, null, '✅ Sale saved · change ' + money(j.order.cash.change)); }
      else b.disabled = false;
    }
  });
  function itemSheet(it) {
    const ch = it.groups.map(() => -1); let qty = 1, price = '';
    const draw = () => {
      it.groups.forEach((g, i) => { if (!visible(it, g, ch)) ch[i] = -1; });
      const sum = summary(it, ch), c = lineCost(it.id, sum, qty).cost, unit = it.price != null ? it.price : (+price || null), lt = unit == null ? null : unit * qty;
      let h = '<h3>' + esc(it.name) + '</h3><p class="muted small">' + esc(it.desc || '') + '</p>' + (dayWarn(it) ? '<div class="note">📅 ' + esc(dayWarn(it)) + '</div>' : '');
      it.groups.forEach((g, i) => { if (!visible(it, g, ch)) return; h += '<div class="field"><label>' + esc(g.label) + '</label><div class="opts">' + g.opts.map((o, k) => '<button class="opt ' + (ch[i] === k ? 'on' : '') + '" data-g="' + i + '" data-k="' + k + '">' + esc(o) + '</button>').join('') + '</div></div>'; });
      if (it.price == null) h += '<div class="field"><label>Price per box (G$): price to confirm, enter what you charge</label><input id="mp" type="number" inputmode="numeric" min="1" value="' + esc(price) + '" placeholder="e.g. 3000"></div>';
      h += '<div class="field"><label>Quantity</label><div class="qty"><button data-qd="-1">−</button><b>' + qty + '</b><button data-qd="1">+</button></div></div>' +
        '<div class="note small">Line: <b>' + (lt == null ? 'enter price' : money(lt)) + '</b>' + (SEE() ? ' · est. cost ' + money(c) + (lt == null ? '' : ' · est. profit ' + pm(lt - c)) + ' <span class="tag est">estimated cost</span>' : '') + '</div>' +
        '<div class="acts"><button class="btn" data-close>Cancel</button><button class="btn primary" id="addIt">Add to ticket</button></div>';
      openSheet(h);
      const mp = $('mp'); if (mp) mp.oninput = () => { price = mp.value; const s = summary(it, ch), u = +price || null; const n = document.querySelector('#sheetPanel .note'); if (n) n.innerHTML = 'Line: <b>' + (u ? money(u * qty) : 'enter price') + '</b>' + (SEE() ? ' · est. cost ' + money(lineCost(it.id, s, qty).cost) + (u ? ' · est. profit ' + pm(u * qty - lineCost(it.id, s, qty).cost) : '') + ' <span class="tag est">estimated cost</span>' : ''); };
      $('sheetPanel').onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.g) { ch[+b.dataset.g] = +b.dataset.k; draw(); }
        else if (b.dataset.qd) { qty = Math.max(1, Math.min(50, qty + +b.dataset.qd)); draw(); }
        else if (b.id === 'addIt') {
          const miss = it.groups.find((g, i) => visible(it, g, ch) && ch[i] < 0); if (miss) return toast('Choose: ' + miss.label);
          if (it.price == null && !(+price > 0)) return toast('Enter the price per box');
          ticket.push({ id: it.id, name: it.name, ch: ch.slice(), choices: summary(it, ch), qty, unit: it.price != null ? it.price : Math.round(+price), manual: it.price == null });
          closeSheet(); renderTicket(); toast('Added ' + qty + '× ' + it.name);
        }
      };
    };
    draw();
  }

  // ---------- STOCK ----------
  function renderStock() {
    if (!SEE()) return;
    const el = $('tab-stock');
    let h = lowBar() + '<h2>Stock</h2>' + exampleNote() + '<p class="muted small">Every completed order (walk-in, WhatsApp, web) deducts ingredients automatically from the recipes. Going below a minimum shows here and sends ONE WhatsApp alert to the shop\'s own chat' + (D.settings.lowStockWhatsApp ? '' : ' (alerts are switched OFF in Settings)') + '. The POS never orders from or messages vendors.</p><div class="stock">';
    h += D.ingredients.slice().sort((a, b) => (b.low - a.low) || a.name.localeCompare(b.name)).map(i => {
      const pctv = Math.max(4, Math.min(100, i.threshold ? i.stock / (i.threshold * 3) * 100 : 100));
      const v = i.vendor;
      return '<div class="card si ' + (i.low ? 'low' : '') + '"><div class="sh"><b>' + esc(i.name) + '</b>' + (i.low ? '<span class="tag new">LOW</span>' : '<span class="tag ready">OK</span>') + '</div>' +
        '<div class="sh"><span class="lvl">' + i.stock + ' <span class="small muted">' + esc(i.unit) + '</span></span><span class="small muted">≈ ' + i.servingsLeft + ' servings</span></div><div class="bar"><i style="width:' + pctv + '%"></i></div>' +
        '<div class="small muted">Minimum: ' + (i.min.kind === 'servings' ? 'enough for ' + i.min.value + ' servings (' + i.threshold + ' ' + esc(i.unit) + ')' : i.min.value + ' ' + esc(i.unit)) + (SEE() ? ' · cost ' + money(i.costPerUnit) + '/' + esc(i.unit) + ' ' + costTag(i) : '') + '</div>' +
        (SEE() && i.costSource && (i.costSource.url || i.costSource.note) ? '<div class="small muted src">' + (i.costSource.url ? '<a href="' + esc(i.costSource.url) + '" target="_blank" rel="noopener">' + esc(i.costSource.name || 'source') + '</a>' : '') + (i.costSource.pack ? ' · ' + esc(i.costSource.pack) + ' ' + esc(i.costSource.price || '') : '') + (i.costSource.date ? ' · seen ' + esc(i.costSource.date) : '') + (i.costSource.note ? '<br>' + esc(i.costSource.note) : '') + '</div>' : '') +
        '<div class="vend">' + (v ? '🚚 ' + esc(v.name) + (v.placeholder ? ' <span class="tag ph">placeholder</span>' : '') + ' · <a href="tel:' + esc(v.phone.replace(/[^\d+]/g, '')) + '">📞 ' + esc(v.phone) + '</a>' + (i.low ? ' <b class="neg">· call this vendor</b>' : '') : '<span class="muted">No vendor set</span>') + '</div>' +
        '<div class="acts"><button class="btn sm" data-stk="add" data-id="' + i.id + '">+ Restock</button><button class="btn sm" data-stk="set" data-id="' + i.id + '">Count / set</button></div></div>';
    }).join('') + '</div>';
    if (D.alerts.length) h += '<h3>Recent low-stock alerts</h3><table class="t"><tr><th>Time</th><th>Item</th><th>WhatsApp (own chat)</th></tr>' + D.alerts.map(a => '<tr><td>' + time(a.at) + '</td><td>' + esc(a.name || a.id) + ' (' + esc(a.stock) + ')</td><td>' + esc(a.whatsapp || '') + '</td></tr>').join('') + '</table>';
    el.innerHTML = h;
  }
  $('tab-stock').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-stk]'); if (!b) return;
    const i = D.ingredients.find(x => x.id === b.dataset.id), add = b.dataset.stk === 'add';
    openSheet('<h3>' + (add ? 'Restock ' : 'Count ') + esc(i.name) + '</h3><p class="muted small">Now: ' + i.stock + ' ' + esc(i.unit) + '</p><div class="field"><label>' + (add ? 'Quantity received' : 'Counted quantity on hand') + ' (' + esc(i.unit) + ')</label><input id="sq" type="number" inputmode="decimal" step="0.01" min="0"></div><div class="acts"><button class="btn" data-close>Cancel</button><button class="btn primary" id="sqOk">Save</button></div>');
    $('sq').focus(); $('sqOk').onclick = async () => { const q = $('sq').value; if (q === '') return toast('Enter a quantity'); await act('stock', { id: i.id, op: add ? 'add' : 'set', qty: +q }, i.name + ' updated'); closeSheet(); };
  });

  // ---------- TODAY ----------
  function renderToday() {
    if (!SEE()) return;
    const s = D.summary;
    let h = '<h2>Today · ' + esc(s.day) + '</h2>' + exampleNote() + '<div class="kpis"><div class="kpi"><b>' + money(s.sales) + '</b><span>Sales (' + s.orders + ' orders)</span></div>' + (SEE() ? '<div class="kpi"><b>' + money(s.cost) + '</b><span>Est. cost (estimates)</span></div><div class="kpi"><b>' + pm(s.profit) + '</b><span>Est. profit · ' + pct(s.profit, s.sales) + '</span></div>' : '') + '<div class="kpi"><b>' + (s.orders ? money(s.sales / s.orders) : '–') + '</b><span>Average order</span></div></div>';
    if (D.settings.payments) h += '<div class="note small">💳 <b>Payments:</b> cash / pay on pickup: on · ' + esc(D.settings.payments.mmg) + (D.settings.payments.outlet ? ' · Outlet features: ' + (D.settings.payments.outlet.ok ? esc(Object.keys(D.settings.payments.outlet.features).filter(k => D.settings.payments.outlet.features[k].connected).join(', ') || 'none connected') : 'not reachable (' + esc(D.settings.payments.outlet.error) + '), cash only') : '') + '</div>';
    if (s.testOrders) h += '<div class="note blue small">🧪 ' + s.testOrders + ' TEST order(s) today are not counted in these totals.</div>';
    if (s.tbc) h += '<div class="note">' + s.tbc + ' order(s) have a Hot Box / Wrap Box with price still to confirm (not counted in sales). Set the price on the order card.</div>';
    h += '<h3>By source</h3><div class="scroll"><table class="t"><tr><th>Source</th><th class="r">Orders</th><th class="r">Sales</th>' + (SEE() ? '<th class="r">Cost</th><th class="r">Profit</th>' : '') + '</tr>' +
      ['walk-in', 'whatsapp', 'web'].map(k => { const b = s.bySource[k] || { orders: 0, sales: 0, cost: 0, profit: 0 }; return '<tr><td><span class="tag ' + k + '">' + SRC[k] + '</span></td><td class="r">' + b.orders + '</td><td class="r">' + money(b.sales) + '</td>' + (SEE() ? '<td class="r">' + money(b.cost) + '</td><td class="r">' + pm(b.profit) + '</td>' : '') + '</tr>'; }).join('') +
      '<tr><td><b>Total</b></td><td class="r"><b>' + s.orders + '</b></td><td class="r"><b>' + money(s.sales) + '</b></td>' + (SEE() ? '<td class="r"><b>' + money(s.cost) + '</b></td><td class="r"><b>' + pm(s.profit) + '</b></td>' : '') + '</tr></table></div>';
    const items = Object.entries(s.items).sort((a, b) => b[1].qty - a[1].qty);
    h += '<h3>Items sold</h3>' + (items.length ? '<div class="scroll"><table class="t"><tr><th>Item</th><th class="r">Qty</th><th class="r">Sales</th>' + (SEE() ? '<th class="r">Cost</th>' : '') + '</tr>' + items.map(([n, v]) => '<tr><td>' + esc(n) + '</td><td class="r">' + v.qty + '</td><td class="r">' + money(v.sales) + '</td>' + (SEE() ? '<td class="r">' + money(v.cost) + '</td>' : '') + '</tr>').join('') + '</table></div>' : '<div class="empty card">No sales yet today.</div>');
    $('tab-today').innerHTML = h;
  }

  // ---------- SETTINGS ----------
  let SD = null;   // editable copy
  function renderSettings() {
    SD = { vendors: JSON.parse(JSON.stringify(D.vendors)), ingredients: D.ingredients.map(i => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit, costLabel: labelOf(i), costSource: i.costSource || null, vendorId: i.vendorId, min: { ...i.min } })), recipes: JSON.parse(JSON.stringify(D.recipes)), settings: { readyText: D.settings.readyText, readyTextDelivery: D.settings.readyTextDelivery, lowStockWhatsApp: D.settings.lowStockWhatsApp, printer: { ...PR() }, receipt: { ...RS() },
      promo: { sponsorDefault: (D.settings.promo && D.settings.promo.sponsorDefault) || 'Sponsored by Neuereatec', dailyCap: (D.settings.promo && D.settings.promo.dailyCap) || 150, tags: (D.settings.promo && D.settings.promo.tags) || [] },
      shop: { closedWeekdays: [...((D.settings.shop && D.settings.shop.closedWeekdays) || [])], closedDates: [...((D.settings.shop && D.settings.shop.closedDates) || [])] } } };
    drawSettings();
  }
  function drawSettings() {
    const ingOpts = (sel) => SD.ingredients.map(i => '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name) + '</option>').join('');
    let h = '<h2>Settings</h2><div class="note">🧪 <b>' + esc(D.settings.examplesNote || 'Example numbers, Calton to supply.') + '</b> Everything marked <span class="tag ex">example</span> is made up, <span class="tag est">market estimate</span> is a public Guyana shop price (not what Unruly Taste pays) and <span class="tag ph">placeholder</span> vendors are not real. When the owner confirms a number, set its label to <span class="tag real">real (owner)</span>, or use Bulk import below.</div>';
    h += '<h3>Ready messages</h3><div class="card">' + (D.settings.readyTestMode ? '<div class="note blue">🧪 <b>TEST MODE is ON</b> (set on the shop PC, not here). Ready messages go to the own test chat ' + esc(D.settings.ownChat) + ', labelled TEST. Going live needs Calton\'s OK. When live, customers get the WhatsApp line\'s fixed safe wording (same as the default below), only on confirmed numbers.</div>' : '<div class="note red"><b>LIVE:</b> ready messages go to customers with a confirmed WhatsApp number.</div>') +
      '<div class="field"><label>Pickup message ({name} {no} {total})</label><textarea data-s="readyText" rows="3">' + esc(SD.settings.readyText) + '</textarea></div>' +
      '<div class="field"><label>Delivery message</label><textarea data-s="readyTextDelivery" rows="3">' + esc(SD.settings.readyTextDelivery) + '</textarea></div>' +
      '<label class="small"><input type="checkbox" data-s="lowStockWhatsApp"' + (SD.settings.lowStockWhatsApp ? ' checked' : '') + '> Send low-stock WhatsApp alerts to the shop\'s own chat</label></div>';
    const drv = window.UTPrinter ? UTPrinter.list() : [{ id: 'none', label: 'No printer yet' }];
    h += '<h3>Receipts &amp; printer</h3><div class="card">' +
      '<p class="muted small">No receipt printer is installed yet. Every walk-in and online order still gets a receipt in the <b>print queue</b> (🖨️ at the top), marked "ready to print, no printer". You can preview, print with the browser, save as PDF or download .txt from any order.</p>' +
      '<label class="small"><input type="checkbox" data-sp="autoPrint"' + (SD.settings.printer.autoPrint !== false ? ' checked' : '') + '> Auto-print: add a receipt to the print queue for every new walk-in and online order</label>' +
      '<div class="field"><label>Paper width</label><select data-sp="paperWidth" style="width:auto"><option value="80"' + (+SD.settings.printer.paperWidth !== 58 ? ' selected' : '') + '>80 mm (48 characters)</option><option value="58"' + (+SD.settings.printer.paperWidth === 58 ? ' selected' : '') + '>58 mm (32 characters)</option></select></div>' +
      '<div class="field"><label>Printer driver</label><select data-sp="driver" style="width:auto;max-width:100%">' + drv.map(d => '<option value="' + esc(d.id) + '"' + (d.id === SD.settings.printer.driver ? ' selected' : '') + (d.stub ? ' disabled' : '') + '>' + esc(d.label) + '</option>').join('') + '</select><div class="hint small muted">When the printer arrives: add its driver (pos/printer/driver.js) and pick it here. That is the only switch.</div></div>' +
      '<label class="small"><input type="checkbox" data-sr="showPhone"' + (SD.settings.receipt.showPhone ? ' checked' : '') + '> Business phone on receipt</label>' +
      '<div class="field"><label>Business phone (receipts only)</label><input data-sr="phone" value="' + esc(SD.settings.receipt.phone || '') + '" maxlength="20" placeholder="(not set)" style="max-width:220px"></div>' +
      '<label class="small"><input type="checkbox" id="printStation"' + (localStorage.getItem(PS_KEY) === '1' ? ' checked' : '') + '> This device is the print station (prints queued receipts automatically once a real printer driver is chosen)</label></div>';
    const WDN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const owner = D.me && D.me.role === 'owner';
    h += '<h3 id="closedDays">Shop closed days' + (owner ? '' : ' (owner)') + '</h3><div class="card" id="closedCard"><p class="muted small">A scheduled promo on a closed day is skipped (nothing is sent) and you get one note on the shop chat. Weekly repeats skip that week. A blast already going out stops at midnight if the next day is closed.</p>' +
      '<div class="chips">' + WDN.map((n, i) => '<label class="chip' + (SD.settings.shop.closedWeekdays.includes(i) ? ' on' : '') + '"><input type="checkbox" data-cwd="' + i + '"' + (SD.settings.shop.closedWeekdays.includes(i) ? ' checked' : '') + (owner ? '' : ' disabled') + '> ' + n + '</label>').join('') + '</div>' +
      '<p class="small">One-off closed dates</p><ul class="small">' + (SD.settings.shop.closedDates.map(d => '<li>' + esc(d) + (owner ? ' <button class="btn sm" data-cdd="' + esc(d) + '">remove</button>' : '') + '</li>').join('') || '<li class="muted">None</li>') + '</ul>' +
      (owner ? '<div class="acts"><input type="date" id="closedAdd"><button class="btn sm" id="closedAddBtn" type="button">Add closed date</button></div>' : '') + '</div>';
    h += '<h3>Promo sponsor line (owner)</h3><div class="card"><p class="muted small">Default sponsor line for new promos. Each promo stays off until "Add sponsor line" is ticked.</p>' +
      '<div class="field"><label>Default sponsor line</label><input data-spromo="sponsorDefault" maxlength="80" value="' + esc(SD.settings.promo.sponsorDefault) + '"></div>' +
      '<div class="field"><label>Most promos per day</label><input data-spromo="dailyCap" type="number" min="10" max="500" value="' + esc(SD.settings.promo.dailyCap) + '" style="max-width:120px"></div>' +
      '<div class="field"><label>Customer groups (comma separated)</label><input data-spromo="tags" value="' + esc((SD.settings.promo.tags || []).join(', ')) + '"></div></div>';
    h += '<h3>Ingredients &amp; costs</h3><div class="scroll"><table class="t"><tr><th>Name</th><th>Unit</th><th>Cost / unit (G$)</th><th>Label</th><th>Source</th><th>Low-stock minimum</th><th>Vendor</th></tr>' + SD.ingredients.map((i, k) =>
      '<tr><td><input data-i="' + k + '" data-f="name" value="' + esc(i.name) + '"></td><td><input data-i="' + k + '" data-f="unit" value="' + esc(i.unit) + '" style="min-width:55px"></td><td><input type="number" step="0.01" data-i="' + k + '" data-f="costPerUnit" value="' + i.costPerUnit + '"></td>' +
      '<td><select data-i="' + k + '" data-f="costLabel" style="width:auto">' + Object.keys(LBL).map(l => '<option value="' + l + '"' + (i.costLabel === l ? ' selected' : '') + '>' + LBL[l][1] + '</option>').join('') + '</select></td>' +
      '<td class="small" style="min-width:160px">' + (i.costSource && i.costSource.url ? '<a href="' + esc(i.costSource.url) + '" target="_blank" rel="noopener" title="' + esc(srcText(i.costSource)) + '">' + esc(i.costSource.name || 'source') + '</a><br>' + esc((i.costSource.pack || '') + ' ' + (i.costSource.price || '')) + (i.costSource.date ? ' · ' + esc(i.costSource.date) : '') : '<span class="muted">' + esc(i.costSource && i.costSource.note ? i.costSource.note : '–') + '</span>') + '</td>' +
      '<td style="white-space:nowrap"><select data-i="' + k + '" data-f="minKind" style="width:auto"><option value="qty"' + (i.min.kind === 'qty' ? ' selected' : '') + '>quantity</option><option value="servings"' + (i.min.kind === 'servings' ? ' selected' : '') + '>servings</option></select> <input type="number" step="0.01" data-i="' + k + '" data-f="minValue" value="' + i.min.value + '" style="width:80px;min-width:60px"></td>' +
      '<td><select data-i="' + k + '" data-f="vendorId"><option value="">–</option>' + SD.vendors.map(v => '<option value="' + esc(v.id) + '"' + (v.id === i.vendorId ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') + '</select></td></tr>').join('') + '</table></div>';
    h += '<h3>Vendors</h3><p class="muted small">Names/phones are only shown to staff and in the low-stock alert. The POS never contacts vendors.</p><div class="scroll"><table class="t"><tr><th>Name</th><th>Phone</th><th>Placeholder?</th></tr>' + SD.vendors.map((v, k) =>
      '<tr><td><input data-v="' + k + '" data-f="name" value="' + esc(v.name) + '"></td><td><input data-v="' + k + '" data-f="phone" value="' + esc(v.phone) + '"></td><td><input type="checkbox" data-v="' + k + '" data-f="placeholder"' + (v.placeholder ? ' checked' : '') + '></td></tr>').join('') + '</table></div><button class="btn sm" id="addV" style="margin-top:6px">+ Add vendor</button>';
    h += '<h3>Recipes (per serving)</h3><p class="muted small">"Only if choice contains" applies a line when the order\'s choices mention that word (e.g. Wings / Strip chicken / Fries), once per mention.</p>';
    for (const it of M.items) {
      const rec = SD.recipes[it.id] || (SD.recipes[it.id] = { label: 'example', rules: [] }); if (!LBL[rec.label]) rec.label = rec.example === false ? 'real' : 'example';
      const c = lineCost2(it, rec);
      h += '<details class="rec"><summary>' + esc(it.name) + ' · est. cost ' + money(c) + (it.price ? ' · price ' + money(it.price) + ' · margin ' + pct(it.price - c, it.price) : ' · price to confirm') + ' ' + recTag(rec) + '</summary><div class="rb">' + (rec.note ? '<p class="small muted">' + esc(rec.note) + '</p>' : '') + '<div class="scroll"><table class="t"><tr><th>Ingredient</th><th>Qty / serving</th><th>Only if choice contains</th><th></th></tr>' +
        rec.rules.map((r, k) => '<tr><td><select data-r="' + it.id + '" data-k="' + k + '" data-f="ing">' + ingOpts(r.ing) + '</select></td><td><input type="number" step="0.001" data-r="' + it.id + '" data-k="' + k + '" data-f="qty" value="' + r.qty + '"></td><td><input data-r="' + it.id + '" data-k="' + k + '" data-f="match" value="' + esc(r.match || '') + '" placeholder="(always)"></td><td><button class="btn sm" data-rr="' + it.id + '" data-k="' + k + '">✕</button></td></tr>').join('') +
        '</table></div><div class="acts"><button class="btn sm" data-ra="' + it.id + '">+ Ingredient</button><label class="small">Portions: <select data-re="' + it.id + '" style="width:auto">' + Object.keys(LBL).map(l => '<option value="' + l + '"' + (rec.label === l ? ' selected' : '') + '>' + (l === 'estimate' ? 'estimate' : LBL[l][1]) + '</option>').join('') + '</select></label></div></div></details>';
    }
    h += '<h3>Bulk import (owner sheet answers)</h3><div class="card small"><p>Paste the owner\'s answers as CSV (or choose a .csv file), check the preview, then apply. Imported numbers are labelled <span class="tag real">real (owner)</span>. Blank cells mean "no change". <a href="data/owner-sheet-template.csv" download>Download the CSV template</a>.</p>' +
      '<pre class="fmt">ingredient, name, unit, cost per unit (G$), supplier name, supplier phone, current stock, minimum, minimum type (qty|servings)\nrecipe, menu item, ingredient name, qty per serving, only if choice contains (optional)\nprice, Hot Box | Wrap Box, price (G$)</pre>' +
      '<textarea id="impText" rows="6" placeholder="ingredient,Chicken wings,kg,1400,ABC Poultry,+592 ...,20,5,qty"></textarea><div class="acts"><input type="file" id="impFile" accept=".csv,text/csv,text/plain"><button class="btn sm" id="impPrev">Preview import</button></div><div id="impOut"></div></div>';
    h += '<div class="acts savebar"><button class="btn" id="resetS">Discard changes</button><button class="btn red" id="saveS">Save settings</button></div>' +
      '<h3>This device</h3><div class="card small">Signed in as staff. <button class="btn sm" id="signOut">Sign out</button></div>';
    const open = [...document.querySelectorAll('#tab-settings details[open] summary')].map(s => s.textContent.split(' · ')[0]);
    $('tab-settings').innerHTML = h;
    document.querySelectorAll('#tab-settings details').forEach(d => { if (open.includes(d.querySelector('summary').textContent.split(' · ')[0])) d.open = true; });
  }
  function lineCost2(it, rec) { const ing = {}; SD.ingredients.forEach(i => { ing[i.id] = i; }); const ch = summary(it, it.groups.map(() => 0)); let c = 0; for (const r of rec.rules) if (ing[r.ing]) c += (+r.qty || 0) * count(ch, r.match) * (+ing[r.ing].costPerUnit || 0); return Math.round(c); }
  if ($('tab-settings')) $('tab-settings').addEventListener('input', (e) => {
    const t = e.target, d = t.dataset; dirtySettings = true;
    const val = t.type === 'checkbox' ? t.checked : t.value;
    if (t.id === 'printStation') { localStorage.setItem(PS_KEY, t.checked ? '1' : '0'); dirtySettings = false; return toast(t.checked ? 'This device is the print station' : 'Print station off on this device'); }
    if (d.cwd != null) { const i = +d.cwd; const set = new Set(SD.settings.shop.closedWeekdays); if (t.checked) set.add(i); else set.delete(i); SD.settings.shop.closedWeekdays = [...set].sort(); }
    else if (d.spromo) { if (d.spromo === 'tags') SD.settings.promo.tags = String(val).split(',').map(x => x.trim()).filter(Boolean); else SD.settings.promo[d.spromo] = d.spromo === 'dailyCap' ? +val : val; }
    else if (d.sp) SD.settings.printer[d.sp] = d.sp === 'paperWidth' ? +val : val;
    else if (d.sr) SD.settings.receipt[d.sr] = val;
    else if (d.s) SD.settings[d.s] = val;
    else if (d.i) { const i = SD.ingredients[+d.i]; if (d.f === 'costLabel') { i.costLabel = val; if (val === 'real') i.costSource = { name: 'Owner-confirmed', date: today(), note: 'Set in POS Settings' }; } else if (d.f === 'minKind') i.min.kind = val; else if (d.f === 'minValue') i.min.value = +val; else if (d.f === 'costPerUnit') i.costPerUnit = +val; else i[d.f] = val; }
    else if (d.v) SD.vendors[+d.v][d.f] = val;
    else if (d.r) { const r = SD.recipes[d.r].rules[+d.k]; r[d.f] = d.f === 'qty' ? +val : val; if (d.f === 'match' && !val) delete r.match; }
    else if (d.re) { SD.recipes[d.re].label = val; SD.recipes[d.re].example = val === 'example'; }
  });
  if ($('tab-settings')) $('tab-settings').addEventListener('change', (e) => { if (e.target.dataset.r || e.target.dataset.f === 'costPerUnit') drawSettings(); });
  if ($('tab-settings')) $('tab-settings').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'addV') { dirtySettings = true; SD.vendors.push({ id: 'v-' + Date.now().toString(36), name: 'New vendor', phone: '', placeholder: true }); return drawSettings(); }
    if (b.dataset.ra) { dirtySettings = true; SD.recipes[b.dataset.ra].rules.push({ ing: SD.ingredients[0].id, qty: 0.1 }); return drawSettings(); }
    if (b.dataset.rr) { dirtySettings = true; SD.recipes[b.dataset.rr].rules.splice(+b.dataset.k, 1); return drawSettings(); }
    if (b.id === 'resetS') { dirtySettings = false; return renderSettings(); }
    if (b.id === 'signOut') { localStorage.removeItem(TOKEN_KEY); return location.reload(); }
    if (b.id === 'closedAddBtn') { const v = ($('closedAdd') || {}).value; if (!v) return; dirtySettings = true; if (!SD.settings.shop.closedDates.includes(v)) SD.settings.shop.closedDates.push(v); return drawSettings(); }
    if (b.dataset.cdd) { dirtySettings = true; SD.settings.shop.closedDates = SD.settings.shop.closedDates.filter(x => x !== b.dataset.cdd); return drawSettings(); }
    if (b.id === 'saveS') { b.disabled = true; const j = await act('settings', SD, 'Settings saved'); b.disabled = false; if (j) { dirtySettings = false; renderSettings(); } }
  });

  // ---------- bulk import (owner sheet CSV) ----------
  let IMP = null;
  function parseCSV(t) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) { const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(cur.trim()); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
      else cur += c; }
    if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
    return rows.filter(r => r.some(x => x));
  }
  const numOf = (v) => { const s = String(v || '').replace(/G\$|\$|,|\s/gi, ''); if (s === '') return null; const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : NaN; };
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';
  const findItem = (v) => { const k = String(v || '').trim().toLowerCase(); return M.items.find(i => i.id === k || i.name.toLowerCase() === k) || (k.length > 3 ? M.items.find(i => i.name.toLowerCase().startsWith(k)) : null); };
  function buildImport(text) {
    const res = { ings: [], recs: {}, prices: [], warn: [], err: [] };
    parseCSV(text).forEach((r, n) => {
      const t = (r[0] || '').toLowerCase(), L = 'Line ' + (n + 1) + ': ';
      if (t === 'type' || t.startsWith('#') || t === 'section') return;
      if (t === 'ingredient') {
        if (!r[1]) return res.err.push(L + 'ingredient name missing');
        const x = { name: r[1], unit: r[2] || '', cost: numOf(r[3]), supplier: r[4] || '', phone: r[5] || '', stock: numOf(r[6]), min: numOf(r[7]), minType: /^serv/i.test(r[8] || '') ? 'servings' : 'qty' };
        for (const k of ['cost', 'stock', 'min']) if (Number.isNaN(x[k])) { res.err.push(L + k + ' is not a number'); x[k] = null; }
        res.ings.push(x);
      } else if (t === 'recipe') {
        const it = findItem(r[1]); if (!it) return res.err.push(L + 'menu item "' + r[1] + '" not found');
        const q = numOf(r[3]); if (q != null && (Number.isNaN(q) || q <= 0)) return res.err.push(L + 'qty must be a number > 0');
        if (!r[2]) return res.err.push(L + 'ingredient name missing');
        (res.recs[it.id] = res.recs[it.id] || []).push({ ingName: r[2], qty: q, match: r[4] || '' });   // q null = keep current amount
      } else if (t === 'price') { const p = numOf(r[2]); if (p) res.prices.push([r[1], p]); }
      else res.err.push(L + 'first column must be ingredient, recipe or price');
    });
    for (const id of Object.keys(res.recs)) if (!res.recs[id].some(r => r.qty != null)) delete res.recs[id];   // nothing filled in: leave the recipe alone
    return res;
  }
  function applyImport(res) {   // into the editable Settings copy (SD); returns [id, stock] pairs to set afterwards
    const stocks = [], byName = (n) => { const k = String(n).trim().toLowerCase(); return SD.ingredients.find(i => i.id === k || i.name.toLowerCase() === k); };
    const src = { name: 'Owner ingredient sheet', date: today(), note: 'Imported in POS Settings' };
    const newIng = (name, unit) => { let id = slug(name); while (SD.ingredients.some(j => j.id === id)) id += '-2'; const i = { id, name, unit: unit || 'each', costPerUnit: 0, costLabel: 'example', costSource: null, vendorId: '', min: { kind: 'qty', value: 0 } }; SD.ingredients.push(i); return i; };
    for (const x of res.ings) {
      const i = byName(x.name) || newIng(x.name, x.unit);
      if (x.unit) i.unit = x.unit;
      if (x.cost != null) { i.costPerUnit = x.cost; i.costLabel = 'real'; i.costSource = src; }
      if (x.supplier) { let v = SD.vendors.find(v => v.name.toLowerCase() === x.supplier.toLowerCase()); if (!v) { let vid = 'v-' + slug(x.supplier); while (SD.vendors.some(w => w.id === vid)) vid += '-2'; v = { id: vid, name: x.supplier, phone: '', placeholder: false }; SD.vendors.push(v); } if (x.phone) v.phone = x.phone; v.placeholder = false; i.vendorId = v.id; }
      if (x.min != null) i.min = { kind: x.minType, value: x.min };
      if (x.stock != null) stocks.push([i.id, x.stock]);
    }
    for (const [id, rows] of Object.entries(res.recs)) {
      const rules = [];
      const old = (SD.recipes[id] && SD.recipes[id].rules) || [];
      for (const r of rows) { if (r.qty == null) { const i0 = byName(r.ingName), o = i0 && old.find(x => x.ing === i0.id && (x.match || '') === r.match); if (o) rules.push({ ...o }); continue; }
        let i = byName(r.ingName); if (!i) { res.warn.push('"' + r.ingName + '" (in ' + byId(id).name + ') was not in the ingredient list: added with cost 0, label example'); i = newIng(r.ingName); }
        rules.push({ ing: i.id, qty: r.qty, ...(r.match ? { match: r.match } : {}) }); }
      const all = rows.every(r => r.qty != null), prev = SD.recipes[id] || {};
      SD.recipes[id] = { label: all ? 'real' : (prev.label === 'example' ? 'example' : 'estimate'), example: false, note: (all ? 'From' : 'Partly from') + ' the owner ingredient sheet (' + today() + ')' + (all ? '' : '; blank amounts kept as before'), rules };
    }
    return stocks;
  }
  if ($('tab-settings')) $('tab-settings').addEventListener('change', (e) => { if (e.target.id === 'impFile' && e.target.files[0]) { const f = e.target.files[0]; if (f.size > 200000) return toast('File too big'); f.text().then(t => { $('impText').value = t; toast('File loaded, tap Preview'); }); } });
  if ($('tab-settings')) $('tab-settings').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'impPrev') {
      IMP = buildImport($('impText').value || '');
      const n = Object.keys(IMP.recs);
      $('impOut').innerHTML = '<div class="note blue">' + IMP.ings.length + ' ingredient row(s) · recipes for ' + n.length + ' item(s)' + (n.length ? ' (' + n.map(id => esc(byId(id).name)).join(', ') + ': these replace the current recipe; blank amounts keep the current amount)' : '') + '<br>' +
        IMP.ings.map(x => esc(x.name) + ': ' + (x.cost != null ? money(x.cost) + '/' + esc(x.unit || '?') : 'cost unchanged') + (x.supplier ? ' · ' + esc(x.supplier) : '') + (x.stock != null ? ' · stock ' + x.stock : '') + (x.min != null ? ' · min ' + x.min + ' ' + x.minType : '')).join('<br>') +
        (IMP.prices.length ? '<br><b>Menu prices</b> (not changed here; they live on the website menu): ' + IMP.prices.map(p => esc(p[0]) + ' ' + money(p[1])).join(', ') : '') + '</div>' +
        (IMP.err.length ? '<div class="note red">' + IMP.err.map(esc).join('<br>') + '</div>' : '') +
        (IMP.err.length || (!IMP.ings.length && !n.length) ? '' : '<button class="btn red" id="impApply">Apply import &amp; save</button>');
      dirtySettings = true;
    }
    if (b.id === 'impApply' && IMP) {
      b.disabled = true; const stocks = applyImport(IMP);
      busy = true;
      try { await api('settings', SD); for (const [id, q] of stocks) await api('stock', { id, op: 'set', qty: q });
        toast('✅ Imported' + (IMP.warn.length ? ' (' + IMP.warn.length + ' note(s))' : ''), 5000); if (IMP.warn.length) alert(IMP.warn.join('\n'));
        IMP = null; dirtySettings = false; busy = false; await sync(true); renderSettings(); }
      catch (err) { toast('⚠️ ' + err.message, 6000); b.disabled = false; } finally { busy = false; }
    }
  });

  // ---------- RECEIPTS + PRINT QUEUE ----------
  const PS_KEY = 'ut_print_station';
  const PR = () => (D && D.settings.printer) || { autoPrint: true, paperWidth: 80, driver: 'none' };
  const RS = () => (D && D.settings.receipt) || { showPhone: false, phone: '' };
  const printedNos = () => new Set((D && D.printQueue || []).filter(j => j.status === 'printed').map(j => j.no));
  const BIZ = RAW.business || {};
  const qrSvg = (u) => { try { if (typeof qrcode !== 'function') return ''; const q = qrcode(0, 'M'); q.addData(u); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true, alt: 'QR code: order again' }); } catch (e) { return ''; } };
  function rcOpts(width) {
    const items = {}; M.items.forEach(i => { if (i.day != null) items[i.id] = { day: i.day, dayName: i.dayName }; });
    return { width: +width === 58 ? 58 : 80, business: { name: BIZ.name || 'Unruly Taste', address: BIZ.pickupAddress || BIZ.address || '', phone: RS().phone || '' }, showPhone: !!RS().showPhone,
      siteUrl: CFG.SITE_URL || '', items, logo: '../images/logo.webp', qrSvg };
  }
  function receiptJob(o, width) {
    const opt = rcOpts(width), lines = UTReceipt.escpos(o, opt);
    return { no: o.no, width: opt.width, html: UTReceipt.html(o, opt), text: UTReceipt.text(o, opt), lines, bytes: UTReceipt.escposBytes(lines) };
  }
  function browserPrint(job) {
    const area = $('printArea'); area.innerHTML = job.html;
    let st = $('pageSize'); if (!st) { st = document.createElement('style'); st.id = 'pageSize'; document.head.appendChild(st); }
    st.textContent = '@page { size: ' + job.width + 'mm auto; margin: 0; }';
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50); setTimeout(done, 60000);
  }
  window.UTReceiptUI = { browserPrint };
  function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function receiptSheet(o, width, title) {
    let w = +(width || PR().paperWidth) === 58 ? 58 : 80;
    const drv = window.UTPrinter ? UTPrinter.get(PR().driver) : null;
    const draw = () => {
      const job = receiptJob(o, w);
      openSheet((title ? '<div class="note green small"><b>' + esc(title) + '</b></div>' : '') +
        '<h3>🧾 Receipt ' + esc(o.no) + (printedNos().has(o.no) ? ' <span class="tag ready">printed before</span>' : '') + '</h3>' +
        '<div class="chips"><button class="chip ' + (w === 80 ? 'on' : '') + '" data-rw="80">80 mm</button><button class="chip ' + (w === 58 ? 'on' : '') + '" data-rw="58">58 mm</button></div>' +
        '<div class="rc-stage">' + job.html + '</div>' +
        '<div class="note small">🖨️ Printer: <b>' + esc(drv ? drv.label : 'none') + '</b>. ' + (PR().driver === 'none' ? 'No receipt printer installed yet: use Print (any printer this device has) or Save as PDF.' : '') + '</div>' +
        '<div class="acts rc-acts"><button class="btn primary" data-rp="print">🖨️ Print</button><button class="btn" data-rp="pdf">📄 Save as PDF</button><button class="btn" data-rp="txt">⬇️ Download .txt</button><button class="btn" data-rp="queue">➕ Add to print queue</button><button class="btn" data-close>Close</button></div>');
      $('sheetPanel').onclick = async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.rw) { w = +b.dataset.rw; return draw(); }
        if (b.dataset.rp === 'print') return browserPrint(job);
        if (b.dataset.rp === 'pdf') { toast('In the print dialog choose "Save as PDF" as the printer.', 5000); return browserPrint(job); }
        if (b.dataset.rp === 'txt') return download('receipt-' + o.no + '-' + w + 'mm.txt', job.text);
        if (b.dataset.rp === 'queue') { b.disabled = true; const j = await act('status', { print: { op: 'queue', no: o.no } }, 'Added to the print queue'); if (j && j.already) toast('Already in the print queue (' + j.job.note + ')'); b.disabled = false; }
      };
    };
    draw();
  }
  const PQS = { queued: 'ph', printed: 'ready', skipped: 'collected' };
  function queueSheet() {
    const q = (D && D.printQueue) || [];
    let h = '<h3>🖨️ Print queue</h3><p class="muted small">Every new walk-in and online order gets one receipt here automatically' + (PR().autoPrint === false ? ' (<b>auto-print is OFF</b> in Settings)' : '') + '. Printer driver: <b>' + esc(PR().driver) + '</b>' + (PR().driver === 'none' ? ' (no printer installed yet, so receipts wait here as "ready to print").' : '.') + '</p>';
    h += q.length ? '<div class="pq-list">' + q.map(j => '<div class="pq-row"><div><b>' + esc(j.no) + '</b> <span class="tag ' + (PQS[j.status] || '') + '">' + esc(j.status) + '</span>' + (j.kind === 'reprint' ? ' <span class="tag">reprint</span>' : '') +
      '<div class="muted small">' + time(j.at) + (dayOf(j.at) !== today() ? ' · ' + dayOf(j.at) : '') + ' · ' + esc(j.trigger) + ' · ' + j.width + ' mm · ' + esc(j.note || '') + '</div></div><div class="pq-acts">' +
      '<button class="btn sm" data-pqv="' + esc(j.id) + '">Preview</button>' + (j.status === 'queued' ? '<button class="btn sm" data-pqm="printed" data-id="' + esc(j.id) + '">Mark printed</button><button class="btn sm" data-pqm="skipped" data-id="' + esc(j.id) + '">Skip</button>' : '') + '</div></div>').join('') + '</div>'
      : '<div class="empty card">No receipts yet. The next walk-in or online order will appear here.</div>';
    h += '<div class="acts">' + (D && D.printQueued ? '<button class="btn" id="pqClear">Skip all queued</button>' : '') + '<button class="btn" data-close>Close</button></div>';
    openSheet(h);
    $('sheetPanel').onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.pqv) {
        const j = q.find(x => x.id === b.dataset.pqv), o = j && D.orders.find(x => x.no === j.no);
        if (o) return receiptSheet(o, j.width);
        try { const r = await api('status', { print: { op: 'get', id: b.dataset.pqv } }); openSheet('<h3>🧾 ' + esc(r.job.no) + '</h3><pre class="rc-text">' + esc(r.job.text) + '</pre><div class="acts"><button class="btn" data-close>Close</button></div>'); } catch (err) { toast('⚠️ ' + err.message); }
        return;
      }
      if (b.dataset.pqm) { await act('status', { print: { op: 'mark', id: b.dataset.id, status: b.dataset.pqm } }, 'Receipt ' + b.dataset.pqm); return queueSheet(); }
      if (b.id === 'pqClear') { if (!confirm('Mark all queued receipts as skipped?')) return; await act('status', { print: { op: 'clear' } }, 'Queue cleared'); return queueSheet(); }
    };
  }
  $('pqBtn').addEventListener('click', () => { if (D) queueSheet(); });
  // Auto-print (print station only, real driver only). With driver "none" this does nothing.
  let printing = false;
  async function processPrintQueue() {
    if (printing || !D || !window.UTPrinter || localStorage.getItem(PS_KEY) !== '1') return;
    const drv = UTPrinter.get(PR().driver);
    if (!drv || drv.id === 'none' || drv.stub || drv.interactive) return;
    const jobs = (D.printQueue || []).filter(j => j.status === 'queued').reverse();
    if (!jobs.length || !(await drv.available())) return;
    printing = true;
    try {
      for (const j of jobs) {
        const o = D.orders.find(x => x.no === j.no); if (!o) continue;
        const r = await drv.print(receiptJob(o, j.width));
        await api('status', { print: { op: 'mark', id: j.id, status: r.ok ? 'printed' : 'queued', note: r.ok ? 'printed' : 'print failed: ' + String(r.error || r.reason || '').slice(0, 50), driver: drv.id } });
      }
    } catch (e) { toast('⚠️ Printer: ' + e.message); } finally { printing = false; }
  }

  // ---------- ADMIN (owner: users. owner/manager: customers) ----------
  let adminUsers = null, adminAudit = null;
  const canBlast = () => D.me && (D.me.role === 'owner' || D.me.role === 'manager');
  async function renderAdmin() {
    const role = D.me && D.me.role;
    let h = '<h2>Admin</h2><p class="muted small">Signed in as <b>' + esc((D.me && D.me.name) || '') + '</b> (' + esc(role || '') + '). Staff can take orders. Only the owner or a manager can change customers or send promos. Only the owner changes PINs.</p>';
    if (role === 'owner') {
      if (!adminUsers) { try { const j = await api('status', { admin: { op: 'users' } }); adminUsers = j.users || []; adminAudit = j.audit || []; } catch (e) { h += '<div class="note">' + esc(e.message) + '</div>'; } }
      h += '<h3>Staff</h3><div class="card"><div class="scroll"><table class="t"><tr><th>Name</th><th>Role</th><th></th></tr>' + (adminUsers || []).map(u => '<tr><td>' + esc(u.name) + (u.disabled ? ' <span class="tag collected">off</span>' : '') + '</td><td>' + esc(u.role) + '</td><td><button class="btn sm" data-upin="' + esc(u.id) + '">New PIN</button></td></tr>').join('') + '</table></div>' +
        '<h3>Add manager or staff</h3><div class="field"><label>Name</label><input id="nuName" maxlength="40"></div><div class="field"><label>Role</label><select id="nuRole" style="width:auto"><option value="staff">staff</option><option value="manager">manager</option></select></div><div class="field"><label>PIN (8+ characters)</label><input id="nuPin" type="password" autocomplete="new-password"></div><button class="btn" id="nuAdd" type="button">Add user</button></div>';
    }
    const P = D.promo || { customers: [] };
    h += '<h3>Customers</h3><div class="card"><p class="muted small">Numbers stay masked in the list. Edit shows the full number to the owner or a manager, and every change is written to the audit log (who, when, before, after).</p>' +
      '<div class="acts"><button class="btn sm" id="cuAdd" type="button">Add customer</button></div>' +
      '<div class="scroll"><table class="t"><tr><th>Name</th><th>WhatsApp</th><th>Groups</th><th>Specials</th><th></th></tr>' +
      (P.customers || []).map(c => '<tr><td>' + esc(c.name || '–') + '</td><td>' + esc(c.number) + '</td><td class="small">' + esc((c.tags || []).join(', ')) + '</td><td>' + esc(c.opt) + '</td><td><button class="btn sm" data-cedit="' + esc(c.id) + '">Edit</button></td></tr>').join('') +
      '</table></div></div>';
    if (role === 'owner' && adminAudit) {
      h += '<h3>Audit log</h3><div class="card small">' + (adminAudit.slice(0, 12).map(a => '<div>' + esc((a.at || '').slice(0, 16).replace('T', ' ')) + ' · ' + esc(a.user) + ' · <b>' + esc(a.action) + '</b></div>').join('') || '<span class="muted">No changes yet.</span>') + '</div>';
    }
    $('tab-admin').innerHTML = h;
  }
  if ($('tab-admin')) $('tab-admin').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'nuAdd') {
      try { const j = await api('status', { admin: { op: 'user-add', name: $('nuName').value, role: $('nuRole').value, pin: $('nuPin').value } }); adminUsers = j.users; toast('User added'); renderAdmin(); }
      catch (err) { toast('⚠️ ' + err.message); }
      return;
    }
    if (b.dataset.upin) {
      const pin = prompt('New PIN (8+ characters). The old PIN stops working.');
      if (!pin) return;
      try { await api('status', { admin: { op: 'user-pin', id: b.dataset.upin, pin } }); toast('PIN changed'); } catch (err) { toast('⚠️ ' + err.message); }
      return;
    }
    if (b.id === 'cuAdd') return customerSheet(null);
    if (b.dataset.cedit) return customerSheet(b.dataset.cedit);
  });
  async function customerSheet(id) {
    let c = { id: '', name: '', phone: '', tags: [] };
    if (id) { try { const j = await api('status', { admin: { op: 'customer', id } }); c = j.customer; } catch (e) { return toast('⚠️ ' + e.message); } }
    const tags = ((D.settings.promo && D.settings.promo.tags) || []).map(t => '<label class="small"><input type="checkbox" data-ctag="' + esc(t) + '"' + ((c.tags || []).includes(t) ? ' checked' : '') + '> ' + esc(t) + '</label>').join(' ');
    openSheet('<h3>' + (id ? 'Edit customer' : 'Add customer') + '</h3><div class="field"><label>Name</label><input id="cuName" value="' + esc(c.name || '') + '"></div><div class="field"><label>WhatsApp number</label><input id="cuPhone" value="' + esc(c.phone || '') + '" inputmode="tel"></div><div class="field"><label>Groups</label><div>' + tags + '</div></div><div class="acts"><button class="btn" data-close>Cancel</button>' + (id ? '<button class="btn" id="cuDel">Remove</button>' : '') + '<button class="btn primary" id="cuSave">Save</button></div>');
    $('cuSave').onclick = async () => {
      const tagsOn = [...document.querySelectorAll('[data-ctag]:checked')].map(x => x.dataset.ctag);
      const body = { name: $('cuName').value, phone: $('cuPhone').value, tags: tagsOn };
      try {
        await api('status', { admin: id ? { op: 'customer-edit', id, ...body } : { op: 'customer-add', ...body } });
        closeSheet(); toast('Customer saved'); await sync(true);
      } catch (err) { toast('⚠️ ' + err.message); }
    };
    const del = $('cuDel');
    if (del) del.onclick = async () => { if (!confirm('Remove this customer from the list? Their past orders stay.')) return; try { await api('status', { admin: { op: 'customer-remove', id } }); closeSheet(); toast('Removed'); await sync(true); } catch (err) { toast('⚠️ ' + err.message); } };
  }

  // ---------- PROMOS ----------
  let promoView = 'customers', promoBody = '', promoSponsor = false, promoSponsorText = '', promoImageId = '', promoImagePreview = '', promoWhen = '', promoRepeat = false, promoPreview = null;
  let promoAud = { mode: 'all', ids: [], groups: [], includeUnknown: false }, promoQ = '', promoList = 'upcoming';
  function audiencePayload() { return { mode: promoAud.mode, ids: promoAud.ids, groups: promoAud.groups, includeUnknown: !!promoAud.includeUnknown }; }
  function excludedLine(ex) {
    ex = ex || {};
    return 'Not included: stopped ' + (ex.stopped || 0) + ', said no ' + (ex.no || 0) + ', not opted in ' + (ex.unknown || 0) + ', blocked ' + (ex.blocked || 0) + ', this line ' + (ex.own || 0) + '.';
  }
  function renderPromo() {
    const P = D.promo || { customers: [], optedIn: 0, promos: [], sentToday: 0, dailyCap: 150 };
    const def = (D.settings.promo && D.settings.promo.sponsorDefault) || 'Sponsored by Neuereatec';
    if (!promoSponsorText) promoSponsorText = def;
    const blast = canBlast();
    const chip = (id, label) => '<button class="chip ' + (promoView === id ? 'on' : '') + '" data-pv="' + id + '" type="button">' + label + '</button>';
    let h = '<h2>Promos</h2><div class="chips">' + chip('customers', 'Customers (' + (P.customerCount || P.customers.length) + ')') + chip('compose', 'New promo') + chip('list', 'Scheduled') + '</div>';
    h += '<p class="muted small">Opted in: <b>' + (P.optedIn || 0) + '</b> · sent today ' + (P.sentToday || 0) + ' / ' + (P.dailyCap || 150) + '. Stopped, said-no, 592 712 2188 and this line are never included. ' + (P.bridgePromo === false ? '<b>Customer sending waits for the WhatsApp bridge update.</b> ' : '') + (blast ? '' : '<b>You can look, but only the owner or a manager can send.</b>') + '</p>';
    if (promoView === 'customers') {
      h += '<div class="scroll"><table class="t"><tr><th>Name</th><th>WhatsApp</th><th>Orders</th><th>Groups</th><th>Specials</th><th></th></tr>' +
        (P.customers || []).map(c => '<tr><td>' + esc(c.name || '–') + '</td><td>' + esc(c.number) + '</td><td>' + c.orders + '</td><td class="small">' + esc((c.tags || []).join(', ')) + '</td><td><span class="tag ' + (c.opt === 'yes' ? 'ready' : c.opt === 'stopped' || c.opt === 'no' ? 'collected' : 'ph') + '">' + esc(c.opt) + '</span></td><td>' + (blast ? '<button class="btn sm" data-cedit="' + esc(c.id) + '" type="button">Edit</button>' : '') + '</td></tr>').join('') +
        '</table></div>';
    } else if (promoView === 'compose') {
      const tags = (D.settings.promo && D.settings.promo.tags) || [];
      const smart = [['smart:7d', 'Ordered in 7 days'], ['smart:30d', 'Ordered in 30 days'], ['smart:source:phone-call', 'Phone calls'], ['smart:source:web-chat', 'Web chat'], ['smart:source:web-voice', 'Web voice'], ['smart:source:whatsapp', 'WhatsApp orders']];
      const q = promoQ.toLowerCase();
      const people = (P.customers || []).filter(c => !q || (c.name || '').toLowerCase().includes(q) || (c.number || '').includes(q));
      const shop = D.settings.shop || { closedWeekdays: [], closedDates: [] };
      const whenDay = promoWhen ? promoWhen.slice(0, 10) : '';
      const whenClosed = whenDay && (shop.closedDates || []).includes(whenDay);
      h += '<div class="card" id="promoCompose">' +
        '<div class="field"><label>Message (max 500)</label><textarea id="promoBody" rows="4" maxlength="500">' + esc(promoBody) + '</textarea><div class="hint small muted"><span id="promoLen">' + promoBody.length + '</span>/500</div></div>' +
        '<label class="small"><input type="checkbox" id="promoSponsor"' + (promoSponsor ? ' checked' : '') + '> Add sponsor line</label>' +
        '<div class="field"><label>Sponsor line</label><input id="promoSponsorText" maxlength="80" value="' + esc(promoSponsorText) + '"></div>' +
        '<div class="field"><label>Picture (JPG, PNG or WEBP, under 1.5 MB)</label><input type="file" id="promoFile" accept="image/jpeg,image/png,image/webp">' +
        (promoImagePreview ? '<img id="promoImg" alt="Promo picture" src="' + promoImagePreview + '" style="max-width:180px;border-radius:8px;display:block;margin-top:6px">' : '') + '</div>' +
        '<h3>Who gets it</h3>' +
        '<label class="small"><input type="radio" name="pam" value="all"' + (promoAud.mode === 'all' ? ' checked' : '') + '> All opted-in</label> ' +
        '<label class="small"><input type="radio" name="pam" value="ids"' + (promoAud.mode === 'ids' ? ' checked' : '') + '> Pick people</label> ' +
        '<label class="small"><input type="radio" name="pam" value="groups"' + (promoAud.mode === 'groups' ? ' checked' : '') + '> Groups</label>' +
        (promoAud.mode === 'ids' ? '<div class="field"><input id="promoQ" placeholder="Search name or last 4" value="' + esc(promoQ) + '"><div class="scroll" style="max-height:160px">' + people.map(c => '<label class="small" style="display:block"><input type="checkbox" data-pid="' + esc(c.id) + '"' + (promoAud.ids.includes(c.id) ? ' checked' : '') + '> ' + esc(c.name || '–') + ' ' + esc(c.number) + ' <span class="muted">' + esc(c.opt) + '</span></label>').join('') + '</div></div>' : '') +
        (promoAud.mode === 'groups' ? '<div>' + tags.map(t => '<label class="small" style="display:block"><input type="checkbox" data-pg="tag:' + esc(t) + '"' + (promoAud.groups.includes('tag:' + t) ? ' checked' : '') + '> ' + esc(t) + '</label>').join('') + smart.map(([id, label]) => '<label class="small" style="display:block"><input type="checkbox" data-pg="' + id + '"' + (promoAud.groups.includes(id) ? ' checked' : '') + '> ' + label + '</label>').join('') + '</div>' : '') +
        (blast ? '<label class="small"><input type="checkbox" id="promoUnknown"' + (promoAud.includeUnknown ? ' checked' : '') + '> Include customers who haven\'t opted in (unknown)</label><p class="note" id="unknownWarn">WhatsApp can block the shared 712 9487 line if you message people who never agreed. Stopped and said-no stay out. This needs a second confirm and is written to the audit log.</p>' : '') +
        '<div class="field"><label>Send later (Guyana time, optional)</label><input id="promoWhen" type="datetime-local" value="' + esc(promoWhen) + '">' + (whenClosed ? '<div class="note">This date is a closed day. It will be skipped unless you confirm.</div>' : '') + '</div>' +
        '<label class="small"><input type="checkbox" id="promoRepeat"' + (promoRepeat ? ' checked' : '') + '> Repeat every week (skips weeks the shop is closed)</label>' +
        '<h3>Preview' + (promoImageId ? ' (caption)' : '') + '</h3>' + (promoImagePreview ? '<img alt="" src="' + promoImagePreview + '" style="max-width:120px;border-radius:8px">' : '') + '<pre class="promo-preview" id="promoPreview">' + esc(promoPreview ? promoPreview.text : 'The exact message appears here.') + '</pre>' +
        '<p class="small muted" id="promoMeta">' + (promoPreview ? promoPreview.chars + ' characters · ' + promoPreview.recipients + ' will get it. ' + excludedLine(promoPreview.excluded) : '') + '</p>' +
        '<div class="acts"><button class="btn" id="promoRefresh" type="button">Update preview</button>' + (blast ? '<button class="btn" id="promoTest" type="button">Send test to me</button><button class="btn red" id="promoSend" type="button">Send</button>' : '') + '</div></div>';
    } else {
      const rows = (P.promos || []).filter(p => promoList === 'upcoming' ? (p.status === 'scheduled' || p.status === 'running' || p.status === 'paused') : promoList === 'sent' ? p.status === 'done' : promoList === 'missed' ? p.status === 'missed' : (p.status === 'skipped' || p.status === 'cancelled'));
      const fchip = (id, label) => '<button class="chip ' + (promoList === id ? 'on' : '') + '" data-pl="' + id + '" type="button">' + label + '</button>';
      h += '<div class="chips">' + fchip('upcoming', 'Upcoming') + fchip('sent', 'Sent') + fchip('missed', 'Missed') + fchip('skipped', 'Skipped') + '</div>';
      h += rows.length ? rows.map(p => '<div class="card"><div class="oh"><b>' + esc(p.id) + '</b> ' + (p.test ? '<span class="tag test">TEST</span>' : '') + ' <span class="tag ' + (p.status === 'done' ? 'ready' : p.status === 'missed' || p.status === 'skipped' || p.status === 'cancelled' ? 'collected' : 'ph') + '">' + esc(p.status) + '</span> ' + (p.repeat === 'weekly' ? '<span class="tag">weekly</span>' : '') + '</div>' +
        '<p class="small">' + (p.sendAt ? 'when ' + esc(p.sendAt.slice(0, 16).replace('T', ' ')) + ' UTC · ' : '') + 'sent ' + p.sent + ' · queued ' + p.queued + ' · failed ' + p.failed + ' · skipped ' + p.skipped + (p.hold ? ' · <b>' + esc(p.hold) + '</b>' : '') + (p.pausedReason ? ' · ' + esc(p.pausedReason) : '') + (p.sponsor ? ' · ' + esc(p.sponsorText) : '') + '</p>' +
        '<pre class="promo-preview">' + esc(p.preview || '') + '</pre>' +
        (blast ? '<div class="acts">' + (p.status === 'scheduled' ? '<button class="btn sm" data-now="' + esc(p.id) + '" type="button">Send now</button>' : '') + (p.status === 'running' || p.status === 'scheduled' ? '<button class="btn sm" data-pop="pause" data-pid="' + esc(p.id) + '" type="button">Pause</button>' : '') + (p.status === 'paused' ? '<button class="btn sm" data-pop="resume" data-pid="' + esc(p.id) + '" type="button">Resume</button>' : '') + (p.editable ? '<button class="btn sm" data-pedit="' + esc(p.id) + '" type="button">Edit</button>' : '') + (p.status !== 'done' && p.status !== 'cancelled' && p.status !== 'missed' ? '<button class="btn sm" data-pop="cancel" data-pid="' + esc(p.id) + '" type="button">Cancel</button>' : '') + '</div>' : '') + '</div>').join('') : '<div class="empty card">Nothing in this list.</div>';
    }
    $('tab-promo').innerHTML = h;
    const body = $('promoBody'); if (body) body.oninput = () => { promoBody = body.value; const n = $('promoLen'); if (n) n.textContent = body.value.length; };
    const st = $('promoSponsorText'); if (st) st.oninput = () => { promoSponsorText = st.value; };
    const wh = $('promoWhen'); if (wh) wh.onchange = () => { promoWhen = wh.value; renderPromo(); };
    const qq = $('promoQ'); if (qq) qq.oninput = () => { promoQ = qq.value; renderPromo(); const n = $('promoQ'); if (n) n.focus(); };
  }
  async function refreshPromoPreview() {
    const j = await api('status', { promo: { op: 'preview', body: promoBody, sponsor: promoSponsor, sponsorText: promoSponsorText, image: !!promoImageId, imageId: promoImageId, audience: audiencePayload(), sendLocal: promoWhen } });
    promoPreview = j; renderPromo();
  }
  async function uploadPromoFile(file) {
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) throw new Error('Image is over 1.5 MB.');
    const buf = new Uint8Array(await file.arrayBuffer());
    const start = await api('status', { image: { op: 'start' } });
    const step = 24000;
    for (let i = 0; i < buf.length; i += step) {
      let bin = ''; const slice = buf.subarray(i, i + step);
      for (let k = 0; k < slice.length; k++) bin += String.fromCharCode(slice[k]);
      await api('status', { image: { op: 'chunk', id: start.id, data: btoa(bin) } });
    }
    const fin = await api('status', { image: { op: 'finish', id: start.id } });
    promoImageId = fin.imageId; promoImagePreview = fin.preview;
    toast('Picture saved'); renderPromo();
  }
  if ($('tab-promo')) $('tab-promo').addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'promoSponsor') { promoSponsor = t.checked; refreshPromoPreview().catch(err => toast('⚠️ ' + err.message)); }
    if (t.id === 'promoRepeat') promoRepeat = t.checked;
    if (t.id === 'promoUnknown') { promoAud.includeUnknown = t.checked; refreshPromoPreview().catch(err => toast('⚠️ ' + err.message)); }
    if (t.name === 'pam') { promoAud.mode = t.value; renderPromo(); }
    if (t.dataset.pid) { const id = t.dataset.pid; promoAud.ids = t.checked ? [...new Set(promoAud.ids.concat(id))] : promoAud.ids.filter(x => x !== id); }
    if (t.dataset.pg) { const id = t.dataset.pg; promoAud.groups = t.checked ? [...new Set(promoAud.groups.concat(id))] : promoAud.groups.filter(x => x !== id); }
    if (t.id === 'promoFile') uploadPromoFile(t.files[0]).catch(err => toast('⚠️ ' + err.message));
  });
  if ($('tab-promo')) $('tab-promo').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pv) { promoView = b.dataset.pv; return renderPromo(); }
    if (b.dataset.pl) { promoList = b.dataset.pl; return renderPromo(); }
    if (b.dataset.cedit) return customerSheet(b.dataset.cedit);
    if (b.dataset.copt) { if (!canBlast()) return; if (b.dataset.copt === 'stopped' && !confirm('Stop specials for this customer?')) return; await act('status', { promo: { op: 'opt', id: b.dataset.cid, status: b.dataset.copt } }, 'Updated'); return; }
    if (b.dataset.pop) { await act('status', { promo: { op: b.dataset.pop, id: b.dataset.pid } }, b.dataset.pop); return; }
    if (b.dataset.now) {
      const go = (confirmClosed) => api('status', { promo: { op: 'sendNow', id: b.dataset.now, confirmClosed: !!confirmClosed } });
      try { await go(false); toast('Sending now'); promoView = 'list'; await sync(true); }
      catch (err) { if (/closed today/.test(err.message) && confirm('The shop is closed today. Send anyway?')) { try { await go(true); toast('Sending now'); await sync(true); } catch (e2) { toast('⚠️ ' + e2.message); } } else toast('⚠️ ' + err.message); }
      return;
    }
    if (b.dataset.pedit) {
      const p = (D.promo.promos || []).find(x => x.id === b.dataset.pedit); if (!p) return;
      openSheet('<h3>Edit ' + esc(p.id) + '</h3><div class="field"><label>Message</label><textarea id="edBody" rows="4" maxlength="500">' + esc(p.body) + '</textarea></div><label class="small"><input type="checkbox" id="edSp"' + (p.sponsor ? ' checked' : '') + '> Add sponsor line</label><div class="field"><label>Sponsor line</label><input id="edSpText" maxlength="80" value="' + esc(p.sponsorText || promoSponsorText) + '"></div><div class="field"><label>Send at (Guyana time)</label><input id="edWhen" type="datetime-local"></div><div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="edSave" type="button">Save</button></div>');
      $('edSave').onclick = async () => { const j = await act('status', { promo: { op: 'edit', id: p.id, body: $('edBody').value, sponsor: $('edSp').checked, sponsorText: $('edSpText').value, sendLocal: $('edWhen').value || undefined } }, 'Promo updated'); if (j) closeSheet(); };
      return;
    }
    if (b.id === 'promoRefresh') { try { await refreshPromoPreview(); } catch (err) { toast('⚠️ ' + err.message); } return; }
    if (b.id === 'promoTest') {
      try { await refreshPromoPreview(); } catch (err) { return toast('⚠️ ' + err.message); }
      openSheet('<h3>Send test to me?</h3><p>One TEST message to the shop\'s own WhatsApp chat only. No customer gets it.</p><pre class="promo-preview">' + esc(promoPreview.text) + '</pre><div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="doTest" type="button">Send test</button></div>');
      $('doTest').onclick = async () => { $('doTest').disabled = true; const j = await act('status', { promo: { op: 'test', body: promoBody, sponsor: promoSponsor, sponsorText: promoSponsorText, imageId: promoImageId } }, 'Test queued to the own chat'); if (j) { closeSheet(); promoView = 'list'; } };
      return;
    }
    if (b.id === 'promoSend') {
      try { await refreshPromoPreview(); } catch (err) { return toast('⚠️ ' + err.message); }
      const n = promoPreview.recipients;
      const ex = excludedLine(promoPreview.excluded);
      const closed = !!promoPreview.closed;
      const go = (extra) => {
        openSheet('<h3 id="promoConfirm">Send this promo?</h3><p><b>' + n + '</b> ' + (promoAud.includeUnknown ? 'people (including some who have not opted in)' : 'people') + ' will get it. ' + esc(ex) + (promoWhen ? ' Scheduled for ' + esc(promoWhen.replace('T', ' ')) + ' Guyana time.' : ' Starts as soon as the WhatsApp line is idle.') + (closed ? ' <b>That day is closed.</b>' : '') + '</p><pre class="promo-preview">' + esc(promoPreview.text) + '</pre><div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn red" id="doSend" type="button"' + (n ? '' : ' disabled') + '>Send to ' + n + '</button></div>');
        $('doSend').onclick = async () => {
          $('doSend').disabled = true;
          const j = await act('status', { promo: { op: 'send', confirm: true, confirmUnknown: !!promoAud.includeUnknown, confirmClosed: !!closed, body: promoBody, sponsor: promoSponsor, sponsorText: promoSponsorText, image: !!promoImageId, imageId: promoImageId, audience: audiencePayload(), sendLocal: promoWhen, repeat: promoRepeat ? 'weekly' : '' } }, n + ' queued');
          if (j) { closeSheet(); promoView = 'list'; promoList = promoWhen ? 'upcoming' : 'upcoming'; }
        };
      };
      if (promoAud.includeUnknown) {
        openSheet('<h3>Include people who have not opted in?</h3><p class="note">This can get the shared WhatsApp line <b>712 9487</b> blocked. Stopped customers and anyone who said no are still left out. It is written to the audit log.</p><div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn red" id="doUnknown" type="button">I understand, continue</button></div>');
        $('doUnknown').onclick = () => go(true);
      } else go(false);
    }
  });

  // ---------- boot ----------
  if (!RAW || !CFG.ASSISTANT_API) { document.body.innerHTML = '<p style="padding:20px">POS not configured.</p>'; return; }
  if (localStorage.getItem(TOKEN_KEY)) startPoll(); else showLogin();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && localStorage.getItem(TOKEN_KEY)) sync(); });
})();
