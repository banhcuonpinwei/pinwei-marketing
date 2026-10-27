/*
 * The posting helper: New post (composer), Groups this week (copy-and-open queue), Check D+1, Check D+3.
 * One API call ("bootstrap") loads every tab; switching tabs never reloads. The composer keeps what you
 * typed when its data is refreshed.
 */
(function () {
  'use strict';
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var TABS = ['compose', 'week', 'd1', 'd3', 'dash'];
  var state = { data: null, editing: null, img: null, removeImage: false, armed: null, queuePlan: '', composeBuilt: false };

  // ------------------------------------------------------------ frame

  function tabFromHash() {
    var t = String(location.hash).replace(/^#/, '');
    return TABS.indexOf(t) >= 0 ? t : 'compose';
  }

  function showTab() {
    var tab = tabFromHash();
    TABS.forEach(function (t) { $('t-' + t).hidden = t !== tab; });
    Array.prototype.forEach.call($('tabs').querySelectorAll('a'), function (a) {
      a.className = a.getAttribute('data-tab') === tab ? 'on' : '';
    });
    // The dashboard has its own call, made the first time its tab opens (dashboard.js).
    if (tab === 'dash' && window.PW_DASHBOARD) window.PW_DASHBOARD.show();
  }

  function showError(err) {
    if (err && err.auth) {
      $('error').innerHTML = PW.noKeyHtml();
      if (!state.data) $('t-compose').innerHTML = '';
      return;
    }
    $('error').innerHTML = '<p class="note bad">' + esc(err && err.message || err) + ' <a href="#" id="retry">Try again</a></p>';
    $('retry').addEventListener('click', function (ev) { ev.preventDefault(); load(); });
  }

  function footer(r) {
    var at = new Date();
    $('foot').innerHTML = 'Updated ' + at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
      ' · loaded in ' + (r.total_ms / 1000).toFixed(1) + ' s (server ' + (r.server_ms / 1000).toFixed(1) + ' s) · ' +
      '<a href="#" id="refresh">Refresh</a> · <a href="install.html">Capture bookmark</a>';
    $('refresh').addEventListener('click', function (ev) { ev.preventDefault(); load(); });
  }

  function load() {
    $('error').innerHTML = '';
    return PW.api('bootstrap', { plan: state.queuePlan }).then(function (r) {
      state.data = r.data;
      footer(r);
      renderCompose();
      renderWeek();
      renderD1();
      renderD3();
    }, showError);
  }

  // ------------------------------------------------------------ New post

  function hint(ch) {
    var reason = state.data.meta[ch];
    if (ch === 'Page') return reason ? reason + ' Set up the Meta app to post for real.' : 'Posts on the Page right away.';
    return (reason ? reason + ' ' : 'Posts right away. ') + 'Needs a photo (JPEG, between 4:5 and 1.91:1).';
  }

  function buildCompose() {
    $('t-compose').innerHTML =
      '<div class="compose-grid"><section class="card composer">' +
      '<h2 class="card-title"><span id="cTitle">Create post</span> <a href="#" id="cNew" class="small" hidden>Start a new post</a></h2>' +
      '<p id="cStatus" class="note warn" hidden></p>' +
      '<textarea id="text" class="postbox" placeholder="What do you want to tell customers?"></textarea>' +
      '<div class="muted small" id="count"></div>' +
      '<div id="photo" class="photo" hidden><img id="preview" alt=""><button type="button" class="alt" id="removePhoto">Remove photo</button></div>' +
      '<div class="row"><label class="btn alt" for="file">Add photo</label><input type="file" id="file" accept="image/*" hidden>' +
      '<span class="muted small" id="photoNote"></span></div>' +
      '<div class="pair"><div><label for="topic">Name (for you)</label><input type="text" id="topic" maxlength="120" placeholder="e.g. Morning bánh cuốn"></div>' +
      '<div><label for="branch">Branch</label><select id="branch"><option>All</option><option>TD</option><option>BT</option><option>LM</option></select></div></div>' +
      '<label>Post to</label><div class="targets">' +
      '<label class="check"><input type="checkbox" id="page"> <span><b>Facebook Page</b><br><span class="muted small" id="hPage"></span></span></label>' +
      '<label class="check"><input type="checkbox" id="ig"> <span><b>Instagram</b><br><span class="muted small" id="hIG"></span></span></label>' +
      '<label class="check"><input type="checkbox" id="group" checked> <span><b>Facebook groups</b><br><span class="muted small" id="hGroup"></span></span></label></div>' +
      '<div class="bar"><label for="who">Posted by</label><input type="text" id="who" maxlength="60" placeholder="Your name"></div>' +
      '<div class="actions"><button type="button" class="alt" id="save">Save draft</button> <button type="button" id="post">Post</button></div>' +
      '<div id="result" class="result"></div></section>' +
      '<section class="card recent"><h2 class="card-title">Recent posts</h2><div id="recent"></div></section></div>';
    PW.remember('pw_posted_by', $('who'));
    $('text').addEventListener('input', count);
    $('ig').addEventListener('change', count);
    $('file').addEventListener('change', pickPhoto);
    $('removePhoto').addEventListener('click', function () {
      state.img = null;
      state.removeImage = true;
      $('photo').hidden = true;
      $('photoNote').textContent = '';
    });
    $('cNew').addEventListener('click', function (ev) { ev.preventDefault(); edit(null); });
    $('save').addEventListener('click', save);
    $('post').addEventListener('click', post);
    state.composeBuilt = true;
    count();
  }

  function count() {
    var n = $('text').value.length;
    var ig = $('ig').checked;
    $('count').textContent = n + ' characters' + (ig ? ' · Instagram max 2,200' : '');
    $('count').className = 'muted small' + (ig && n > 2200 ? ' badc' : '');
  }

  function pickPhoto() {
    var f = this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var im = new Image();
      im.onload = function () {
        var s = Math.min(1, 1440 / Math.max(im.width, im.height));
        var c = document.createElement('canvas');
        c.width = Math.round(im.width * s);
        c.height = Math.round(im.height * s);
        var g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(im, 0, 0, c.width, c.height);
        var url = c.toDataURL('image/jpeg', 0.9);
        state.img = { base64: url.split(',')[1], mime: 'image/jpeg', name: (f.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg' };
        state.removeImage = false;
        $('preview').src = url;
        $('photo').hidden = false;
        var ratio = c.width / c.height;
        $('photoNote').textContent = ratio < 0.8 || ratio > 1.91 ? 'Instagram only takes photos between 4:5 (tall) and 1.91:1 (wide); this one is outside.' : '';
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(f);
    this.value = '';
  }

  /** Loads a post into the composer (null = a new post). */
  function edit(plan) {
    state.editing = plan;
    state.img = null;
    state.removeImage = false;
    $('cTitle').textContent = plan ? 'Edit post ' + plan.plan_id : 'Create post';
    $('cNew').hidden = !plan;
    $('cStatus').hidden = !plan || plan.status === 'Draft';
    $('cStatus').textContent = plan ? 'Status ' + plan.status + '. Post only sends what was not posted yet.' : '';
    $('text').value = plan ? plan.text : '';
    $('topic').value = plan ? plan.topic : '';
    $('branch').value = plan ? plan.branch : 'All';
    $('page').checked = plan ? plan.channels.indexOf('page') >= 0 : false;
    $('ig').checked = plan ? plan.channels.indexOf('ig') >= 0 : false;
    $('group').checked = plan ? plan.channels.indexOf('group') >= 0 : true;
    if (plan && plan.image_file_id) {
      $('preview').src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(plan.image_file_id) + '&sz=w800';
      $('photo').hidden = false;
    } else {
      $('photo').hidden = true;
    }
    $('photoNote').textContent = '';
    $('result').innerHTML = '';
    count();
    window.scrollTo(0, 0);
  }

  function renderCompose() {
    if (!state.composeBuilt) buildCompose();
    var d = state.data;
    $('hPage').textContent = hint('Page');
    $('hIG').textContent = hint('IG');
    $('hGroup').textContent = d.groups_due + ' group' + (d.groups_due === 1 ? '' : 's') +
      ' due this week. You post them one by one from the queue (Facebook has no API for groups).';
    if (!d.recent.length) {
      $('recent').innerHTML = '<p class="muted">Nothing yet.</p>';
      return;
    }
    $('recent').innerHTML = '<table class="list"><tbody>' + d.recent.map(function (x, i) {
      var links = ['<a href="#" data-open="' + i + '">Open</a>'];
      if (x.status === 'Approved' && x.channels.indexOf('group') >= 0) links.push('<a href="#" data-queue="' + esc(x.plan_id) + '">Group queue</a>');
      return '<tr><td><b>' + esc(x.topic || x.plan_id) + '</b><div class="muted small">' + esc(x.plan_id) + ' · ' +
        esc(x.channels.map(function (c) { return { page: 'Page', ig: 'IG', group: 'Group' }[c] || c; }).join(', ') || '-') +
        '</div></td><td><span class="tag st-' + esc(String(x.status).toLowerCase()) + '">' + esc(x.status) + '</span></td><td>' + links.join(' · ') + '</td></tr>';
    }).join('') + '</tbody></table>';
    Array.prototype.forEach.call($('recent').querySelectorAll('a[data-open]'), function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); edit(state.data.recent[Number(a.getAttribute('data-open'))]); });
    });
    Array.prototype.forEach.call($('recent').querySelectorAll('a[data-queue]'), function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); openQueue(a.getAttribute('data-queue')); });
    });
    // Keep the post being edited in step with what the server now has.
    if (state.editing) {
      var now = d.recent.filter(function (x) { return x.plan_id === state.editing.plan_id; })[0];
      if (now) {
        state.editing = now;
        $('cStatus').hidden = now.status === 'Draft';
        $('cStatus').textContent = 'Status ' + now.status + '. Post only sends what was not posted yet.';
      }
    }
  }

  function form() {
    return {
      plan_id: state.editing ? state.editing.plan_id : '',
      text: $('text').value, topic: $('topic').value, branch: $('branch').value,
      page: $('page').checked, ig: $('ig').checked, group: $('group').checked,
      posted_by: $('who').value, image: state.img, remove_image: state.removeImage,
    };
  }

  function result(html, cls) {
    $('result').className = 'result ' + (cls || '');
    $('result').innerHTML = html;
  }

  function busy(on) {
    $('save').disabled = on;
    $('post').disabled = on;
  }

  function afterWrite(planId) {
    state.img = null;
    state.removeImage = false;
    state.editing = { plan_id: planId, status: 'Draft' };
    $('cTitle').textContent = 'Edit post ' + planId;
    $('cNew').hidden = false;
    return load();
  }

  function save() {
    busy(true);
    result('Saving…');
    PW.api('composeSave', form()).then(function (r) {
      busy(false);
      result(esc(r.data.message), 'okc');
      afterWrite(r.data.plan_id);
    }, function (err) {
      busy(false);
      result('Not saved: ' + esc(err.message), 'badc');
    });
  }

  function post() {
    var b = $('post');
    if (!state.armed) {
      var where = [$('page').checked ? 'Facebook Page' : '', $('ig').checked ? 'Instagram' : '', $('group').checked ? 'the group queue' : '']
        .filter(Boolean).join(', ');
      b.textContent = 'Click again to post to ' + (where || '…');
      state.armed = setTimeout(function () { state.armed = null; b.textContent = 'Post'; }, 5000);
      return;
    }
    clearTimeout(state.armed);
    state.armed = null;
    b.textContent = 'Post';
    busy(true);
    result('Posting…');
    var groups = $('group').checked;
    PW.api('composePost', form()).then(function (r) {
      busy(false);
      var res = r.data.results;
      var names = { Page: 'Facebook Page', IG: 'Instagram' };
      var lines = Object.keys(res).map(function (ch) {
        var x = res[ch];
        return '<div><b>' + names[ch] + ':</b> ' + esc(x.message) +
          (x.link ? ' <a href="' + esc(x.link) + '" target="_blank" rel="noopener">Open post</a>' : '') + '</div>';
      });
      if (groups) lines.push('<div><b>Facebook groups:</b> <a href="#" id="goQueue">Open the group queue</a></div>');
      var failed = Object.keys(res).some(function (c) { return res[c].status === 'failed'; });
      result(lines.join('') || 'Saved.', failed ? 'badc' : 'okc');
      if (groups) {
        $('goQueue').addEventListener('click', function (ev) { ev.preventDefault(); openQueue(r.data.plan_id); });
        state.queuePlan = r.data.plan_id;
      }
      afterWrite(r.data.plan_id);
    }, function (err) {
      busy(false);
      result('Not posted: ' + esc(err.message), 'badc');
    });
  }

  // ------------------------------------------------------------ Groups this week

  var QUEUE_PAGE = 10;
  var queue = { page: 0, search: '', editing: false, draft: '', done: {}, showDone: false, manage: false };

  function openQueue(planId) {
    state.queuePlan = planId;
    queue.page = 0;
    queue.editing = false;
    location.hash = '#week';
    loadQueue();
  }

  function loadQueue() {
    $('t-week').innerHTML = '<p class="muted">Loading…</p>';
    PW.api('queue', { plan: state.queuePlan }).then(function (r) {
      state.data.queue = r.data;
      renderWeek();
    }, showError);
  }

  /** The groups shown: search, then the ones not saved yet (unless Show done), then the page. */
  function visibleGroups(q) {
    var s = queue.search.trim().toLowerCase();
    return q.groups.filter(function (g) {
      return (!s || g.name.toLowerCase().indexOf(s) >= 0) && (queue.showDone || !queue.done[g.group_id]);
    });
  }

  function renderWeek() {
    if (queue.manage) return renderManage();
    var q = state.data.queue;
    var doneCount = q.groups.filter(function (g) { return queue.done[g.group_id]; }).length;
    var list = visibleGroups(q);
    var pages = Math.max(1, Math.ceil(list.length / QUEUE_PAGE));
    if (queue.page >= pages) queue.page = pages - 1;
    var shown = list.slice(queue.page * QUEUE_PAGE, (queue.page + 1) * QUEUE_PAGE);
    var out = [];
    if (!q.plans.length) {
      out.push('<p class="note warn">No post for groups this week yet. Write one in New post and tick Facebook groups.</p>');
    } else {
      out.push('<div class="plans">' + q.plans.map(function (x) {
        return '<a href="#" data-plan="' + esc(x.plan_id) + '" class="' + (x.plan_id === q.plan_id ? 'on' : '') + '">' + esc(x.label) + '</a>';
      }).join('') + '</div>');
    }
    out.push('<div class="qbar"><label for="qwho">Posted by</label><input type="text" id="qwho" maxlength="60" placeholder="Your name">' +
      '<input type="search" id="qsearch" placeholder="Find a group" value="' + esc(queue.search) + '">' +
      '<button type="button" class="alt" id="qmanage">Manage groups</button></div>');
    if (!q.groups_total) {
      out.push('<p class="note warn">No groups yet. Use Manage groups to add one, or import the P5 tracker from the spreadsheet menu.</p>');
      $('t-week').innerHTML = out.join('');
      bindWeekTop(q);
      return;
    }
    out.push('<p class="qsum"><b>' + (q.groups.length - doneCount) + '</b> of ' + q.groups.length + ' groups left this week' +
      (doneCount ? ' · ' + doneCount + ' saved <a href="#" id="qdone">' + (queue.showDone ? 'hide them' : 'show them') + '</a>' : '') +
      (q.photo_url ? ' · <a href="' + esc(q.photo_url) + '" target="_blank" rel="noopener">Download photo</a>' : '') + '</p>');
    out.push(queue.editing
      ? '<div class="card qtext"><label for="qtxt">Text for every group</label><textarea id="qtxt" rows="6">' + esc(queue.draft) + '</textarea>' +
        '<div class="row"><button type="button" id="qtsave">Save text</button><button type="button" class="alt" id="qtcancel">Cancel</button>' +
        '<span class="small" id="qtmsg"></span></div></div>'
      : '<div class="card qtext"><div class="qtext-line"><b>Text for every group</b><span class="qtext-preview muted">' +
        (q.text ? esc(q.text.replace(/\s+/g, ' ')) : 'No text yet.') + '</span><button type="button" class="link-btn" id="qtedit">Edit text</button></div></div>');
    if (!shown.length) {
      out.push('<p class="note ok">' + (queue.search ? 'No group matches.' : 'All groups for this post are done.') + '</p>');
    } else {
      out.push('<table class="list qtable"><tbody>' + shown.map(function (g) {
        var i = q.groups.indexOf(g);
        var done = !!queue.done[g.group_id];
        return '<tr data-i="' + i + '" class="' + (done ? 'done' : '') + '">' +
          '<td class="qg"><a href="' + esc(g.url) + '" target="_blank" rel="noopener">' + esc(g.name) + '</a>' +
          (g.unclear ? ' <span class="tag">Unclear</span>' : '') +
          '<div class="muted small">' + PW.members(g.members) + ' members · last post ' + esc(g.last_ago) + ' · ' + g.posted + '/' + g.max + ' this week</div></td>' +
          '<td class="qa"><button type="button" class="copy"' + (done ? ' disabled' : '') + '>Copy &amp; open</button></td>' +
          '<td class="qs"><input type="url" class="link" placeholder="Post link (optional)"' + (done ? ' disabled' : '') + '>' +
          '<select class="st"' + (done ? ' disabled' : '') + '><option>Posted</option><option>Pending approval</option></select>' +
          '<button type="button" class="save"' + (done ? ' disabled' : '') + '>' + (done ? 'Saved' : 'Save') + '</button></td>' +
          '<td class="qx"><button type="button" class="link-btn remove" title="Stop posting in this group (turn it off)">Remove</button></td></tr>';
      }).join('') + '</tbody></table>');
      out.push('<div class="msgline small" id="qmsg"></div>');
      if (pages > 1) {
        out.push('<div class="pager"><button type="button" class="alt" id="qprev"' + (queue.page === 0 ? ' disabled' : '') + '>Previous</button>' +
          '<span class="muted">Page ' + (queue.page + 1) + ' of ' + pages + ' (' + list.length + ' groups)</span>' +
          '<button type="button" class="alt" id="qnext"' + (queue.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>');
      }
    }
    $('t-week').innerHTML = out.join('');
    bindWeekTop(q);
    bindWeekRows(q);
  }

  function bindWeekTop(q) {
    PW.remember('pw_posted_by', $('qwho'));
    Array.prototype.forEach.call($('t-week').querySelectorAll('a[data-plan]'), function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        state.queuePlan = a.getAttribute('data-plan');
        queue.page = 0;
        queue.editing = false;
        loadQueue();
      });
    });
    $('qsearch').addEventListener('input', function () {
      queue.search = this.value;
      queue.page = 0;
      var pos = this.selectionStart;
      renderWeek();
      $('qsearch').focus();
      $('qsearch').setSelectionRange(pos, pos);
    });
    $('qmanage').addEventListener('click', function () { queue.manage = true; renderManage(); });
    bindQueueText(q);
    if ($('qdone')) $('qdone').addEventListener('click', function (ev) { ev.preventDefault(); queue.showDone = !queue.showDone; renderWeek(); });
    if ($('qprev')) $('qprev').addEventListener('click', function () { queue.page--; renderWeek(); });
    if ($('qnext')) $('qnext').addEventListener('click', function () { queue.page++; renderWeek(); });
  }

  function qmsg(text, cls) {
    var m = $('qmsg');
    if (!m) return;
    m.className = 'msgline small ' + (cls || '');
    m.innerHTML = text;
  }

  /** The one text every group gets: shown on one line, edited in place, saved for everyone. */
  function bindQueueText(q) {
    if ($('qtedit')) {
      $('qtedit').addEventListener('click', function () {
        queue.editing = true;
        queue.draft = q.text;
        renderWeek();
        $('qtxt').focus();
      });
      return;
    }
    if (!$('qtxt')) return;
    $('qtxt').addEventListener('input', function () { queue.draft = this.value; });
    $('qtcancel').addEventListener('click', function () { queue.editing = false; renderWeek(); });
    $('qtsave').addEventListener('click', function () {
      var b = this;
      var m = $('qtmsg');
      b.disabled = true;
      m.className = 'small';
      m.textContent = 'Saving…';
      PW.api('queueText', { plan_id: q.plan_id, text: queue.draft }).then(function (r) {
        q.text = r.data.text;
        q.draft_id = r.data.draft_id;
        queue.editing = false;
        renderWeek();
        qmsg(esc(r.data.message), 'okc');
      }, function (err) {
        b.disabled = false;
        m.className = 'small badc';
        m.textContent = 'Not saved: ' + err.message;
      });
    });
  }

  function bindWeekRows(q) {
    Array.prototype.forEach.call($('t-week').querySelectorAll('tr[data-i]'), function (tr) {
      var g = q.groups[Number(tr.getAttribute('data-i'))];
      tr.querySelector('.copy').addEventListener('click', function () {
        if (queue.editing) return qmsg('Save the text first (Save text above the list).', 'badc');
        var t = q.text;
        if (!t.trim()) return qmsg('Write the text first (Edit text above the list).', 'badc');
        PW.copy(t, function (ok) {
          qmsg(ok ? 'Copied the text for <b>' + esc(g.name) + '</b>. In the group: click the post box, Ctrl+V, add the photo, post. Then Save here.'
            : 'Could not copy: click Edit text above the list, select the text and press Ctrl+C.', ok ? 'okc' : 'badc');
        });
        window.open(g.url, '_blank', 'noopener');
      });
      tr.querySelector('.save').addEventListener('click', function () {
        var who = $('qwho').value.trim();
        if (!who) return qmsg('Type your name in Posted by first.', 'badc');
        var b = this;
        b.disabled = true;
        b.textContent = 'Saving…';
        PW.api('queueSave', {
          group_id: g.group_id, plan_id: q.plan_id, draft_id: q.draft_id, url: tr.querySelector('.link').value,
          status: tr.querySelector('.st').value, posted_by: who, text: q.text,
        }).then(function (r) {
          queue.done[g.group_id] = true;
          renderWeek();
          qmsg(esc(g.name) + ': ' + esc(r.data.message), 'okc');
        }, function (err) {
          b.disabled = false;
          b.textContent = 'Save';
          qmsg('Not saved (' + esc(g.name) + '): ' + esc(err.message), 'badc');
        });
      });
      var rm = tr.querySelector('.remove');
      rm.addEventListener('click', function () {
        if (rm.getAttribute('data-armed') !== '1') {
          rm.setAttribute('data-armed', '1');
          rm.textContent = 'Sure? Remove';
          setTimeout(function () { if (rm.isConnected) { rm.removeAttribute('data-armed'); rm.textContent = 'Remove'; } }, 4000);
          return;
        }
        rm.disabled = true;
        PW.api('groupSave', { group_id: g.group_id, active: false }).then(function () {
          q.groups.splice(q.groups.indexOf(g), 1);
          q.groups_total--;
          renderWeek();
          qmsg('Removed <b>' + esc(g.name) + '</b>: no more posts there. <a href="#" id="qundo">Undo</a>', 'okc');
          $('qundo').addEventListener('click', function (ev) {
            ev.preventDefault();
            PW.api('groupSave', { group_id: g.group_id, active: true }).then(loadQueue, function (err) { qmsg('Undo failed: ' + esc(err.message), 'badc'); });
          });
        }, function (err) {
          rm.disabled = false;
          qmsg('Not removed: ' + esc(err.message), 'badc');
        });
      });
    });
  }

  // ------------------------------------------------------------ Manage groups

  var manage = { list: null, search: '', showRemoved: false, page: 0, flash: null };
  var MANAGE_PAGE = 15;

  function renderManage() {
    var head = '<div class="qbar"><button type="button" class="alt" id="mback">Back to this week\'s groups</button>' +
      '<input type="search" id="msearch" placeholder="Find a group" value="' + esc(manage.search) + '">' +
      '<label class="check inline"><input type="checkbox" id="mremoved"' + (manage.showRemoved ? ' checked' : '') + '> Show removed</label></div>';
    var add = '<details class="card addgroup"' + (manage.list && !manage.list.length ? ' open' : '') + '><summary>Add a group</summary>' +
      '<div class="addgrid">' +
      '<div><label for="aname">Name</label><input type="text" id="aname" maxlength="200" placeholder="Group name"></div>' +
      '<div class="wide"><label for="aurl">Facebook group link</label><input type="url" id="aurl" placeholder="https://www.facebook.com/groups/…"></div>' +
      '<div><label for="amembers">Members</label><input type="text" id="amembers" placeholder="e.g. 13,9K"></div>' +
      '<div><label for="abranch">Branch</label><select id="abranch"><option>All</option><option>TD</option><option>BT</option><option>LM</option></select></div>' +
      '<div><label for="amax">Posts / week</label><input type="number" id="amax" min="1" max="14" value="1"></div>' +
      '<div><label for="aallowed">Posting allowed</label><select id="aallowed"><option>Allowed</option><option>Unclear</option><option>Not allowed</option></select></div>' +
      '</div><div class="row"><button type="button" id="aadd">Add group</button><span class="small" id="amsg"></span></div></details>';
    if (!manage.list) {
      $('t-week').innerHTML = head + add + '<p class="muted">Loading…</p>';
      bindManage();
      PW.api('groupsList').then(function (r) { manage.list = r.data; renderManage(); }, showError);
      return;
    }
    var s = manage.search.trim().toLowerCase();
    var list = manage.list.filter(function (g) {
      return (manage.showRemoved || g.active) && (!s || g.name.toLowerCase().indexOf(s) >= 0 || g.group_id.indexOf(s) >= 0);
    });
    var pages = Math.max(1, Math.ceil(list.length / MANAGE_PAGE));
    if (manage.page >= pages) manage.page = pages - 1;
    var shown = list.slice(manage.page * MANAGE_PAGE, (manage.page + 1) * MANAGE_PAGE);
    var opt = function (vals, v) { return vals.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>'; }).join(''); };
    var table = '<p class="qsum">' + manage.list.filter(function (g) { return g.active; }).length + ' groups in use' +
      (manage.showRemoved ? ', ' + manage.list.filter(function (g) { return !g.active; }).length + ' removed' : '') + '.</p>' +
      '<div class="scroll-x"><table class="list dash-table mtable"><thead><tr><th>Group</th><th class="n">Members</th><th>Branch</th><th>Posts / week</th>' +
      '<th>Posting allowed</th><th>Note</th><th></th></tr></thead><tbody>' + shown.map(function (g) {
        var i = manage.list.indexOf(g);
        return '<tr data-i="' + i + '" class="' + (g.active ? '' : 'off') + '"><td><a href="' + esc(g.url) + '" target="_blank" rel="noopener">' + esc(g.name) + '</a>' +
          '<div class="muted small">' + esc(g.source === 'manual' ? 'added by hand' : 'from the tracker') + (g.admin_response ? ' · admin: ' + esc(g.admin_response) : '') + '</div></td>' +
          '<td class="n">' + PW.members(g.members) + '</td>' +
          '<td><select class="mb">' + opt(['All', 'TD', 'BT', 'LM'], g.branch) + '</select></td>' +
          '<td><input type="number" class="mm" min="1" max="14" value="' + g.max_posts_per_week + '"></td>' +
          '<td><select class="ma">' + opt(['Allowed', 'Unclear', 'Not allowed'], g.posting_allowed) + '</select></td>' +
          '<td><input type="text" class="mn" maxlength="300" value="' + esc(g.admin_note) + '" placeholder="Note"></td>' +
          '<td class="nowrap"><button type="button" class="msave" disabled>Save</button> ' +
          '<button type="button" class="link-btn mtoggle">' + (g.active ? 'Remove' : 'Turn on again') + '</button></td></tr>';
      }).join('') + '</tbody></table></div><div class="msgline small" id="mmsg"></div>' +
      (pages > 1 ? '<div class="pager"><button type="button" class="alt" id="mprev"' + (manage.page === 0 ? ' disabled' : '') + '>Previous</button>' +
        '<span class="muted">Page ' + (manage.page + 1) + ' of ' + pages + '</span><button type="button" class="alt" id="mnext"' +
        (manage.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>' : '');
    $('t-week').innerHTML = head + add + table;
    bindManage();
    bindManageRows();
    if (manage.flash) { mmsg(manage.flash[0], manage.flash[1]); manage.flash = null; }
  }

  function mmsg(text, cls) {
    var m = $('mmsg');
    if (m) { m.className = 'msgline small ' + (cls || ''); m.innerHTML = text; }
  }

  function bindManage() {
    $('mback').addEventListener('click', function () { queue.manage = false; manage.list = null; loadQueue(); });
    $('msearch').addEventListener('input', function () {
      manage.search = this.value;
      manage.page = 0;
      var pos = this.selectionStart;
      renderManage();
      $('msearch').focus();
      $('msearch').setSelectionRange(pos, pos);
    });
    $('mremoved').addEventListener('change', function () { manage.showRemoved = this.checked; manage.page = 0; renderManage(); });
    if ($('mprev')) $('mprev').addEventListener('click', function () { manage.page--; renderManage(); });
    if ($('mnext')) $('mnext').addEventListener('click', function () { manage.page++; renderManage(); });
    $('aadd').addEventListener('click', function () {
      var b = this;
      var am = $('amsg');
      b.disabled = true;
      am.className = 'small';
      am.textContent = 'Adding…';
      PW.api('groupSave', {
        name: $('aname').value, url: $('aurl').value, members: $('amembers').value, branch: $('abranch').value,
        max_posts_per_week: Number($('amax').value), posting_allowed: $('aallowed').value,
      }).then(function (r) {
        manage.list = null;
        manage.search = '';
        manage.flash = [esc(r.data.message), 'okc'];
        renderManage();
      }, function (err) {
        b.disabled = false;
        am.className = 'small badc';
        am.textContent = err.message;
      });
    });
  }

  function bindManageRows() {
    Array.prototype.forEach.call($('t-week').querySelectorAll('.mtable tr[data-i]'), function (tr) {
      var g = manage.list[Number(tr.getAttribute('data-i'))];
      var save = tr.querySelector('.msave');
      Array.prototype.forEach.call(tr.querySelectorAll('select,input'), function (el) {
        el.addEventListener('input', function () { save.disabled = false; });
        el.addEventListener('change', function () { save.disabled = false; });
      });
      save.addEventListener('click', function () {
        save.disabled = true;
        save.textContent = 'Saving…';
        var change = { group_id: g.group_id, branch: tr.querySelector('.mb').value, max_posts_per_week: Number(tr.querySelector('.mm').value),
          posting_allowed: tr.querySelector('.ma').value, admin_note: tr.querySelector('.mn').value };
        PW.api('groupSave', change).then(function (r) {
          Object.assign(g, change);
          save.textContent = 'Save';
          mmsg(esc(r.data.message), 'okc');
        }, function (err) {
          save.disabled = false;
          save.textContent = 'Save';
          mmsg('Not saved (' + esc(g.name) + '): ' + esc(err.message), 'badc');
        });
      });
      tr.querySelector('.mtoggle').addEventListener('click', function () {
        var b = this;
        b.disabled = true;
        PW.api('groupSave', { group_id: g.group_id, active: !g.active }).then(function () {
          g.active = !g.active;
          renderManage();
          mmsg((g.active ? 'Turned on ' : 'Removed ') + '<b>' + esc(g.name) + '</b>.', 'okc');
        }, function (err) {
          b.disabled = false;
          mmsg(esc(err.message), 'badc');
        });
      });
    });
  }

  // ------------------------------------------------------------ Check D+1 / D+3

  function postLink(p) {
    if (p.post_url) return '<a href="' + esc(p.post_url) + '" target="_blank" rel="noopener">Open post</a>';
    return p.group_url ? '<a href="' + esc(p.group_url) + '" target="_blank" rel="noopener">Open group</a><div class="muted small">No post link saved</div>' : '-';
  }

  function renderD1() {
    var d = state.data.d1;
    var out = ['<p class="muted">Posts made ' + d.days + ' day' + (d.days === 1 ? '' : 's') + ' ago or more. Open each one and say what you see.</p>'];
    if (!d.posts.length) out.push('<p class="note ok">Nothing to check.</p>');
    else {
      out.push('<table class="list"><thead><tr><th>Group</th><th>Posted</th><th>Status now</th><th>Post</th><th>What you see</th></tr></thead><tbody>' +
        d.posts.map(function (p, i) {
          return '<tr data-i="' + i + '"><td data-th="Group">' + esc(p.group_name) + '</td><td data-th="Posted">' + esc(p.posted_ago) +
            (p.posted_by ? ' · ' + esc(p.posted_by) : '') + '</td><td data-th="Status now">' + esc(p.status) + '</td><td data-th="Post">' + postLink(p) + '</td>' +
            '<td><button type="button" data-status="live">Live</button> <button type="button" class="alt" data-status="pending">Still pending</button> ' +
            '<button type="button" class="alt" data-status="removed">Removed</button><div class="msg small"></div></td></tr>';
        }).join('') + '</tbody></table>');
    }
    $('t-d1').innerHTML = out.join('');
    Array.prototype.forEach.call($('t-d1').querySelectorAll('tr[data-i]'), function (tr) {
      var p = d.posts[Number(tr.getAttribute('data-i'))];
      var buttons = tr.querySelectorAll('button');
      var msg = tr.querySelector('.msg');
      Array.prototype.forEach.call(buttons, function (b) {
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(buttons, function (x) { x.disabled = true; });
          msg.className = 'msg small';
          msg.textContent = 'Saving…';
          PW.api('statusSet', { post_id: p.post_id, status: b.getAttribute('data-status') }).then(function (r) {
            msg.className = 'msg small okc';
            msg.textContent = r.data.message;
            tr.classList.add('done');
          }, function (err) {
            msg.className = 'msg small badc';
            msg.textContent = 'Not saved: ' + err.message;
            Array.prototype.forEach.call(buttons, function (x) { x.disabled = false; });
          });
        });
      });
    });
  }

  function renderD3() {
    var d = state.data.d3;
    var out = ['<p class="muted">Live posts made ' + d.days + ' days ago or more. Open the post, press F5, click <b>PW capture</b>, ' +
      'check the numbers and Save. The post leaves this list once its numbers are saved.</p>'];
    if (!d.posts.length) out.push('<p class="note ok">Nothing to record.</p>');
    else {
      out.push('<table class="list"><thead><tr><th>Group</th><th>Posted</th><th>Last numbers</th><th>Post</th></tr></thead><tbody>' +
        d.posts.map(function (p) {
          var last = p.reactions === null && p.comments === null ? 'none yet'
            : (p.reactions === null ? '-' : p.reactions) + ' reactions, ' + (p.comments === null ? '-' : p.comments) + ' comments';
          return '<tr><td data-th="Group">' + esc(p.group_name) + '</td><td data-th="Posted">' + esc(p.posted_ago) + '</td>' +
            '<td data-th="Last numbers">' + esc(last) + '</td><td data-th="Post">' + postLink(p) + '</td></tr>';
        }).join('') + '</tbody></table>');
    }
    $('t-d3').innerHTML = out.join('');
  }

  // ------------------------------------------------------------ start

  window.addEventListener('hashchange', showTab);
  if (!PW.token()) {
    $('t-compose').innerHTML = PW.noKeyHtml();
    return;
  }
  showTab();
  load();
})();
