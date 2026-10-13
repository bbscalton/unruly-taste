// Staff (cashier) must not see cost/profit on the POS; owner and manager do. jsdom + mocked sync.
// Simulated-browser test for pos/steps.js (the "? Steps" guide). Run: JSDOM_PATH=/path/to/jsdom node --test tests/steps.test.mjs
import test, { after } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import { createRequire } from 'node:module';
let JSDOM; try { ({ JSDOM } = createRequire(import.meta.url)(process.env.JSDOM_PATH || 'jsdom')); } catch {}
const rd = (p) => fs.readFileSync(p, 'utf8'), wait = (ms) => new Promise((r) => setTimeout(r, ms)); const wins = []; after(() => wins.forEach((w) => w.close()));
const ing = [{ id: 'i1', name: 'Chicken', unit: 'kg', stock: 2, low: true, min: { kind: 'qty', value: 5 }, threshold: 5, servingsLeft: 8, costPerUnit: 1400, costLabel: 'estimate', vendor: { name: 'V', phone: '5925550100', placeholder: true } }];
const order = { no: 'W-1', source: 'whatsapp', status: 'new', name: 'Ann', number: '5925550101', fulfilment: 'pickup', createdAt: new Date().toISOString(), total: 3000, cost: 1000, profit: 2000, lines: [{ qty: 1, name: 'Box', lineTotal: 3000, cost: 1000, profit: 2000 }] };
let ROLE = 'owner'; const posSync = { get me() { return { name: 'T', role: ROLE, scope: 'pos' }; }, serverTime: new Date().toISOString(), orders: [order], ingredients: ing, recipes: {}, alerts: [], vendors: [], catalog: [], printQueue: [], printQueued: 0, settings: { readyText: 'x', readyTextDelivery: 'y', printer: {}, pos: {} }, summary: { day: '2026-10-10', sales: 3000, orders: 1, cost: 1000, profit: 2000, tbc: 0, bySource: { 'walk-in': { orders: 1, sales: 3000, cost: 1000, profit: 2000 } }, items: { Box: { qty: 1, sales: 3000, cost: 1000 } } }, float: { day: '2026-10-12', open: 5000, sales: 3000, salesCount: 1, in: 0, out: 0, expected: 8000, count: null, over: null, moves: [], openBy: 'T' } };
const admSync = { me: { role: 'owner', scope: 'admin', name: 'Owner' }, settings: { shop: { closedWeekdays: [], closedDates: [] }, promo: { tags: [] }, printer: {}, receipt: {}, pos: {} }, promo: { customers: [{ id: 'c1', name: 'Ann', number: '592***', tags: [], opt: 'yes' }], promos: [], optedIn: 1 }, catalog: [], ingredients: ing, vendors: [], recipes: {}, printQueue: [] };
async function load(kind, signedIn) {
  const adm = kind === 'admin', dom = new JSDOM(rd(adm ? 'pos/admin/index.html' : 'pos/index.html').replace(/<script[^>]*src[^>]*><\/script>/g, ''), { url: 'http://x/unruly-taste/pos/' + (adm ? 'admin/' : ''), runScripts: 'outside-only', pretendToBeVisual: true }), w = dom.window; wins.push(w);
  w.Element.prototype.scrollIntoView = () => {}; w.alert = w.confirm = w.scrollTo = () => {};
  // jsdom has no layout: report every element as visible
  w.Element.prototype.getClientRects = function () { return this.closest('.hidden') ? [] : [{}]; }; w.Element.prototype.getBoundingClientRect = () => ({ top: 100, bottom: 140, left: 10, right: 200, width: 190, height: 40 });
  w.fetch = async (u, o = {}) => { const b = o.body ? JSON.parse(o.body) : {}; let j = {};
    if (/\/auth$/.test(u)) j = { session: 's' }; else if (adm) j = b.admin && b.admin.op === 'users' ? { users: [{ id: 'u1', name: 'Owner', role: 'owner' }, { id: 'u2', name: 'Sam', role: 'staff' }] } : b.admin && b.admin.op === 'audit' ? { audit: [{ action: 'x', user: 'o', at: new Date().toISOString() }] } : b.op === 'status' ? { devices: [], seen: [] } : admSync; else j = posSync;
    return { ok: true, status: 200, json: async () => j }; };
  if (signedIn) { (adm ? w.sessionStorage : w.localStorage).setItem(adm ? 'ut_admin_session' : 'ut_pos_token', 'tok'); }
  const files = adm ? ['config.js', 'menu.js', 'pos/receipt.js', 'pos/admin/admin.js', 'pos/steps.js'] : ['config.js', 'menu.js', 'pos/receipt.js', 'pos/pos.js', 'pos/steps.js'];
  for (const f of files) w.eval(rd(f)); await wait(500); return w;
}

const text = (el) => el.textContent;
async function tab(w, name) { w.document.querySelector('#tabs [data-tab=' + name + ']').click(); await wait(400); }
const COSTWORDS = /Est\. cost|Est\. profit|est\. cost|est\. profit|margin|\bprofit\b|\bCost\b|cost \d|cost G\$|estimated cost/;
async function views(w) { const out = {}; out.orders = text(w.document.querySelector('#tab-orders'));
  await tab(w, 'walkin'); w.document.querySelector('#tab-walkin .grid .item').click(); await wait(100); out.item = text(w.document.querySelector('#sheetPanel')); w.document.querySelector('#sheetPanel .opt') && w.document.querySelector('#sheetPanel .opt').click();
  w.document.querySelector('#sheetPanel #addIt').click(); await wait(200); out.walkin = text(w.document.querySelector('#tab-walkin')); out.grid = text(w.document.querySelector('#tab-walkin .grid'));
  await tab(w, 'float'); out.float = text(w.document.querySelector('#tab-float'));
  if (!w.document.body.classList.contains('ut-staff')) { await tab(w, 'stock'); out.stock = text(w.document.querySelector('#tab-stock')); await tab(w, 'today'); out.today = text(w.document.querySelector('#tab-today')); }
  else { out.stock = ''; out.today = ''; }
  return out; }
test('staff: no cost or profit anywhere; sales still shown', { skip: !JSDOM }, async () => {
  ROLE = 'staff'; const w = await load('pos', true); const v = await views(w);
  for (const [k, t] of Object.entries(v)) assert.ok(!COSTWORDS.test(t) && !/Costs are not the restaurant/.test(t), k + ' leaks cost/profit: ' + (COSTWORDS.exec(t) || ['note'])[0]);
  assert.ok(/Cash sales/.test(v.float) && /G\$3,000/.test(v.float) && /G\$5,000/.test(v.float), 'float kept'); assert.ok(/Total/.test(v.orders) && /G\$3,000/.test(v.orders), 'order total kept'); assert.ok(/Total/.test(v.walkin), 'ticket total kept');
  assert.ok(w.document.querySelector('#tabs [data-tab=stock]').classList.contains('hidden') && w.document.querySelector('#tabs [data-tab=today]').classList.contains('hidden'), 'stock and today hidden');
  assert.ok(!w.document.querySelector('#tabs [data-tab=float]').classList.contains('hidden'), 'float shown');
  assert.ok(w.document.body.classList.contains('ut-staff')); assert.ok(!/profit/i.test(v.float));
  w.document.querySelector('#tabs [data-tab=today]').click(); await wait(200); w.document.querySelector('.st-btn').click(); await wait(30);
  const texts = []; for (let i = 0; i < 10; i++) { const t = w.document.querySelector('.st-text'); if (!t || /All done/.test(w.document.querySelector('.st-title').textContent)) break; texts.push(t.textContent); w.document.querySelector('.st-next').click(); await wait(5); }
  assert.ok(texts.length && !texts.some((t) => /profit|cost/i.test(t)), 'Steps text for staff has no profit/cost: ' + texts.join('|'));
});
for (const role of ['owner', 'manager']) test(role + ': still sees cost and profit', { skip: !JSDOM }, async () => {
  ROLE = role; const w = await load('pos', true); const v = await views(w);
  assert.ok(/Est\. cost/.test(v.orders) && /Est\. profit/.test(v.orders), 'order card'); assert.ok(/est\. cost/.test(v.item) && /est\. profit/.test(v.item), 'item box'); assert.ok(/est\. cost/.test(v.grid), 'grid margin note');
  assert.ok(/Est\. profit/.test(v.walkin), 'ticket totals'); assert.ok(/1,400/.test(v.stock), 'ingredient cost'); assert.ok(/Est\. cost/.test(v.today) && /Est\. profit/.test(v.today) && /Profit/.test(v.today) && /Cost/.test(v.today), 'today');
  assert.ok(!w.document.body.classList.contains('ut-staff'));
});
