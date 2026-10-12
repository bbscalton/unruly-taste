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
  let D = null, tab = 'customers', toastT, cOpen = false;

  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3200); }
  function openSheet(html) { $('sheetPanel').innerHTML = html; $('sheet').classList.remove('hidden');
    ['pCat', 'rpCat', 'mCat'].forEach((id) => { const el = $(id); if (el && !el.querySelector('[value="__new"]')) el.insertAdjacentHTML('beforeend', '<option value="__new">+ New category…</option>'); });
  }
  // Categories (12 Oct 2026): live list from the bot (base menu sections + owner-added), deleted ones left out
  function useCats() { if (D && Array.isArray(D.categories) && D.categories.length) M.sections = D.categories.filter((c) => !c.deleted).map((c) => ({ id: c.id, title: c.title })); }
  document.addEventListener('change', async (e) => {
    const el = e.target; if (!el.matches || !el.matches('#pCat,#rpCat,#mCat') || el.value !== '__new') return;
    const name = (prompt('New category name (for example: Local Drinks)') || '').trim();
    if (!name) { el.selectedIndex = 0; return; }
    try { const j = await api('status', { admin: { op: 'cat-add', title: name } }); D = await api('sync'); useCats();
      el.querySelector('[value="__new"]').insertAdjacentHTML('beforebegin', '<option value="' + esc(j.id) + '">' + esc(j.title) + '</option>'); el.value = j.id; toast('Category added'); }
    catch (err) { toast(err.message); el.selectedIndex = 0; }
  });
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
    ['recipes', 'Products & Recipes', 'owner'],
    ['closed', 'Closed days', 'owner'],
    ['promos', 'Promos', 'mgr'],
    ['shop', 'Shop settings', 'owner'],
    ['browser', 'Browser access', 'owner'],
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
    D = await api('sync'); useCats();
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
    useCats(); drawTabs();
    if (tab === 'staff') return renderStaff();
    if (tab === 'customers') return renderCustomers();
    if (tab === 'menu') return renderMenu();
    if (tab === 'recipes') return renderRecipes();
    if (tab === 'closed') return renderClosed();
    if (tab === 'promos') return renderPromos();
    if (tab === 'shop') return renderShop();
    if (tab === 'browser') return renderBrowser();
    if (tab === 'activity') return renderActivity();
  }

  // Browser access (owner): a SEPARATE password lets a browser use the POS; the Unruly POS app never needs it.
  async function renderBrowser() {
    let j;
    try { j = await api('browser', { op: 'status' }); } catch (e) { view.innerHTML = '<div class="note">' + esc(e.message) + '</div>'; return; }
    const dev = j.devices || [];
    view.innerHTML = '<h2>Browser access</h2><div class="note">The Unruly POS app is the POS. A normal browser can only use it with this separate browser-access password (not a PIN). Mode now: <b>' + (j.enforce ? 'ENFORCED (browsers without a pass are refused)' : 'log-only (nothing is refused yet)') + '</b>. The switch is set on the shop PC, not here.</div>' +
      '<div class="card"><p>Browser-access password: <b>' + (j.passwordSet ? 'set ' + esc(String(j.passwordSetAt).slice(0, 10)) : 'not set (browsers cannot get in)') + '</b></p>' +
      '<button class="btn primary" id="baNew" type="button">' + (j.passwordSet ? 'Rotate password' : 'Create password') + '</button> <label class="small"><input type="checkbox" id="baRev" checked> sign out all browsers when rotating</label><div id="baShow"></div></div>' +
      '<h3>Browsers allowed</h3><div class="card"><div class="scroll"><table class="t"><tr><th>Browser</th><th>Added</th><th>Last seen</th><th></th></tr>' +
      (dev.length ? dev.map((d) => '<tr><td>' + esc(d.label) + (d.revoked ? ' <span class="tag collected">revoked</span>' : '') + '</td><td>' + esc(String(d.created).slice(0, 16).replace('T', ' ')) + '</td><td>' + esc(String(d.lastSeen || '-').slice(0, 16).replace('T', ' ')) + '</td><td>' + (d.revoked ? '' : '<button class="btn sm" data-barev="' + esc(d.id) + '" type="button">Revoke</button>') + '</td></tr>').join('') : '<tr><td colspan="4" class="muted">None yet.</td></tr>') +
      '</table></div></div><h3>Clients seen (log)</h3><div class="card small">' + ((j.seen || []).map((s) => esc(s.client) + ': ' + s.count + ' (last ' + esc(String(s.last).slice(0, 16).replace('T', ' ')) + ')').join('<br>') || 'nothing yet') + '</div>';
    baNew.onclick = async () => {
      try { const r = await api('browser', { op: 'set-password', revokeDevices: baRev.checked }); baShow.innerHTML = '<div class="note">New browser-access password (shown once, write it down): <b style="font-size:1.3rem;letter-spacing:.05em">' + esc(r.password) + '</b></div>'; }
      catch (e) { toast(e.message); }
    };
    document.querySelectorAll('[data-barev]').forEach((b) => { b.onclick = async () => { try { await api('browser', { op: 'revoke', id: b.dataset.barev }); toast('Revoked.'); renderBrowser(); } catch (e) { toast(e.message); } }; });
  }

  async function renderStaff() {
    let users = [];
    try { const j = await api('status', { admin: { op: 'users' } }); users = j.users || []; }
    catch (e) { $('view').innerHTML = '<div class="note">' + esc(e.message) + '</div>'; return; }
    $('view').innerHTML = '<h2>Staff &amp; PINs</h2><p class="muted small">Only the owner sees this. PINs are stored hashed. Changing a PIN signs that person out.</p>' +
      '<div class="card"><div class="scroll"><table class="t"><tr><th>Name</th><th>Role</th><th></th></tr>' +
      users.map((u) => '<tr><td>' + esc(u.name) + (u.disabled ? ' <span class="tag collected">off</span>' : '') + '</td><td>' + esc(u.role) + '</td><td><button class="btn sm" data-upin="' + esc(u.id) + '" type="button">New PIN</button> ' + (u.role === 'owner' ? '' : (u.disabled ? '<button class="btn sm" data-uon="' + esc(u.id) + '" type="button">Turn back on</button>' : '<button class="btn sm" data-uoff="' + esc(u.id) + '" data-uname="' + esc(u.name) + '" type="button" style="background:#b3261e;color:#fff">Remove</button>')) + '</td></tr>').join('') +
      '</table></div><h3>Add manager, staff or kitchen</h3><div class="field"><label>Name</label><input id="nuName" maxlength="40"></div><div class="field"><label>Role</label><select id="nuRole" style="width:auto"><option value="staff">staff (cashier)</option><option value="manager">manager</option><option value="kitchen">kitchen (orders screen only)</option></select></div><div class="field"><label>PIN (8+ characters)</label><input id="nuPin" type="password" autocomplete="new-password"></div><button class="btn" id="nuAdd" type="button">Add user</button></div>';
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
      rows().filter((c) => !c.deleted).map((c) => '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.category || '') + '</td><td class="r">' + (c.price == null ? 'TBC' : money(c.price)) + '</td><td>' + onSwitch(c) + '</td><td><button class="btn sm" data-medit="' + esc(c.id) + '" type="button">Edit</button></td></tr>').join('') +
      '</table></div>';
    $('view').dataset.secs = secs.join(',');
  }

  // ---------- Ingredients & Recipes (12 Oct 2026): add / delete (soft, with undo) / create recipe ----------
  const ingName = (i) => { const x = (D.ingredients || []).find((g) => g.id === i); return x ? x.name + ' (' + x.unit + ')' : i; };
  let rOpen = '', rQ = '', rCat = '', rOn = '', iQ = '', iOpen = false, rDraft = null;
  function renderRecipes() {
    const ings = D.ingredients || [], recs = D.recipes || {}, secs = M.sections || [];
    const prod = rows().filter((c) => !c.deleted && (!rOn || (rOn === 'off') === (c.available === false)) && (!rCat || (c.category || '') === rCat) && (!rQ || c.name.toLowerCase().includes(rQ.toLowerCase())));
    const tag = (c) => { const r = recs[c.id]; if (!r) return '<span class="tag">no stock link</span>'; const ready = (r.rules || []).length === 1 && /^r-/.test(r.rules[0].ing); return ready ? '<span class="tag ex">ready-made</span>' : '<span class="tag est">recipe</span>'; };
    let h = '<div class="acts" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Products &amp; Recipes</h2><button class="btn primary" id="rpNew" type="button">+ Create product</button></div>' +
      '<div class="acts" style="flex-wrap:wrap;gap:6px"><input id="rSearch" type="search" placeholder="Search products" value="' + esc(rQ) + '" style="flex:1;min-width:150px"><select id="rOn"><option value="">On + off</option><option value="on"' + (rOn === 'on' ? ' selected' : '') + '>On only</option><option value="off"' + (rOn === 'off' ? ' selected' : '') + '>Off only</option></select><select id="rCat"><option value="">All categories</option>' + secs.map((x) => '<option value="' + esc(x.id) + '"' + (rCat === x.id ? ' selected' : '') + '>' + esc(x.title || x.name || x.id) + '</option>').join('') + '</select></div>';
    h += '<div class="rlist">' + prod.map((c) => {
      const open = rOpen === c.id, r = recs[c.id];
      let row = '<div class="card" style="padding:8px 10px;margin:6px 0"><button type="button" data-ropen="' + esc(c.id) + '" style="all:unset;cursor:pointer;display:flex;gap:8px;align-items:center;width:100%;flex-wrap:wrap">' + ((u) => u ? '<img src="' + esc(u) + '" alt="" loading="lazy" style="width:40px;height:40px;object-fit:cover;border-radius:8px">' : '<span style="width:40px;height:40px;border-radius:8px;background:#eee;display:inline-flex;align-items:center;justify-content:center">📷</span>')(c.noImg ? '' : imgUrl(c) || imgUrl((M.items || []).find((i) => i.id === c.id))) + '<b style="flex:1;min-width:110px">' + (open ? '▾ ' : '▸ ') + esc(c.name) + '</b><span>' + (c.price == null ? 'TBC' : money(c.price)) + '</span>' + tag(c) + '</button>' + onSwitch(c);
      if (open) {
        const rules = rDraft || (r ? r.rules.map((x) => ({ ...x })) : []);
        rDraft = rules;
        row += '<div style="margin-top:8px">' + (rules.length ? '' : '<p class="muted small">No recipe: selling it takes nothing off stock. Add ingredients below to link it.</p>') +
          rules.map((x, k) => '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0" data-rr="' + k + '"><select data-ring style="flex:2;min-width:140px"><option value="">Choose ingredient…</option>' + ings.map((i) => '<option value="' + esc(i.id) + '"' + (x.ing === i.id ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.unit) + ')</option>').join('') + '</select><input data-rqty inputmode="decimal" placeholder="qty" value="' + (x.qty == null ? '' : esc(x.qty)) + '" style="width:6em">' + (x.match ? '<span class="muted small">if ' + esc(x.match) + '</span>' : '') + '<button class="btn sm" data-rrm="' + k + '" type="button" aria-label="Remove">✕</button></div>').join('') +
          '<div class="acts" style="flex-wrap:wrap"><button class="btn sm" id="rAddIng" type="button">+ Ingredient</button><button class="btn sm primary" id="rSaveInline" type="button">Save recipe</button></div>' +
          '<div class="acts" style="flex-wrap:wrap"><button class="btn sm" data-medit="' + esc(c.id) + '" type="button">Edit product</button>' + (r ? '<button class="btn sm" data-rprod="' + esc(c.id) + '" type="button">Make product from this recipe</button><button class="btn sm" data-rdel="' + esc(c.id) + '" data-rname="' + esc(c.name) + '" type="button">Delete recipe</button>' : '') + '<button class="btn sm" data-pdel="' + esc(c.id) + '" data-pname="' + esc(c.name) + '" type="button">Delete product</button></div></div>';
      }
      return row + '</div>';
    }).join('') + (prod.length ? '' : '<p class="muted">No products match.</p>') + '</div>';
    if ((D.deletedRecipes || []).length) h += '<p class="small"><b>Deleted recipes:</b> ' + D.deletedRecipes.map((r) => esc((rows().find((c) => c.id === r.id) || { name: r.id }).name) + ' <button class="btn sm" data-rres="' + esc(r.id) + '" type="button">Undo</button>').join(' · ') + '</p>';
    if (rows().some((c) => c.deleted)) h += '<p class="small"><b>Deleted products:</b> ' + rows().filter((c) => c.deleted).map((c) => esc(c.name) + ' <button class="btn sm" data-pres="' + esc(c.id) + '" type="button">Undo</button>').join(' · ') + '</p>';
    const il = ings.filter((i) => !iQ || i.name.toLowerCase().includes(iQ.toLowerCase()));
    h += '<details id="ingBox"' + (iOpen ? ' open' : '') + ' style="margin-top:14px"><summary><b>Ingredients / stock items (' + ings.length + ')</b></summary>' +
      '<div class="acts" style="flex-wrap:wrap;gap:6px"><input id="iSearch" type="search" placeholder="Search ingredients" value="' + esc(iQ) + '" style="flex:1;min-width:150px"><button class="btn primary" id="iAdd" type="button">+ Add ingredient</button></div>' +
      il.map((i) => { const used = Object.entries(recs).filter(([, r]) => (r.rules || []).some((x) => x.ing === i.id)).length;
        return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid #eee"><span style="flex:1;min-width:140px">' + esc(i.name) + '</span><span class="small">' + esc(i.stock) + ' ' + esc(i.unit) + '</span><span class="small muted">' + used + ' recipe(s)</span><button class="btn sm" data-iedit="' + esc(i.id) + '" type="button">Edit</button><button class="btn sm" data-idel="' + esc(i.id) + '" data-iname="' + esc(i.name) + '" data-iused="' + used + '" type="button">Delete</button></div>'; }).join('') +
      ((D.deletedIngredients || []).length ? '<p class="small"><b>Deleted:</b> ' + D.deletedIngredients.map((i) => esc(i.name) + ' <button class="btn sm" data-ires="' + esc(i.id) + '" type="button">Undo</button>').join(' · ') + '</p>' : '') + '</details>';
    const cl = (D.categories || []);
    h += '<details id="catBox"' + (cOpen ? ' open' : '') + ' style="margin-top:10px"><summary><b>Categories (' + cl.filter((c) => !c.deleted).length + ')</b></summary>' +
      '<p class="muted small">Categories with no products switched on are hidden on the website. Delete works only when no product uses the category.</p>' +
      '<div class="acts"><button class="btn primary" id="cAdd" type="button">+ Add category</button></div>' +
      cl.filter((c) => !c.deleted).map((c) => '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid #eee"><span style="flex:1;min-width:140px">' + esc(c.title) + '</span><span class="small muted">' + (c.count || 0) + ' product(s)</span><button class="btn sm" data-cren="' + esc(c.id) + '" type="button">Rename</button><button class="btn sm" data-cdel="' + esc(c.id) + '" data-ccount="' + (c.count || 0) + '" type="button">Delete</button></div>').join('') +
      (cl.some((c) => c.deleted) ? '<p class="small"><b>Deleted:</b> ' + cl.filter((c) => c.deleted).map((c) => esc(c.title) + ' <button class="btn sm" data-cres="' + esc(c.id) + '" type="button">Undo</button>').join(' · ') + '</p>' : '') + '</details>';
    $('view').innerHTML = h;
  }
  const readDraft = () => [...document.querySelectorAll('[data-rr]')].map((el) => ({ ...(rDraft[+el.dataset.rr] || {}), ing: el.querySelector('[data-ring]').value, qty: el.querySelector('[data-rqty]').value }));
  $('view').addEventListener('input', (e) => {
    if (tab !== 'recipes') return;
    const t = e.target, pos = t.selectionStart;
    if (t.id === 'rSearch') { rQ = t.value; rOpen = ''; rDraft = null; renderRecipes(); const n = $('rSearch'); n.focus(); n.setSelectionRange(pos, pos); }
    if (t.id === 'iSearch') { iQ = t.value; iOpen = true; renderRecipes(); const n = $('iSearch'); n.focus(); n.setSelectionRange(pos, pos); }
  });
  $('view').addEventListener('change', (e) => { if (tab === 'recipes' && e.target.id === 'rCat') { rCat = e.target.value; rOpen = ''; rDraft = null; renderRecipes(); } if (tab === 'recipes' && e.target.id === 'rOn') { rOn = e.target.value; rOpen = ''; renderRecipes(); } });
  $('view').addEventListener('toggle', (e) => { if (e.target.id === 'ingBox') iOpen = e.target.open; }, true);
  $('view').addEventListener('click', async (e) => {
    if (tab !== 'recipes') return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ptog) return toggleOn(b.dataset.ptog, b.dataset.pon !== '1', () => (tab === 'recipes' ? renderRecipes() : renderMenu()));
    if (b.dataset.ropen) { rOpen = rOpen === b.dataset.ropen ? '' : b.dataset.ropen; rDraft = null; return renderRecipes(); }
    if (b.id === 'rAddIng') { rDraft = readDraft(); rDraft.push({ ing: '', qty: null }); return renderRecipes(); }
    if (b.dataset.rrm != null) { rDraft = readDraft(); rDraft.splice(+b.dataset.rrm, 1); return renderRecipes(); }
    if (b.id === 'rSaveInline') {
      const rules = readDraft().filter((r) => r.ing).map((r) => ({ ing: r.ing, qty: Number(r.qty), match: r.match || '' }));
      if (!rules.length) return toast('Add an ingredient with a quantity (or use Delete recipe).');
      const j = await adminOp({ op: 'recipe-save', id: rOpen, rules }, 'Recipe saved', () => { rDraft = null; renderRecipes(); });
      return j;
    }
  });
  async function adminOp(admin, okMsg, reRender) {
    try { const j = await api('status', { admin }); toast(okMsg); D = await api('sync'); useCats(); reRender(); return j; } catch (err) { toast(err.message); return null; }
  }
  function ingEditSheet(id) {
    const i = (D.ingredients || []).find((x) => x.id === id); if (!i) return;
    const used = Object.values(D.recipes || {}).filter((r) => (r.rules || []).some((x) => x.ing === id)).length;
    openSheet('<h3>Edit ' + esc(i.name) + '</h3><p class="muted small">Recipes stay linked when you rename. Leave cost or stock blank to keep them as they are. Every change goes to Activity.</p>' +
      '<div class="field"><label>Name</label><input id="ieName" maxlength="60" value="' + esc(i.name) + '"></div>' +
      '<div class="field"><label>Unit</label><input id="ieUnit" maxlength="12" value="' + esc(i.unit) + '">' + (used ? '<div class="small neg">Used by ' + used + ' recipe(s): if you change the unit, check their quantities.</div>' : '') + '</div>' +
      '<div class="field"><label>Supplier</label><select id="ieVendor"><option value="">(none)</option>' + (D.vendors || []).map((v) => '<option value="' + esc(v.id) + '"' + (v.id === i.vendorId ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Cost per unit (G$), now ' + esc(i.costPerUnit) + '</label><input id="ieCost" inputmode="decimal" placeholder="keep"></div>' +
      '<div class="field"><label>Stock count, now ' + esc(i.stock) + ' ' + esc(i.unit) + '</label><input id="ieStock" inputmode="decimal" placeholder="keep"></div>' +
      '<div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="ieSave" type="button">Save</button></div>');
    $('ieSave').onclick = async () => {
      if (used && $('ieUnit').value.trim() !== i.unit && !confirm('This ingredient is used by ' + used + ' recipe(s). Changing the unit does not change their quantities. Continue?')) return;
      const j = await adminOp({ op: 'ing-edit', id, name: $('ieName').value, unit: $('ieUnit').value, vendorId: $('ieVendor').value, costPerUnit: $('ieCost').value, stock: $('ieStock').value }, 'Ingredient saved', () => { iOpen = true; renderRecipes(); });
      if (j) { closeSheet(); if (j.warn) setTimeout(() => toast(j.warn), 3300); }
    };
  }
  function ingSheet() {
    openSheet('<h3>Add ingredient</h3><p class="muted small">Leave numbers blank if you don\'t know them yet.</p><div class="field"><label>Name *</label><input id="iName" maxlength="60"></div><div class="field"><label>Unit (kg, L, each…)</label><input id="iUnit" maxlength="12"></div><div class="field"><label>Stock now</label><input id="iStock" inputmode="decimal"></div><div class="field"><label>Cost per unit (G$)</label><input id="iCost" inputmode="decimal"></div><div class="field"><label>Low-stock minimum</label><input id="iMin" inputmode="decimal"></div><div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="iSave" type="button">Add</button></div>');
    $('iSave').onclick = async () => { const j = await adminOp({ op: 'ing-add', name: $('iName').value, unit: $('iUnit').value, stock: $('iStock').value, costPerUnit: $('iCost').value, min: $('iMin').value }, 'Ingredient added', renderRecipes); if (j) closeSheet(); };
  }
  function productSheet() {
    const secs = M.sections || [];
    const st = {}; openSheet('<h3>Add product</h3><p class="muted small">Shows on the till (Walk-in), the phone bot and the website. Leave the price blank if it is not set yet. New products start OFF until you switch them on.</p><div class="field"><label>Name *</label><input id="pName" maxlength="80"></div>' + photoField(st) + '<div class="field"><label>Price (G$)</label><input id="pPrice" inputmode="numeric"></div><div class="field"><label>Category</label><select id="pCat">' + secs.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.title || x.name || x.id) + '</option>').join('') + '</select></div><label class="small"><input type="checkbox" id="pOn"> Available now</label><div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="pSave" type="button">Add</button></div>');
    wirePhoto(st);
    $('pSave').onclick = async () => { const j = await adminOp({ op: 'product-add', name: $('pName').value, price: $('pPrice').value, category: $('pCat').value, available: $('pOn').checked, imageId: st.imageId || '' }, 'Product added', renderMenu); if (j) closeSheet(); };
  }
  function recipeSheet(id) {
    const c = rows().find((x) => x.id === id); if (!c) return;
    const cur = ((D.recipes || {})[id] || { rules: [] }).rules.slice();
    const ings = D.ingredients || [];
    const row = (r, k) => '<div class="field" data-rrow="' + k + '"><select data-ring>' + '<option value="">Choose ingredient…</option>' + ings.map((i) => '<option value="' + esc(i.id) + '"' + (r.ing === i.id ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.unit) + ')</option>').join('') + '</select> <input data-rqty inputmode="decimal" placeholder="qty per serving" value="' + (r.qty == null ? '' : esc(r.qty)) + '" style="width:9em"> <input data-rmatch placeholder="only if choice contains (optional)" value="' + esc(r.match || '') + '" style="width:12em"> <button class="btn sm" data-rrm type="button">✕</button></div>';
    const draw = () => {
      openSheet('<h3>' + (cur.length ? 'Edit' : 'Create') + ' recipe: ' + esc(c.name) + '</h3><p class="muted small">Quantity is per one item sold, in the ingredient\'s unit. Selling this product takes these amounts off stock.</p><div id="rRows">' + cur.map(row).join('') + '</div><button class="btn sm" id="rAddRow" type="button">+ Ingredient</button><div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="rSave" type="button">Save recipe</button></div>');
      const read = () => [...document.querySelectorAll('[data-rrow]')].map((el) => ({ ing: el.querySelector('[data-ring]').value, qty: el.querySelector('[data-rqty]').value, match: el.querySelector('[data-rmatch]').value }));
      $('rAddRow').onclick = () => { cur.splice(0, cur.length, ...read(), { ing: '', qty: null }); draw(); };
      $('rRows').onclick = (e) => { const b = e.target.closest('[data-rrm]'); if (!b) return; const all = read(); all.splice(+b.parentElement.dataset.rrow, 1); cur.splice(0, cur.length, ...all); draw(); };
      $('rSave').onclick = async () => { const rules = read().filter((r) => r.ing).map((r) => ({ ing: r.ing, qty: Number(r.qty), match: r.match })); const j = await adminOp({ op: 'recipe-save', id, rules }, 'Recipe saved', renderRecipes); if (j) closeSheet(); };
    };
    if (!cur.length) cur.push({ ing: '', qty: null });
    draw();
  }
  // "Create recipe + product" / "Make product from this recipe": one form, product is created linked to the recipe, switched OFF.
  // Product photo control (12 Oct 2026): big Add photo button (phone: camera or gallery), or paste a picture link; preview at once.
  const imgUrl = (c) => !c || !c.img || c.noImg ? '' : (/^https:\/\//.test(c.img) ? c.img : /^m[a-z0-9]{4,20}$/.test(c.img) ? 'https://unruly.neuereatec.org/menu-img/' + c.img + '.jpg' : '../../images/' + c.img);
  // On/off switch (12 Oct 2026): green "On, showing" / grey "Off, hidden". Off hides it from the website and the till; nothing is deleted.
  const onSwitch = (c, big) => '<button type="button" data-ptog="' + esc(c.id) + '" data-pon="' + (c.available === false ? '0' : '1') + '" aria-pressed="' + (c.available !== false) + '" style="border:0;border-radius:999px;padding:' + (big ? '10px 16px' : '6px 12px') + ';margin-top:6px;font-weight:700;cursor:pointer;color:#fff;background:' + (c.available === false ? '#8a8a8a' : '#1d8a3a') + '">' + (c.available === false ? '○ Off, hidden' : '● On, showing') + '</button>';
  async function toggleOn(id, on, after) {
    try { await api('status', { admin: { op: 'menu', id, available: on } }); D = await api('sync'); useCats(); toast(on ? 'On: showing on the website and the till' : 'Off: hidden from the website and the till (not deleted)'); after(); }
    catch (err) { toast(err.message); }
  }
  function photoField(st) {
    return '<div class="field" style="border:2px dashed #e0b400;border-radius:12px;padding:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<label for="phFile" style="cursor:pointer;display:block"><img id="phPrev" alt="Product photo" src="' + esc(st.preview || '') + '" style="width:96px;height:96px;object-fit:cover;border-radius:10px;background:#eee;' + (st.preview ? '' : 'display:none') + '">' +
      '<span id="phEmpty" style="width:96px;height:96px;border-radius:10px;background:#f3f3f3;' + (st.preview ? 'display:none' : 'display:flex') + ';flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:.8em">📷<br>Tap to add a photo</span></label>' +
      '<div style="flex:1;min-width:180px"><label class="btn primary" for="phFile" style="display:block;text-align:center;font-size:1.1em;padding:12px">📷 ' + (st.preview ? 'Replace photo' : 'Add photo') + '</label>' +
      '<input id="phFile" type="file" accept="image/*" style="display:none">' +
      '<div style="display:flex;gap:6px;margin-top:6px"><input id="phUrl" type="url" placeholder="or paste image URL (https://…)" style="flex:1;min-width:0"><button class="btn sm" id="phUrlGo" type="button">Use link</button></div>' +
      '<div class="small muted" id="phMsg">' + (st.preview ? 'Photo ready. It shows on the website after you save.' : 'Optional. Camera or gallery on a phone.') + '</div>' +
      (st.preview ? '<button class="btn sm" id="phDel" type="button" style="margin-top:4px">Remove photo</button>' : '') + '</div></div>';
  }
  function shrinkPhoto(file) {   // phone photos are often 3-8 MB: shrink to 1280 px JPEG before upload
    return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob((b) => b ? res(b) : rej(new Error('Could not read that photo.')), 'image/jpeg', 0.85); };
      im.onerror = () => { URL.revokeObjectURL(u); file.size <= 1.5 * 1024 * 1024 ? res(file) : rej(new Error('Could not read that photo. Try a JPG.')); }; im.src = u; });
  }
  function wirePhoto(st) {
    const done = (j) => { st.imageId = j.imageId; st.preview = j.preview; st.removed = false; const p = $('phPrev'); p.src = j.preview; p.style.display = ''; $('phEmpty').style.display = 'none'; $('phMsg').textContent = 'Photo ready. It shows on the website after you save.'; toast('Photo added'); };
    $('phFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; $('phMsg').textContent = 'Uploading…'; try { done(await uploadMenuImage(await shrinkPhoto(f))); } catch (err) { $('phMsg').textContent = err.message; toast(err.message); } };
    $('phUrlGo').onclick = async () => { const u = $('phUrl').value.trim(); if (!u) return toast('Paste a picture link first.'); $('phMsg').textContent = 'Downloading…'; try { done(await api('status', { image: { op: 'from-url', url: u } })); } catch (err) { $('phMsg').textContent = err.message; toast(err.message); } };
    if ($('phDel')) $('phDel').onclick = () => { st.imageId = ''; st.preview = ''; st.removed = true; $('phPrev').style.display = 'none'; $('phEmpty').style.display = 'flex'; $('phMsg').textContent = 'Photo will be removed from the website when you save.'; };
  }
  async function uploadMenuImage(file) {
    if (file.size > 1.5 * 1024 * 1024) throw new Error('Image is over 1.5 MB.');
    const buf = new Uint8Array(await file.arrayBuffer());
    const start = await api('status', { image: { op: 'start' } });
    for (let i = 0; i < buf.length; i += 24000) {
      let bin = ''; const slice = buf.subarray(i, i + 24000);
      for (let k = 0; k < slice.length; k++) bin += String.fromCharCode(slice[k]);
      await api('status', { image: { op: 'chunk', id: start.id, data: btoa(bin) } });
    }
    return api('status', { image: { op: 'finish', id: start.id, purpose: 'menu' } });
  }
  function recipeProductSheet(fromId) {
    const ings = D.ingredients || [], secs = M.sections || [];
    const cur = fromId && (D.recipes || {})[fromId] ? D.recipes[fromId].rules.map((r) => ({ ...r })) : [];
    const ph = {};
    const keep = {};
    const row = (r, k) => '<div class="field" data-rrow="' + k + '"><select data-ring><option value="">Choose ingredient…</option>' + ings.map((i) => '<option value="' + esc(i.id) + '"' + (r.ing === i.id ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.unit) + ')</option>').join('') + '</select> <input data-rqty inputmode="decimal" placeholder="qty per serving" value="' + (r.qty == null ? '' : esc(r.qty)) + '" style="width:9em"> <button class="btn sm" data-rrm type="button">✕</button></div>';
    const read = () => [...document.querySelectorAll('[data-rrow]')].map((el) => ({ ing: el.querySelector('[data-ring]').value, qty: el.querySelector('[data-rqty]').value }));
    const grab = () => { ['rpName', 'rpPrice', 'rpCat', 'rpDesc', 'rpStock'].forEach((id) => { if ($(id)) keep[id] = $(id).value; }); };
    const draw = () => {
      const from = fromId ? (rows().find((c) => c.id === fromId) || {}).name : '';
      openSheet('<h3>' + (from ? 'Make a product from the ' + esc(from) + ' recipe' : 'Create recipe + product') + '</h3><p class="muted small">The new product is linked to this recipe (selling it takes these ingredients off stock). It starts <b>OFF</b>: switch it on in Menu &amp; Prices when ready, then it shows on the till and the website. Leave price blank if not set.</p>' +
        '<div class="field"><label>Product name *</label><input id="rpName" maxlength="80" value="' + esc(keep.rpName || '') + '"></div>' + photoField(ph) +
        '<div class="field"><label>Price (G$)</label><input id="rpPrice" inputmode="numeric" value="' + esc(keep.rpPrice || '') + '"></div>' +
        '<div class="field"><label>Category</label><select id="rpCat">' + secs.map((x) => '<option value="' + esc(x.id) + '"' + (keep.rpCat === x.id ? ' selected' : '') + '>' + esc(x.title || x.name || x.id) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Description (shown on the website)</label><textarea id="rpDesc" maxlength="300" rows="2">' + esc(keep.rpDesc || '') + '</textarea></div>' +
        '<h3>Recipe (per one item sold)</h3><p class="muted small">Ready-made item bought from a vendor (ice cream, cookies…)? Leave the recipe empty and use the stock count below instead.</p><div id="rRows">' + cur.map(row).join('') + '</div><button class="btn sm" id="rAddRow" type="button">+ Ingredient</button>' +
        '<div class="field"><label>No recipe: stock count (ready-made items, 1 off per sale). Blank = don\'t track stock.</label><input id="rpStock" inputmode="numeric" value="' + esc(keep.rpStock || '') + '"></div>' +
        '<div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="rpSave" type="button">Create product</button></div>');
      $('rAddRow').onclick = () => { grab(); cur.splice(0, cur.length, ...read(), { ing: '', qty: null }); draw(); };
      $('rRows').onclick = (e) => { const b = e.target.closest('[data-rrm]'); if (!b) return; grab(); const all = read(); all.splice(+b.parentElement.dataset.rrow, 1); cur.splice(0, cur.length, ...all); draw(); };
      wirePhoto(ph);
      $('rpSave').onclick = async () => {
        const rules = read().filter((r) => r.ing).map((r) => ({ ing: r.ing, qty: Number(r.qty) }));
        if (rules.length && $('rpStock').value.trim()) return toast('Use either a recipe or a stock count, not both.');
        if (!rules.length && !$('rpStock').value.trim() && !confirm('No recipe and no stock count: sales of this item will not change stock. Continue?')) return;
        const j = await adminOp({ op: 'product-add', name: $('rpName').value, price: $('rpPrice').value, category: $('rpCat').value, desc: $('rpDesc').value, imageId: ph.imageId || '', rules, resaleStock: rules.length ? '' : $('rpStock').value.trim(), available: false }, 'Product + recipe created (OFF until you switch it on)', renderRecipes);
        if (j) closeSheet();
      };
    };
    draw();
  }
  async function confirmDelete(what, name, warn, admin, reRender) {
    if (!confirm('Delete ' + what + ' "' + name + '"?' + (warn ? '\n\n' + warn : '') + '\n\nYou can undo this afterwards.')) return;
    try { await api('status', { admin: { ...admin, confirm: true } }); }
    catch (err) {
      if (/Open orders still have/.test(err.message) && confirm(err.message + '\n\nDelete anyway?')) { try { await api('status', { admin: { ...admin, confirm: true, force: true } }); } catch (e2) { return toast(e2.message); } }
      else return toast(err.message);
    }
    toast('Deleted. Use Undo to bring it back.'); D = await api('sync'); reRender();
  }
  $('view').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'iAdd') return ingSheet();
    const reC = () => { cOpen = true; renderRecipes(); };
    if (b.id === 'cAdd') { const t = (prompt('New category name') || '').trim(); if (t) await adminOp({ op: 'cat-add', title: t }, 'Category added', reC); return; }
    if (b.dataset.cren) { const c = D.categories.find((x) => x.id === b.dataset.cren); const t = (prompt('Rename category', c ? c.title : '') || '').trim(); if (t) await adminOp({ op: 'cat-rename', id: b.dataset.cren, title: t }, 'Category renamed', reC); return; }
    if (b.dataset.cdel) { if (+b.dataset.ccount) return toast('Move its ' + b.dataset.ccount + ' product(s) to another category first.'); if (confirm('Delete this category? You can undo it.')) await adminOp({ op: 'cat-delete', id: b.dataset.cdel }, 'Category deleted', reC); return; }
    if (b.dataset.cres) { await adminOp({ op: 'cat-restore', id: b.dataset.cres }, 'Category restored', reC); return; }
    if (b.dataset.iedit) return ingEditSheet(b.dataset.iedit);
    if (b.id === 'rpNew') return recipeProductSheet(null);
    if (b.dataset.rprod) return recipeProductSheet(b.dataset.rprod);
    if (b.id === 'pAdd') return productSheet();
    if (b.dataset.redit) return recipeSheet(b.dataset.redit);
    if (b.dataset.idel) { if (+b.dataset.iused) return toast(b.dataset.iname + ' is used by ' + b.dataset.iused + ' recipe(s). Remove it from those recipes first.'); return confirmDelete('ingredient', b.dataset.iname, 'It disappears from Stock.', { op: 'ing-delete', id: b.dataset.idel }, renderRecipes); }
    if (b.dataset.pdel) return confirmDelete('product', b.dataset.pname, 'It is hidden from Walk-in and refused on new orders.', { op: 'product-delete', id: b.dataset.pdel }, () => (tab === 'recipes' ? (rOpen = '', rDraft = null, renderRecipes()) : renderMenu()));
    if (b.dataset.rdel) return confirmDelete('the recipe for', b.dataset.rname, 'Selling it will no longer take anything off stock.', { op: 'recipe-delete', id: b.dataset.rdel }, () => { rDraft = null; renderRecipes(); });
    if (b.dataset.ires) return adminOp({ op: 'ing-restore', id: b.dataset.ires }, 'Ingredient restored', renderRecipes);
    if (b.dataset.pres) return adminOp({ op: 'product-restore', id: b.dataset.pres }, 'Product restored', () => (tab === 'recipes' ? renderRecipes() : renderMenu()));
    if (b.dataset.rres) return adminOp({ op: 'recipe-restore', id: b.dataset.rres }, 'Recipe restored', renderRecipes);
  });

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
    const base = (M.items || []).find((i) => i.id === id); const st = { preview: c.noImg ? '' : (imgUrl(c) || imgUrl(base)) }; openSheet('<h3>Edit ' + esc(c.name) + '</h3>' + photoField(st) + '<div class="field"><label>Name</label><input id="mName" maxlength="80" value="' + esc(c.name) + '"></div><div class="field"><label>Price (G$, blank = to confirm)</label><input id="mPrice" inputmode="numeric" value="' + (c.price == null ? '' : esc(c.price)) + '"></div><div class="field"><label>Category</label><select id="mCat">' + secs.map((s) => '<option value="' + esc(s.id) + '"' + (s.id === c.category ? ' selected' : '') + '>' + esc(s.title || s.name || s.id) + '</option>').join('') + '</select></div><div class="field"><label>Showing to customers</label><div id="mOnBox">' + onSwitch(c, true) + '</div><input type="checkbox" id="mOn" hidden' + (c.available === false ? '' : ' checked') + '></div>' + recipe + '<div class="acts"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="mSave" type="button">Save</button></div>');
    wirePhoto(st);
    $('mOnBox').onclick = (e) => { const t = e.target.closest('[data-ptog]'); if (!t) return; e.stopPropagation(); const on = t.dataset.pon !== '1';
      toggleOn(id, on, () => { $('mOn').checked = on; const cc = rows().find((x) => x.id === id) || { id, available: on }; $('mOnBox').innerHTML = onSwitch(cc, true); tab === 'recipes' ? renderRecipes() : renderMenu(); }); };
    $('mSave').onclick = async () => {
      const recipeRules = rec && rec.rules ? rec.rules.map((r, k) => ({ ...r, qty: Number($('sheetPanel').querySelector('[data-rq="' + k + '"]').value) })) : undefined;
      try {
        await api('status', { admin: { op: 'menu', id, name: $('mName').value, price: $('mPrice').value, category: $('mCat').value, available: $('mOn').checked, recipe: recipeRules, ...(st.imageId ? { imageId: st.imageId } : st.removed ? { imageId: 'none' } : {}) } });
        closeSheet(); toast('Menu saved'); D = await api('sync'); tab === 'recipes' ? renderRecipes() : renderMenu();
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
