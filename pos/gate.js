/* Unruly POS app-only gate. Off unless UT_CONFIG.REQUIRE_APP === true (config.js).
 * Allowed: Unruly POS Android app (user agent contains "UnrulyPOS/" or the UnrulyAndroid JS bridge exists), the Windows wrapper
 * once it sends the same marker, and (future) a browser holding an owner-issued device pass.
 * This only hides the page from casual browsing. It is NOT security: a user agent is trivial to fake. The PINs, rate limiting and
 * the server API are the real protection. */
(function () {
  'use strict';
  var cfg = window.UT_CONFIG || {};
  if (cfg.REQUIRE_APP !== true) return;
  var inApp = false;
  try { inApp = !!window.UnrulyAndroid || /UnrulyPOS\//.test(navigator.userAgent || ''); } catch (e) {}
  if (!inApp) { try { inApp = !!localStorage.getItem('ut_device_pass'); } catch (e) {} } // future: browser device pass (server must verify it)
  if (inApp) return;
  window.UT_BLOCKED = true;
  document.open();
  document.write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Unruly POS</title><body style="margin:0;background:#111;color:#fff;font:18px system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center"><div><h1 style="font-size:1.5rem">Open this in the Unruly POS app</h1><p style="color:#bbb">This page is for the Unruly POS app only.</p></div></body>');
  document.close();
})();