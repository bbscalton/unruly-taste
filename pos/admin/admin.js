/* Unruly Taste Admin. Separate page and a separate server session from the till. */
(function () {
  const CFG = window.UT_CONFIG || {};
  const API = String(CFG.ASSISTANT_API || '').replace(/\/$/, '') + '/pos/';
  const KEY = 'ut_admin_session';
  const M = window.UT_MENU;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => 'G$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  let token = sessionStorage.getItem(KEY) || '';
  let D = null, tab = 'customers', toastT;

  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3200); }
  function openSheet(html) { $('sheetPanel').innerHTML = html; $('sheet').classList.remove('hidden'); }
  function closeSheet() { $('sheet').classList.add('hidden'); $('sheetPanel').innerHTML = ''; }
  $('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' || e.target.closest('[data-close]')) closeSheet(); });

  async function api(action, body) {
    const r = await fetch(API + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...(body || {}) }) });
    let j = {}; try { j = await r.json(); } catch {}
    if (r.status === 401) { token = ''; sessionStorage.removeItem(KEY); showLogin(j.error || 'Sign in again.'); throw new Error(j.error || 'Sign in again.'); }
    if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
    return j;
  }

  function showLogin(msg) {
    $('login').classList.remove('hidden');
    $('tabs').innerHTML = '';
    $('view').innerHTML = '';
    $('who').textContent = 'sign in';
    if (msg) $('loginErr').textContent = msg;
  }
  function hideLogin() { $('login').classList.add('hidden'); }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginErr').textContent = '';
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const r = await fetch(API + 'auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('pin').value.trim(), admin: true }) });
      let j = {}; try { j = await r.json(); } catch {}
      if (!r.ok || !j.session) { $('loginErr').textContent = j.error || 'That PIN cannot open Admin.'; btn.disabled = false; return; }
      token = j.session; sessionStorage.setItem(KEY, token); $('pin').value = '';
      btn.disabled = false; hideLogin(); await boot();
    } catch (err) { $('loginErr').textContent = err.message; btn.disabled = false; }
  });
  $('outBtn').addEventListener('click', () => { token = ''; sessionStorage.removeItem(KEY); location.reload(); });

  const TABS = [
    ['staff', 'Staff & PINs', 'owner'],
    ['customers', 'Customers', 'mgr'],
    ['menu', 'Menu & Prices', 'owner'],
    ['closed', 'Closed days', 'owner'],
    ['promos', 'Promos', 'mgr'],
    ['shop', 'Shop settings', 'owner'],
    ['activity', 'Activity', 'owner']
  ];
  const role = () => (D && D.me && D.me.role) || '';
  const allowed = (need) => need === 'mgr' ? (role() === 'owner' || role() === 'manager') : role() === 'owner';

  function drawTabs() {
    const vis = TABS.filter((t) => allowed(t[2]));
    if (!vis.some((t) => t[0] === tab)) tab = (vis[0] && vis[0][0]) || 'customers';
    $('tabs').innerHTML = vis.map((t) => '<button type="button" data-tab="' + t[0] + '"' + (t[0] === tab ? ' class="on" aria-current="page"' : '') + '><span>' + t[1] + '</span></button>').join('');
    $('who').textContent = ((D.me && D.me.name) || '') + ' · ' + role();
  }
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    tab = b.dataset.tab; drawTabs(); render();
  });

  async function boot() {
    D = await api('sync');
    if (!D.me || D.me.scope !== 'admin' || (role() !== 'owner' && role() !== 'manager')) {
      token = ''; sessionStorage.removeItem(KEY);
      return showLogin('This PIN is for the till only. Admin needs an owner or manager PIN.');
    }
    hideLogin(); drawTabs(); render();
  }

  function rows() {
    const cat = (D && D.catalog) || [];
    if (cat.length) return cat;
    return (M.items || []).map((it) => ({ id: it.id, name: it.name, price: it.price, category: it.sec, available: it.available !== false }));
  }

  async function render() {
    drawTabs();
    if (tab === 'staff') return renderStaff();
    if (tab === 'customers') return renderCustomers();
    if (tab === 'menu') return renderMenu();
    if (tab === 'closed') return renderClosed();
    if (tab === 'promos') return renderPromos();
    if (tab === 'shop') return renderShop();
    if (tab === 'activity') return renderActivity();
  }

  async function renderStaff() {
    let users = [];
    try { const j = await api('status', { admin: { op: 'users' } }); users = j.users || []; }
    catch (e) { $('view').innerHTML = '<div class="note">' + esc(e.message) + '</div>'; return; }
    $('view').innerHTML = '<h2>Staff &amp; PINs</h2><p class="muted small">Only the owner sees this. PINs are stored hashed. Changing a PIN signs that person out.</p>' +
      '<div class="card"><div class="scroll"><table class="t"><tr><th>Name</th><th>Role</th><th></th></tr>' +
      users.map((u) => '<tr><td>' + esc(u.name) + (u.disabled ? ' <span class="tag collected">off</span>' : '') + '</td><td>' + esc(u.role) + '</td><td><button class="btn sm" data-upin="' + esc(u.id) + '" type="button">New PIN</button> ' + (u.role === 'owner' ? '' : (u.disabled ? '<button class="btn sm" data-uon="' + esc(u.id) + '" type="button">Turn back on</button>' : '<button class="btn sm" data-uoff="' + esc(u.id) + '" data-uname="' + esc(u.name) + '" type="button" style="background:#b3261e;color:#fff">Remove</button>')) + '</td></tr>').join('') +
      '</table></div><h3>Add manager or staff</h3><div class="field"><label>Name</label><input id="nuName" maxlength="40"></div><div class="field"><label>Role</label><select id="nuRole" style="width:auto"><option value="staff">staff</option><option value="manager">manager</option></select></div><div class="field"><label>PIN (8+ characters)</label><input id="nuPin" type="password" autocomplete="new-password"></div><button class="btn" id="nuAdd" type="button">Add user</button></div>';
  }

  function renderCustomers() {
    const P = D.promo || { customers: [] };
    const tags = ((D.settings.promo && D.settings.promo.tags) || []);
    $('view').innerHTML = '<h2>Customers</h2><p class="muted small">The list stays masked. Edit shows the full number to the owner or a manager, and the change is written to Activity.</p>' +
      '<div class="acts"><button class="btn sm" id="cuAdd" type="button">Add customer</button></div>' +
      '<div class="scroll"><table class="t"><tr><th>Name</th><th>WhatsApp</th><th>Groups</th><th>Specials</th><th></th></tr>' +
      (P.customers || []).map((c) => '<tr><td>' + esc(c.name || '–') + '</td><td>' + esc(c.number) + '</td><td class="small">' + esc((c.tags || []).join(', ') || tags.length ? (c.tags || []).join(', ') : '') + '</td><td>' + esc(c.opt) + '</td><td><button class="btn sm" data-cedit="' + esc(c.id) + '" type="button">Edit</button></td></tr>').join('') +
      '</table></div>';
  }

  function renderMenu() {
    const secs = (M.sections || []).map((s) => s.id);
    $('view').innerHTML = '<h2>Menu &amp; Prices</h2><p class="muted small">Saved on the shop PC and written to Activity. The public website keeps its own menu file; the till and the phone bot use this list. Turning an item off hides it from Walk-in and refuses new orders for it.</p>' +
      '<div class="scroll"><table class="t"><tr><th>Item</th><th>Category</th><th class="r">Price</th><th>On</th><th></th></tr>' +
      rows().map((c) => '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.category || '') + '</td><td class="r">' + (c.price == null ? 'TBC' : money(c.price)) + '</td><td>' + (c.available === false ? '<span class="tag collected">off</span>' : '<span class="tag ready">on</span>') + '</td><td><button class="btn sm" data-medit="' + esc(c.id) + '" type="button">Edit</button></td></tr>').join('') +
      '</table></div>';
    $('view').dataset.secs = secs.join(',');
  }

  function renderClosed() {
    const shop = (D.settings && D.settings.shop) || { closedWeekdays: [], closedDates: [] };
    const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    $('view').innerHTML = '<h2>Closed days</h2><p class="muted small">A scheduled promo on a closed day is skipped. Weekly repeats skip that week. A blast already going stops at midnight if the next day is closed.</p><div class="card">' +
      '<div class="chips">' + W.map((n, i) => '<label class="chip' + ((shop.closedWeekdays || []).includes(i) ? ' on' : '') + '"><input type="checkbox" data-cwd="' + i + '"' + ((shop.closedWeekdays || []).includes(i) ? ' checked' : '') + '> ' + n + '</label>').join('') + '</div>' +
      '<ul class="small">' + ((shop.closedDates || []).map((d) => '<li>' + esc(d) + ' <button class="btn sm" data-cdd="' + esc(d) + '" type="button">remove</button></li>').join('') || '<li class="muted">No one-off dates</li>') + '</ul>' +
      '<div class="acts"><input type="date" id="closedAdd"><button class="btn sm" id="closedAddBtn" type="button">Add closed date</button><button class="btn primary" id="closedSave" type="button">Save closed days</button></div></div>';
  }

  let promoBody = '', promoSponsor = false, promoWhen = '', promoPreview = null, promoImageId = '', promoImagePreview = '', promoAud = { mode: 'all', includeUnknown: false };
  function renderPromos() {
    const P = D.promo || { customers: [], promos: [], optedIn: 0, sentToday: 0, dailyCap: 150 };
    const def = (D.settings.promo && D.settings.promo.sponsorDefault) || 'Sponsored by Neuereatec';
    $('view').innerHTML = '<h2>Promos</h2><p class="muted small">Opted in <b>' + (P.optedIn || 0) + '</b> · sent today ' + (P.sentToday || 0) + ' / ' + (P.dailyCap || 150) + '. Stopped, said-no, 592 712 2188 and this line are never included. ' + (P.bridgePromo === false ? '<b>Customer sending waits for the WhatsApp bridge update.</b>' : '') + '</p>' +
      '<div class="card"><div class="field"><label>Message (max 500)</label><textarea id="promoBody" rows="4" maxlength="500">' + esc(promoBody) + '</textarea></div>' +
      '<label class="small"><input type="checkbox" id="promoSponsor"' + (promoSponsor ? ' checked' : '') + '> Add sponsor line</label>' +
      '<div class="field"><label>Sponsor line</label><input id="promoSponsorText" maxlength="80" value="' + esc(def) + '"></div>' +
      '<div class="field"><label>Picture (optional, under 1.5 MB)</label><input type="file" id="promoFile" accept="image/jpeg,image/png,image/webp">' +
      (promoImagePreview ? '<img alt="Promo" src="' + promoImagePreview + '" style="max-width:160px;border-radius:8px">' : '') + '</div>' +
      '<label class="small"><input type="radio" name="pam" value="all" checked> All opted-in</label> ' +
      '<label class="small"><input type="checkbox" id="promoUnknown"' + (promoAud.includeUnknown ? ' checked' : '') + '> Include customers who have not opted in</label>' +
      '<p class="note">WhatsApp can restrict the line if you message people who never agreed. Stopped and said-no stay out. This needs a second confirm and is written to Activity.</p>' +
      '<div class="field"><label>Send later (Guyana time, optional)</label><input id="promoWhen" type="datetime-local" value="' + esc(promoWhen) + '"></div>' +
      '<pre class="promo-preview" id="promoPreview">' + esc(promoPreview ? promoPreview.text : 'Tap Update preview.') + '</pre>' +
      '<p class="small muted">' + (promoPreview ? promoPreview.chars + ' characters · ' + promoPreview.recipients + ' will get it.' : '') + '</p>' +
      '<div class="acts"><button class="btn" id="promoRefresh" type="button">Update preview</button><button class="btn red" id="promoSend" type="button">Send</button></div></div>' +
      '<h3>Recent</h3>' + ((P.promos || []).slice(0, 8).map((p) => '<div class="card"><b>' + esc(p.id) + '</b> <span class="tag">' + esc(p.status) + '</span><p class="small">sent ' + p.sent + ' · failed ' + p.failed + (p.hold ? ' · ' + esc(p.hold) : '') + '</p>' +
        (p.status === 'scheduled' || p.status === 'running' ? '<button class="btn sm" data-pop="pause" data-pid="' + esc(p.id) + '" type="button">Pause</button> ' : '') +
        (p.status === 'paused' ? '<button class="btn sm" data-pop="resume" data-pid="' + esc(p.id) + '" type="button">Resume</button> ' : '') +
        (p.status !== 'done' && p.status !== 'cancelled' ? '<button class="btn sm" data-pop="cancel" data-pid="' + esc(p.id) + '" type="button">Cancel</button>' : '') +
        '</div>').join('') || '<div class="empty card">No promos yet.</div>');
  }

  function renderShop() {
    const s = D.settings || {}, pr = s.printer || {}, rc = s.receipt || {}, promo = s.promo || {}, pos = s.pos || {};
    const drv = window.UTPrinter ? UTPrinter.list() : [{ id: 'none', label: 'No printer yet' }];
    const q = D.printQueue || [];
    $('view').innerHTML = '<h2>Shop settings</h2><div class="note">These are the controls that used to live on the POS Settings tab. Only the owner can save them. Every save is written to Activity.</div>' +
      '<h3>Show Admin on the till</h3><div class="card"><label class="small"><input type="checkbox" id="showAdmin"' + (pos.showAdminButton === false ? '' : ' checked') + '> Show Admin button on POS</label><p class="muted small">On by default. Turn it off and the till has no Admin button. You still open this page from the /pos/admin/ address and sign in here.</p></div>' +
      '<h3>Ready messages</h3><div class="card">' + (s.readyTestMode ? '<div class="note blue">TEST MODE is on (shop PC only). Ready messages go to the own test chat.</div>' : '') +
      '<div class="field"><label>Pickup ({name} {no} {total})</label><textarea id="readyText" rows="3">' + esc(s.readyText || '') + '</textarea></div>' +
      '<div class="field"><label>Delivery</label><textarea id="readyTextDelivery" rows="3">' + esc(s.readyTextDelivery || '') + '</textarea></div>' +
      '<label class="small"><input type="checkbox" id="lowStock"' + (s.lowStockWhatsApp ? ' checked' : '') + '> Low-stock WhatsApp to the shop\'s own chat</label></div>' +
      '<h3>Receipts &amp; printer</h3><div class="card"><p class="muted small">No receipt printer is installed yet. New orders still get a receipt in the print queue, marked ready to print.</p>' +
      '<label class="small"><input type="checkbox" id="autoPrint"' + (pr.autoPrint !== false ? ' checked' : '') + '> Auto-print: queue a receipt for every new order</label>' +
      '<div class="field"><label>Paper size</label><select id="paperWidth" style="width:auto"><option value="80"' + (+pr.paperWidth !== 58 ? ' selected' : '') + '>80 mm</option><option value="58"' + (+pr.paperWidth === 58 ? ' selected' : '') + '>58 mm</option></select></div>' +
      '<div class="field"><label>Printer driver</label><select id="driver" style="width:auto">' + drv.map((d) => '<option value="' + esc(d.id) + '"' + (d.id === (pr.driver || 'none') ? ' selected' : '') + '>' + esc(d.label) + '</option>').join('') + '</select></div>' +
      '<label class="small"><input type="checkbox" id="showPhone"' + (rc.showPhone ? ' checked' : '') + '> Business phone on receipt</label>' +
      '<div class="field"><label>Business phone (receipts only, never the public site)</label><input id="bizPhone" maxlength="20" value="' + esc(rc.phone || '') + '" style="max-width:220px"></div>' +
      '<label class="small"><input type="checkbox" id="printStation"' + (localStorage.getItem('ut_print_station') === '1' ? ' checked' : '') + '> This device is the print station</label>' +
      '<h3>Print queue</h3>' + (q.length ? q.slice(0, 12).map((j) => '<div class="small"><b>' + esc(j.no) + '</b> ' + esc(j.status) + ' · ' + esc(j.width) + ' mm · ' + esc(j.note || '') + '</div>').join('') : '<p class="muted small">Empty.</p>') + '</div>' +
      '<h3>Promo defaults</h3><div class="card"><div class="field"><label>Sponsor line default</label><input id="sponsorDefault" maxlength="80" value="' + esc(promo.sponsorDefault || 'Sponsored by Neuereatec') + '"></div>' +
      '<div class="field"><label>Most promos per day</label><input id="dailyCap" type="number" min="10" max="500" value="' + esc(promo.dailyCap || 150) + '" style="max-width:120px"></div>' +
      '<div class="field"><label>Customer groups (comma separated)</label><input id="tags" value="' + esc((promo.tags || []).join(', ')) + '"></div></div>' +
      '<h3>Ingredients, vendors, recipes</h3><div class="card small"><p>Costs, vendors and recipes are edited here and saved with the button below. ' + (D.ingredients || []).length + ' ingredients, ' + (D.vendors || []).length + ' vendors, ' + Object.keys(D.recipes || {}).length + ' recipes. The costing on Menu &amp; Prices updates a recipe that already exists.</p>' +
      '<div class="scroll" style="max-height:220px"><table class="t"><tr><th>Ingredient</th><th>Unit</th><th class="r">G$ / unit</th></tr>' +
      (D.ingredients || []).slice(0, 40).map((i) => '<tr><td>' + esc(i.name) + '</td><td>' + esc(i.unit) + '</td><td class="r"><input data-ing="' + esc(i.id) + '" type="number" step="0.01" value="' + esc(i.costPerUnit) + '" style="width:90px"></td></tr>').join('') + '</table></div></div>' +
      '<h3>CSV import</h3><div class="card small"><p>Paste the owner sheet. Columns: ingredient, name, unit, cost, supplier, phone, stock, minimum, minimum type. Then recipe, menu item, ingredient, qty. Preview before you apply. <a href="../data/owner-sheet-template.csv" download>CSV template</a>.</p>' +
      '<textarea id="impText" rows="5" placeholder="ingredient,Chicken wings,kg,1400,..."></textarea><div class="acts"><input type="file" id="impFile" accept=".csv,text/csv,text/plain"><button class="btn sm" id="impPrev" type="button">Preview import</button></div><div id="impOut"></div></div>' +
      '<div class="acts"><button class="btn primary" id="shopSave" type="button">Save shop settings</button></div>';
  }

  async function renderActivity() {
    let rowsA = [];
    try { const j = await api('status', { admin: { op: 'audit' } }); rowsA = j.audit || []; }
    catch (e) { $('view').innerHTML = '<div class="note">' + esc(e.message) + '</div>'; return; }
    $('view').innerHTML = '<h2>Activity</h2><p class="muted small">Read-only. Owner only. Who changed what, and when (Guyana time is the shop clock).</p><div class="card small">' +
      (rowsA.map((a) => '<div style="padding:6px 0;border-bottom:1px solid #eee"><b>' + esc(a.action) + '</b> · ' + esc(a.user || '') + ' · ' + esc(a.at ? new Date(a.at).toLocaleString('en-US', { timeZone: 'America/Guyana', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') +
        '<div class="muted">' + esc(JSON.stringify(a.before || null)).slice(0, 180) + ' → ' + esc(JSON.stringify(a.after || null)).slice(0, 180) + '</div></div>').join('') || '<span class="muted">No changes yet.</span>') + '</div>';
  }

  function shopPayload() {
    const costs = {};
    document.querySelectorAll('[data-ing]').forEach((el) => { costs[el.dataset.ing] = el.value; });
    const ingredients = (D.ingredients || []).map((i) => ({ ...i, min: i.min || { kind: 'qty', value: 0 }, costPerUnit: costs[i.id] != null && costs[i.id] !== '' ? Number(costs[i.id]) : i.costPerUnit }));
    return {
      ingredients, vendors: D.vendors || [], recipes: D.recipes || {},
      settings: {
        readyText: $('readyText').value, readyTextDelivery: $('readyTextDelivery').value, lowStockWhatsApp: $('lowStock').checked,
        printer: { autoPrint: $('autoPrint').checked, paperWidth: +$('paperWidth').value, driver: $('driver').value },
        receipt: { showPhone: $('showPhone').checked, phone: $('bizPhone').value },
        promo: { sponsorDefault: $('sponsorDefault').value, dailyCap: +$('dailyCap').value, tags: $('tags').value.split(',').map((x) => x.trim()).filter(Boolean) },
        pos: { showAdminButton: $('showAdmin').checked },
        shop: (D.settings && D.settings.shop) || { closedWeekdays: [], closedDates: [] }
      }
    };
  }

  function parseCSV(t) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) { const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(cur.trim()); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
      else cur += c; }
    if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
    return rows.filter((r) => r.some((x) => x));
  }

  $('view').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.id === 'nuAdd') {
        const j = await api('status', { admin: { op: 'user-add', name: $('nuName').value, role: $('nuRole').value, pin: $('nuPin').value } });
        toast('User added'); return renderStaff();
      }
      if (b.dataset.uoff) {
        if (!confirm('Remove ' + (b.dataset.uname || 'this user') + '? Their PIN stops working right away. Their history stays in the Activity log, and you can turn them back on later.')) return;
        await api('status', { admin: { op: 'user-disable', id: b.dataset.uoff, disabled: true } });
        toast('User removed'); return renderStaff();
      }
      if (b.dataset.uon) {
        await api('status', { admin: { op: 'user-disable', id: b.dataset.uon, disabled: false } });
        toast('User turned back on'); return renderStaff();
      }
      if (b.dataset.upin) {
        const pin = prompt('New PIN (8+ characters). The old PIN stops working.');
        if (!pin) return;
        await api('status', { admin: { op: 'user-pin', id: b.dataset.upin, pin } });
        return toast('PIN changed');
      }
      if (b.id === 'cuAdd') return customerSheet(null);
      if (b.dataset.cedit) return customerSheet(b.dataset.cedit);
      if (b.dataset.medit) return menuSheet(b.dataset.medit);
      if (b.id === 'closedAddBtn') {
        const v = $('closedAdd').value; if (!v) return;
        const shop = D.settings.shop || (D.settings.shop = { closedWeekdays: [], closedDates: [] });
        if (!shop.closedDates.includes(v)) shop.closedDates.push(v);
        return renderClosed();
      }
      if (b.dataset.cdd) {
        D.settings.shop.closedDates = (D.settings.shop.closedDates || []).filter((x) => x !== b.dataset.cdd);
        return renderClosed();
      }
      if (b.id === 'closedSave') {
        const days = [...document.querySelectorAll('[data-cwd]:checked')].map((x) => +x.dataset.cwd);
        const dates = (D.settings.shop && D.settings.shop.closedDates) || [];
        await api('settings', { settings: { shop: { closedWeekdays: days, closedDates: dates } } });
        toast('Closed days saved'); D = await api('sync'); return renderClosed();
      }
      if (b.id === 'shopSave') {
        if ($('printStation')) localStorage.setItem('ut_print_station', $('printStation').checked ? '1' : '0');
        await api('settings', shopPayload());
        toast('Shop settings saved'); D = await api('sync'); return renderShop();
      }
      if (b.id === 'impPrev') return previewImport();
      if (b.id === 'impApply') return applyImport();
      if (b.id === 'promoRefresh') return previewPromo();
      if (b.id === 'promoSend') return sendPromo();
      if (b.dataset.pop) { await api('status', { promo: { op: b.dataset.pop, id: b.dataset.pid } }); toast(b.dataset.pop); D = await api('sync'); return renderPromos(); }
    } catch (err) { toast(err.message); }
  });
  $('view').addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'promoBody') promoBody = t.value;
    if (t.id === 'promoSponsor') promoSponsor = t.checked;
    if (t.id === 'promoWhen') promoWhen = t.value;
    if (t.id === 'promoUnknown') promoAud.includeUnknown = t.checked;
    if (t.dataset.cwd != null && D.settings) {
      const shop = D.settings.shop || (D.settings.shop = { closedWeekdays: [], closedDates: [] });
      const set = new Set(shop.closedWeekdays || []);
      if (t.checked) set.add(+t.dataset.cwd); else set.delete(+t.dataset.cwd);
      shop.closedWeekdays = [...set];
    }
    if (t.id === 'impFile' && t.files[0]) {
      if (t.files[0].size > 200000) return toast('File too big');
      $('impText').value = await t.files[0].text(); toast('File loaded. Tap Preview.');
    }
    if (t.id === 'promoFile' && t.files[0]) {
      try { await uploadImage(t.files[0]); } catch (err) { toast(err.message); }
    }
  });
  $('view').addEventListener('input', (e) => { if (e.target.id === 'promoBody') promoBody = e.target.value; });

  async function customerSheet(id) {
    let c = { name: '', phone: '', tags: [] };
    if (id) { const j = await api('status', { admin: { op: 'customer', id } }); c = j.customer; }
    const tags = ((D.settings.promo && D.settings.promo.tags) || []).map((t) => '<label class="small"><input type="checkbox" data-ctag="' + esc(t) + '"' + ((c.tags || []).includes(t) ? ' checked' : '') + '> ' + esc(t) + '</label>').join(' ');
    openSheet('<h3>' + (id ? 'Edit customer' : 'Add customer') + '</h3><div class="field"><label>Name</label><input id="cuName" value="' + esc(c.name || '') + '"></div><div class="field"><label>WhatsApp number</label><input id="cuPhone" value="' + esc(c.phone || '') + '" inputmode="tel"></div><div class="field"><label>Groups</label><div>' + tags + '</div></div><div class="acts"><button class="btn" data-close type="button">Cancel</button>' + (id ? '<button class="btn" id="cuDel" type="button">Remove</button>' : '') + '<button class="btn primary" id="cuSave" type="button">Save</button></div>');
    $('cuSave').onclick = async () => {
      const tagsOn = [...document.querySelectorAll('[data-ctag]:checked')].map((x) => x.dataset.ctag);
      const body = { name: $('cuName').value, phone: $('cuPhone').value, tags: tagsOn };
      try {
        await api('status', { admin: id ? { op: 'customer-edit', id, ...body } : { op: 'customer-add', ...body } });
        closeSheet(); toast('Customer saved'); D = await api('sync'); renderCustomers();
      } catch (err) { toast(err.message); }
    };
    if ($('cuDel')) $('cuDel').onclick = async () => {
      if (!confirm('Remove this customer from the list? Past orders stay.')) return;
      await api('status', { admin: { op: 'customer-remove', id } }); closeSheet(); D = await api('sync'); renderCustomers();
    };
  }

  function menuSheet(id) {
    const c = rows().find((x) => x.id === id); if (!c) return;
    const secs = M.sections || [];
    const rec = (D.recipes || {})[id];
    const ingName = (i) => { const x = (D.ingredients || []).find((g) => g.id === i); return x ? x.name : i; };
    const recipe = rec && rec.rules ? '<h3>Costing / recipe</h3>' + rec.rules.map((r, k) => '<div class="field"><label>' + esc(ingName(r.ing)) + (r.match ? ' if ' + esc(r.match) : '') + '</label><input data-rq="' + k + '" type="number" step="0.001" value="' + esc(r.qty) + '"></div>').join('') : '';
    openSheet('<h3>Edit ' + esc(c.name) + '</h3><div class="field"><label>Name</label><input id="mName" maxlength="80" value="' + esc(c.name) + '"></div><div class="field"><label>Price (G$, blank = to confirm)</label><input id="mPrice" inputmode="numeric" value="' + (c.price == null ? '' : esc(c.price)) + '"></div><div class="field"><label>Category</label><select id="mCat">' + secs.map((s) => '<option value="' + esc(s.id) + '"' + (s.id === c.category ? ' selected' : '') + '>' + esc(s.title || s.name || s.id) + '</option>').join('') + '</select></div><label class="small"><input type="checkbox" id="mOn"' + (c.available === false ? '' : ' checked') + '> Available</label>' + recipe + '<div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="mSave" type="button">Save</button></div>');
    $('mSave').onclick = async () => {
      const recipeRules = rec && rec.rules ? rec.rules.map((r, k) => ({ ...r, qty: Number($('sheetPanel').querySelector('[data-rq="' + k + '"]').value) })) : undefined;
      try {
        await api('status', { admin: { op: 'menu', id, name: $('mName').value, price: $('mPrice').value, category: $('mCat').value, available: $('mOn').checked, recipe: recipeRules } });
        closeSheet(); toast('Menu saved'); D = await api('sync'); renderMenu();
      } catch (err) { toast(err.message); }
    };
  }

  async function previewPromo() {
    promoBody = $('promoBody').value; promoSponsor = $('promoSponsor').checked; promoWhen = $('promoWhen').value;
    promoPreview = await api('status', { promo: { op: 'preview', body: promoBody, sponsor: promoSponsor, sponsorText: $('promoSponsorText').value, image: !!promoImageId, imageId: promoImageId, audience: { mode: 'all', includeUnknown: $('promoUnknown').checked }, sendLocal: promoWhen } });
    renderPromos();
  }
  async function sendPromo() {
    await previewPromo();
    const n = promoPreview.recipients;
    const unk = $('promoUnknown').checked;
    if (!confirm('Send to ' + n + ' customer(s)?' + (promoWhen ? ' Scheduled.' : ''))) return;
    if (unk && !confirm('Second confirm: include people who have not opted in? Stopped and said-no stay out. This is logged.')) return;
    await api('status', { promo: { op: 'send', body: promoBody, sponsor: promoSponsor, sponsorText: $('promoSponsorText').value, imageId: promoImageId, audience: { mode: 'all', includeUnknown: unk }, sendLocal: promoWhen, confirm: true, confirmUnknown: unk, confirmClosed: false } });
    toast(promoWhen ? 'Scheduled' : 'Sending'); D = await api('sync'); renderPromos();
  }
  async function uploadImage(file) {
    if (file.size > 1.5 * 1024 * 1024) throw new Error('Image is over 1.5 MB.');
    const buf = new Uint8Array(await file.arrayBuffer());
    const start = await api('status', { image: { op: 'start' } });
    for (let i = 0; i < buf.length; i += 24000) {
      let bin = ''; const slice = buf.subarray(i, i + 24000);
      for (let k = 0; k < slice.length; k++) bin += String.fromCharCode(slice[k]);
      await api('status', { image: { op: 'chunk', id: start.id, data: btoa(bin) } });
    }
    const fin = await api('status', { image: { op: 'finish', id: start.id } });
    promoImageId = fin.imageId; promoImagePreview = fin.preview; toast('Picture saved'); renderPromos();
  }

  let IMP = null;
  function previewImport() {
    const text = $('impText').value || '';
    const res = { ings: [], err: [] };
    parseCSV(text).forEach((r, n) => {
      const t = (r[0] || '').toLowerCase();
      if (!t || t === 'type' || t.startsWith('#')) return;
      if (t !== 'ingredient') { res.err.push('Line ' + (n + 1) + ' skipped in this preview (recipe rows apply with the full sheet on the shop PC save).'); return; }
      if (!r[1]) return res.err.push('Line ' + (n + 1) + ': name missing');
      res.ings.push(r[1] + (r[3] ? ' · G$' + r[3] : ''));
    });
    IMP = text;
    $('impOut').innerHTML = '<div class="note">' + res.ings.length + ' ingredient row(s).' + (res.ings.length ? '<br>' + res.ings.map(esc).join('<br>') : '') + '</div>' +
      (res.err.length ? '<div class="note">' + res.err.map(esc).join('<br>') + '</div>' : '') +
      (res.ings.length ? '<button class="btn red" id="impApply" type="button">Apply ingredient costs</button>' : '');
  }
  async function applyImport() {
    const byName = {};
    (D.ingredients || []).forEach((i) => { byName[i.name.toLowerCase()] = i; });
    parseCSV(IMP || '').forEach((r) => {
      if ((r[0] || '').toLowerCase() !== 'ingredient' || !r[1]) return;
      const i = byName[r[1].trim().toLowerCase()]; if (!i) return;
      const n = Number(String(r[3] || '').replace(/[^\d.]/g, ''));
      if (Number.isFinite(n) && n >= 0) { i.costPerUnit = n; i.costLabel = 'real'; }
    });
    await api('settings', shopPayload());
    toast('Import saved'); D = await api('sync'); renderShop();
  }

  if (token) boot().catch((e) => showLogin(e.message));
  else showLogin('');
})();
