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

  /**
   * Keeps a long list inside its card: every table in `root`, and every element marked data-scroll, goes into a
   * .scroll-y box, so a long list scrolls instead of stretching the page. Runs once after a tab draws; moving the nodes
   * keeps their listeners, and a box that is already there is left alone. Call it again after redrawing.
   */
  function scrollify(root) {
    var host = root || document;
    var targets = host.querySelectorAll ? host.querySelectorAll('table, [data-scroll]') : [];
    Array.prototype.forEach.call(targets, function (el) {
      var p = el.parentNode;
      if (!p || (p.classList && p.classList.contains('scroll-y'))) return;
      var box = document.createElement('div');
      box.className = 'scroll-y';
      p.insertBefore(box, el);
      box.appendChild(el);
    });
  }

  /**
   * The navigation, at every width: one button that names the section you are in, and a vertical panel that drops
   * under it — the shape the reference asked for. Three states are explicit: closed (start: the button says the current
   * section), open (active: the panel lists the sections and marks the current one), and closed again with the new
   * section marked (completed).
   *
   * Keys: Enter/Space opens, ArrowDown/ArrowUp move through the items, Home/End jump, Escape closes and puts focus back
   * on the button, Tab out closes. A link closes it, so does a click outside. With reduced motion the panel is simply
   * there: no transition, and nothing is ever left hidden behind an animation. Safe after every redraw: it upgrades a
   * bar once and only refreshes the labels.
   */
  function tabMenu(root) {
    var host = root || document;
    var bars = host.querySelectorAll ? host.querySelectorAll('nav.tabs') : [];
    Array.prototype.forEach.call(bars, function (nav) {
      var wrap = nav.parentNode;
      if (!wrap || !wrap.classList || !wrap.classList.contains('navmenu')) {
        wrap = document.createElement('div');
        wrap.className = 'navmenu';
        nav.parentNode.insertBefore(wrap, nav);
        wrap.appendChild(nav);
      }
      var trigger = wrap.querySelector('.navtrigger');
      if (!trigger) {
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'navtrigger';
        trigger.setAttribute('aria-controls', nav.id || '');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-haspopup', 'true');
        trigger.innerHTML = '<span class="navmark" aria-hidden="true"><i></i><i></i><i></i></span>' +
          '<span class="navcapt">Section</span><span class="navlabel"></span><span class="navchev" aria-hidden="true"></span>';
        wrap.insertBefore(trigger, nav);
        // the close button lives in the panel, so the way out is visible as well as Escape
        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'navclose';
        close.setAttribute('aria-label', 'Close the menu');
        close.textContent = '×';
        nav.insertBefore(close, nav.firstChild);

        var items = function () { return Array.prototype.slice.call(nav.querySelectorAll('a')); };
        var isOpen = function () { return wrap.classList.contains('is-open'); };
        var setOpen = function (open, back) {
          wrap.classList.toggle('is-open', open);
          trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
          if (open) {
            var current = nav.querySelector('a.on') || items()[0];
            if (current) current.focus();
          } else if (back !== false) {
            trigger.focus();
          }
        };
        trigger.addEventListener('click', function (ev) { ev.preventDefault(); setOpen(!isOpen()); });
        close.addEventListener('click', function (ev) { ev.preventDefault(); setOpen(false); });
        nav.addEventListener('click', function (ev) {
          var t = ev.target;
          if (t && t.tagName === 'A' && isOpen()) setOpen(false, false); // completed: focus follows the new page
        });
        wrap.addEventListener('keydown', function (ev) {
          if (!isOpen()) return;
          var list = items();
          var at = list.indexOf(document.activeElement);
          if (ev.key === 'Escape') { ev.preventDefault(); setOpen(false); return; }
          if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            ev.preventDefault();
            var step = ev.key === 'ArrowDown' ? 1 : -1;
            var next = list[(at + step + list.length) % list.length];
            if (next) next.focus();
          } else if (ev.key === 'Home' || ev.key === 'End') {
            ev.preventDefault();
            var edge = ev.key === 'Home' ? list[0] : list[list.length - 1];
            if (edge) edge.focus();
          }
        });
        document.addEventListener('click', function (ev) { if (!wrap.contains(ev.target) && isOpen()) setOpen(false, false); });
      }
      var current = nav.querySelector('a.on');
      var label = trigger.querySelector('.navlabel');
      if (label) label.textContent = current ? current.textContent.trim() : 'Sections';
      Array.prototype.forEach.call(nav.querySelectorAll('a'), function (a) {
        if (a.classList.contains('on')) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    });
  }
  window.PW = { key: '', hashParams: hashParams, token: token, api: api, esc: esc, copy: copy, remember: remember, members: members,
    noKeyHtml: noKeyHtml, scrollify: scrollify, tabMenu: tabMenu };
})();
