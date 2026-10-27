/*
 * The main page: says whether Posting and KOL were opened on this computer (their keys are in this origin's
 * localStorage) and offers both bookmarks, built the same way as each part's install page.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var here = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');

  var PARTS = [
    { id: 'posting', dir: 'posting/', store: 'pw_k', name: 'PW capture', form: 'capture.html', part: 'Posting',
      menu: 'Pin Wei Posting &gt; Open posting helper', install: 'install.html',
      what: 'Group post numbers', steps: ['Open the group post on Facebook (click the post\'s time).', 'Click <b>PW capture</b>: a tab opens with the reactions and comments filled in.', 'Check, pick the status, Save.'] },
    { id: 'kol', dir: 'kol/', store: 'pwkol_k', name: 'PW creator', form: 'creator.html', part: 'KOL',
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
