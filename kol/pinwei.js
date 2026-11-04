/*
 * The PinWei videos tab of the KOL site (drawn through window.KOL, from kol.js).
 *
 * The other tabs look for creators Pin Wei has not worked with. This one answers the other question: which creators
 * already made a video about Pin Wei, what did they publish, how did it do, and who is worth booking again. The videos
 * come from the weekly #pinwei search (or from a person pasting a link the search missed); each is marked as a
 * collaboration or an independent (organic) visit, by Pin Wei's own Outreach records and the caption's ad markers.
 * Nothing is sent from here: a person reads, decides, and contacts the creator themselves.
 *
 * The search is a search, not an exact tag: TikTok also answers Pennywise clips, a #pinwei restaurant in Manchester and
 * Chinese "pinwei" (品味) videos. So a video is kept only when its caption names Pin Wei and its account is in Vietnam
 * (PinWei.js, pinweiKeep_), and anything that still slips through can be hidden here and restored later.
 */
(function () {
  'use strict';
  var K = window.KOL;
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var data = null;
  var loading = false;
  var st = { filter: 'All', msg: '', busy: false, addOpen: false, inviting: '', showHidden: false };
  var COLLAB_CLASS = { Collaborator: 'st-collab', Organic: 'st-organic', Unknown: 'st-unknown' };
  var VERDICT_CLASS = { 'Book again': 'st-book', 'First booking?': 'st-first', 'Check first': 'st-check', 'Below the bar': 'st-below' };
  var VERDICT_HELP = {
    'Book again': 'Pin Wei hired them before and one of their videos did well: the strongest reason to contact them again.',
    'First booking?': 'They came on their own and the video did well, so they have never been paid: a good first booking.',
    'Check first': 'The video did well but nothing says whether they were hired: read it and set the answer above first.',
    'Below the bar': 'No video of theirs reached the bar in Config pinwei_rebook_views.',
  };
  var COLLAB_HELP = {
    Collaborator: 'Pin Wei hired them (an invitation that was visited or posted), or the caption says #ad / sponsored.',
    Organic: 'They named Pin Wei and claimed nothing, and Outreach has no booking: an independent visit, not a paid collaboration.',
    Unknown: 'Neither the caption nor our records say: open the video and choose. Your answer is kept.',
  };
  var PLAY_HELP = "TikTok's own player. The /video/ page shows some people \"Access denied\"; this one plays the same video.";
  var KEEP_HELP = 'The TikTok #pinwei search is a search, not an exact tag: it also returns Pennywise clips, a #pinwei ' +
    'restaurant in Manchester and Chinese "pinwei" (品味) videos. A video is kept only when its caption uses #pinwei (or ' +
    'names Pin Wei) and its account is in Vietnam.';

  function say(text, cls) {
    st.msg = text;
    if ($('pwmsg')) $('pwmsg').innerHTML = '<span class="' + (cls || '') + '">' + esc(text) + '</span>';
  }

  function who() {
    var v = $('cwho') ? $('cwho').value.trim() : '';
    return v;
  }

  var members = function (n) { return n === null || n === undefined ? '-' : PW.members(n); };

  /** A badge with its explanation on hover. */
  function badge(cls, text, help) {
    return K.hint('<span class="st ' + cls + '">' + esc(text) + '</span>', help);
  }

  function collabBadge(c) {
    return badge(COLLAB_CLASS[c] || 'st-unknown', c, COLLAB_HELP[c] || '');
  }

  function verdictBadge(v) {
    return badge(VERDICT_CLASS[v] || 'st-below', v, VERDICT_HELP[v] || '');
  }

  /** The player link: it works where /video/ shows "Access denied". */
  function playLink(v) {
    return K.hint('<a class="small" href="' + esc(v.embed_url) + '" target="_blank" rel="noopener">Play</a>', PLAY_HELP);
  }

  /** The video's own page (comments, the creator's profile). */
  function pageLink(v) {
    return '<a class="small" href="' + esc(v.url) + '" target="_blank" rel="noopener">Page</a>';
  }

  function creatorLink(c) {
    return '<a href="' + esc(c.profile_url) + '" target="_blank" rel="noopener">@' + esc(c.handle) + '</a>' +
      (c.display_name ? ' <span class="muted small">' + esc(c.display_name) + '</span>' : '');
  }

  // ------------------------------------------------------------ the parts of the page

  function summary(d) {
    var t = d.totals;
    var last = d.last
      ? 'Last search ' + esc(K.ago(d.last.at)) + (d.last.status === 'read' ? ', ' + (d.last.items || 0) + ' videos read' : ', ' + esc(d.last.status)) + '.'
      : 'The #pinwei search has not run yet.';
    var cost = Math.round((d.config.hashtags.length * d.config.videos_per_hashtag * 0.003 + 0.001) * 100) / 100;
    var box = function (label, value, note) {
      return '<div class="tile"><div class="tile-label">' + esc(label) + '</div><div class="tile-value">' + esc(value) + '</div>' +
        '<div class="muted small">' + esc(note) + '</div></div>';
    };
    return '<div class="tiles">' + box('Videos about Pin Wei', K.num(t.videos), t.measured + ' with views read') +
      box('Creators', K.num(t.creators), t.collaborators + ' hired · ' + t.organic + ' came on their own') +
      box('Views in all', K.num(t.views), 'on the videos that have them') +
      box('To book again', K.num(t.rebook), t.first_booking + ' more would be a first booking') + '</div>' +
      '<p class="qsum">Counted from the sheets just now. ' + last +
      ' <button type="button" class="small-btn alt" id="pwsearch"' + (st.busy ? ' disabled' : '') + '>Search #pinwei now</button>' +
      ' <span class="small muted">reads up to #' + esc(d.config.hashtags.join(' #')) + ' (about $' + cost.toFixed(2) + '), once a day</span>' +
      ' <button type="button" class="small-btn alt" id="pwcleanup">Re-check old videos</button>' +
      ' <button type="button" class="link-btn" id="pwrefresh">Refresh</button><br><span class="small" id="pwmsg">' + esc(st.msg) + '</span></p>' +
      '<p class="small muted">' + K.hint('Kept: videos in Vietnam that name Pin Wei', KEEP_HELP) + ' · the account\'s country ' +
      'and any place the video names are shown under each creator' + (d.totals.hidden ? ' · <b>' + d.totals.hidden + '</b> hidden' : '') + '.</p>';
  }

  /** The invitation a rebooking writes, from the same Config templates as the review queue. */
  function inviteForm(d, c) {
    var o = d.outreach;
    var opt = function (list, label) {
      return list.map(function (x) {
        var v = typeof x === 'object' ? x.code : x;
        return '<option value="' + esc(v) + '">' + esc(label ? label(x) : v) + '</option>';
      }).join('');
    };
    return '<div class="pwcon"><select id="pwtype" aria-label="Invitation">' +
      opt(o.invite_types, function (t) { return t === 'Barter' ? 'Barter' : 'Paid'; }) + '</select> ' +
      '<select id="pwbranch" aria-label="Branch">' + opt(o.branches, function (b) { return b.code === 'Any' ? 'They choose' : b.code; }) +
      '</select> <button type="button" class="small-btn" id="pwinvite" data-id="' + esc(c.creator_id) + '">Write it</button>' +
      ' <button type="button" class="link-btn pwcancel">Cancel</button></div>';
  }

  /** Every clip of a creator, biggest first: one click to the promo video, without leaving the shortlist. */
  function clipsHtml(c) {
    if (!c.clips || !c.clips.length) return '';
    return '<details class="pwclips"><summary>' + c.clips.length + (c.clips.length === 1 ? ' clip' : ' clips') + '</summary>' +
      '<ol class="pwcliplist">' + c.clips.map(function (v) {
        return '<li>' + (v.posted_at ? esc(v.posted_at) + ' · ' : '') + '<b>' + members(v.views) + '</b> views' +
          (v.likes !== null ? ' · ' + members(v.likes) + ' likes' : '') +
          (v.comments !== null ? ' · ' + members(v.comments) + ' comments' : '') +
          (v.shares !== null ? ' · ' + members(v.shares) + ' shares' : '') +
          ' ' + collabBadge(v.collab) + ' ' + playLink(v) + ' ' + pageLink(v) +
          (v.caption ? '<div class="pwcap">' + esc(v.caption.length > 90 ? v.caption.slice(0, 90) + '…' : v.caption) + '</div>' : '') + '</li>';
      }).join('') + '</ol></details>';
  }

  function rebook(d) {
    var rows = d.creators.filter(function (c) { return c.verdict !== 'Below the bar'; });
    if (!rows.length) {
      return '<p class="muted small">No video about Pin Wei has reached ' + K.num(d.config.rebook_views) + ' views yet. Every creator we ' +
        'worked with is below that bar (Config pinwei_rebook_views).</p>';
    }
    return '<p class="small">Highest video of theirs first. The bar is <b>' + K.num(d.config.rebook_views) + '</b> views on one video ' +
      '(Config pinwei_rebook_views). Open <b>N clips</b> under a creator to see every video of theirs. <b>Invite again</b> writes the ' +
      'same invitation the review queue writes: it waits in Outreach for a person to copy and send.</p>' +
      '<div class="scroll-x"><table class="list kdtable pwtable"><thead><tr>' +
      '<th>Creator</th><th class="n">Followers</th><th class="n">Videos</th><th class="n">Best video</th><th class="n">Average</th>' +
      '<th class="n">Views in all</th><th>Last posted</th><th>How we know them</th><th>Worth</th><th></th></tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr><td class="who">' + creatorLink(c) + clipsHtml(c) + '</td>' +
          '<td class="n" data-th="Followers">' + members(c.followers) + '</td>' +
          '<td class="n" data-th="Videos">' + c.n + '</td>' +
          '<td class="n" data-th="Best video">' + members(c.views_best) + (c.best_video ? ' ' + playLink(c.best_video) : '') + '</td>' +
          '<td class="n" data-th="Average">' + members(c.views_avg) + '</td><td class="n" data-th="Views in all">' + members(c.views_total) + '</td>' +
          '<td data-th="Last posted">' + esc(c.last_posted || '-') + '</td><td class="stc" data-th="How we know them">' + collabBadge(c.collab) + '</td>' +
          '<td class="stc" data-th="Worth">' + verdictBadge(c.verdict) + '</td><td class="act">' +
          (st.inviting === c.creator_id ? inviteForm(d, c) : '<button type="button" class="small-btn alt pwinv" data-id="' + esc(c.creator_id) +
            '">Invite again</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /** Where the video is: the account's country, and any place the video names. */
  function whereLine(v) {
    var bits = [];
    if (v.region) bits.push(v.region);
    if (v.location && v.location !== v.region) bits.push(v.location);
    return bits.length ? '<div class="small muted pwloc">' + esc(bits.join(' · ')) + '</div>' : '';
  }

  function videoRows(d) {
    return d.videos.filter(function (v) {
      if (st.filter !== 'All' && v.collab !== st.filter) return false;
      if (v.hidden && !st.showHidden) return false;
      return true;
    });
  }

  function videos(d) {
    var rows = videoRows(d);
    var opt = function (v, label) {
      return '<option value="' + esc(v) + '"' + (st.filter === v ? ' selected' : '') + '>' + esc(label) + '</option>';
    };
    var bar = '<div class="qbar cbar"><select id="pwfilter" aria-label="What it is">' +
      opt('All', 'All videos (' + d.totals.videos + ')') +
      opt('Collaborator', 'Collaborations (' + d.totals.collaborators + ')') +
      opt('Organic', 'Came on their own (' + d.totals.organic + ')') +
      opt('Unknown', 'Not answered yet (' + d.totals.unknown + ')') + '</select>' +
      '<label class="check pwcheck"><input type="checkbox" id="pwshowhidden"' + (st.showHidden ? ' checked' : '') + '> Show hidden (' +
      (d.totals.hidden || 0) + ')</label>' + K.whoBox() + '</div>' +
      '<p class="small muted">Choose what each video is under "What it is": your answer is kept, the next search only refreshes the ' +
      'numbers. <b>Hide</b> takes a video out of the list and the counts (it stays in the sheet, and Restore brings it back).</p>';
    if (!rows.length) {
      return bar + '<p class="muted small">No video here yet. The search runs every ' + esc(d.config.search_day || 'week') + '; click ' +
        '<b>Search #pinwei now</b> to read them at once, or add one by its link below.</p>';
    }
    return bar + '<div class="scroll-x"><table class="list kdtable pwtable"><thead><tr><th>Posted</th><th>Creator</th><th class="n">Views</th>' +
      '<th class="n">Likes</th><th class="n">Comments</th><th class="n">Shares</th>' +
      '<th class="n">' + K.hint('Like / view', 'Likes per view, as the creators tab shows them.') + '</th>' +
      '<th class="n">' + K.hint('View / follower', 'Views of this video against the creator\'s followers: 2.0 = twice their followers.', 'r') + '</th>' +
      '<th>What it is</th><th></th></tr></thead><tbody>' + rows.map(function (v) {
        return '<tr' + (v.hidden ? ' class="pwhiddenrow"' : '') + '><td data-th="Posted">' + esc(v.posted_at || '-') + '</td>' +
          '<td class="who">' + creatorLink(v) + (v.hidden ? ' ' + badge('st-below', 'Hidden', 'Hidden by ' + (v.hidden_by || 'a person') +
            (v.hidden_why ? ': ' + v.hidden_why : '') + '. Restore brings it back.') : '') + whereLine(v) +
          (v.caption ? '<div class="small muted pwcap">' + esc(v.caption.length > 90 ? v.caption.slice(0, 90) + '…' : v.caption) + '</div>' : '') + '</td>' +
          '<td class="n" data-th="Views">' + members(v.views) + '</td><td class="n" data-th="Likes">' + members(v.likes) + '</td>' +
          '<td class="n" data-th="Comments">' + members(v.comments) + '</td><td class="n" data-th="Shares">' + members(v.shares) + '</td>' +
          '<td class="n" data-th="Like / view">' + K.rateText('like', v.rates.like) + '</td>' +
          '<td class="n" data-th="View / follower">' + K.rateText('view', v.views_per_follower) + '</td>' +
          '<td class="stc" data-th="What it is">' + '<select class="pwc" data-id="' + esc(v.video_id) + '">' +
            d.config.collabs.map(function (c) { return '<option value="' + esc(c) + '"' + (v.collab === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
            '</select>' + (v.by_person ? ' <span class="small muted">by ' + esc(v.collab_by) + '</span>' : '') +
            '<div class="small muted">' + K.hint(esc(v.collab_evidence.slice(0, 60)) + (v.collab_evidence.length > 60 ? '…' : ''), v.collab_evidence) + '</div></td>' +
          '<td class="act">' + playLink(v) + ' ' + pageLink(v) + ' ' +
            (v.hidden ? '<button type="button" class="link-btn pwrestore" data-id="' + esc(v.video_id) + '">Restore</button>' :
              '<button type="button" class="link-btn pwhide" data-id="' + esc(v.video_id) + '">Hide</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function addForm(d) {
    return '<details class="card addcreator"' + (st.addOpen ? ' open' : '') + '><summary>Add a video the search missed</summary>' +
      '<p class="small muted">An older video, or one a person was told about. The search cannot find every video (a private ' +
      'account, a video without the hashtag), and the numbers are read from the video page as you see them.</p>' +
      '<div class="agrid">' +
      '<div><label for="pwurl">TikTok video link</label><input type="url" id="pwurl" placeholder="https://www.tiktok.com/@name/video/123…"></div>' +
      '<div><label for="pwposted">Posted on</label><input type="date" id="pwposted"></div>' +
      '<div><label for="pwnote">Note (optional)</label><input type="text" id="pwnote" maxlength="500" placeholder="who said so"></div>' +
      '<div><label for="pwviews">Views</label><input type="text" id="pwviews" placeholder="e.g. 210K"></div>' +
      '<div><label for="pwlikes">Likes</label><input type="text" id="pwlikes"></div>' +
      '<div><label for="pwcomments">Comments</label><input type="text" id="pwcomments"></div>' +
      '<div><label for="pwshares">Shares</label><input type="text" id="pwshares"></div>' +
      '<div><label for="pwsaves">Saves</label><input type="text" id="pwsaves"></div>' +
      '<div class="wide"><label for="pwcaption">Caption (optional, it decides Collaborator or Organic)</label>' +
      '<input type="text" id="pwcaption" maxlength="300" placeholder="the caption, or the first words of it"></div></div>' +
      '<div class="row"><button type="button" id="pwadd">Add the video</button><span class="small" id="pwaddmsg"></span></div></details>';
  }

  // ------------------------------------------------------------ drawing and actions

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  function draw() {
    if (!data) return;
    var d = data;
    $('main').innerHTML = ['<section class="card"><h2 class="card-title">Who made videos about Pin Wei</h2>' + summary(d) +
      '<p class="small muted">Every video below was found by the <b>#pinwei</b> hashtag: creators Pin Wei already worked with, and ' +
      'creators who came on their own. The first card is the shortlist: book again the ones whose video did well.</p></section>',
      '<section class="card"><h2 class="card-title">Worth booking again</h2>' + rebook(d) + '</section>',
      '<section class="card"><h2 class="card-title">Every video</h2>' + videos(d) + '</section>',
      addForm(d)].join('');
    PW.remember('pwkol_by', $('cwho'));
    $('pwrefresh').addEventListener('click', function () { load(true); });
    $('pwsearch').addEventListener('click', search);
    $('pwcleanup').addEventListener('click', cleanup);
    $('pwfilter').addEventListener('change', function () { st.filter = $('pwfilter').value; draw(); });
    $('pwshowhidden').addEventListener('change', function () { st.showHidden = $('pwshowhidden').checked; load(true); });
    $('pwadd').addEventListener('click', add);
    each('button.pwinv', function (el) {
      el.addEventListener('click', function () {
        if (!who()) return say('Type your name in "Saved by" first.', 'badc');
        st.inviting = el.getAttribute('data-id');
        draw();
      });
    });
    each('button.pwcancel', function (el) { el.addEventListener('click', function () { st.inviting = ''; draw(); }); });
    if ($('pwinvite')) $('pwinvite').addEventListener('click', function () { invite($('pwinvite').getAttribute('data-id')); });
    each('select.pwc', function (el) {
      el.addEventListener('change', function () { setCollab(el.getAttribute('data-id'), el.value); });
    });
    each('button.pwhide', function (el) {
      el.addEventListener('click', function () { hide(el.getAttribute('data-id'), true); });
    });
    each('button.pwrestore', function (el) {
      el.addEventListener('click', function () { hide(el.getAttribute('data-id'), false); });
    });
    PW.remember('pwkol_by', $('cwho'));
  }

  function setCollab(videoId, collab) {
    if (!who()) return say('Type your name in "Saved by" first.', 'badc');
    PW.api('pinweiVideoSave', { video_id: videoId, collab: collab, saved_by: who() }).then(function (r) {
      say(r.data.message);
      load(true);
    }, function (err) { say(err.message, 'badc'); });
  }

  /** Hide a video out of the list (still in the sheet), or restore it. */
  function hide(videoId, on) {
    if (!who()) return say('Type your name in "Saved by" first.', 'badc');
    PW.api('pinweiVideoHide', { video_id: videoId, hide: on, saved_by: who() }).then(function (r) {
      say(r.data.message);
      load(true);
    }, function (err) { say(err.message, 'badc'); });
  }

  /** Re-check every old video against today's rules (the ones read before the country was stored, too). */
  function cleanup() {
    say('Re-checking the videos already in the sheet…');
    PW.api('pinweiCleanup').then(function (r) {
      say('Checked ' + r.data.checked + ' videos: hid ' + r.data.hidden + (r.data.why ? ' (' + r.data.why + ')' : '') + '.');
      load(true);
    }, function (err) { say(err.message, 'badc'); });
  }

  function invite(creatorId) {
    PW.api('reviewApprove', { creator_id: creatorId, invite_type: $('pwtype').value, branch: $('pwbranch').value, saved_by: who() })
      .then(function (r) {
        st.inviting = '';
        say(r.data.message);
        load(true);
      }, function (err) { say(err.message, 'badc'); });
  }

  function search() {
    if (st.busy) return;
    st.busy = true;
    say('Asking Apify to read the #pinwei videos…');
    if ($('pwsearch')) $('pwsearch').disabled = true;
    PW.api('pinweiSearch').then(function (r) {
      st.busy = false;
      say(r.data.message + ' The next morning step reads them; click again in a few minutes to read them now.');
      load(true);
    }, function (err) {
      st.busy = false;
      if ($('pwsearch')) $('pwsearch').disabled = false;
      say(err.message, 'badc');
    });
  }

  function add() {
    if (!who()) return say('Type your name in "Saved by" first.', 'badc');
    var val = function (id) { return $(id) ? $(id).value.trim() : ''; };
    var body = { saved_by: who(), url: val('pwurl'), posted_at: val('pwposted'), views: val('pwviews'), likes: val('pwlikes'),
      comments: val('pwcomments'), shares: val('pwshares'), saves: val('pwsaves'), caption: val('pwcaption'), note: val('pwnote') };
    if ($('pwaddmsg')) $('pwaddmsg').textContent = 'Saving…';
    PW.api('pinweiAddVideo', body).then(function (r) {
      st.addOpen = true;
      say(r.data.message);
      load(true);
    }, function (err) {
      if ($('pwaddmsg')) $('pwaddmsg').innerHTML = '<span class="badc">' + esc(err.message) + '</span>';
    });
  }

  function load(force) {
    if (loading) return;
    loading = true;
    if (force) data = null;
    if (!data) $('main').innerHTML = '<p class="muted">Reading the Pin Wei videos…</p>';
    PW.api('pinweiList', { show_hidden: st.showHidden }).then(function (r) {
      loading = false;
      data = r.data;
      if (K.state.tab === 'pinwei') draw();
    }, function (err) {
      loading = false;
      if (K.state.tab === 'pinwei') K.showError(err);
    });
  }

  /** Draws what it has at once (if anything), and reads the list again. */
  K.renderPinwei = function () {
    if (data) draw();
    load(false);
  };
  K.pinweiReload = function () {
    data = null;
    if (K.state.tab === 'pinwei') load(true);
  };
})();
