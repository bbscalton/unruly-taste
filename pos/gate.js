/* Unruly POS client check + browser-access (loaded first on pos/ and pos/admin/).
 * The Unruly POS app (Android UA marker "UnrulyPOS/x" or the UnrulyAndroid bridge) is the POS and needs nothing here.
 * A normal browser needs a SEPARATE browser-access password (owner creates it in POS Admin > Browser access), exchanged once
 * for a revocable per-browser token kept in this browser. A staff/owner PIN login alone is never enough for a browser.
 * - UT_CONFIG.REQUIRE_APP === true: a browser without a token sees 'Open this in the Unruly POS app' + a password field.
 * - REQUIRE_APP false (default): nothing changes unless the server refuses (403 BROWSER_ACCESS, server switch on): then the same screen shows.
 * The token is sent in the JSON body ("bat"). The REAL enforcement is on the server; this page only hides/guides.
 * Windows wrapper 2.0.4 sends no marker: until it does, give it the password once (it keeps the token) or leave the server in log-only mode. */
(function () {
  'use strict';
  var cfg = window.UT_CONFIG || {}, KEY = 'ut_browser_token';
  var inApp = false;
  try { inApp = !!window.UnrulyAndroid || /UnrulyPOS\//.test(navigator.userAgent || ''); } catch (e) {}
  if (inApp) return;
  function tok() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  var API = String(cfg.ASSISTANT_API || '').replace(/\/$/, '') + '/pos/';
  function screen(msg) {
    window.UT_BLOCKED = true;
    document.open();
    document.write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Unruly POS</title>' +
      '<body style="margin:0;background:#111;color:#fff;font:18px system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center"><form id="f" style="max-width:340px;padding:16px"><h1 style="font-size:1.5rem">Open this in the Unruly POS app</h1>' +
      '<p style="color:#bbb">This page is for the Unruly POS app. To use it in a browser, enter the browser-access password from the owner (this is not a PIN).</p>' +
      '<input id="p" type="password" autocomplete="off" placeholder="Browser-access password" style="width:100%;box-sizing:border-box;padding:12px;font-size:1rem;border-radius:8px;border:0;margin:8px 0"><button style="padding:12px 20px;font-size:1rem;border-radius:8px;border:0">Continue</button><p id="e" style="color:#ff8a80">' + (msg || '') + '</p></form></body>');
    document.close();
    document.getElementById('f').onsubmit = function (ev) {
      ev.preventDefault();
      var e = document.getElementById('e'); e.textContent = '';
      fetch(API + 'browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'redeem', password: document.getElementById('p').value }) })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) { if (j && j.token) { try { localStorage.setItem(KEY, j.token); } catch (x) {} location.reload(); } else e.textContent = (j && j.error) || 'Could not check the password.'; })
        .catch(function () { e.textContent = 'No connection.'; });
    };
  }
  // Add the browser token to POS API calls; show the screen if the server refuses this browser.
  var of = window.fetch;
  window.fetch = function (url, opts) {
    try {
      if (String(url).indexOf('/pos/') >= 0 && opts && typeof opts.body === 'string' && tok() && String(url).indexOf('/pos/browser') < 0) {
        var b = JSON.parse(opts.body); b.bat = tok(); opts = Object.assign({}, opts, { body: JSON.stringify(b) });
      }
    } catch (e) {}
    return of.call(this, url, opts).then(function (r) {
      if (r.status === 403 && String(url).indexOf('/pos/') >= 0) {
        r.clone().json().then(function (j) { if (j && j.code === 'BROWSER_ACCESS') { try { localStorage.removeItem(KEY); } catch (x) {} screen('Browser access is required.'); } }).catch(function () {});
      }
      return r;
    });
  };
  if (cfg.REQUIRE_APP === true && !tok()) screen('');
})();