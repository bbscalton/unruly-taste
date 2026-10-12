/* Unruly Taste ordering page. Static site: cart in localStorage, checkout opens WhatsApp (wa.me)
   with a formatted order + customer receipt. Config (order line number etc.) lives in config.js. */
(function () {
  'use strict';
  var C = window.UT_CONFIG;
  var $ = function (id) { return document.getElementById(id); };

  // ---------------- MENU: data lives in menu.js (shared with the voice bot) ----------------
  var M = window.UT_MENU, LISTS = M.lists, FLAVOURS = LISTS.flavours, SECTIONS = M.sections;
  // per-item summary formats (display only)
  var FMT = {
    db: function (v) { return 'Box 1: ' + v.b1 + ' w/ ' + v.p1 + (v.f1 ? ' (' + v.f1 + ')' : '') + '; Box 2: ' + v.b2 + ' w/ ' + v.p2 + (v.f2 ? ' (' + v.f2 + ')' : ''); },
    mm: function (v) { return 'Box 1: ' + v.b1 + ' w/ ' + v.p1 + (v.f1 ? ' (' + v.f1 + ')' : '') + '; Box 2: ' + v.b2 + ' w/ ' + v.p2 + (v.f2 ? ' (' + v.f2 + ')' : '') + '; Refreshers: ' + v.r1 + ' + ' + v.r2; }
  };
  var MENU = M.items.map(function (it) {
    var c = Object.assign({}, it, { fmt: FMT[it.id] });
    c.groups = (it.groups || []).map(function (g) { return Object.assign({}, g, { opts: typeof g.opts === 'string' ? LISTS[g.opts] : g.opts }); });
    return c;
  });
  var BY_ID = {}; MENU.forEach(function (m) { BY_ID[m.id] = m; });

  // ---------------- helpers ----------------
  function money(n) { return C.CURRENCY + Number(n).toLocaleString('en-US'); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // encodeURIComponent + also escape !'()* so WhatsApp formatting (*bold*) never breaks a link
  function enc(s) { return encodeURIComponent(s).replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); }); }
  function waLink(digits, text) { return 'https://wa.me/' + digits + (text ? '?text=' + enc(text) : ''); }
  function gyNow() {
    var d = new Date(), tz = C.TIME_ZONE;
    var get = function (o) { return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: tz }, o)).format(d); };
    return {
      weekday: Number({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d)]),
      dayName: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d),
      ymd: get({ year: '2-digit' }) + get({ month: '2-digit' }) + get({ day: '2-digit' }),
      label: new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }).format(d) + ' (Guyana)'
    };
  }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add('hidden'); }, 2600); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

  // choices: array (one per group) of option index, or -1 when the group is hidden / unchosen
  function visible(item, g, ch) {
    if (!g.showIf) return true;
    var gi = item.groups.findIndex(function (x) { return x.key === g.showIf[0]; });
    return ch[gi] === g.showIf[1];
  }
  function values(item, ch) {
    var v = {};
    item.groups.forEach(function (g, i) { v[g.key] = visible(item, g, ch) && ch[i] >= 0 ? g.opts[ch[i]] : ''; });
    return v;
  }
  function summary(item, ch) {
    if (!item.groups.length) return '';
    if (item.fmt) return item.fmt(values(item, ch));
    return item.groups.filter(function (g, i) { return visible(item, g, ch) && ch[i] >= 0; })
      .map(function (g) { var i = item.groups.indexOf(g); return (g.short === 'Flavour' ? '' : g.short + ': ') + g.opts[ch[i]]; }).join(', ');
  }
  function dayWarn(item) {
    if (!item.day) return '';
    var now = gyNow();
    return now.weekday === item.day ? '' : item.dayName + 's only: pre-order for ' + item.dayName + ' (today is ' + now.dayName + ')';
  }

  // ---------------- cart ----------------
  var cart = (store('ut_cart') || []).filter(function (l) { return BY_ID[l.id] && Array.isArray(l.ch) && l.ch.length === BY_ID[l.id].groups.length; });
  function lineKey(l) { return l.id + ':' + l.ch.join(','); }
  function saveCart() { store('ut_cart', cart); renderCartBar(); }
  function cartTotal() { return cart.reduce(function (s, l) { return s + (BY_ID[l.id].price || 0) * l.q; }, 0); }
  function cartHasAsk(lines) { return (lines || cart).some(function (l) { return !BY_ID[l.id].price; }); }
  var ASK = 'price confirmed on WhatsApp';
  function cartCount() { return cart.reduce(function (s, l) { return s + l.q; }, 0); }
  function addLine(id, ch, q) {
    var nl = { id: id, ch: ch.slice(), q: q }, k = lineKey(nl);
    var ex = cart.find(function (l) { return lineKey(l) === k; });
    if (ex) ex.q = Math.min(20, ex.q + q); else cart.push(nl);
    saveCart();
  }

  // Reorder link format (URL-safe, no WhatsApp formatting chars): lines joined by ".",
  // each line = id-qty-choices, choices = one base36 char per option group ("z" = not applicable).
  function encodeCart(lines) {
    return lines.map(function (l) { return l.id + '-' + l.q + '-' + l.ch.map(function (c) { return c < 0 ? 'z' : c.toString(36); }).join(''); }).join('.');
  }
  function decodeCart(s) {
    var out = [];
    String(s || '').split('.').forEach(function (part) {
      var m = /^([a-z]{2})-(\d{1,2})-([0-9a-z]*)$/.exec(part);
      if (!m || !BY_ID[m[1]]) return;
      var item = BY_ID[m[1]], q = Math.max(1, Math.min(20, parseInt(m[2], 10)));
      if (m[3].length !== item.groups.length) return;
      var ch = m[3].split('').map(function (c) { return c === 'z' ? -1 : parseInt(c, 36); });
      var ok = item.groups.every(function (g, i) {
        if (!visible(item, g, ch)) { ch[i] = -1; return true; }
        return ch[i] >= 0 && ch[i] < g.opts.length;
      });
      if (ok) out.push({ id: item.id, ch: ch, q: q });
    });
    return out;
  }
  function reorderUrl(lines) { return C.SITE_URL + '?reorder=' + encodeCart(lines); }

  // ---------------- render menu ----------------
  // items without a real photo get a branded no-photo card (no fake food pictures)
  function noPhoto(m) { return '<span class="nophoto" role="img" aria-label="' + esc(m.name) + ' (photo coming soon)"><span class="np-i">' + esc(m.icon || '🍽️') + '</span><span class="np-n">' + esc(m.name) + '</span><small>Photo coming soon</small></span>'; }
  function renderTabs() {
    $('tabs').innerHTML = SECTIONS.map(function (s, i) { return '<button data-sec="' + s.id + '"' + (i ? '' : ' class="on"') + '>' + esc(s.title) + '</button>'; }).join('');
  }
  renderTabs();
  function renderMenu() {
    var now = gyNow(), html = '';
    SECTIONS.forEach(function (s) {
      html += '<section class="sec" id="sec-' + s.id + '"><h2>' + s.title + '</h2>' +
        (s.id === 'wings' ? '<p class="flv"><b>In-house sauces:</b> ' + FLAVOURS.map(esc).join(' · ') + '</p>' : '') + '<div class="grid">';
      MENU.filter(function (m) { return m.sec === s.id; }).forEach(function (m) {
        var tag = m.day ? '<span class="tag' + (now.weekday === m.day ? ' today' : '') + '">' + (now.weekday === m.day ? 'TODAY' : m.dayName + 's') + '</span>' : '';
        html += '<button type="button" class="item" data-id="' + m.id + '">' + (m.img ? '<img src="images/' + m.img + '" alt="' + esc(m.name) + '" loading="lazy" width="640" height="480">' : noPhoto(m)) +
          '<span class="t"><h3>' + esc(m.name) + tag + '</h3><p>' + esc(m.desc) + '</p><span class="pr">' +
          (m.price ? '<span class="price">' + money(m.price) + '</span><span class="addb">Add +</span>'
                   : '<span class="price ask">Price on WhatsApp</span><span class="addb">Add +</span>') +
          '</span></span></button>';
      });
      html += '</div></section>';
    });
    $('menu').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (b) { b.addEventListener('click', function () { openItem(b.dataset.id); }); });
  }

  // ---------------- item sheet ----------------
  var cur = null; // { item, ch, q }
  function openModal(id) { $(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function closeModal(id) { $(id).classList.add('hidden'); document.body.style.overflow = ''; }
  Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.hasAttribute('data-close')) closeModal(m.id); });
  });

  function openItem(id) {
    var item = BY_ID[id];
    cur = { item: item, ch: item.groups.map(function () { return -1; }), q: 1 };
    if (item.img) { $('itemImg').src = 'images/' + item.img; $('itemImg').alt = item.name; $('itemImg').classList.remove('hidden'); $('itemNoPhoto').classList.add('hidden'); }
    else { $('itemImg').classList.add('hidden'); $('itemImg').removeAttribute('src'); $('itemNoPhoto').innerHTML = noPhoto(item); $('itemNoPhoto').classList.remove('hidden'); }
    $('itemTitle').textContent = item.name + (item.price ? ' · ' + money(item.price) : '');
    $('itemDesc').textContent = item.desc;
    $('itemErr').textContent = '';
    var dn = $('itemDay');
    if (!item.price) {
      dn.innerHTML = '💬 Price not posted yet: Unruly Taste confirms it on WhatsApp when you order.';
      dn.classList.remove('hidden');
    } else if (item.day) {
      var w = dayWarn(item);
      dn.innerHTML = w ? '📅 ' + esc(w) + '. You can still order it as a pre-order; Unruly Taste confirms on WhatsApp.' : '✅ Today is ' + item.dayName + ': available today!';
      dn.classList.remove('hidden');
    } else dn.classList.add('hidden');
        renderGroups(); updateAdd();
    openModal('itemModal');
  }
  function renderGroups() {
    var item = cur.item, html = '';
    item.groups.forEach(function (g, gi) {
      if (!visible(item, g, cur.ch)) return;
      html += '<div class="grp"><div class="gl">' + esc(g.label) + ' <small>(required)</small></div><div class="opts">' +
        g.opts.map(function (o, oi) { return '<button type="button" data-g="' + gi + '" data-o="' + oi + '" class="' + (cur.ch[gi] === oi ? 'on' : '') + '">' + esc(o) + '</button>'; }).join('') + '</div></div>';
    });
    $('itemGroups').innerHTML = html;
    Array.prototype.forEach.call($('itemGroups').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        cur.ch[+b.dataset.g] = +b.dataset.o;
        cur.item.groups.forEach(function (g, i) { if (!visible(cur.item, g, cur.ch)) cur.ch[i] = -1; });
        $('itemErr').textContent = ''; renderGroups(); updateAdd();
      });
    });
  }
  function updateAdd() {
    $('qVal').textContent = cur.q;
    $('addBtn').textContent = cur.item.price ? 'Add to order · ' + money(cur.item.price * cur.q) : 'Add to order (price on WhatsApp)';
  }
  $('qMinus').addEventListener('click', function () { cur.q = Math.max(1, cur.q - 1); updateAdd(); });
  $('qPlus').addEventListener('click', function () { cur.q = Math.min(20, cur.q + 1); updateAdd(); });
  $('addBtn').addEventListener('click', function () {
    var item = cur.item;
    var miss = item.groups.filter(function (g, i) { return visible(item, g, cur.ch) && cur.ch[i] < 0; });
    if (miss.length) { $('itemErr').textContent = 'Please choose: ' + miss.map(function (g) { return g.label.replace(/^Choose /, ''); }).join(', '); return; }
    addLine(item.id, cur.ch, cur.q);
    closeModal('itemModal');
    toast('Added ' + cur.q + ' × ' + item.name);
  });

  // ---------------- cart sheet + checkout ----------------
  function renderCartBar() {
    var n = cartCount();
    $('cartBar').classList.toggle('hidden', !n || !$('done').classList.contains('hidden'));
    $('cartCount').textContent = n; $('cartTotalBar').textContent = (cartTotal() || !cartHasAsk()) ? money(cartTotal()) + (cartHasAsk() ? ' + TBC' : '') : 'Price TBC';
  }
  function renderCart() {
    if (!cart.length) {
      $('cartLines').innerHTML = '<p class="muted">Your order is empty. Tap a menu item to add it.</p>';
    } else {
      $('cartLines').innerHTML = cart.map(function (l, i) {
        var it = BY_ID[l.id], s = summary(it, l.ch), w = dayWarn(it);
        return '<div class="line"><div class="ln"><b>' + esc(it.name) + '</b>' + (s ? '<small>' + esc(s) + '</small>' : '') +
          (w ? '<small class="warn">📅 ' + esc(w) + '</small>' : '') + '<small>' + (it.price ? money(it.price) + ' each' : '💬 ' + ASK) + '</small></div>' +
          '<div class="stepper"><button type="button" data-i="' + i + '" data-d="-1" aria-label="Less">' + (l.q === 1 ? '🗑' : '−') + '</button><b>' + l.q +
          '</b><button type="button" data-i="' + i + '" data-d="1" aria-label="More">+</button></div><div class="lp">' + (it.price ? money(it.price * l.q) : 'TBC') + '</div></div>';
      }).join('');
      Array.prototype.forEach.call($('cartLines').querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          var l = cart[+b.dataset.i]; l.q += +b.dataset.d;
          if (l.q <= 0) cart.splice(+b.dataset.i, 1); else l.q = Math.min(20, l.q);
          saveCart(); renderCart();
        });
      });
    }
    $('cartTotal').textContent = (cartTotal() || !cartHasAsk()) ? money(cartTotal()) + (cartHasAsk() ? ' + box price' : '') : 'Price to confirm';
    $('checkout').classList.toggle('hidden', !cart.length);
  }
  $('cartBar').addEventListener('click', function () { renderCart(); openModal('cartModal'); });

  // WhatsApp number: default +592; 7-digit local numbers get +592; others need + and country code.
  function normPhone(raw) {
    var s = String(raw || '').trim(), plus = /^\+/.test(s), d = s.replace(/\D/g, ''), cc = C.DEFAULT_COUNTRY_CODE;
    if (!plus && /^00/.test(d)) d = d.slice(2);
    else if (!plus && d.length === 7) d = cc + d;
    if (!d || d === cc) return { err: 'Enter your WhatsApp number.' };
    if (d.indexOf(cc) === 0) { // +592 = Guyana (no other country code starts with 592)
      var loc = d.slice(cc.length);
      if (loc.length !== 7) return { err: 'Guyana numbers have 7 digits after +592 (e.g. +592 612 3456).' };
      if (!/^[2-9]/.test(loc)) return { err: 'That doesn\'t look like a Guyana number.' };
      return { digits: d, display: '+' + cc + ' ' + loc.slice(0, 3) + ' ' + loc.slice(3) };
    }
    if (!plus && d.length < 10) return { err: 'Guyana numbers have 7 digits after +592. For other countries start with + and the country code.' };
    if (d.length < 8 || d.length > 15 || d[0] === '0') return { err: 'Enter the full number with country code, e.g. +1 718 555 0123.' };
    return { digits: d, display: '+' + d };
  }
  function phoneCheck(show) {
    var r = normPhone($('cPhone').value), h = $('phoneHint');
    if (r.digits) { h.className = 'hint ok'; h.textContent = '✓ WhatsApp: ' + r.display; $('cPhone').classList.remove('bad'); }
    else if (show) { h.className = 'hint bad'; h.textContent = r.err; $('cPhone').classList.add('bad'); }
    else { h.className = 'hint'; h.textContent = 'Guyana numbers: just type the 7 digits after +592. Other countries: start with + and the country code.'; }
    return r;
  }
  $('cPhone').addEventListener('input', function () { phoneCheck(false); });
  $('cPhone').addEventListener('blur', function () { phoneCheck(true); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name=ful]'), function (r) {
    r.addEventListener('change', function () {
      var del = document.querySelector('input[name=ful]:checked').value === 'delivery';
      $('deliveryBox').classList.toggle('hidden', !del); $('pickupInfo').classList.toggle('hidden', del);
    });
  });

  ['cName', 'cPhone', 'cAddr'].forEach(function (id) {
    $(id).addEventListener('input', function () { $(id).classList.remove('bad'); $('checkoutErr').textContent = ''; });
  });

  function orderNo() {
    var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = '';
    var buf = new Uint32Array(4); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(buf) : buf.forEach(function (_, i) { buf[i] = Math.random() * 1e9; });
    for (var i = 0; i < 4; i++) r += a[buf[i] % a.length];
    return 'UT-' + gyNow().ymd + '-' + r;
  }
  var PICKUP_ADDR = '5th Street, Alberttown (between Light & Albert St), Georgetown';

  function buildOrder(o) {
    var items = o.lines.map(function (l) {
      var it = BY_ID[l.id], s = summary(it, l.ch), w = dayWarn(it);
      return '• ' + l.q + ' x ' + it.name + (s ? ' (' + s + ')' : '') + ': ' + (it.price ? money(it.price * l.q) : 'PRICE TO CONFIRM') + (w ? '\n   ↳ ' + w : '');
    }).join('\n');
    var ful = o.delivery
      ? 'Delivery to: ' + o.addr + (o.landmark ? ' (landmark: ' + o.landmark + ')' : '') + '\n+ delivery charge (confirmed on WhatsApp)'
      : 'Pickup at ' + PICKUP_ADDR;
    var receipt = [
      '*UNRULY TASTE · RECEIPT*',
      'Order: ' + o.no,
      'Date: ' + o.when,
      'Name: ' + o.name,
      '-----',
      items,
      '-----',
      '*Total: ' + (o.total || !o.ask ? money(o.total) + '*' + (o.ask ? ' + box price (confirmed on WhatsApp)' : '') : 'price to confirm*') + (o.delivery ? ' + delivery' : ''),
      ful,
      'Pay on ' + (o.delivery ? 'delivery' : 'pickup') + '.',
      '',
      'Order the same again in one tap:',
      o.reorder,
      '',
      'Thank you for choosing Unruly Taste!' + ''
    ].join('\n');
    var msg = [
      '🍗 *NEW ORDER · UNRULY TASTE*',
      'Order: *' + o.no + '*',
      'Date: ' + o.when,
      '',
      '*Customer:* ' + o.name,
      '*Customer WhatsApp:* ' + o.phone.display,
      'Chat: https://wa.me/' + o.phone.digits,
      '*Order type:* ' + (o.delivery ? 'DELIVERY' : 'PICKUP'),
      o.delivery ? 'Address: ' + o.addr + (o.landmark ? '\nLandmark: ' + o.landmark : '') : 'Pickup at ' + PICKUP_ADDR,
      o.note ? 'Note: ' + o.note : '',
      '',
      '*Items:*',
      items,
      '*Total: ' + (o.total || !o.ask ? money(o.total) + '*' + (o.ask ? ' + box price' : '') : 'PRICE TO CONFIRM*') + (o.delivery ? ' + delivery charge' : ''),
      o.ask ? '⚠️ *PRICE TO CONFIRM:* Hot Box / Wrap Box has no posted solo price. Reply to the customer with the final total.' : '',
      '',
      '===== RECEIPT FOR CUSTOMER =====',
      receipt,
      '================================',
      '',
      '👉 Send the receipt to the customer (tap, then Send):',
      waLink(o.phone.digits, receipt)
    ].filter(function (x, i, a) { return x !== '' || (a[i - 1] !== '' ); }).join('\n');
    return { receipt: receipt, message: msg, link: waLink(C.ORDER_WHATSAPP, msg) };
  }

  $('checkout').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('checkoutErr'); err.textContent = '';
    Array.prototype.forEach.call(document.querySelectorAll('.bad'), function (x) { x.classList.remove('bad'); });
    if (!cart.length) { err.textContent = 'Your order is empty.'; return; }
    var name = $('cName').value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) { $('cName').classList.add('bad'); err.textContent = 'Please enter your name.'; $('cName').focus(); return; }
    var ph = phoneCheck(true);
    if (!ph.digits) { err.textContent = 'A valid WhatsApp number is required to place your order: ' + ph.err; $('cPhone').focus(); return; }
    var delivery = document.querySelector('input[name=ful]:checked').value === 'delivery';
    var addr = $('cAddr').value.trim().replace(/\s+/g, ' ');
    if (delivery && addr.length < 5) { $('cAddr').classList.add('bad'); err.textContent = 'Please enter your delivery address.'; $('cAddr').focus(); return; }
    store('ut_cust', { name: name, phone: ph.display });
    var lines = cart.map(function (l) { return { id: l.id, ch: l.ch.slice(), q: l.q }; });
    var o = { no: orderNo(), when: gyNow().label, name: name, phone: ph, delivery: delivery, addr: addr, landmark: $('cLandmark').value.trim(),
      note: $('cNote').value.trim(), lines: lines, total: cartTotal(), ask: cartHasAsk(lines), reorder: reorderUrl(lines) };
    var built = buildOrder(o);
    var pay = (document.querySelector('input[name=pay]:checked') || {}).value || 'pay-on-pickup';
    if (C.ORDER_API) {   // Buy -> order goes straight to the shop's POS (12 Oct 2026). WhatsApp link stays as the fallback.
      var btn = $('placeBtn'); btn.disabled = true; btn.textContent = 'Placing your order…';
      fetch(C.ORDER_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        items: lines, name: name, whatsapp: ph.display, fulfilment: delivery ? 'delivery' : 'pickup', address: addr, landmark: o.landmark, note: o.note, payment: pay, site: C.SITE_URL }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
        .then(function (x) {
          btn.disabled = false; btn.textContent = 'Buy · place order';
          if (!x.r.ok || !x.j.ok) { err.innerHTML = esc(x.j.error || 'We could not place your order right now.') + (x.j.outOfStock ? '' : ' <a href="' + esc(built.link) + '" target="_blank" rel="noopener">Send it on WhatsApp instead</a>'); return; }
          var d = { placed: true, no: x.j.no, receipt: x.j.receipt || built.receipt, link: waLink(C.ORDER_WHATSAPP, 'Hi Unruly Taste, about my order ' + x.j.no), reorder: x.j.reorderUrl || o.reorder, total: x.j.total, payment: x.j.payment, test: x.j.test, confirm: x.j.confirm || null };
          try { sessionStorage.setItem('ut_done', JSON.stringify(d)); } catch (y) {}
          cart = []; saveCart(); closeModal('cartModal'); showDone(d);
        })
        .catch(function () { btn.disabled = false; btn.textContent = 'Buy · place order'; err.innerHTML = 'No connection to the shop right now. <a href="' + esc(built.link) + '" target="_blank" rel="noopener">Send it on WhatsApp instead</a>'; });
      return;
    }
    var done = { no: o.no, receipt: built.receipt, link: built.link, reorder: o.reorder };
    try { sessionStorage.setItem('ut_done', JSON.stringify(done)); } catch (x) {}
    window.__lastOrder = { order: o, message: built.message, link: built.link };   // for testing
    cart = []; saveCart();
    closeModal('cartModal');
    showDone(done);
    window.open(built.link, '_blank'); // opens WhatsApp chat with the order line, message prefilled
  });

  // ---------------- confirmation ----------------
  function showDone(d) {
    $('shop').classList.add('hidden'); $('done').classList.remove('hidden'); renderCartBar();
    $('doneNo').textContent = d.no; $('doneWa').href = d.link; $('receiptText').textContent = d.receipt;
    $('doneTitle').textContent = d.placed ? 'Thank you! Your order is placed' : 'Almost done: send it in WhatsApp';
    $('doneMsg').innerHTML = d.placed ? 'Your order number is <b>' + esc(d.no) + '</b>. The kitchen has it now. ' + esc(d.payment || 'Pay on pickup') + '. Show this number when you collect.' + (d.test ? ' <b>(TEST order)</b>' : '')
      : 'Your order <b>' + esc(d.no) + '</b> is ready in WhatsApp. <b>Tap Send</b> there to place it.';
    $('doneWa').textContent = d.placed ? 'Questions? Message us on WhatsApp' : 'Open WhatsApp & send order';
    if (d.placed && d.confirm && d.confirm.link) {   // Confirm on WhatsApp: the customer sends the code; then the receipt comes to that number
      $('doneWa').href = d.confirm.link; $('doneWa').textContent = '📲 Confirm on WhatsApp to get your receipt';
      $('doneMsg').innerHTML += '<br><small>Tap the green button and press <b>Send</b> in WhatsApp (code ' + esc(d.confirm.code) + '). We then send your receipt to that WhatsApp number.</small>';
    }
    $('copyReceipt').onclick = function () { copy(d.receipt, 'Receipt copied'); };
    $('copyReorder').onclick = function () { copy(d.reorder, 'Reorder link copied'); };
    $('saveReceipt').onclick = function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([d.receipt.replace(/\*/g, '')], { type: 'text/plain' }));
      a.download = 'Unruly-Taste-receipt-' + d.no + '.txt'; document.body.appendChild(a); a.click(); a.remove();
      toast('Receipt saved');
    };
    if (navigator.share) {
      $('shareReceipt').classList.remove('hidden');
      $('shareReceipt').onclick = function () { navigator.share({ title: 'Unruly Taste receipt ' + d.no, text: d.receipt }).catch(function () {}); };
    }
    window.scrollTo(0, 0);
  }
  function copy(text, ok) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(ok); }, function () {
      var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); toast(ok); } catch (e) { toast('Copy failed: press and hold to copy'); } t.remove();
    });
  }
  $('newOrder').addEventListener('click', function () {
    try { sessionStorage.removeItem('ut_done'); } catch (x) {}
    $('done').classList.add('hidden'); $('shop').classList.remove('hidden'); renderCartBar(); window.scrollTo(0, 0);
  });

  // ---------------- tabs (scroll + highlight) ----------------
  var tabs = Array.prototype.slice.call(document.querySelectorAll('#tabs button'));
  tabs.forEach(function (b) { b.addEventListener('click', function () { document.getElementById('sec-' + b.dataset.sec).scrollIntoView({ behavior: 'smooth' }); }); });
  function spy() {
    var on = SECTIONS[0].id;
    SECTIONS.forEach(function (s) { var el = document.getElementById('sec-' + s.id); if (el && el.getBoundingClientRect().top < 160) on = s.id; });
    tabs.forEach(function (b) { b.classList.toggle('on', b.dataset.sec === on); });
  }
  window.addEventListener('scroll', spy, { passive: true });

  // ---------------- init ----------------
  $('callBtn').href = 'tel:+' + C.ORDER_WHATSAPP;
  $('waBtn').href = waLink(C.ORDER_WHATSAPP, 'Hi Unruly Taste! I have a question about an order.');
  var cust = store('ut_cust');
  if (cust) { $('cName').value = cust.name || ''; $('cPhone').value = cust.phone || '+592 '; }
  renderMenu();
  // Extra payment methods (e.g. MMG) appear ONLY when the shop server reports them enabled. Today: none, cash only.
  if (C.ORDER_API) fetch(C.ORDER_API.replace(/\/order$/, '/payment-methods'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(function (r) { return r.json(); }).then(function (j) {
      (j.methods || []).filter(function (m) { return m.id !== 'pay-on-pickup' && m.id !== 'cash'; }).forEach(function (m) {
        var l = document.createElement('label'); l.innerHTML = '<input type="radio" name="pay" value="' + esc(m.id) + '"> ' + esc(m.label); $('payBox').appendChild(l);
      });
    }).catch(function () {});

  var params = new URLSearchParams(location.search);
  if (params.has('reorder')) {
    var lines = decodeCart(params.get('reorder'));
    history.replaceState(null, '', location.pathname + location.hash);
    if (lines.length) {
      cart = lines; saveCart();
      try { sessionStorage.removeItem('ut_done'); } catch (x) {}
      renderCart(); openModal('cartModal');
      toast('Welcome back! Your last order is in the cart.');
    } else toast('That reorder link has expired items. Please pick again.');
  }
  var saved = null; try { saved = JSON.parse(sessionStorage.getItem('ut_done') || 'null'); } catch (x) {}
  if (saved && !params.has('reorder')) showDone(saved);
  renderCartBar();

  // expose for testing
  window.UT = { normPhone: normPhone, encodeCart: encodeCart, decodeCart: decodeCart, cart: function () { return cart; } };
})();
