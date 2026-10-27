/*
 * The form the PW creator bookmark opens: what it read from the profile (after # in the link), editable,
 * with what the list already knows about this creator. Opening it writes nothing; only Save does.
 */
(function () {
  'use strict';
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var p = PW.hashParams();
  var platform = p.p === 'tt' ? 'TikTok' : p.p === 'ig' ? 'Instagram' : '';
  var handle = String(p.h || '').toLowerCase();
  var captions = [];
  try { captions = p.caps ? JSON.parse(p.caps) : []; } catch (e) { captions = []; }
  if (!Array.isArray(captions)) captions = [];

  function fail(html) {
    $('main').innerHTML = '<h1>Save a creator</h1>' + html;
  }

  if (!platform || !handle) {
    fail('<p class="note warn">Open a creator\'s profile on Instagram or TikTok, then click the PW creator bookmark.</p>');
    return;
  }
  if (!window.PW_CONFIG.api) {
    fail('<p class="note warn">The KOL web app is not deployed yet. See kol/README.md, One-time setup.</p>');
    return;
  }
  if (!PW.token()) {
    fail(PW.noKeyHtml());
    return;
  }

  var profileUrl = platform === 'TikTok' ? 'https://www.tiktok.com/@' + handle : 'https://www.instagram.com/' + handle + '/';
  var field = function (id, label, value, type, cls) {
    return '<div' + (cls ? ' class="' + cls + '"' : '') + '><label for="' + id + '">' + label + '</label><input type="' + (type || 'text') + '" id="' + id + '" value="' + esc(value) + '"' +
      (type === 'number' ? ' min="0" step="1" inputmode="numeric"' : '') + '></div>';
  };

  function render(info) {
    var out = ['<h1>Save a creator</h1>'];
    if (p.v && p.v !== info.version) {
      out.push('<p class="note bad">Your PW creator bookmark is out of date, so some numbers may be missing. ' +
        '<a href="install.html" target="_blank" rel="noopener">Open the install page</a>, click Copy, then paste it into the bookmark ' +
        '(right-click PW creator &gt; Edit).</p>');
    }
    if (p.how === 'none' || !p.followers) out.push('<p class="note warn">Could not read the numbers from the page. Type them in, or press F5 on the profile and click PW creator again.</p>');
    else if (p.x === '1') out.push('<p class="note ok">Exact numbers from the profile page. Check them, then Save.</p>');
    else out.push('<p class="note warn">These numbers are rounded the way the page shows them (like 12K). For exact numbers, press F5 on the profile, then click PW creator again.</p>');

    var f = info.found;
    out.push('<form id="f" class="panel" autocomplete="off">');
    out.push('<p><b>' + esc(platform) + ' <a href="' + esc(profileUrl) + '" target="_blank" rel="noopener">@' + esc(handle) + '</a></b>' +
      (f ? ' <span class="muted">already in the list</span>' : ' <span class="muted">new creator</span>') + '</p>');
    out.push('<div class="cgrid">' + field('name', 'Display name', p.name || '', 'text', 'w2') +
      '<div class="w2"><label for="type">Account type</label><select id="type">' + ['', 'Personal', 'Business', 'Creator'].map(function (t) {
        return '<option value="' + t + '"' + (t === (p.type || '') ? ' selected' : '') + '>' + (t || 'Not known') + '</option>';
      }).join('') + '</select></div>' +
      field('followers', 'Followers', p.followers || '', 'number') + field('following', 'Following', p.following || '', 'number') +
      field('posts', 'Posts', p.posts || '', 'number') +
      (platform === 'TikTok' ? field('likes_total', 'Total likes', p.likes_total || '', 'number') : '<div></div>') + '</div>');
    out.push('<label for="bio">Bio</label><textarea id="bio" rows="2" maxlength="500">' + esc(p.bio || '') + '</textarea>');
    out.push('<div class="cgrid">' + field('ext', 'Website', p.ext || '', 'url', 'w2') + field('cat', 'Category', p.cat || '') +
      '<div><label class="check"><input type="checkbox" id="verified"' + (p.verified === '1' ? ' checked' : '') + '> Verified</label></div></div>');
    var n = Number(p.n || 0);
    var win = Number(p.win || 0);
    var loaded = Number(p.loaded || 0);
    var read = !n ? 'none on the page: scroll the profile a little, then click again'
      : p.from ? n + ' posts from ' + p.from + ' to ' + p.to + (win >= n ? ' (the last ' + (p.wd || 30) + ' days)' : ' (fewer than 12 in the last ' + (p.wd || 30) + ' days, so the 12 newest)')
        : n + ' posts read from the page';
    out.push('<label>Recent posts <span class="muted small">' + esc(read) + '</span></label>');
    // Every loaded post is still inside the window although the bookmark scrolled: it was stopped, or the page loaded no more.
    if (p.from && win && win === loaded && win < 60 && Number(p.posts || 0) > loaded + 3) {
      out.push('<p class="note warn small">All ' + loaded + ' loaded posts are from the last ' + (p.wd || 30) + ' days, so there may be more ' +
        '(the scrolling was stopped, or the page loaded no more). To read the whole month, click PW creator on the profile again.</p>');
    }
    out.push('<div class="cgrid">' + field('avg_likes', 'Avg likes', p.avg_likes || '', 'number') + field('avg_comments', 'Avg comments', p.avg_comments || '', 'number') +
      field('avg_views', 'Avg views', p.avg_views || '', 'number') + '<div></div></div>');
    if (captions.length) {
      out.push('<details><summary class="small">' + captions.length + ' captions (kept for the classification step)</summary><ol class="caps">' +
        captions.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ol></details>');
    }
    out.push('<label for="note">Note</label><input type="text" id="note" maxlength="500" value="">');
    out.push('<label for="who">Saved by</label><input type="text" id="who" maxlength="60" list="people" placeholder="Your name">' +
      '<datalist id="people">' + info.people.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>');
    out.push('<button type="submit" id="save">Save</button><p id="msg" class="note"></p></form>');
    if (f) {
      out.push('<div class="panel"><table>' +
        '<tr><td>Status</td><td>' + esc(f.status) + '</td></tr>' +
        '<tr><td>Added</td><td>' + esc(String(f.added_at).slice(0, 10)) + (f.added_by ? ' by ' + esc(f.added_by) : '') + ' (' + esc(f.source) + ')</td></tr>' +
        '<tr><td>Followers saved</td><td>' + PW.members(f.followers) + '</td></tr>' +
        '<tr><td>Numbers saved</td><td>' + (f.snapshots ? f.snapshots + ' days, last ' + esc(f.last_snapshot) : 'none yet') + '</td></tr>' +
        (f.note ? '<tr><td>Note</td><td>' + esc(f.note) + '</td></tr>' : '') + '</table>' +
        '<p class="muted small">Save updates the profile and today\'s numbers; status and the first note stay unless you type a new note.</p></div>');
    }
    $('main').innerHTML = out.join('');
    PW.remember('pwkol_by', $('who'));
    $('f').addEventListener('submit', save);
  }

  function save(ev) {
    ev.preventDefault();
    var b = $('save');
    var m = $('msg');
    var v = function (id) { return $(id) ? $(id).value : ''; };
    if (!v('who').trim()) {
      m.className = 'note bad';
      m.textContent = 'Type your name in Saved by.';
      return;
    }
    b.disabled = true;
    m.className = 'note';
    m.textContent = 'Saving…';
    PW.api('captureSave', {
      platform: platform, handle: handle, display_name: v('name'), followers: v('followers'), following: v('following'), posts_count: v('posts'),
      likes_total: v('likes_total'), bio: v('bio'), external_url: v('ext'), category: v('cat'), account_type: v('type'), verified: $('verified').checked,
      avg_likes: v('avg_likes'), avg_comments: v('avg_comments'), avg_views: v('avg_views'), posts_counted: p.n || '', captions: captions,
      captions_window: p.from ? (p.n + ' posts, ' + p.from + ' to ' + p.to + ', ' + (p.win || 0) + ' in the last ' + (p.wd || 30) + ' days, ' + (p.loaded || 0) + ' loaded') : '',
      note: v('note'), saved_by: v('who'),
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
  }

  PW.api('capture', { platform: platform, handle: handle }).then(function (r) { render(r.data); }, function (err) {
    fail(err.auth ? PW.noKeyHtml() : '<p class="note bad">' + esc(err.message) + '</p>');
  });
})();
