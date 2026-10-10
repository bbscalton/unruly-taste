/* Unruly Taste: in-page AI order assistant behind the two header buttons.
 *  - "Call"     -> voice order with the AI (voice "Ara"): mic, live captions, end button.
 *  - "WhatsApp" -> text chat with the AI (bubbles, typing indicator, input box).
 * Same brain/menu/flow as the Unruly Taste phone bot. Backend: C.ASSISTANT_API (no keys in this page).
 * Completed orders are saved by the bot and alerted to the shop's WhatsApp. */
(function () {
  'use strict';
  var C = window.UT_CONFIG || {};
  var API = (C.ASSISTANT_API || '').replace(/\/$/, '');
  var callBtn = document.getElementById('callBtn'), waBtn = document.getElementById('waBtn');
  if (!API || !callBtn || !waBtn) return;
  var fallbackCall = callBtn.getAttribute('href'), fallbackWa = waBtn.getAttribute('href');

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function post(path, body, sid) {
    return fetch(API + path + (sid ? '?sid=' + encodeURIComponent(sid) : ''), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), credentials: 'omit', mode: 'cors'
    });
  }
  function errText(r, j) { return (j && j.error) || (r.status === 429 ? 'Please wait a moment and try again.' : 'The order assistant is not reachable right now.'); }

  // ---------------- sheet (shared shell) ----------------
  var sheet = el('div', 'ai-sheet hidden'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML =
    '<div class="ai-panel">' +
      '<div class="ai-head"><div class="ai-av" aria-hidden="true">UT</div><div class="ai-ttl"><b id="aiTitle">Unruly Taste</b><span id="aiSub">AI order assistant</span></div>' +
      '<button type="button" class="ai-x" id="aiClose" aria-label="Close">✕</button></div>' +
      '<div class="ai-body" id="aiBody"></div>' +
      '<form class="ai-input hidden" id="aiForm" autocomplete="off"><input id="aiText" type="text" maxlength="400" placeholder="Type a message" aria-label="Message">' +
      '<button type="submit" id="aiSend" aria-label="Send">➤</button></form>' +
      '<div class="ai-voice hidden" id="aiVoice"><div class="ai-status" id="aiStatus">Tap the mic to start</div>' +
      '<button type="button" class="ai-mic" id="aiMic" aria-label="Start talking"><span class="ai-mic-ico">🎤</span></button>' +
      '<button type="button" class="ai-end" id="aiEnd">End call</button></div>' +
      '<p class="ai-foot">AI assistant · orders are confirmed by Unruly Taste on WhatsApp · pay on pickup/delivery</p>' +
    '</div>';
  document.body.appendChild(sheet);
  var $ = function (id) { return document.getElementById(id); };
  var body = $('aiBody'), form = $('aiForm'), input = $('aiText');
  var S = null; // current session state

  function openSheet(mode) {
    closeSession(true);
    S = { mode: mode, sid: '', ended: false, busy: false, gen: Math.random() };
    body.innerHTML = '';
    sheet.classList.remove('hidden'); document.body.classList.add('ai-open');
    $('aiTitle').textContent = mode === 'voice' ? 'Call Unruly Taste' : 'Unruly Taste';
    $('aiSub').textContent = mode === 'voice' ? 'AI voice order · Ara' : 'AI order assistant · usually replies instantly';
    form.classList.toggle('hidden', mode !== 'chat'); $('aiVoice').classList.toggle('hidden', mode !== 'voice');
    sheet.classList.toggle('voice', mode === 'voice');
    if (mode === 'chat') startChat(); else voiceReady();
  }
  function closeSession(silent) {
    if (!S) return;
    var s = S; S = null;
    stopVoice();
    if (s.sid && !s.ended) post('/end', { sid: s.sid }, s.sid).catch(function () {});
    if (!silent) { sheet.classList.add('hidden'); document.body.classList.remove('ai-open'); }
  }
  $('aiClose').addEventListener('click', function () { closeSession(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S) closeSession(false); });

  function addMsg(who, text, extra) {
    var row = el('div', 'ai-row ' + who + (extra ? ' ' + extra : ''));
    var b = el('div', 'ai-bub'); b.textContent = text; row.appendChild(b);
    body.appendChild(row); body.scrollTop = body.scrollHeight; return b;
  }
  function addNote(text, link) {
    var n = el('div', 'ai-note', text);
    if (link) { var a = el('a', '', link.text); a.href = link.href; if (link.blank) { a.target = '_blank'; a.rel = 'noopener'; } n.appendChild(document.createTextNode(' ')); n.appendChild(a); }
    body.appendChild(n); body.scrollTop = body.scrollHeight;
  }
  function addOrderCard(o) {
    var c = el('div', 'ai-order');
    c.appendChild(el('b', '', '✅ Order sent · ' + o.no));
    c.appendChild(el('span', '', 'Unruly Taste will confirm it with you on WhatsApp.'));
    body.appendChild(c); body.scrollTop = body.scrollHeight;
  }
  function typing(on) {
    var t = $('aiTyping');
    if (on && !t) { t = el('div', 'ai-row bot'); t.id = 'aiTyping'; t.innerHTML = '<div class="ai-bub ai-dots"><i></i><i></i><i></i></div>'; body.appendChild(t); body.scrollTop = body.scrollHeight; }
    if (!on && t) t.remove();
  }
  function ended(msg) {
    if (!S) return;
    S.ended = true; input.disabled = true; $('aiSend').disabled = true;
    addNote(msg || 'Chat ended.');
    var again = el('button', 'ai-again', S.mode === 'voice' ? 'Start a new call' : 'Start a new chat'); var m = S.mode;
    again.type = 'button'; again.addEventListener('click', function () { openSheet(m); });
    body.appendChild(again); body.scrollTop = body.scrollHeight;
  }

  // ---------------- text chat ----------------
  function startChat() {
    var s = S; input.disabled = false; $('aiSend').disabled = false; input.value = '';
    typing(true);
    post('/session', { mode: 'chat' }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (S !== s) return; typing(false);
        if (!x.r.ok || !x.j.sid) { addNote(errText(x.r, x.j), { text: 'Message us on WhatsApp instead', href: fallbackWa, blank: true }); input.disabled = true; return; }
        s.sid = x.j.sid; if (x.j.maxMessageChars) input.maxLength = x.j.maxMessageChars;
        addMsg('bot', x.j.greeting);
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
      }).catch(function () { if (S !== s) return; typing(false); addNote('The order assistant is not reachable right now.', { text: 'Message us on WhatsApp instead', href: fallbackWa, blank: true }); input.disabled = true; });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var s = S; if (!s || s.mode !== 'chat' || !s.sid || s.ended || s.busy) return;
    var text = input.value.trim(); if (!text) return;
    input.value = ''; addMsg('me', text); s.busy = true; $('aiSend').disabled = true; typing(true);
    post('/chat', { sid: s.sid, message: text }, s.sid).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (S !== s) return; typing(false); s.busy = false; $('aiSend').disabled = false;
        if (!x.r.ok) { if (x.j.ended || x.r.status === 410) return ended(x.j.error); addNote(errText(x.r, x.j)); return; }
        if (x.j.reply) addMsg('bot', x.j.reply);
        if (x.j.order) addOrderCard(x.j.order);
        if (x.j.endCall) return ended('Chat ended. Thanks!');
        try { input.focus(); } catch (e2) {}
      }).catch(function () { if (S !== s) return; typing(false); s.busy = false; $('aiSend').disabled = false; addNote('Network problem. Please try again.'); });
  });

  // ---------------- voice ----------------
  var V = null; // audio state
  var RATE = 16000, CHUNK = 4000;
  function status(t, cls) { var s = $('aiStatus'); s.textContent = t; $('aiVoice').className = 'ai-voice' + (cls ? ' ' + cls : ''); }
  function voiceReady() {
    status('Tap the mic to start your call');
    addNote('Talk to our AI order-taker like a phone call. It will ask what you want, your name, WhatsApp number and pickup or delivery. Tap the mic to start; allow the microphone when asked.');
    $('aiMic').setAttribute('aria-label', 'Start call');
  }
  function toPcm16k(f32, inRate) {
    var ratio = inRate / RATE, n = Math.floor(f32.length / ratio), out = new Int16Array(n);
    for (var i = 0; i < n; i++) {
      var a = Math.floor(i * ratio), b = Math.min(f32.length, Math.floor((i + 1) * ratio)), sum = 0, c = 0;
      for (var k = a; k < b; k++) { sum += f32[k]; c++; }
      var v = c ? sum / c : 0; v = Math.max(-1, Math.min(1, v)); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return out;
  }
  function stopVoice() {
    if (!V) return;
    var v = V; V = null;
    try { v.proc && v.proc.disconnect(); v.src && v.src.disconnect(); } catch (e) {}
    try { v.stream && v.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { v.player && v.player.stop(); } catch (e) {}
    try { v.ctx && v.ctx.close(); } catch (e) {}
    if (v.turn && v.sid) post('/voice/cancel', { sid: v.sid, turn: v.turn }, v.sid).catch(function () {});
  }
  function playWav(buf) {
    return new Promise(function (resolve) {
      if (!V) return resolve();
      var v = V;
      v.ctx.decodeAudioData(buf.slice(0), function (ab) {
        if (V !== v) return resolve();
        var src = v.ctx.createBufferSource(); src.buffer = ab; src.connect(v.ctx.destination);
        v.player = src; src.onended = function () { v.player = null; resolve(); }; src.start();
      }, function () { resolve(); });
    });
  }
  function fetchTts(text) {
    var v = V; if (!v) return Promise.resolve(null);
    return post('/tts', { sid: v.sid, text: text }, v.sid).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).catch(function () { return null; });
  }
  // speak a list of sentences in order, prefetching the next while the current plays
  function Speaker() {
    var q = [], playing = false, doneCb = null, closed = false;
    function pump() {
      if (playing) return;
      if (!q.length) { if (closed && doneCb) { var d = doneCb; doneCb = null; d(); } return; }
      playing = true; var item = q.shift();
      item.audio.then(function (buf) { return buf && V ? playWav(buf) : null; }).then(function () { playing = false; pump(); });
    }
    return {
      say: function (text) { q.push({ text: text, audio: fetchTts(text) }); pump(); },
      close: function (cb) { closed = true; doneCb = cb; pump(); }
    };
  }
  function caption(who, text) { return addMsg(who === 'me' ? 'me' : 'bot', text, 'cap'); }

  function startVoice() {
    var s = S; if (!s || s.mode !== 'voice' || V) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { addNote('This browser cannot use the microphone. Try the WhatsApp chat instead.'); return; }
    var Ctx = window.AudioContext || window.webkitAudioContext;
    V = { ctx: new Ctx(), sid: '', state: 'starting', frames: [], pend: [], pre: [], turn: '', noise: 0.004, speech: 0, silence: 0, sent: 0 };
    var v = V; v.ctx.resume && v.ctx.resume();
    status('Starting…', 'busy');
    Promise.all([
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }),
      post('/session', { mode: 'voice' }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.sid) throw new Error(errText(r, j)); return j; }); })
    ]).then(function (res) {
      if (V !== v || S !== s) { res[0].getTracks().forEach(function (t) { t.stop(); }); return; }
      v.stream = res[0]; v.sid = s.sid = res[1].sid; v.silenceMs = res[1].silenceMs || 900; v.maxTurn = (res[1].maxTurnSeconds || 25) * 1000;
      v.src = v.ctx.createMediaStreamSource(v.stream);
      v.proc = v.ctx.createScriptProcessor(2048, 1, 1);
      v.proc.onaudioprocess = function (e) { onAudio(v, e.inputBuffer.getChannelData(0)); };
      v.src.connect(v.proc); v.proc.connect(v.ctx.destination);
      $('aiMic').setAttribute('aria-label', 'Stop talking');
      v.state = 'speaking'; status('Ara is talking…', 'speak');
      caption('bot', res[1].greeting);
      var sp = Speaker(); sp.say(res[1].greeting); sp.close(function () { listen(v); });
    }).catch(function (err) {
      if (V !== v) return; stopVoice();
      var msg = (err && err.name === 'NotAllowedError') ? 'Microphone permission was blocked. Allow the mic for this site, or use the WhatsApp chat instead.' : ((err && err.message) || 'Could not start the call.');
      status('Tap the mic to try again'); addNote(msg);
    });
  }
  function listen(v) {
    if (V !== v) return;
    v.state = 'listening'; v.turn = ''; v.speech = 0; v.silence = 0; v.frames = []; v.pre = []; v.sent = 0; v.turnStart = 0;
    status('Listening… speak now', 'listen');
  }
  function onAudio(v, f32) {
    if (V !== v || (v.state !== 'listening' && v.state !== 'recording')) return;
    var sum = 0; for (var i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
    var rms = Math.sqrt(sum / f32.length), ms = f32.length / v.ctx.sampleRate * 1000;
    var th = Math.max(0.012, v.noise * 3);
    var pcm = toPcm16k(f32, v.ctx.sampleRate);
    if (v.state === 'listening') {
      if (rms < th) { v.noise = v.noise * 0.95 + rms * 0.05; v.pre.push(pcm); if (v.pre.length > 6) v.pre.shift(); v.speech = 0; return; }
      v.speech += ms; v.pre.push(pcm);
      if (v.speech < 120) return;
      v.state = 'recording'; v.turn = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); v.turnStart = Date.now();
      status('Listening… (tap the mic when you finish)', 'rec');
      v.pend = v.pre.slice(); v.pre = []; v.silence = 0; v.bubble = caption('me', '…');
      flush(v, false); return;
    }
    v.pend.push(pcm);
    if (rms < th) v.silence += ms; else v.silence = 0;
    flush(v, false);
    if (v.silence >= v.silenceMs || Date.now() - v.turnStart > v.maxTurn) endTurn(v);
  }
  function flush(v, all) {
    var len = 0; v.pend.forEach(function (p) { len += p.length; });
    if (!len || (!all && len < CHUNK)) return Promise.resolve();
    var out = new Int16Array(len), o = 0; v.pend.forEach(function (p) { out.set(p, o); o += p.length; }); v.pend = [];
    var turn = v.turn;
    v.chain = (v.chain || Promise.resolve()).then(function () {
      if (V !== v || v.turn !== turn) return;
      return fetch(API + '/voice/chunk?sid=' + v.sid + '&turn=' + turn, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: out.buffer, credentials: 'omit' })
        .then(function (r) { if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { if (j.ended) { v.fatal = j.error; } else if (j.stop) v.stopTurn = true; }); })
        .catch(function () {});
    });
    return v.chain;
  }
  function endTurn(v) {
    if (V !== v || v.state !== 'recording') return;
    v.state = 'thinking'; status('Thinking…', 'busy');
    var turn = v.turn, bubble = v.bubble;
    flush(v, true).then(function () { return v.chain; }).then(function () {
      if (V !== v) return;
      if (v.fatal) { var f = v.fatal; stopVoice(); return ended(f); }
      return fetch(API + '/voice/end?sid=' + v.sid, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: v.sid, turn: turn }), credentials: 'omit' }).then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { bubble.parentNode.remove(); if (j.ended || r.status === 410) { stopVoice(); return ended(j.error); } addNote(errText(r, j)); listen(v); });
        var sp = Speaker(), botBub = null, buf = '', endCall = false, reader = r.body.getReader(), dec = new TextDecoder();
        function handle(line) {
          if (!line.trim()) return; var m; try { m = JSON.parse(line); } catch (e) { return; }
          if (m.event === 'stt') {
            if (m.transcript) bubble.textContent = m.transcript; else bubble.parentNode.remove();
          } else if (m.event === 'sentence' && m.text) {
            if (V !== v) return;
            if (v.state !== 'speaking') { v.state = 'speaking'; status('Ara is talking…', 'speak'); }
            botBub = botBub ? (botBub.textContent += ' ' + m.text, botBub) : caption('bot', m.text);
            body.scrollTop = body.scrollHeight; sp.say(m.text);
          } else if (m.event === 'done') { endCall = !!m.endCall; if (m.order) addOrderCard(m.order); }
          else if (m.event === 'error') addNote(m.error || 'Something went wrong.');
        }
        function pump() {
          return reader.read().then(function (x) {
            if (x.done) { handle(buf); return; }
            buf += dec.decode(x.value, { stream: true }); var lines = buf.split('\n'); buf = lines.pop(); lines.forEach(handle); return pump();
          });
        }
        return pump().then(function () {
          sp.close(function () { if (V !== v) return; if (endCall) { stopVoice(); ended('Call ended. Thanks for ordering!'); status('Call ended'); } else listen(v); });
        });
      });
    }).catch(function () { if (V !== v) return; addNote('Network problem. Please try again.'); listen(v); });
  }
  $('aiMic').addEventListener('click', function () {
    if (!S || S.mode !== 'voice' || S.ended) return;
    if (!V) return startVoice();
    if (V.state === 'recording') return endTurn(V);           // "stop": I'm done talking
    if (V.state === 'speaking' && V.player) { try { V.player.stop(); } catch (e) {} } // tap to skip Ara
  });
  $('aiEnd').addEventListener('click', function () { if (!S) return; var had = !!V; stopVoice(); if (S && !S.ended) { if (S.sid) post('/end', { sid: S.sid }, S.sid).catch(function () {}); ended(had ? 'Call ended.' : 'Call closed.'); } status('Call ended'); });

  // ---------------- buttons: same labels/icons, new behaviour ----------------
  callBtn.removeAttribute('target'); waBtn.removeAttribute('target'); waBtn.removeAttribute('rel');
  callBtn.addEventListener('click', function (e) { e.preventDefault(); openSheet('voice'); });
  waBtn.addEventListener('click', function (e) { e.preventDefault(); openSheet('chat'); });
  window.UT_AI = { open: openSheet, close: function () { closeSession(false); }, state: function () { return { S: S, V: V && { state: V.state, sid: V.sid } }; }, fallback: { call: fallbackCall, wa: fallbackWa } };
})();
