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
 *
 * "Open on TikTok" is a plain link to the video's own page, in a new tab: that page loads for a person. Do not send
 * people to the player address (tiktok.com/embed/v2/<id>): opened on its own — in a tab or in an iframe — TikTok
 * answers "overload-protect triggered", because the embed is only meant to be framed by the page that embeds it.
 */
(function () {
  'use strict';
  var K = window.KOL;
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var data = null;
  var loading = false;
  var st = { filter: 'All', msg: '', busy: false, addOpen: false, inviting: '', showHidden: false, invitation: null };
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

  function say(text, cls) {
    st.msg = text;
    if ($('pwmsg')) $('pwmsg').innerHTML = '<span class="' + (cls || '') + '">' + esc(text) + '</span>';
  }

  function who() {
    var v = $('cwho') ? $('cwho').value.trim() : '';
    return v;
  }

  var members = function (n) { return n === null || n === undefined ? '-' : PW.members(n); };

  function badge(cls, text, help) {
    return K.hint('<span class="st ' + cls + '">' + esc(text) + '</span>', help);
  }

  function collabBadge(c) {
    return badge(COLLAB_CLASS[c] || 'st-unknown', c, COLLAB_HELP[c] || '');
  }

  function verdictBadge(v) {
    return badge(VERDICT_CLASS[v] || 'st-below', v, VERDICT_HELP[v] || '');
  }

  /** One click to TikTok, in a new tab: the video's own page, which loads for a person. */
  function openLink(v, text) {
    return '<a class="btn" href="' + esc(v.url) + '" target="_blank" rel="noopener">' + esc(text || 'Open on TikTok') + '</a>';
  }

  /** Copy the link, for the phone app when a network blocks TikTok on the computer. */
  function copyBtn(url) {
    return '<button type="button" class="link-btn pwcopy" data-url="' + esc(url) + '">Copy link</button>';
  }

  function creatorLink(c) {
    return '<a href="' + esc(c.profile_url) + '" target="_blank" rel="noopener">@' + esc(c.handle) + '</a>';
  }

  // ------------------------------------------------------------ the parts of the page

  function hero(d) {
    var t = d.totals;
    var last = d.last
      ? 'Last search ' + esc(K.ago(d.last.at)) + (d.last.status === 'read' ? ' · ' + (d.last.items || 0) + ' videos read' : ' · ' + esc(d.last.status))
      : 'The #pinwei search has not run yet';
    return '<section class="pwhero"><div class="pwhero-main">' +
      '<p class="pwkicker">Pin Wei · previous videos</p>' +
      '<h1 class="pwtitle">Who already made a video about Pin Wei</h1>' +
      '<p class="pwlead">Every <b>#pinwei</b> video that names the restaurant and is in Vietnam. Open a creator to see ' +
      'their clips and watch one on TikTok in a click. <b>Invite again</b> writes the invitation from the same Config ' +
      'template as the review queue; a person still sends it.</p>' +
      '<div class="pwactions">' +
      '<button type="button" class="btn" id="pwsearch"' + (st.busy ? ' disabled' : '') + '>Search #pinwei now</button>' +
      '<button type="button" class="btn ghost" id="pwcleanup">Re-check old videos</button>' +
      '<button type="button" class="link-btn" id="pwrefresh">Refresh</button>' +
      '</div><p class="pwmsgline" role="status" id="pwmsg">' + esc(st.msg) + '</p>' +
      '</div><div class="pwhero-side">' +
      '<div class="pwnum"><b>' + K.num(t.rebook) + '</b><span>to book again</span></div>' +
      '<div class="pwnum"><b>' + K.num(t.views) + '</b><span>views in all</span></div>' +
      '</div></section>' +
      '<p class="qsum">' + last + ' · <b>' + K.num(t.videos) + '</b> videos by <b>' + K.num(t.creators) + '</b> creators · ' +
      t.collaborators + ' hired · ' + t.organic + ' came on their own' + (t.hidden ? ' · ' + t.hidden + ' hidden' : '') +
      ' · <span class="muted">kept: names Pin Wei, in Vietnam</span></p>';
  }

  function inviteForm(d, c) {
    var o = d.outreach;
    var opt = function (list, label) {
      return list.map(function (x) {
        var v = typeof x === 'object' ? x.code : x;
        return '<option value="' + esc(v) + '">' + esc(label ? label(x) : v) + '</option>';
      }).join('');
    };
    return '<span class="pwcon"><select id="pwtype" aria-label="Invitation type">' +
      opt(o.invite_types, function (t) { return t === 'Barter' ? 'Barter' : 'Paid'; }) + '</select>' +
      '<select id="pwbranch" aria-label="Branch">' + opt(o.branches, function (b) { return b.code === 'Any' ? 'They choose' : b.code; }) +
      '</select><button type="button" class="btn" id="pwinvite" data-id="' + esc(c.creator_id) + '">Write it</button>' +
      '<button type="button" class="link-btn pwcancel">Cancel</button></span>';
  }

  /** Every clip of a creator: the promo video is one click away, with its numbers beside it. */
  function clips(c) {
    if (!c.clips || !c.clips.length) return '';
    return '<details class="pwclips"><summary>' + c.clips.length + (c.clips.length === 1 ? ' clip' : ' clips') + ' — open to watch</summary>' +
      '<ol class="pwcliplist">' + c.clips.map(function (v) {
        return '<li class="pwclip"><div class="when">' + esc(v.posted_at || '-') + '</div>' +
          '<div class="what"><div class="num"><b>' + members(v.views) + '</b> views</div>' +
          '<div class="sub">' + members(v.likes) + ' likes · ' + members(v.comments) + ' comments · ' + members(v.shares) + ' shares</div>' +
          '<div class="caps">' + esc(v.caption || '') + '</div></div>' +
          '<div class="pwclipacts">' + openLink(v) + copyBtn(v.url) + '</div></li>';
      }).join('') + '</ol></details>';
  }

  function creators(d) {
    var rows = d.creators.filter(function (c) { return c.verdict !== 'Below the bar'; });
    if (!rows.length) {
      return '<p class="muted">No video has reached the bar yet (<b>' + K.num(d.config.rebook_views) + '</b> views on one video, ' +
        'Config pinwei_rebook_views). Search again, or lower the bar when a good video is worth less reach.</p>';
    }
    return '<ol class="pwlist">' + rows.map(function (c) {
      return '<li class="pwrow"><div class="pwchead">' +
        '<div class="pwcname"><a class="at" href="' + esc(c.profile_url) + '" target="_blank" rel="noopener">@' + esc(c.handle) + '</a>' +
        (c.display_name ? '<span class="nm">' + esc(c.display_name) + '</span>' : '') + '</div>' +
        '<div class="pwcstats">' +
        '<span><b>' + members(c.views_best) + '</b>best video</span>' +
        '<span><b>' + members(c.followers) + '</b>followers</span>' +
        '<span><b>' + c.n + '</b>' + (c.n === 1 ? 'clip' : 'clips') + '</span>' +
        '<span><b>' + esc(c.last_posted || '-') + '</b>last</span>' +
        '</div>' +
        '<div class="pwcacts">' + verdictBadge(c.verdict) + collabBadge(c.collab) +
        (st.inviting === c.creator_id ? inviteForm(d, c) :
          '<button type="button" class="btn alt pwinv" data-id="' + esc(c.creator_id) + '">Invite again</button>') +
        '</div></div>' + clips(c) + '</li>';
    }).join('') + '</ol>';
  }

  function invitationBox(d) {
    if (!st.invitation) return '';
    return '<section class="card"><h2 class="card-title">Invitation for @' + esc(st.invitation.handle) + '</h2>' +
      '<div class="pwinvite"><textarea id="pwinvtext" readonly aria-label="Invitation text">' + esc(st.invitation.text) + '</textarea>' +
      '<div class="row"><button type="button" class="btn" id="pwinvcopy">Copy invitation</button>' +
      '<span class="muted small">It is <b>To send</b> in Outreach. Nothing is sent by the system: paste it from Pin Wei\'s account, ' +
      'then mark it sent there.</span></div></div></section>';
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
    var bar = '<div class="qbar"><select id="pwfilter" aria-label="What it is">' +
      opt('All', 'All videos (' + d.totals.videos + ')') +
      opt('Collaborator', 'Collaborations (' + d.totals.collaborators + ')') +
      opt('Organic', 'Came on their own (' + d.totals.organic + ')') +
      opt('Unknown', 'Not answered yet (' + d.totals.unknown + ')') + '</select>' +
      '<label class="check pwcheck"><input type="checkbox" id="pwshowhidden"' + (st.showHidden ? ' checked' : '') + '> Show hidden (' +
      (d.totals.hidden || 0) + ')</label>' + K.whoBox() + '</div>' +
      '<p class="small muted">What each video is, you decide: the answer is kept and the next search only refreshes the numbers. ' +
      '<b>Hide</b> takes one out of the list and the counts; it stays in the sheet, and Restore brings it back.</p>';
    if (!rows.length) {
      return bar + '<p class="muted">No video here yet. The search runs every ' + esc(d.config.search_day || 'week') + '; click ' +
        '<b>Search #pinwei now</b> to read them at once, or add one by its link below.</p>';
    }
    return bar + '<div class="scroll-x"><table class="list pwv"><thead><tr><th>Posted</th><th>Creator</th><th class="n">Views</th>' +
      '<th class="n">Likes</th><th class="n">' + K.hint('Like / view', 'Likes per view, as the creators tab shows them.', 'r') + '</th>' +
      '<th>What it is</th><th></th></tr></thead><tbody>' + rows.map(function (v) {
        return '<tr' + (v.hidden ? ' class="pwhiddenrow"' : '') + '><td data-th="Posted">' + esc(v.posted_at || '-') + '</td>' +
          '<td class="who" data-th="Creator">' + creatorLink(v) + (v.hidden ? ' ' + badge('st-below', 'Hidden',
            'Hidden by ' + (v.hidden_by || 'a person') + (v.hidden_why ? ': ' + v.hidden_why : '') + '. Restore brings it back.') : '') +
          (v.region || v.location ? '<div class="small muted">' + esc([v.region, v.location].filter(function (x, i, all) {
            return x && all.indexOf(x) === i;
          }).join(' · ')) + '</div>' : '') +
          (v.caption ? '<div class="small muted">' + esc(v.caption.length > 80 ? v.caption.slice(0, 80) + '…' : v.caption) + '</div>' : '') + '</td>' +
          '<td class="n" data-th="Views">' + members(v.views) + '</td><td class="n" data-th="Likes">' + members(v.likes) + '</td>' +
          '<td class="n" data-th="Like / view">' + K.rateText('like', v.rates.like) + '</td>' +
          '<td class="stc" data-th="What it is"><select class="pwc" aria-label="What this video is" data-id="' + esc(v.video_id) + '">' +
            d.config.collabs.map(function (c) { return '<option value="' + esc(c) + '"' + (v.collab === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
            '</select>' + (v.by_person ? ' <span class="small muted">by ' + esc(v.collab_by) + '</span>' : '') +
            '<div class="small muted">' + K.hint(esc(v.collab_evidence.slice(0, 54)) + (v.collab_evidence.length > 54 ? '…' : ''), v.collab_evidence) + '</div></td>' +
          '<td class="act" data-th="">' + '<a class="tb" href="' + esc(v.url) + '" target="_blank" rel="noopener">Open</a> ' + copyBtn(v.url) + ' ' +
            (v.hidden ? '<button type="button" class="link-btn pwrestore" data-id="' + esc(v.video_id) + '">Restore</button>' :
              '<button type="button" class="link-btn pwhide" data-id="' + esc(v.video_id) + '">Hide</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function addForm(d) {
    return '<details class="card addcreator"' + (st.addOpen ? ' open' : '') + '><summary>Add a video the search missed</summary>' +
      '<p class="small muted">An older video, or one a person was told about. The search cannot find every video (a private ' +
      'account, a video without the hashtag), and the numbers are read from the video page as you see them.</p>' +
      '<div class="agrid">' +
      '<div class="wide"><label for="pwurl">TikTok video link</label><input type="url" id="pwurl" placeholder="https://www.tiktok.com/@name/video/123…"></div>' +
      '<div><label for="pwposted">Posted on</label><input type="date" id="pwposted"></div>' +
      '<div><label for="pwviews">Views</label><input type="text" id="pwviews" placeholder="e.g. 210K"></div>' +
      '<div><label for="pwlikes">Likes</label><input type="text" id="pwlikes"></div>' +
      '<div><label for="pwcomments">Comments</label><input type="text" id="pwcomments"></div>' +
      '<div><label for="pwshares">Shares</label><input type="text" id="pwshares"></div>' +
      '<div><label for="pwsaves">Saves</label><input type="text" id="pwsaves"></div>' +
      '<div class="wide"><label for="pwcaption">Caption (optional, it decides Collaborator or Organic)</label>' +
      '<input type="text" id="pwcaption" maxlength="300" placeholder="the caption, or the first words of it"></div>' +
      '<div class="wide"><label for="pwnote">Note (optional)</label><input type="text" id="pwnote" maxlength="500" placeholder="who said so"></div></div>' +
      '<div class="row"><button type="button" class="btn" id="pwadd">Add the video</button><span class="small" id="pwaddmsg" role="status"></span></div></details>';
  }

  // ------------------------------------------------------------ drawing and actions

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  function draw() {
    if (!data) return;
    var d = data;
    $('main').innerHTML = [hero(d),
      invitationBox(d),
      '<section class="card"><h2 class="card-title">Worth booking again</h2>' + creators(d) + '</section>',
      '<section class="card"><h2 class="card-title">Every video</h2>' + videos(d) + '</section>',
      addForm(d)].join('');
    PW.remember('pwkol_by', $('cwho'));
    $('pwrefresh').addEventListener('click', function () { load(true); });
    $('pwsearch').addEventListener('click', search);
    $('pwcleanup').addEventListener('click', cleanup);
    $('pwfilter').addEventListener('change', function () { st.filter = $('pwfilter').value; draw(); });
    $('pwshowhidden').addEventListener('change', function () { st.showHidden = $('pwshowhidden').checked; load(true); });
    $('pwadd').addEventListener('click', add);
    if ($('pwinvcopy')) $('pwinvcopy').addEventListener('click', copyInvitation);
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
    each('button.pwcopy', function (el) {
      el.addEventListener('click', function () {
        PW.copy(el.getAttribute('data-url'), function (ok) {
          if (!ok) return say('Could not copy the link.', 'badc');
          var was = el.textContent;
          el.textContent = 'Copied';
          if (el.classList) el.classList.add('copied');
          setTimeout(function () {
            el.textContent = was;
            if (el.classList) el.classList.remove('copied');
          }, 1600);
        });
      });
    });
    PW.remember('pwkol_by', $('cwho'));
  }

  function copyInvitation() {
    var box = $('pwinvtext');
    if (!box) return;
    PW.copy(box.value, function (ok) { say(ok ? 'Invitation copied: paste it into the message.' : 'Could not copy: select the text.', ok ? '' : 'badc'); });
  }

  function setCollab(videoId, collab) {
    if (!who()) return say('Type your name in "Saved by" first.', 'badc');
    PW.api('pinweiVideoSave', { video_id: videoId, collab: collab, saved_by: who() }).then(function (r) {
      say(r.data.message);
      load(true);
    }, function (err) { say(err.message, 'badc'); });
  }

  function hide(videoId, on) {
    if (!who()) return say('Type your name in "Saved by" first.', 'badc');
    PW.api('pinweiVideoHide', { video_id: videoId, hide: on, saved_by: who() }).then(function (r) {
      say(r.data.message);
      load(true);
    }, function (err) { say(err.message, 'badc'); });
  }

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
        st.invitation = { handle: String(creatorId).replace(/^tt:|^ig:/, ''), text: r.data.invite_text };
        say('Invitation written: it is To send in Outreach.');
        load(true);
        if (window.scrollTo) window.scrollTo(0, 0);
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
