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
  var K = PW.keys;
  // Each browser calls the bar and the edit box differently; the steps follow the browser this page is open in.
  var B = {
    Safari: { bar: 'Favorites bar', show: 'View &gt; Show Favorites Bar (' + K.bar + ')', edit: 'Edit Address…',
      add: 'Bookmarks &gt; Add Bookmark… (⌘D), pick <b>Favorites</b>, name it <code>PW capture</code>, Add. Then right-click it in the Favorites bar &gt; <b>Edit Address…</b>, press ⌘A, and' },
    Chrome: { bar: 'bookmarks bar', show: 'press ' + K.bar, edit: 'Edit…',
      add: 'right-click the bookmarks bar &gt; <b>Add page…</b>, name it <code>PW capture</code>, and in the URL box' },
    Edge: { bar: 'favorites bar', show: 'press ' + K.bar, edit: 'Edit',
      add: 'right-click the favorites bar &gt; <b>Add page</b>, name it <code>PW capture</code>, and in the URL box' },
    Firefox: { bar: 'bookmarks toolbar', show: 'press ' + K.bar, edit: 'Edit Bookmark…',
      add: 'right-click the bookmarks toolbar &gt; <b>Add Bookmark…</b>, name it <code>PW capture</code>, and in the URL box' },
  }[PW.browser] || { bar: 'bookmarks bar', show: 'show it from the browser menu', edit: 'Edit',
    add: 'add a bookmark to the bookmarks bar, name it <code>PW capture</code>, and as its address' };
  $('main').innerHTML = BACK + '<h1>Install the capture bookmark</h1>' +
    '<p class="muted">Current version: ' + esc(window.PW_BOOKMARKLET.version) + ' · steps for ' +
    esc(PW.browser === 'other' ? 'your browser' : PW.browser + (PW.mac ? ' on a Mac' : '')) + '</p>' +
    '<div class="panel"><p><b>First install</b></p><ol>' +
    '<li>Show the ' + B.bar + ' if it is hidden: ' + B.show + '.</li>' +
    '<li>Drag this button onto the ' + B.bar + ': <a class="bm" id="bm" href="#">PW capture</a></li></ol>' +
    '<p class="muted">If dragging does not work: <button type="button" class="copy" style="margin:0 4px">Copy</button> the code, then ' + B.add +
    ' paste it (' + K.paste + ') and save.</p>' +
    '<p class="muted">The bookmark holds the key to the posting data. Keep it on Pin Wei computers only.</p></div>' +
    '<div class="panel"><p><b>Update the bookmark you have</b></p><ol>' +
    '<li><button type="button" class="copy" style="margin:0">Copy</button> <span id="copied" class="muted"></span></li>' +
    '<li>Right-click <b>PW capture</b> in the ' + B.bar + ' &gt; <b>' + B.edit + '</b></li>' +
    '<li>Click in the address box, press ' + K.all + ', then ' + K.paste + '. Save.</li></ol>' +
    '<textarea id="code" rows="3" readonly>' + esc(href) + '</textarea></div>' +
    '<div class="panel"><p><b>Use it</b></p><ol>' +
    '<li>Open the group post on Facebook (click the post\'s time so the address bar shows that one post).</li>' +
    '<li>Reload the page (' + K.reload + ') so the numbers are exact.</li>' +
    '<li>Click <b>PW capture</b>. A tab opens with the reactions and comments filled in.</li>' +
    '<li>Check the numbers, tick "lead" if a comment asks about booking or price, pick the status, Save.</li></ol>' +
    '</div>' + BACK;
  $('bm').setAttribute('href', href);
  $('code').addEventListener('click', function () { this.select(); });
  Array.prototype.forEach.call(document.querySelectorAll('button.copy'), function (b) {
    b.addEventListener('click', function () {
      PW.copy($('code').value, function (ok) {
        $('copied').textContent = ok ? 'Copied. Now edit or add the bookmark.' : 'Could not copy: select the box below and press ' + PW.keys.copy + '.';
      });
    });
  });
})();
