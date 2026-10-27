/*
 * The PW capture bookmark with this site's capture form and the key filled in: drag it to the bookmarks bar,
 * or Copy and paste it over an old bookmark. The code comes from bookmarklet.js (made by posting/site/build.js).
 */
(function () {
  'use strict';
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var BACK = '<p class="back"><a class="btn" href="./">Back to Posting</a><a href="../">Pin Wei Marketing</a></p>';

  function bookmarkletCode(captureUrl, key) {
    var lit = function (s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); };
    return window.PW_BOOKMARKLET.code.split('__WEBAPP_URL__').join(lit(captureUrl)).split('__TOKEN__').join(lit(key));
  }

  if (!PW.token()) {
    $('main').innerHTML = BACK + '<h1>Install the capture bookmark</h1>' + PW.noKeyHtml();
    return;
  }
  var capture = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'capture.html';
  var href = 'javascript:' + encodeURIComponent(bookmarkletCode(capture, PW.key));
  $('main').innerHTML = BACK + '<h1>Install the capture bookmark</h1>' +
    '<p class="muted">Current version: ' + esc(window.PW_BOOKMARKLET.version) + '</p>' +
    '<div class="panel"><p><b>Update the bookmark you have</b></p><ol>' +
    '<li><button type="button" id="copy" style="margin:0">Copy</button> <span id="copied" class="muted"></span></li>' +
    '<li>Right-click <b>PW capture</b> in the bookmarks bar &gt; <b>Edit…</b></li>' +
    '<li>Click in the URL box, press Ctrl+A, then Ctrl+V. Save.</li></ol>' +
    '<textarea id="code" rows="3" readonly>' + esc(href) + '</textarea></div>' +
    '<div class="panel"><p><b>First install</b></p><p>Drag this button to the Chrome bookmarks bar (press Ctrl+Shift+B if the bar is hidden):</p>' +
    '<a class="bm" id="bm" href="#">PW capture</a>' +
    '<p class="muted">If dragging does not work: right-click the bookmarks bar &gt; Add page, name it <code>PW capture</code>, ' +
    'and paste the copied text as the URL.</p>' +
    '<p class="muted">The bookmark holds the key to the posting data. Keep it on Pin Wei computers only.</p></div>' +
    '<div class="panel"><p><b>Use it</b></p><ol>' +
    '<li>Open the group post on Facebook (click the post\'s time so the address bar shows that one post).</li>' +
    '<li>Click <b>PW capture</b>. A tab opens with the reactions and comments filled in.</li>' +
    '<li>Check the numbers, tick "lead" if a comment asks about booking or price, pick the status, Save.</li></ol>' +
    '</div>' + BACK;
  $('bm').setAttribute('href', href);
  $('code').addEventListener('click', function () { this.select(); });
  $('copy').addEventListener('click', function () {
    PW.copy($('code').value, function (ok) {
      $('copied').textContent = ok ? 'Copied. Now edit the bookmark.' : 'Could not copy: select the box below and press Ctrl+C.';
    });
  });
})();
