/* Unruly Taste · printable receipt layout (added 8 Oct 2026).
 * ONE file, two places: the POS page loads it as window.UTReceipt; the bot on PC01 uses an identical copy as
 * lib/receipt-format.js (print-queue text). No business phone or keys in here: the phone comes from POS settings.
 *
 *   UTReceipt.model(order, opt)   -> plain object (what goes on the receipt)
 *   UTReceipt.text(order, opt)    -> plain ASCII text, 32 cols (58 mm) or 48 cols (80 mm)
 *   UTReceipt.escpos(order, opt)  -> ESC/POS-ready line list [{t, a:'l'|'c'|'r', b, big}] + {qr} + {cut}
 *   UTReceipt.escposBytes(lines, cols) -> Uint8Array with ESC/POS commands (for a future printer driver; not used yet)
 *   UTReceipt.html(order, opt)    -> HTML for the on-screen preview / browser print (class rc-58 / rc-80)
 *
 * order = POS order view: { no, source, botSource, createdAt, name, number (already masked), fulfilment, address, note,
 *   lines:[{id,name,qty,choices,unitPrice,lineTotal,manualPrice}], total, tbc, cash:{tendered,change}, test, reorder }
 * opt = { width: 58|80, business:{name, address, phone}, showPhone, siteUrl, items:{id:{day, dayName}}, logo, qrSvg(url) }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UTReceipt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const COLS = { 58: 32, 80: 48 };          // characters per line, printer font A
  const TZ = 'America/Guyana';
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const money = (n) => 'G$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // thermal printers: plain ASCII only (code page safe)
  const ascii = (s) => String(s == null ? '' : s).replace(/[×✕]/g, 'x').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/\s{2,}/g, ' ').trim();
  const maskNo = (n) => { n = String(n || ''); if (!n) return ''; if (n.includes('*')) return n; const d = n.replace(/\D/g, ''); return d.length >= 4 ? '***' + d.slice(-4) : ''; };
  const when = (iso) => {
    const d = new Date(iso || Date.now());
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    const t = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d);
    return date + ', ' + t + ' GYT';
  };
  const weekday = (iso) => WD[new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date(iso || Date.now()))];
  function sourceLabel(o) {
    if (o.source === 'walk-in') return 'Walk-in (counter)';
    if (o.botSource === 'web-chat') return 'Website chat';
    if (o.botSource === 'web-voice') return 'Website voice call';
    if (o.source === 'web') return 'Website';
    return 'WhatsApp call';
  }

  function model(o, opt) {
    opt = opt || {};
    const b = opt.business || {}, items = opt.items || {};
    const wd = weekday(o.createdAt);
    const lines = (o.lines || []).map(l => {
      const it = items[l.id] || {};
      let day = '';
      if (it.day != null && it.dayName) day = wd === it.day ? it.dayName + ' special' : it.dayName + 's only: pre-order for ' + it.dayName;
      return { qty: Number(l.qty) || 1, name: l.name, choices: l.choices || '', unit: l.unitPrice, total: l.lineTotal, manual: !!l.manualPrice, day };
    });
    const total = lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
    return {
      shop: b.name || 'Unruly Taste', address: b.address || '', phone: opt.showPhone && b.phone ? b.phone : '',
      test: !!o.test, no: o.no, source: sourceLabel(o), when: when(o.createdAt),
      fulfilment: o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup', deliveryTo: o.fulfilment === 'delivery' ? (o.address || '') : '',
      customer: o.name || '', number: maskNo(o.number || o.phone),
      lines, total, tbc: lines.some(l => l.total == null),
      cash: o.source === 'walk-in' && o.cash ? { tendered: o.cash.tendered, change: o.cash.change } : null,
      payment: o.source === 'walk-in' ? 'Paid cash' : 'Cash on ' + (o.fulfilment === 'delivery' ? 'delivery' : 'pickup'),
      note: o.note || '', reorder: o.reorder || '', site: opt.siteUrl || '', thanks: 'Thank you for choosing Unruly Taste!'
    };
  }

  // ---------- text / ESC-POS lines ----------
  function wrap(s, w) {
    const out = []; let cur = '';
    for (const word of String(s).split(' ')) {
      if (!word) continue;
      if (word.length > w) { if (cur) { out.push(cur); cur = ''; } for (let i = 0; i < word.length; i += w) out.push(word.slice(i, i + w)); const last = out.pop(); cur = last; continue; }
      if (!cur) cur = word; else if (cur.length + 1 + word.length <= w) cur += ' ' + word; else { out.push(cur); cur = word; }
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }
  const lr = (l, r, w) => { const left = wrap(l, Math.max(8, w - r.length - 1)); const first = left[0] + ' '.repeat(Math.max(1, w - left[0].length - r.length)) + r; return [first].concat(left.slice(1).map(x => '    ' + x)); };
  function escpos(o, opt) {
    const m = model(o, opt), w = COLS[(opt && opt.width) === 58 ? 58 : 80], L = [];
    const add = (t, a, x) => {   // t is laid out already; long lines (centred text) are wrapped to the paper width
      t = String(t).replace(/[^\x20-\x7e]/g, '');
      (t.length > w ? wrap(t.trim(), w) : [t]).forEach(s => L.push(Object.assign({ t: s, a: a || 'l' }, x || {})));
    };
    const rule = (ch) => add((ch || '-').repeat(w));
    add(ascii(m.shop).toUpperCase(), 'c', { b: true, big: true });
    if (m.address) wrap(ascii(m.address), w).forEach(s => add(s, 'c'));
    if (m.phone) add('Tel ' + ascii(m.phone), 'c');
    rule('=');
    if (m.test) add('** TEST - NOT A REAL SALE **', 'c', { b: true });
    add('Order: ' + ascii(m.no), 'l', { b: true });
    add('Source: ' + m.source);
    add('Date: ' + m.when);
    add(m.fulfilment + (m.deliveryTo ? ': ' + ascii(m.deliveryTo) : ''));
    if (m.customer || m.number) add('Customer: ' + ascii([m.customer, m.number].filter(Boolean).join(' ')));
    rule();
    for (const l of m.lines) {
      lr(ascii(l.qty + ' x ' + l.name), l.total == null ? 'TBC' : ascii(money(l.total)), w).forEach(s => add(s));
      const sub = [];
      if (l.choices) sub.push(...wrap(ascii(l.choices), w - 4));
      if (l.qty > 1 && l.unit != null) sub.push('@ ' + money(l.unit) + ' each');
      if (l.manual) sub.push('Price set at counter: ' + money(l.unit));
      if (l.total == null) sub.push('Price to confirm');
      if (l.day) sub.push('* ' + l.day);
      sub.forEach(s => wrap(ascii(s), w - 4).forEach(x => add('    ' + x)));
    }
    rule();
    lr('TOTAL', money(m.total) + (m.tbc ? ' + TBC' : ''), w).forEach(s => add(s, 'l', { b: true }));
    if (m.cash) { add(lr('Cash', money(m.cash.tendered), w)[0]); add(lr('Change', money(m.cash.change), w)[0]); }
    add(m.payment + ' - cash only');
    if (m.note) { rule(); wrap(ascii('Note: ' + m.note), w).forEach(s => add(s)); }
    rule();
    const link = m.reorder || m.site;
    if (link) { add(m.reorder ? 'Order the same again:' : 'Order online:', 'c'); wrap(ascii(link), w).forEach(s => add(s, 'c')); L.push({ qr: link }); }
    add(m.thanks, 'c', { b: true });   // wrapped by add() on 58 mm
    if (m.test) add('(test receipt)', 'c');
    L.push({ cut: true });
    return L;
  }
  function text(o, opt) {
    const w = COLS[(opt && opt.width) === 58 ? 58 : 80];
    return escpos(o, opt).filter(x => x.t != null).map(x => {
      if (x.a === 'c') { const pad = Math.max(0, Math.floor((w - x.t.length) / 2)); return ' '.repeat(pad) + x.t; }
      if (x.a === 'r') return ' '.repeat(Math.max(0, w - x.t.length)) + x.t;
      return x.t;
    }).join('\n') + '\n';
  }
  // Raw ESC/POS bytes for a future driver (ESC @ init, ESC a align, ESC E bold, GS ! size, GS ( k QR, GS V cut).
  function escposBytes(lines) {
    const out = [0x1b, 0x40];
    const str = (s) => { for (const c of String(s)) out.push(c.charCodeAt(0) & 0x7f); };
    for (const x of lines) {
      if (x.cut) { out.push(0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00); continue; }
      if (x.qr) {
        const d = Array.from(String(x.qr)).map(c => c.charCodeAt(0) & 0x7f), n = d.length + 3;
        out.push(0x1b, 0x61, 1, 0x1d, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00, 0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x43, 5, 0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31,
          0x1d, 0x28, 0x6b, n & 0xff, n >> 8, 0x31, 0x50, 0x30, ...d, 0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30, 0x0a);
        continue;
      }
      out.push(0x1b, 0x61, x.a === 'c' ? 1 : x.a === 'r' ? 2 : 0, 0x1b, 0x45, x.b ? 1 : 0, 0x1d, 0x21, x.big ? 0x11 : 0x00);
      str(x.t); out.push(0x0a);
    }
    out.push(0x1b, 0x61, 0, 0x1b, 0x45, 0, 0x1d, 0x21, 0);
    return Uint8Array.from(out);
  }

  // ---------- HTML (preview + browser print) ----------
  function html(o, opt) {
    opt = opt || {};
    const m = model(o, opt), w = opt.width === 58 ? 58 : 80;
    const link = m.reorder || m.site;
    let h = '<div class="rc rc-' + w + '">';
    if (opt.logo) h += '<img class="rc-logo" src="' + esc(opt.logo) + '" alt="">';
    h += '<div class="rc-shop">' + esc(m.shop) + '</div>' + (m.address ? '<div class="rc-c rc-s">' + esc(m.address) + '</div>' : '') + (m.phone ? '<div class="rc-c rc-s">Tel ' + esc(m.phone) + '</div>' : '');
    h += '<hr class="rc-hr2">' + (m.test ? '<div class="rc-test">TEST ORDER · not a real sale</div>' : '');
    h += '<div class="rc-row"><b>Order</b><b>' + esc(m.no) + '</b></div><div class="rc-row"><span>Source</span><span>' + esc(m.source) + '</span></div>' +
      '<div class="rc-row"><span>Date</span><span>' + esc(m.when) + '</span></div><div class="rc-row"><span>' + esc(m.fulfilment) + '</span><span>' + esc(m.deliveryTo) + '</span></div>' +
      (m.customer || m.number ? '<div class="rc-row"><span>Customer</span><span>' + esc([m.customer, m.number].filter(Boolean).join(' · ')) + '</span></div>' : '') + '<hr>';
    for (const l of m.lines) {
      h += '<div class="rc-item"><div class="rc-row"><span><b>' + l.qty + '×</b> ' + esc(l.name) + '</span><b>' + (l.total == null ? 'TBC' : money(l.total)) + '</b></div>' +
        (l.choices ? '<div class="rc-sub">' + esc(l.choices) + '</div>' : '') +
        (l.qty > 1 && l.unit != null ? '<div class="rc-sub">@ ' + money(l.unit) + ' each</div>' : '') +
        (l.manual ? '<div class="rc-sub">Price set at counter: ' + money(l.unit) + '</div>' : '') +
        (l.total == null ? '<div class="rc-sub">Price to confirm</div>' : '') +
        (l.day ? '<div class="rc-sub rc-day">📅 ' + esc(l.day) + '</div>' : '') + '</div>';
    }
    h += '<hr><div class="rc-row rc-total"><span>TOTAL</span><span>' + money(m.total) + (m.tbc ? ' + TBC' : '') + '</span></div>';
    if (m.cash) h += '<div class="rc-row"><span>Cash</span><span>' + money(m.cash.tendered) + '</span></div><div class="rc-row"><span>Change</span><span>' + money(m.cash.change) + '</span></div>';
    h += '<div class="rc-s">' + esc(m.payment) + ' · cash only</div>';
    if (m.note) h += '<hr><div class="rc-s">Note: ' + esc(m.note) + '</div>';
    h += '<hr>';
    if (link) {
      h += '<div class="rc-c rc-s">' + (m.reorder ? 'Order the same again:' : 'Order online:') + '</div>';
      const svg = typeof opt.qrSvg === 'function' ? opt.qrSvg(link) : '';
      if (svg) h += '<div class="rc-qr">' + svg + '</div>';
      h += '<div class="rc-c rc-link">' + esc(link) + '</div>';
    }
    h += '<div class="rc-thanks">' + esc(m.thanks) + '</div>' + (m.test ? '<div class="rc-c rc-s">(test receipt)</div>' : '') + '</div>';
    return h;
  }

  return { COLS, model, text, escpos, escposBytes, html, ascii, maskNo };
});
