/*
 * Shared by every page of the Pin Wei Posting site: the key, calls to the Apps Script API, small helpers.
 * The key arrives once in the link after # (from the spreadsheet menu or the bookmark) and is kept in this
 * browser's localStorage; it is never sent anywhere but the API.
 */
(function () {
  'use strict';
  // The KOL site shares this github.io origin (and its localStorage); its config.js names its own key store.
  var CONFIG = window.PW_CONFIG || {};
  var KEY_STORE = CONFIG.keyStore || 'pw_k';

  /** The params after #, e.g. #k=abc&url=… -> {k: 'abc', url: '…'}. */
  function hashParams() {
    var out = {};
    String(location.hash || '').replace(/^#/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var key = i < 0 ? pair : pair.slice(0, i);
      var val = i < 0 ? '' : pair.slice(i + 1);
      try { out[decodeURIComponent(key)] = decodeURIComponent(val.replace(/\+/g, ' ')); } catch (e) { out[key] = val; }
    });
    return out;
  }

  /** Takes the key from the link (then removes it from the address bar), else from this browser. */
  function token() {
    var p = hashParams();
    if (p.k) {
      try { localStorage.setItem(KEY_STORE, p.k); } catch (e) { /* private window: use it for this visit */ }
      PW.key = p.k;
      var others = String(location.hash).replace(/^#/, '').split('&').filter(function (x) { return x && x.indexOf('k=') !== 0; });
      history.replaceState(null, '', location.pathname + location.search + (others.length ? '#' + others.join('&') : ''));
    }
    if (!PW.key) {
      try { PW.key = localStorage.getItem(KEY_STORE) || ''; } catch (e) { PW.key = ''; }
    }
    return PW.key;
  }

  /**
   * POST {action, k, ...} to the API as text/plain (a simple request: no CORS preflight). Resolves with
   * {data, server_ms, total_ms}; rejects with an Error (err.auth when the key is wrong).
   */
  function api(action, body) {
    var started = Date.now();
    var payload = Object.assign({ action: action, k: PW.key || token() }, body || {});
    return fetch(window.PW_CONFIG.api, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' })
      .then(function (r) {
        if (!r.ok) throw new Error('The server answered ' + r.status + '. Try again.');
        return r.json();
      }, function () {
        throw new Error('No connection to the server. Check the internet and try again.');
      })
      .then(function (j) {
        if (!j.ok) {
          var err = new Error(j.error || 'Something went wrong.');
          err.auth = !!j.auth;
          throw err;
        }
        return { data: j.data, server_ms: j.server_ms, total_ms: Date.now() - started };
      });
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Copies text; done(true|false). execCommand first (works everywhere), the Clipboard API as fallback. */
  function copy(text, done) {
    var t = document.createElement('textarea');
    t.value = text;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.focus();
    t.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(t);
    if (ok || !navigator.clipboard) return done(ok);
    navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
  }

  function remember(name, input) {
    try {
      var v = localStorage.getItem(name);
      if (v && !input.value) input.value = v;
    } catch (e) { /* no storage */ }
    input.addEventListener('change', function () {
      try { localStorage.setItem(name, input.value.trim()); } catch (e) { /* no storage */ }
    });
  }

  function members(n) {
    return n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US');
  }

  /** Shown when there is no key in this browser. */
  function noKeyHtml() {
    return '<div class="panel"><p><b>This browser does not have the key yet.</b></p>' +
      '<p class="muted">In the spreadsheet, use <b>' + (CONFIG.keyMenu || 'Pin Wei Posting &gt; Open posting helper') + '</b> once on this computer. ' +
      'After that this page opens directly.</p></div>';
  }

  window.PW = { key: '', hashParams: hashParams, token: token, api: api, esc: esc, copy: copy, remember: remember, members: members, noKeyHtml: noKeyHtml };
})();
