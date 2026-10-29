/*
 * The main page: says whether Posting and KOL were opened on this computer (their keys are in this origin's
 * localStorage), offers both bookmarks, built the same way as each part's install page, and an access link
 * (#pk=<Posting key>&kk=<KOL key>) that sets up another computer in one click. Keys only ever travel after #.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var here = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');

  var PARTS = [
    { id: 'posting', dir: 'posting/', store: 'pw_k', param: 'pk', name: 'PW capture', form: 'capture.html', part: 'Posting',
      menu: 'Pin Wei Posting &gt; Open posting helper', install: 'install.html',
      what: 'Group post numbers', steps: ['Open the group post on Facebook (click the post\'s time).', 'Click <b>PW capture</b>: a tab opens with the reactions and comments filled in.', 'Check, pick the status, Save.'] },
    { id: 'kol', dir: 'kol/', store: 'pwkol_k', param: 'kk', name: 'PW creator', form: 'creator.html', part: 'KOL',
      menu: 'Pin Wei KOL &gt; Open KOL site', install: 'install.html',
      what: 'Creator profiles', steps: ['Open a creator\'s Instagram or TikTok profile.', 'Click <b>PW creator</b>: a tab opens with the followers and recent posts filled in.', 'Check and Save.'] },
  ];

  function keyOf(store) {
    try { return localStorage.getItem(store) || ''; } catch (e) { return ''; }
  }

  function bookmarkletCode(code, formUrl, key) {
    var lit = function (s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); };
    return code.split('__WEBAPP_URL__').join(lit(formUrl)).split('__TOKEN__').join(lit(key));
  }

  /** Each part's bookmarklet.js sets window.PW_BOOKMARKLET; load them one after the other and keep each. */
  function loadCode(part, done) {
    var s = document.createElement('script');
    s.src = part.dir + 'bookmarklet.js';
    s.onload = function () { var b = window.PW_BOOKMARKLET; window.PW_BOOKMARKLET = null; done(b && b.code ? b : null); };
    s.onerror = function () { done(null); };
    document.body.appendChild(s);
  }

  function copy(text, cb) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { cb(true); }, function () { cb(false); });
      return;
    }
    cb(false);
  }

  function render(part, b) {
    var box = $('bm-' + part.id);
    var key = keyOf(part.store);
    var head = '<h3>' + esc(part.name) + '</h3><p class="for">' + esc(part.what) + ' · ' + esc(part.part) +
      (b ? ' · version ' + esc(b.version) : '') + '</p>';
    if (!b) {
      box.innerHTML = head + '<p class="muted">Could not load the bookmark. <a class="link" href="' + part.dir + part.install + '">Open the ' +
        esc(part.part) + ' install page</a>.</p>';
      return;
    }
    if (!key) {
      box.innerHTML = head + '<p class="muted">Not set up on this computer yet. In the spreadsheet, use <b>' + part.menu +
        '</b> once, then come back to this page.</p>';
      return;
    }
    var href = 'javascript:' + encodeURIComponent(bookmarkletCode(b.code, here + part.dir + part.form, key));
    box.innerHTML = head +
      '<div class="row"><a class="bm" id="bm-' + part.id + '-link" href="#">' + esc(part.name) + '</a>' +
      '<span class="muted">drag to the bookmarks bar</span></div>' +
      '<div class="row"><button type="button" class="alt" id="bm-' + part.id + '-copy">Copy to update an old one</button>' +
      '<span class="muted" id="bm-' + part.id + '-note"></span></div>' +
      '<ol>' + part.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '<p class="muted">To update: right-click <b>' + esc(part.name) + '</b> in the bar &gt; Edit…, select the URL, paste. ' +
      '<a class="link" href="' + part.dir + part.install + '">Install page</a></p>';
    $('bm-' + part.id + '-link').setAttribute('href', href);
    $('bm-' + part.id + '-copy').addEventListener('click', function () {
      copy(href, function (ok) {
        $('bm-' + part.id + '-note').textContent = ok ? 'Copied. Now edit the bookmark.' : 'Could not copy: use the install page.';
      });
    });
  }

  /** An access link: keep its keys on this computer, then take them out of the address bar. */
  function takeAccessLink() {
    var got = [];
    String(location.hash || '').replace(/^#/, '').split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      var name = pair.slice(0, i);
      var value = '';
      try { value = decodeURIComponent(pair.slice(i + 1)); } catch (e) { return; }
      PARTS.forEach(function (part) {
        if (name !== part.param || !/^[A-Za-z0-9_-]{8,200}$/.test(value)) return;
        try { localStorage.setItem(part.store, value); got.push(part.part); } catch (e) { /* private window: nothing kept */ }
      });
    });
    if (!location.hash) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* old browser: the hash stays */ }
    var note = $('notice');
    note.hidden = false;
    if (got.length) {
      note.className = 'notice ok';
      note.textContent = 'Access saved on this computer: ' + got.join(' and ') + '. Open them below.';
    } else {
      note.className = 'notice bad';
      note.textContent = 'This link did not give access here (it is incomplete, or this is a private window). Ask for the link again.';
    }
  }

  /** The Share access card: a link with the keys this computer has. */
  function renderShare() {
    var have = PARTS.filter(function (part) { return keyOf(part.store); });
    if (!have.length) return;
    $('share').hidden = false;
    var link = here + '#' + have.map(function (part) { return part.param + '=' + encodeURIComponent(keyOf(part.store)); }).join('&');
    $('share-what').textContent = 'The link opens: ' + have.map(function (part) { return part.part; }).join(' and ') +
      (have.length < PARTS.length ? ' (only what this computer has).' : '.');
    $('share-copy').addEventListener('click', function () {
      copy(link, function (ok) {
        $('share-note').textContent = ok ? 'Copied. Paste it in a private message.' : 'Could not copy here: try again in Chrome.';
      });
    });
  }

  takeAccessLink();
  renderShare();

  PARTS.forEach(function (part) {
    var on = !!keyOf(part.store);
    var el = $('state-' + part.id);
    el.textContent = on ? 'Ready on this computer' : 'Open it once from the spreadsheet menu';
    if (on) el.className = 'state on';
  });

  (function next(i) {
    if (i >= PARTS.length) return;
    loadCode(PARTS[i], function (b) { render(PARTS[i], b); next(i + 1); });
  })(0);
})();
