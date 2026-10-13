// Simulated-browser test for pos/steps.js (the "? Steps" guide). Run: JSDOM_PATH=/path/to/jsdom node --test tests/steps.test.mjs
import test, { after } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import { createRequire } from 'node:module';
let JSDOM; try { ({ JSDOM } = createRequire(import.meta.url)(process.env.JSDOM_PATH || 'jsdom')); } catch {}
const rd = (p) => fs.readFileSync(p, 'utf8'), wait = (ms) => new Promise((r) => setTimeout(r, ms)); const wins = []; after(() => wins.forEach((w) => w.close()));
const ing = [{ id: 'i1', name: 'Chicken', unit: 'kg', stock: 2, low: true, min: { kind: 'qty', value: 5 }, threshold: 5, servingsLeft: 8, costPerUnit: 1400, costLabel: 'estimate', vendor: { name: 'V', phone: '5925550100', placeholder: true } }];
const order = { no: 'W-1', source: 'whatsapp', status: 'new', name: 'Ann', number: '5925550101', fulfilment: 'pickup', createdAt: new Date().toISOString(), total: 3000, cost: 1000, profit: 2000, lines: [{ qty: 1, name: 'Box', lineTotal: 3000, cost: 1000, profit: 2000 }] };
const posSync = { me: { name: 'Owner', role: 'owner', scope: 'pos' }, serverTime: new Date().toISOString(), orders: [order], ingredients: ing, recipes: {}, alerts: [], vendors: [], catalog: [], printQueue: [], printQueued: 0, settings: { readyText: 'x', readyTextDelivery: 'y', printer: {}, pos: {} }, summary: { day: '2026-10-10', sales: 3000, orders: 1, cost: 1000, profit: 2000, tbc: 0, bySource: {}, items: { Box: { qty: 1, sales: 3000, cost: 1000 } } }, float: { day: '2026-10-12', open: 5000, sales: 3000, salesCount: 1, in: 0, out: 0, expected: 8000, count: null, over: null, moves: [], openBy: 'Owner' } };
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
async function walk(w) { // press Next through the whole guide, return the titles shown
  w.document.querySelector('.st-btn').click(); await wait(30); const titles = [];
  for (let i = 0; i < 40; i++) { const t = w.document.querySelector('.st-title'); if (!t) break; if (/All done|Nothing to show/.test(t.textContent)) break; titles.push(t.textContent); w.document.querySelector('.st-next').click(); await wait(10); }
  w.document.querySelector('.st-x, .st-next') && w.document.querySelector('.st-next').click(); return titles;
}
async function tab(w, name) { w.document.querySelector('#tabs [data-tab=' + name + ']').click(); await wait(400); }
const need = (titles, list, where) => { for (const x of list) assert.ok(titles.includes(x), where + ': missing step "' + x + '" in ' + JSON.stringify(titles)); };
test('POS: login screen has a Steps button and guide', { skip: !JSDOM }, async () => {
  const w = await load('pos', false); assert.ok(w.document.querySelector('.st-btn'), 'button'); assert.equal(w.UTSteps.context(), 'login');
  need(await walk(w), ['Type your PIN', 'Sign in', 'Need help?'], 'login');
});
test('POS: every cashier tab', { skip: !JSDOM }, async () => {
  const w = await load('pos', true); assert.ok(w.document.querySelector('.st-btn'));
  assert.ok(w.document.querySelector('.top-acts .st-head'), 'Steps button in header'); assert.equal(w.document.querySelector('.top-acts .st-head').nextElementSibling.hasAttribute('data-help'), true, 'sits next to Help');
  w.document.querySelector('.st-head').click(); await wait(30); assert.ok(w.document.querySelector('.st-tip'), 'header button opens guide'); w.UTSteps.stop();
  need(await walk(w), ['Filter the orders', 'An order', 'Move the order along', 'Change the order', 'Cancel the order', 'Print queue', 'Sign out', 'Switch sections'], 'orders');
  await tab(w, 'walkin'); need(await walk(w), ['Tap what the customer wants', 'The ticket', 'Customer name (optional)', 'Cash received', 'Quick amounts', 'Complete the sale'], 'walkin');
  await tab(w, 'float'); need(await walk(w), ["Today's drawer", 'Opening float', 'Cash in or out', 'Balance the shift'], 'float');
  await tab(w, 'stock'); need(await walk(w), ['An ingredient', 'Restock', 'Count', 'Who to call'], 'stock');
  await tab(w, 'today'); need(await walk(w), ["Today's numbers", 'By source', 'Items sold'], 'today');
});
test('POS: tapping the lit item advances; item box and receipt guides', { skip: !JSDOM }, async () => {
  posSync.printQueue = [{ id: 'j1', no: 'W-1', kind: 'auto', trigger: 'walk-in', at: new Date().toISOString(), status: 'queued', note: '', width: 80 }]; posSync.printQueued = 1;
  const w = await load('pos', true); await tab(w, 'walkin'); w.document.querySelector('.st-btn').click(); await wait(30);
  assert.equal(w.document.querySelector('.st-title').textContent, 'Tap what the customer wants');
  w.document.querySelector('#tab-walkin .grid .item').click(); await wait(500);
  const t = w.document.querySelector('.st-title').textContent; assert.notEqual(t, 'Tap what the customer wants', 'advanced after tap: ' + t); assert.ok(w.document.querySelector('#sheet:not(.hidden)'), 'item box opened');
  w.UTSteps.stop(); assert.equal(w.UTSteps.context(), 'item'); need(await walk(w), ['Add to ticket'], 'item box');
  w.document.querySelector('#sheetPanel [data-close]').click(); await wait(20);
  w.document.querySelector('#pqBtn').click(); await wait(50); w.document.querySelector('[data-pqv]').click(); await wait(100);
  assert.equal(w.UTSteps.context(), 'receipt'); need(await walk(w), ['The receipt', 'Print'], 'receipt');
});
test('POS: focusing the PIN field advances the login guide; Back/Close work', { skip: !JSDOM }, async () => {
  const w = await load('pos', false); w.document.querySelector('.st-btn').click(); await wait(30);
  w.document.querySelector('#pin').dispatchEvent(new w.FocusEvent('focusin', { bubbles: true })); await wait(300);
  assert.equal(w.document.querySelector('.st-title').textContent, 'Sign in'); w.document.querySelector('.st-actions button').click(); await wait(20);
  assert.equal(w.document.querySelector('.st-title').textContent, 'Type your PIN'); w.document.querySelector('.st-x').click(); assert.ok(!w.document.querySelector('.st-tip'));
});
test('Admin: sign-in and every tab', { skip: !JSDOM }, async () => {
  let w = await load('admin', false); assert.ok(w.document.querySelector('.st-btn')); need(await walk(w), ['Type your PIN', 'Sign in'], 'admin login');
  w = await load('admin', true); const m = { staff: ['Your team', 'New PIN', 'New person: name', 'Their PIN', 'Add user'], customers: ['Add a customer', 'Your customers', 'Edit'], menu: ['Your menu', 'Edit an item'], closed: ['Weekly days off', 'Save closed days'],
    promos: ['Write your message', 'Be careful here', 'Update preview', 'Send'], shop: ['Ready message', 'Receipts', 'Ingredient costs', 'Save'], browser: ['Browser password'], activity: ['Activity log'] };
  for (const [t, titles] of Object.entries(m)) { await tab(w, t); need(await walk(w), titles, 'admin ' + t); }
});
