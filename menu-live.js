/* Live menu (12 Oct 2026): ask the shop server for the current menu (owner prices, on/off, products added in POS Admin).
   If it does not answer within 3 s, or answers badly, the static menu.js already loaded stays in use. Then start the page. */
(function () {
  var C = window.UT_CONFIG || {}, done = false;
  var api = String(C.ORDER_API || '').replace(/\/order$/, '') || String(C.ASSISTANT_API || '').replace(/\/$/, '');
  function start() {
    if (done) return; done = true;
    ['app.js?v=20261012f', 'assistant.js'].forEach(function (src) { var s = document.createElement('script'); s.src = src; s.async = false; document.body.appendChild(s); });
  }
  if (!api || !window.fetch) return start();
  setTimeout(start, 3000);
  fetch(api + '/menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var m = j && j.menu;
      if (!done && m && Array.isArray(m.items) && m.items.length && m.lists && m.sections) { m.business = m.business || (window.UT_MENU && window.UT_MENU.business); window.UT_MENU = m; }
      start();
    }).catch(start);
})();
