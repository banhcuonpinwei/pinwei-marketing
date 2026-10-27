/*
 * The form PW capture opens: the post link and the numbers read off Facebook come after # (url, reactions,
 * comments, shares, src, exact, why, v, k). Opening it writes nothing; Save sends it to the API.
 */
(function () {
  'use strict';
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var STATUSES = ['Posted', 'Pending approval', 'Live', 'Removed'];

  function count(v) {
    var n = Number(v);
    return v === undefined || v === '' || !isFinite(n) ? '' : String(Math.round(n));
  }

  function notes(p, info) {
    var out = [];
    var src = p.src || '';
    var reactions = Number(p.reactions) || 0;
    var comments = Number(p.comments) || 0;
    if (src && p.v !== info.version) {
      out.push('<p class="note bad">Your PW capture bookmark is out of date, so these numbers may be wrong. ' +
        '<a href="install.html" target="_blank" rel="noopener">Open the install page</a>, click Copy, then paste it into the bookmark ' +
        '(right-click PW capture &gt; Edit).</p>');
    }
    if (p.why === 'multi_photo') {
      out.push('<p class="note bad">This photo is one of several in a post, so the numbers on screen were the photo\'s own. ' +
        'On Facebook, click "Xem bài viết" (View post), then click PW capture again.</p>');
    } else if (src === 'none') {
      out.push('<p class="note warn">Could not read the numbers from the page. Type them in.</p>');
    } else if (src && p.exact === '1') {
      out.push('<p class="note ok">Exact numbers from the post page. Check them, then Save.</p>');
    } else if (src && Math.max(reactions, comments) >= 1000) {
      out.push('<p class="note warn">Facebook shows these numbers rounded (like 1,4K). For exact numbers, press F5 on the post, then click PW capture again.</p>');
    } else if (src) {
      out.push('<p class="note warn">Filled in from the post page. Check the numbers, then Save.</p>');
    }
    if (!info.is_post) {
      out.push('<p class="note bad">This link is not one post. On Facebook, click the post\'s time to open the post itself, then click the bookmark again.</p>');
    }
    return out.join('');
  }

  function render(p, info) {
    var f = info.found;
    var status = f && STATUSES.indexOf(f.status) >= 0 ? f.status : 'Live';
    var html = ['<h1>Group post numbers</h1>', notes(p, info)];
    html.push('<form id="f" class="panel" autocomplete="off">');
    html.push('<label for="url">Post link</label><input type="url" id="url" required value="' + esc(p.url || '') + '">');
    if (info.normalized && info.normalized !== p.url) html.push('<div class="url">Saved as ' + esc(info.normalized) + '</div>');
    html.push('<div class="pair"><div><label for="reactions">Reactions</label><input type="number" min="0" step="1" inputmode="numeric" id="reactions" value="' +
      esc(count(p.reactions)) + '"></div><div><label for="comments">Comments</label><input type="number" min="0" step="1" inputmode="numeric" id="comments" value="' +
      esc(count(p.comments)) + '"></div></div>');
    if (count(p.shares) !== '') html.push('<p class="muted">The page also showed ' + esc(count(p.shares)) + ' shares (not saved for group posts).</p>');
    html.push('<label class="check"><input type="checkbox" id="lead"' + (f && f.has_lead_comment ? ' checked' : '') +
      '> A comment asks about booking, price or the address (a lead)</label>');
    html.push('<label for="status">Status</label><select id="status">' + STATUSES.map(function (s) {
      return '<option' + (s === status ? ' selected' : '') + '>' + s + '</option>';
    }).join('') + '</select>');
    if (!f) {
      html.push('<label for="who">Posted by</label><input type="text" id="who" list="people" maxlength="60" placeholder="Name of the person who posted">' +
        '<datalist id="people">' + info.posters.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>');
    }
    html.push('<label for="note">Note</label><input type="text" id="note" maxlength="500">');
    html.push('<button type="submit" id="save">Save</button><p id="msg" class="note"></p></form>');
    if (f) {
      html.push('<div class="panel"><table>' +
        '<tr><td>PostLog row</td><td>' + esc(f.row) + '</td></tr>' +
        '<tr><td>Group</td><td>' + esc(f.group || '-') + '</td></tr>' +
        '<tr><td>Posted by</td><td>' + esc(f.posted_by || '-') + '</td></tr>' +
        '<tr><td>Status now</td><td>' + esc(f.status || '-') + '</td></tr>' +
        '<tr><td>Last numbers</td><td>' + esc((f.reactions === null ? '-' : f.reactions) + ' reactions, ' + (f.comments === null ? '-' : f.comments) + ' comments') + '</td></tr>' +
        '</table></div>');
    } else if (info.normalized) {
      html.push('<p class="muted">This post is not in PostLog yet. Save adds it as a group post.</p>');
    }
    $('main').innerHTML = html.join('');
    if ($('who')) PW.remember('pw_posted_by', $('who'));
    $('f').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var b = $('save');
      var m = $('msg');
      b.disabled = true;
      m.className = 'note';
      m.textContent = 'Saving…';
      PW.api('captureSave', {
        url: $('url').value, reactions: $('reactions').value, comments: $('comments').value, has_lead_comment: $('lead').checked,
        status: $('status').value, posted_by: $('who') ? $('who').value : '', note: $('note').value,
      }).then(function (r) {
        m.className = 'note ok';
        m.textContent = r.data.message + ' You can close this tab.';
        b.disabled = false;
        b.textContent = 'Save again';
      }, function (err) {
        m.className = 'note bad';
        m.textContent = 'Not saved: ' + err.message;
        b.disabled = false;
      });
    });
  }

  var p = PW.hashParams();
  if (!PW.token()) {
    $('main').innerHTML = PW.noKeyHtml();
    return;
  }
  PW.api('capture', { url: p.url || '' }).then(function (r) { render(p, r.data); }, function (err) {
    $('main').innerHTML = err.auth ? PW.noKeyHtml() : '<p class="note bad">' + esc(err.message) + '</p>';
  });
})();
