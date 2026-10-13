/* "? Steps" guide for the Unruly Taste POS (till) and Admin. Client-side only: it reads the page, calls no API and changes no data.
 * Spotlights one item at a time. Focusing or tapping the lit item moves to the next step. Next / Back / Close always work.
 * Targets are looked up fresh on every frame because the POS redraws its screens every few seconds. */
(function () {
  'use strict';
  if (window.UTSteps) return;
  var ADMIN = /\/admin(\/|$)/.test(location.pathname);
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (el) { return !!(el && el.getClientRects().length); };
  var find = function (s) { var el = typeof s === 'function' ? s() : (s ? $(s) : null); return shown(el) ? el : null; };
  var S = function (sel, title, text) { return { sel: sel, title: title, text: text }; };
  var TABS = S('#tabs', 'Switch sections', 'Tap a name here to move to another section. This guide closes when you switch.');

  /* ---------------- till (cashier) ---------------- */
  var POS = {
    login: [
      S('#pin', 'Type your PIN', 'Tap here and type the staff PIN your manager gave you. It stays on this device only.'),
      S('#loginForm button[type=submit]', 'Sign in', 'Tap Sign in. If it says wrong PIN, check the numbers and try again. Too many wrong tries locks it for a while.'),
      S('#loginForm [data-help]', 'Need help?', 'Tap here for answers about signing in, PINs and lockouts.')
    ],
    orders: [
      S('#tab-orders .chips', 'Filter the orders', 'Pick where orders came from (Walk-in, WhatsApp, Web) and whether to show Open or Collected ones.'),
      S('#tab-orders .order, #tab-orders .empty', 'An order', 'Each card is one order: who it is for, what they ordered and the total. WhatsApp and web orders appear by themselves.'),
      S('#tab-orders .order [data-st][data-no], #tab-orders .order [data-ready]', 'Move the order along', 'Start preparing, then Ready when the food is done, then Collected when the customer takes it.'),
      S('#tab-orders .order [data-edit]', 'Change the order', 'Tap Edit to add an item, remove a line, or change how many. Then tap Save order.'),
      S('#tab-orders .order [data-void]', 'Cancel the order', 'Tap Cancel order if the sale should not have been rung. Stock goes back and it drops out of today\'s cash. You will be asked to confirm.'),
      S('#tab-orders .order [data-rcpt]', 'Receipt', 'Tap to see, print or save the receipt for this order. After Collected the receipt opens: print it, or send it on WhatsApp.'),
      S('#pqBtn', 'Print queue', 'Receipts waiting to print are listed here.'),
      S('#bell', 'Low stock bell', 'A number here means something is running low. Tap it to see what.'),
      S('#adminBtn', 'Admin (owner, admin or manager)', 'Opens the owner side. It asks for an owner, admin or manager PIN.'),
      S('#signOutBtn', 'Sign out', 'Tap when you finish your shift so nobody else uses your login.'),
      TABS
    ],
    walkin: [
      S('#tab-walkin .grid .item', 'Tap what the customer wants', 'Tap a menu item to add it. If it has choices, a box opens.'),
      S('#sheetPanel .opts', 'Pick the choices', 'Tap the options the customer asked for, for example the flavour or size.'),
      S('#sheetPanel .qty', 'How many?', 'Use + and - to set the quantity.'),
      S('#addIt', 'Add to ticket', 'Tap to put it on the ticket. Repeat for each item.'),
      S('#ticket', 'The ticket', 'Everything added so far. Tap the X on a line to remove it.'),
      S('#cName', 'Customer name (optional)', 'Type a name so you can call out the order.'),
      S('#tend', 'Cash received', 'Type how much cash the customer handed you.'),
      S('#tab-walkin .quick', 'Quick amounts', 'Tap Exact if they paid the exact total, or tap a note amount.'),
      S('#ttot', 'Total and change', 'Shows the total and the change to give back. Red means they have not given enough yet.'),
      S('#complete', 'Complete the sale', 'Tap when the money is in your hand. The sale is saved and the receipt opens.'),
      S('#sheetPanel .rc-stage', 'The receipt', 'This is what the customer gets. Check the items and change.'),
      S('#waNum', 'WhatsApp receipt (optional)', 'If the customer wants the receipt on WhatsApp, type their number (7 digits) and tap Send on WhatsApp. Nothing prints then. Leave it blank to print as usual. If sending fails, it prints instead.'),
      S('#sheetPanel [data-rp=print]', 'Print the receipt', 'Tap Print to print it, or use Save as PDF.'),
      S('#sheetPanel [data-close]', 'Close', 'Tap Close to finish and start the next sale.'),
      TABS
    ],
    float: [
      S('#tab-float .kpis', "Today's drawer", 'Opening cash, cash sales, money in, money out, and what should be in the drawer.'),
      S('#floatOpen', 'Opening float', 'Type the cash you started the day with, then tap Set float.'),
      S('#flOpenGo', 'Save the float', 'Tap to save that opening amount.'),
      S('#floatMove', 'Cash in or out', 'Use Cash in for extra change. Use Cash out for a safe drop or a payout, and type a note.'),
      S('#floatCount', 'Count the drawer', 'Type the cash you counted. Over or short is that count minus what the drawer should hold.'),
      TABS
    ],
    stock: [
      S('#tab-stock .si', 'An ingredient', 'Shows how much is left and how many servings that makes. LOW means it is time to reorder.'),
      S('#tab-stock [data-stk=add]', 'Restock', 'Tap when new supplies arrive and type how much came in.'),
      S('#tab-stock [data-stk=set]', 'Count', 'Tap after counting what is on the shelf to set the right number.'),
      S('#sq', 'Type the amount', 'Type the quantity, then tap Save.'),
      S('#sqOk', 'Save', 'Tap to save the new stock number.'),
      S('#tab-stock .vend', 'Who to call', 'The supplier for this item. Tap the phone number to call.'),
      TABS
    ],
    kitchen: [
      S('#tab-orders .k-order, #tab-orders .empty', 'An order', 'Each card is one order: what to make, the choices and any note. New orders appear by themselves.'),
      S('#tab-orders [data-kst]', 'In progress / Done', 'Tap Done when the food is ready. Tap again to put it back to In progress.'),
      S('#signOutBtn', 'Sign out', 'Tap when you finish your shift.')
    ],
    today: [
      S('#tab-today .kpis', "Today's numbers", function () { return document.body.classList.contains('ut-staff') ? 'Your sales so far today, the number of orders and the average order.' : 'Sales, estimated cost and profit so far today, and the average order.'; }),
      S(function () { return $('#tab-today .scroll'); }, 'By source', 'How much came from walk-in, WhatsApp and web orders.'),
      S(function () { var s = document.querySelectorAll('#tab-today .scroll'); return s[1] || $('#tab-today .empty'); }, 'Items sold', 'What sold today and how many.'),
      TABS
    ],
    item: [
      S('#sheetPanel .opts', 'Pick the choices', 'Tap the options the customer asked for, for example the flavour or size.'),
      S('#mp', 'Price (only if asked)', 'This item has no fixed price. Type what you are charging.'),
      S('#sheetPanel .qty', 'How many?', 'Use + and - to set the quantity.'),
      S('#addIt', 'Add to ticket', 'Tap to put it on the ticket.'),
      S('#sheetPanel [data-close]', 'Changed your mind?', 'Tap Cancel to close without adding it.')
    ],
    receipt: [
      S('#sheetPanel .rc-stage', 'The receipt', 'This is what the customer gets. Check the items, total and change.'),
      S('#waNum', 'WhatsApp receipt (optional)', 'Type the customer\'s WhatsApp number (7 digits) and tap Send on WhatsApp instead of printing. Blank = print as usual. If it fails, it prints instead.'),
      S('#sheetPanel .chips', 'Paper size', 'Pick 80 mm or 58 mm to match your receipt paper.'),
      S('#sheetPanel [data-rp=print]', 'Print', 'Tap to print the receipt, or use Save as PDF next to it.'),
      S('#sheetPanel [data-rp=queue]', 'Print queue', 'Tap to print it later with the other waiting receipts.'),
      S('#sheetPanel [data-close]', 'Close', 'Tap Close when you are finished.')
    ],
    sheet: [
      S('#sheetPanel h3', 'This box', 'Read what it says. It asks you to confirm or fill something in.'),
      S('#sheetPanel input, #sheetPanel textarea, #sheetPanel select', 'Fill this in', 'Tap here and type or choose.'),
      S('#sheetPanel .acts .primary, #sheetPanel .acts .green, #sheetPanel #adminGo', 'Confirm', 'Tap to confirm and save.'),
      S('#sheetPanel [data-close]', 'Cancel', 'Tap to close this box without changing anything.')
    ]
  };

  /* ---------------- admin (owner / manager) ---------------- */
  var ADM = {
    login: [
      S('#pin', 'Type your PIN', 'Owner PIN opens everything. A manager PIN opens Customers and Promos only. A staff PIN cannot open Admin.'),
      S('#loginForm button', 'Sign in', 'Tap Sign in.'),
      S('#loginForm .small a', 'Back to the till', 'Tap to go back to the POS.')
    ],
    staff: [
      S('#view .t', 'Your team', 'Everyone who can sign in, and their role.'),
      S('#view [data-upin]', 'New PIN', 'Tap to give that person a new PIN. They are signed out right away.'),
      S('#view [data-uoff], #view [data-uon]', 'Remove or turn back on', 'Remove stops someone signing in. You can turn them back on later.'),
      S('#nuName', 'New person: name', 'Type the name of the new staff member or manager.'),
      S('#nuRole', 'Staff or manager', 'Staff only use the till. Managers can also open Customers and Promos.'),
      S('#nuPin', 'Their PIN', 'Choose a PIN with at least 8 characters and tell them privately.'),
      S('#nuAdd', 'Add user', 'Tap to create the login.'),
      TABS
    ],
    customers: [
      S('#cuAdd', 'Add a customer', 'Tap to add a customer name and WhatsApp number.'),
      S('#view .t', 'Your customers', 'Numbers are hidden in the list. Groups and special-offer choice are shown.'),
      S('#view [data-cedit]', 'Edit', 'Tap to see the full number and change details. Changes are written to Activity.'),
      TABS
    ],
    menu: [
      S('#view .t', 'Your menu', 'Every item with its price and whether it is on or off.'),
      S('#view [data-medit]', 'Edit an item', 'Tap Edit to change the price or turn the item off. Off items disappear from Walk-in.'),
      S('#view [data-pdel]', 'Delete a product', 'Tap Delete and confirm. It is hidden from Walk-in. Undo brings it back.'),
      S('#pAdd', 'Add a product', 'Tap to add a new item. Leave the price blank if it is not set yet.'),
      TABS
    ],
    recipes: [
      S('#rpNew', 'Create product', 'Add a new item: name, price, category, description and photo. Give it a recipe, or for ready-made items (ice cream, cookies) a stock count. It starts OFF until you switch it on.'),
      S('#rSearch', 'Find a product', 'Type part of the name, or pick a category next to it.'),
      S('#view [data-ropen]', 'Open a product', 'Tap a row to see its recipe. Change quantities, add or remove ingredients, then tap Save recipe. Edit or delete the product from here too.'),
      S('#ingBox summary', 'Ingredients', 'Categories: open the Categories section to add, rename or delete one (delete only when no product uses it). In a product form choose + New category… to make one on the spot. Ingredients: tap to open the ingredient list: search, add, edit (name, unit, supplier, cost, stock) or delete an ingredient (only when no recipe uses it).'),
      TABS
    ],
    closed: [
      S('#view .chips', 'Weekly days off', 'Tick the days of the week the shop is closed.'),
      S('#closedAdd', 'One-off day', 'Pick a date, for example a holiday.'),
      S('#closedAddBtn', 'Add the date', 'Tap to add it to the list.'),
      S('#closedSave', 'Save closed days', 'Tap Save. Promos are skipped on closed days.'),
      TABS
    ],
    promos: [
      S('#promoBody', 'Write your message', 'Type the offer you want to send by WhatsApp (up to 500 letters).'),
      S('#promoSponsor', 'Sponsor line', 'Tick to add the sponsor line at the end.'),
      S('#promoFile', 'Add a picture (optional)', 'Choose a photo under 1.5 MB.'),
      S('#promoUnknown', 'Be careful here', 'Leave this OFF. Messaging people who never agreed can get the WhatsApp line blocked.'),
      S('#promoWhen', 'Send later (optional)', 'Pick a day and time, or leave empty to send now.'),
      S('#promoRefresh', 'Update preview', 'Tap to see exactly what will be sent and how many people get it.'),
      S('#promoPreview', 'The preview', 'Read it carefully before sending.'),
      S('#promoSend', 'Send', 'Tap to send. You will be asked to confirm.'),
      TABS
    ],
    shop: [
      S('#showAdmin', 'Admin button on the till', 'Tick to show the Admin button on the cashier screen.'),
      S('#readyText', 'Ready message', 'The WhatsApp customers get when their order is ready. {name} {no} {total} fill in by themselves.'),
      S('#lowStock', 'Low stock alert', 'Tick to get a WhatsApp when an ingredient runs low.'),
      S('#autoPrint', 'Receipts', 'Tick to queue a receipt for every new order.'),
      S('#paperWidth', 'Paper size', 'Choose the width of your receipt paper.'),
      S('#sponsorDefault', 'Promo defaults', 'The usual sponsor line, the most promos per day and customer groups.'),
      S('#view [data-ing]', 'Ingredient costs', 'Update what each ingredient costs so profit numbers are right.'),
      S('#impText', 'Import a sheet (optional)', 'Paste the owner sheet here, then tap Preview import.'),
      S('#shopSave', 'Save', 'Nothing is saved until you tap this.'),
      TABS
    ],
    browser: [
      S('#baNew', 'Browser password', 'Create or change the password that lets a normal web browser use the POS. The POS app does not need it.'),
      S('#view .t', 'Browsers allowed', 'Each browser that has been let in. Tap Revoke to remove one.'),
      TABS
    ],
    activity: [
      S('#view .card', 'Activity log', 'Who changed what and when. You can only read it.'),
      TABS
    ],
    sheet: [
      S('#sheetPanel h3', 'This box', 'Read what it says. It asks you to fill something in or confirm.'),
      S('#sheetPanel input, #sheetPanel textarea, #sheetPanel select', 'Fill this in', 'Tap here and type or choose.'),
      S('#sheetPanel .acts .primary, #sheetPanel .acts .red, #sheetPanel .acts .btn:not([data-close])', 'Save or confirm', 'Tap to save.'),
      S('#sheetPanel [data-close]', 'Cancel', 'Tap to close without changing anything.')
    ]
  };
  var SET = ADMIN ? ADM : POS;

  function context() {
    var login = $('#login');
    if (login && !login.classList.contains('hidden')) return 'login';
    var sh = $('#sheet');
    if (sh && !sh.classList.contains('hidden')) {
      if (!ADMIN && $('#sheetPanel .rc-stage')) return 'receipt';
      if (!ADMIN && $('#addIt')) return 'item';
      return 'sheet';
    }
    if (!ADMIN && document.body.classList.contains('ut-kitchen')) return 'kitchen';
    var on = $('#tabs button.on'); var t = on && on.dataset.tab;
    return t && SET[t] ? t : (ADMIN ? 'staff' : 'orders');
  }

  var steps = [], idx = -1, hole, tip, raf = 0, curSel = null;
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  function stop() {
    cancelAnimationFrame(raf); if (hole) hole.remove(); if (tip) tip.remove(); hole = tip = null; idx = -1; steps = []; curSel = null;
    document.removeEventListener('focusin', onHit, true); document.removeEventListener('click', onHit, true);
  }
  function onHit(e) {
    if (!tip || idx < 0 || idx >= steps.length) return;
    if (tip.contains(e.target)) return;
    var t = find(steps[idx].sel); var me = idx;
    if (t && t.contains(e.target)) setTimeout(function () { if (tip && idx === me) go(idx + 1); }, 200);
    else if (e.target.closest && e.target.closest('#tabs button')) stop();
  }
  function go(n, dir) {
    dir = dir || 1;
    while (n >= 0 && n < steps.length && !find(steps[n].sel)) n += dir;   // skip steps whose item is not on screen right now
    if (n < 0) n = Math.max(idx, 0);
    if (n >= steps.length) return finish();
    idx = n; var t = find(steps[n].sel); curSel = steps[n].sel;
    try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    draw();
  }
  function draw() {
    var s = steps[idx], total = steps.filter(function (x) { return find(x.sel); }).length;
    var pos = steps.slice(0, idx + 1).filter(function (x) { return find(x.sel); }).length;
    tip.replaceChildren(el('div', 'st-count', 'Step ' + pos + ' of ' + Math.max(total, pos)), el('div', 'st-title', s.title), el('p', 'st-text', typeof s.text === 'function' ? s.text() : s.text));
    var back = el('button', null, 'Back'), next = el('button', 'st-next', pos >= total ? 'Finish' : 'Next'), x = el('button', 'st-x', 'Close');
    back.type = next.type = x.type = 'button'; back.disabled = pos <= 1;
    back.onclick = function () { go(idx - 1, -1); }; next.onclick = function () { go(idx + 1); }; x.onclick = stop;
    tip.append(el('div', 'st-actions')); tip.lastChild.append(back, next, x); hole.classList.remove('st-hide');
  }
  function finish() {
    idx = steps.length; hole.classList.add('st-hide');
    var b = el('button', 'st-next', 'Close'); b.type = 'button'; b.onclick = stop;
    tip.replaceChildren(el('div', 'st-title', 'All done'), el('p', 'st-text', 'You have seen every step for this screen. Tap ? Steps any time to see them again.'));
    var a = el('div', 'st-actions'); a.append(b); tip.append(a);
  }
  function place() {
    if (!hole) return; raf = requestAnimationFrame(place);
    var t = idx >= 0 && idx < steps.length ? find(steps[idx].sel) : null, vh = innerHeight, vw = innerWidth, th = tip.offsetHeight, tw = tip.offsetWidth;
    if (!t) { hole.style.width = hole.style.height = '0px'; tip.style.top = Math.max((vh - th) / 2, 8) + 'px'; tip.style.left = Math.max((vw - tw) / 2, 8) + 'px'; return; }
    var r = t.getBoundingClientRect(), p = 6, top = Math.max(r.top - p, 4), bottom = Math.min(r.bottom + p, vh - 4), left = Math.max(r.left - p, 4), right = Math.min(r.right + p, vw - 4);
    hole.style.top = top + 'px'; hole.style.left = left + 'px'; hole.style.width = Math.max(right - left, 10) + 'px'; hole.style.height = Math.max(bottom - top, 10) + 'px';
    var ty = bottom + th + 14 < vh ? bottom + 10 : (top - th - 14 > 0 ? top - th - 10 : vh - th - 10);
    tip.style.top = Math.max(ty, 4) + 'px'; tip.style.left = Math.min(Math.max(left, 8), Math.max(vw - tw - 8, 8)) + 'px';
  }
  function start() {
    stop(); steps = (SET[context()] || []).slice();
    hole = el('div', 'st-hole st-hide'); tip = el('div', 'st-tip'); tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-live', 'polite');
    document.body.append(hole, tip);
    document.addEventListener('focusin', onHit, true); document.addEventListener('click', onHit, true);
    raf = requestAnimationFrame(place); go(0);
    if (idx < 0 || idx >= steps.length) { tip.replaceChildren(el('div', 'st-title', 'Nothing to show yet'), el('p', 'st-text', 'There is nothing on this screen to guide you through right now.')); var b = el('button', 'st-next', 'Close'); b.type = 'button'; b.onclick = stop; var a = el('div', 'st-actions'); a.append(b); tip.append(a); }
  }
  function mount() {
    if (document.querySelector('.st-btn')) return;
    var b = el('button', 'st-btn', '? Steps'); b.type = 'button'; b.setAttribute('aria-label', 'Show me the steps for this screen'); b.onclick = start; document.body.append(b);
    var bar = $('.top-acts');   // also put a Steps button in the header, next to Help
    if (bar && !bar.querySelector('.st-head')) {
      var h = el('button', 'helpbtn st-head', ''); h.type = 'button'; h.title = 'Steps: show me how'; h.setAttribute('aria-label', 'Show me the steps for this screen');
      var q = el('span', null, '?'); var e = el('em', null, 'Steps'); h.append(q, e); h.onclick = start;
      var help = bar.querySelector('[data-help]'); bar.insertBefore(h, help || bar.firstChild);
    }
  }
  window.UTSteps = { start: start, stop: stop, context: context, active: function () { return !!tip; } };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
