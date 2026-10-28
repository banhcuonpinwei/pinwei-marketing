/*
 * The Review and Outreach tabs of the KOL site (drawn through window.KOL, from kol.js).
 * Review: the classified creators best score first; open one to see the bio, captions and numbers, correct the
 * classification, approve (type and branch: the invitation is written) or reject with a reason.
 * Outreach: every invitation. The system never sends anything: a person copies the invitation, sends it from Pin Wei's
 * account and clicks Mark as sent, then follows it to the visit and the review.
 */
(function () {
  'use strict';
  var K = window.KOL;
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var PAGE = 15;
  var rv = { open: '', details: {}, msg: '', sum: '', page: 0, platform: 'All', sort: 'like', ostatus: 'Open', oopen: '', omsg: '' };
  var out = rv; // one state object for both tabs
  // Tone is left out (the user, 2026-10-28): a tone that does not land shows in the rates anyway.
  var CLASS_CHOICES = { is_food_reviewer: ['yes', 'unsure', 'no'], based_in_hcmc: ['yes', 'unsure', 'no'], ad_density: ['low', 'medium', 'high'] };
  var CLASS_LABELS = { is_food_reviewer: 'Food', based_in_hcmc: 'HCMC', ad_density: 'Ads' };

  function who() {
    var v = $('cwho') ? $('cwho').value.trim() : '';
    return v;
  }

  function say(id, text, cls) {
    if ($(id)) $(id).innerHTML = '<span class="' + (cls || '') + '">' + esc(text) + '</span>';
  }

  function options(list, value, labels) {
    return list.map(function (x) {
      var v = typeof x === 'object' ? x.code : x;
      var label = labels ? labels(x) : v;
      return '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  // ------------------------------------------------------------ Review

  function reviewList() {
    return K.sortList(K.reviewQueue().filter(function (c) { return rv.platform === 'All' || c.platform === rv.platform; }), rv.sort);
  }

  function detailHtml(c) {
    var d = rv.details[c.creator_id];
    if (!d) return '<p class="muted small">Loading…</p>';
    if (d.error) return '<p class="badc small">' + esc(d.error) + '</p>';
    var cfg = K.state.data.outreach_config;
    var cl = c.classification || {};
    var snaps = d.snapshots.map(function (s) {
      return esc(s.date) + ': ' + PW.members(s.followers) + ' followers' + (s.avg_views !== null ? ', ' + PW.members(s.avg_views) + ' avg views' : '') +
        (s.avg_likes !== null ? ', ' + PW.members(s.avg_likes) + ' avg likes' : '') +
        (s.avg_comments !== null ? ', ' + PW.members(s.avg_comments) + ' avg comments' : '') + (s.avg_saves !== null && s.avg_saves !== undefined ? ', ' +
        PW.members(s.avg_saves) + ' avg saves' : '') + (s.avg_shares !== null && s.avg_shares !== undefined ? ', ' + PW.members(s.avg_shares) + ' avg shares' : '');
    });
    var info = '<div class="rvinfo">' +
      (d.bio ? '<p class="bio">' + esc(d.bio) + '</p>' : '<p class="muted small">No bio.</p>') +
      '<p class="small"><a href="' + esc(c.profile_url) + '" target="_blank" rel="noopener">Open the profile</a>' +
      (d.external_url ? ' · <a href="' + esc(d.external_url) + '" target="_blank" rel="noopener">their link</a>' : '') + '</p>' +
      (d.reason ? '<p class="small"><b>Why:</b> ' + esc(d.reason) + '</p>' : '') +
      (d.captions.length ? '<p class="small muted">' + esc(d.captions_window || d.captions_total + ' posts') + (d.captions_total > d.captions.length ?
        ' · the newest ' + d.captions.length + ' below' : '') + '</p><ol class="caps">' + d.captions.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>'
        : '<p class="small muted">No captions read yet.</p>') +
      (snaps.length ? '<p class="small muted">' + snaps.join('<br>') + '</p>' : '') + '</div>';
    var classForm = '<div class="rvbox"><h4>Classification</h4><div class="rvsel">' + Object.keys(CLASS_CHOICES).map(function (k) {
      var v = cl[k] || '';
      return '<label>' + CLASS_LABELS[k] + '<select class="rvcls" data-k="' + k + '">' + (v ? '' : '<option value="" selected>not judged</option>') +
        options(CLASS_CHOICES[k], v) + '</select></label>';
    }).join('') + '</div><button type="button" class="alt small-btn" id="rvclass">Save classification</button>' +
      '<p class="small muted">Change it when the counts or the AI got it wrong. Saved as yours: the AI never changes it.</p></div>';
    var approve = '<div class="rvbox"><h4>Approve</h4><div class="rvsel">' +
      '<label>Invitation<select id="rvtype">' + options(cfg.invite_types, 'Barter', function (t) { return t === 'Barter' ? 'Barter (free meal)' : 'Paid'; }) + '</select></label>' +
      '<label>Branch<select id="rvbranch">' + options(cfg.branches, 'Any', function (b) { return b.code === 'Any' ? 'They choose' : b.code; }) + '</select></label></div>' +
      '<button type="button" id="rvapprove">Approve and write the invitation</button>' +
      '<p class="small muted">The text comes from the Config sheet: invite_template_barter / invite_template_paid, and branch_TD, BT, LM for the branch.</p></div>';
    var reject = '<div class="rvbox"><h4>Reject</h4><div class="rvsel"><label>Reason<select id="rvreason"><option value="">Pick a reason</option>' +
      options(cfg.reject_reasons) + '</select></label><label id="rvotherl" hidden>Other reason<input type="text" id="rvother" maxlength="200"></label></div>' +
      '<button type="button" class="alt" id="rvreject">Reject</button></div>';
    return '<div class="rvgrid">' + info + '<div class="rvact">' + approve + reject + classForm + '<p class="small" id="rvmsg">' + rv.msg + '</p></div></div>';
  }

  K.renderReview = function () {
    var d = K.state.data;
    var all = reviewList();
    var pages = Math.max(1, Math.ceil(all.length / PAGE));
    if (rv.page >= pages) rv.page = pages - 1;
    var shown = all.slice(rv.page * PAGE, (rv.page + 1) * PAGE);
    var left = d.creators.filter(function (c) { return c.status === 'Classified' && c.excluded; }).length;
    var out = ['<div class="qbar cbar"><select id="rvplatform" aria-label="Platform"><option value="All">All platforms</option>' +
      options(d.platforms, rv.platform) + '</select>' + K.sortSelect('rvsort', rv.sort) + K.whoBox() + '</div>'];
    out.push('<p class="qsum">' + all.length + ' to review' + (left ? ' · ' + K.hint('<span class="muted">' + left + ' left out by the rules</span>',
      'Classified creators the rules leave out (verified, outside the follower range, not food, not in HCMC). They stay in Creators with the reason.') : '') +
      ' <span class="small" id="rvsum">' + rv.sum + '</span></p>');
    if (!all.length) {
      out.push('<p class="note">Nothing to review. New creators come from the Apify search and the PW creator bookmark; the morning run classifies them.</p>');
    } else {
      out.push('<table class="list ctable rvtable"><thead><tr><th>Creator</th><th class="n">Followers</th>' + K.rateHeads() + '<th></th></tr></thead><tbody>' +
        shown.map(function (c) {
          var open = rv.open === c.creator_id;
          return '<tr' + (open ? ' class="on"' : '') + '><td class="who" data-th="Creator"><a href="' + esc(c.profile_url) + '" target="_blank" rel="noopener">@' + esc(c.handle) + '</a>' +
            (c.display_name ? ' <span class="muted">' + esc(c.display_name) + '</span>' : '') +
            '<div class="muted small">' + esc(c.platform) + ' · ' + esc(c.source) + ' · added ' + esc(K.ago(c.added_at)) + '</div>' + K.classLine(c.classification) + '</td>' +
            '<td class="n" data-th="Followers">' + PW.members(c.followers) + '</td>' + K.rateCells(c) +
            '<td class="act"><button type="button" class="alt small-btn rvopen" data-id="' + esc(c.creator_id) + '">' + (open ? 'Close' : 'Review') + '</button></td></tr>' +
            (open ? '<tr class="rvdetail"><td colspan="8">' + detailHtml(c) + '</td></tr>' : '');
        }).join('') + '</tbody></table>');
      if (pages > 1) {
        out.push('<div class="pager"><button type="button" class="alt" id="rvprev"' + (rv.page === 0 ? ' disabled' : '') + '>Previous</button>' +
          '<span class="muted">Page ' + (rv.page + 1) + ' of ' + pages + '</span><button type="button" class="alt" id="rvnext"' + (rv.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>');
      }
    }
    $('main').innerHTML = out.join('');
    bindReview();
  };

  function loadDetail(id) {
    PW.api('reviewDetail', { creator_id: id }).then(function (r) {
      rv.details[id] = r.data;
    }, function (err) {
      rv.details[id] = { error: err.message };
    }).then(function () { if (K.state.tab === 'review' && rv.open === id) K.renderReview(); });
  }

  /** Calls the API with the name, then reloads; says the outcome in the review panel. */
  function act(action, body, button, then) {
    var name = who();
    if (!name) return say('rvmsg', 'Type your name in Saved by (above the list) first.', 'badc');
    button.disabled = true;
    say('rvmsg', 'Saving…');
    PW.api(action, Object.assign({ saved_by: name }, body)).then(function (r) {
      return then(r.data);
    }).catch(function (err) {
      button.disabled = false;
      say('rvmsg', err.message, 'badc');
    });
  }

  function bindReview() {
    PW.remember('pwkol_by', $('cwho'));
    $('rvplatform').addEventListener('change', function () { rv.platform = this.value; rv.page = 0; K.renderReview(); });
    $('rvsort').addEventListener('change', function () { rv.sort = this.value; rv.page = 0; K.renderReview(); });
    if ($('rvprev')) $('rvprev').addEventListener('click', function () { rv.page--; K.renderReview(); });
    if ($('rvnext')) $('rvnext').addEventListener('click', function () { rv.page++; K.renderReview(); });
    Array.prototype.forEach.call(document.querySelectorAll('.rvopen'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        rv.open = rv.open === id ? '' : id;
        rv.msg = '';
        rv.sum = '';
        if (rv.open && !rv.details[id]) loadDetail(id);
        K.renderReview();
      });
    });
    if (!$('rvapprove')) return;
    var id = rv.open;
    $('rvreason').addEventListener('change', function () { $('rvotherl').hidden = this.value !== 'Other'; });
    $('rvapprove').addEventListener('click', function () {
      act('reviewApprove', { creator_id: id, invite_type: $('rvtype').value, branch: $('rvbranch').value }, this, function (d) {
        rv.open = '';
        delete rv.details[id];
        out.oopen = d.outreach_id;
        out.omsg = '<span class="okc">' + esc(d.message) + '</span>';
        return K.reload(function () { location.hash = 'outreach'; });
      });
    });
    $('rvreject').addEventListener('click', function () {
      act('reviewReject', { creator_id: id, reason: $('rvreason').value, other: $('rvother').value }, this, function (d) {
        rv.open = '';
        rv.msg = '';
        rv.sum = '<span class="okc">' + esc(d.message) + '</span>';
        return K.reload();
      });
    });
    $('rvclass').addEventListener('click', function () {
      var body = { creator_id: id, reason: '', tone_fit: '' };
      Array.prototype.forEach.call(document.querySelectorAll('.rvcls'), function (s) { body[s.getAttribute('data-k')] = s.value; });
      act('classifySave', body, this, function (d) {
        rv.msg = '<span class="okc">' + esc(d.message) + ' The score is updated.</span>';
        return K.reload();
      });
    });
  }

  // ------------------------------------------------------------ Outreach

  var STATUS_HELP = {
    'To send': 'Approved; the invitation is written but not sent yet. Copy it, send it from Pin Wei\'s account, then Mark as sent.',
    'Contacted': 'Sent; waiting for an answer.', 'Replied': 'They answered.', 'Scheduled': 'A visit date is agreed.',
    'Visited': 'They came to the branch.', 'Posted': 'Their video or post is up: add the link and its numbers.', 'Declined': 'They said no, or we stopped.',
  };

  function outreachList() {
    var cfg = K.state.data.outreach_config;
    return K.state.data.outreach.filter(function (o) {
      return out.ostatus === 'All' || (out.ostatus === 'Open' ? cfg.open.indexOf(o.status) >= 0 : o.status === out.ostatus);
    });
  }

  function dates(o) {
    var parts = ['approved ' + K.ago(o.approved_at) + (o.approved_by ? ' by ' + o.approved_by : '')];
    if (o.contacted_at) parts.push('sent ' + K.ago(o.contacted_at) + (o.contacted_by ? ' by ' + o.contacted_by : ''));
    if (o.scheduled_for) parts.push('visit ' + o.scheduled_for);
    if (o.visited_at) parts.push('visited ' + o.visited_at);
    if (o.posted_at) parts.push('posted ' + o.posted_at);
    return esc(parts.join(' · '));
  }

  function numVal(n) {
    return n === null || n === undefined ? '' : String(n);
  }

  function outreachDetail(o) {
    var cfg = K.state.data.outreach_config;
    var sending = o.status === 'To send';
    var text = '<div class="rvinfo"><h4>Invitation</h4>' +
      '<textarea id="ortext" rows="8"' + (sending ? '' : ' readonly') + '>' + esc(o.invite_text) + '</textarea>' +
      '<div class="row"><button type="button" class="alt small-btn" id="orcopy">Copy</button>' +
      '<a class="small" href="' + esc(o.profile_url) + '" target="_blank" rel="noopener">Open their profile to send it</a></div>' +
      (sending ? '<p class="small muted">Edit it here if you like (Save keeps the edit). Pin Wei sends nothing by itself: send it from the Pin Wei account, then click Mark as sent.</p>'
        : '<p class="small muted">Sent text, kept as it was.</p>') + '</div>';
    var form = '<div class="rvact"><div class="rvbox"><h4>Follow-up</h4><div class="ogrid">' +
      '<label>Status<select id="orstatus">' + options(cfg.statuses, o.status) + '</select></label>' +
      '<label>Visit date<input type="date" id="orsched" value="' + esc(o.scheduled_for) + '"></label>' +
      '<label>Visited on<input type="date" id="orvisit" value="' + esc(o.visited_at) + '"></label>' +
      '<label class="w2">Review link<input type="url" id="orurl" placeholder="https://…" value="' + esc(o.review_url) + '"></label>' +
      '<label>Views<input type="text" id="orviews" inputmode="numeric" placeholder="e.g. 12,3K" value="' + numVal(o.review_views) + '"></label>' +
      '<label>Likes<input type="text" id="orlikes" inputmode="numeric" value="' + numVal(o.review_likes) + '"></label>' +
      '<label>Comments<input type="text" id="orcomments" inputmode="numeric" value="' + numVal(o.review_comments) + '"></label>' +
      '<label>' + K.hint('Cost (VND)', 'What this invitation cost Pin Wei: the meal (menu price) for Barter, the fee for Paid. The dashboard divides it by the views.') +
      '<input type="text" id="orcost" inputmode="numeric" placeholder="e.g. 250000" value="' + numVal(o.cost_vnd) + '"></label>' +
      '<label class="w2">Note<input type="text" id="ornote" maxlength="500" value="' + esc(o.note) + '"></label></div>' +
      '<div class="row">' + (sending ? '<button type="button" id="orsent">Mark as sent</button>' : '') +
      '<button type="button" class="' + (sending ? 'alt' : '') + '" id="orsave">Save</button>' +
      (sending ? K.hint('<button type="button" class="link-btn" id="orundo">Undo approval</button>', 'Approved by mistake? Deletes this invitation (it was not sent) and ' +
        'puts @' + o.handle + ' back in Review, so you can approve again or reject.') : '') + '</div>' +
      '<p class="small" id="ormsg">' + out.omsg + '</p></div></div>';
    return '<div class="rvgrid">' + text + form + '</div>';
  }

  K.renderOutreach = function () {
    var d = K.state.data;
    var cfg = d.outreach_config;
    var list = outreachList();
    var counts = cfg.statuses.map(function (s) {
      var n = d.outreach.filter(function (o) { return o.status === s; }).length;
      return n ? K.hint(s + ' ' + n, STATUS_HELP[s]) : '';
    }).filter(Boolean);
    var html = ['<div class="qbar cbar"><select id="orfilter" aria-label="Status">' +
      options(['Open', 'All'].concat(cfg.statuses), out.ostatus, function (s) { return s === 'Open' ? 'Open (not finished)' : s === 'All' ? 'All' : s; }) +
      '</select>' + K.whoBox() + '</div>'];
    html.push('<p class="qsum">' + list.length + ' invitation' + (list.length === 1 ? '' : 's') + (counts.length ? ' · <span class="small">' + counts.join(' · ') + '</span>' : '') + '</p>');
    if (!d.outreach.length) {
      html.push('<p class="note">No invitations yet. Approve a creator in Review: the invitation is written for you to send.</p>');
    } else if (!list.length) {
      html.push('<p class="note">None with this status.</p>');
    } else {
      html.push('<table class="list ctable rvtable"><thead><tr><th>Creator</th><th>Invitation</th><th>' +
        K.hint('Status', cfg.statuses.map(function (s) { return s + ': ' + STATUS_HELP[s]; }).join('\n')) + '</th><th>Review</th><th></th></tr></thead><tbody>' +
        list.map(function (o) {
          var open = out.oopen === o.outreach_id;
          return '<tr' + (open ? ' class="on"' : '') + '><td class="who" data-th="Creator"><a href="' + esc(o.profile_url) + '" target="_blank" rel="noopener">@' + esc(o.handle) + '</a>' +
            (o.display_name ? ' <span class="muted">' + esc(o.display_name) + '</span>' : '') + '<div class="muted small">' + esc(o.platform) + ' · ' +
            PW.members(o.followers) + ' followers</div></td>' +
            '<td data-th="Invitation">' + esc(o.invite_type) + ' · ' + esc(o.branch === 'Any' ? 'they choose' : o.branch) + '<div class="muted small">' + dates(o) + '</div></td>' +
            '<td class="stc" data-th="Status"><span class="st st-' + esc(o.status.toLowerCase().replace(/ /g, '-')) + '">' + esc(o.status) + '</span></td>' +
            '<td data-th="Review">' + (o.review_url ? '<a href="' + esc(o.review_url) + '" target="_blank" rel="noopener">Open</a>' : '<span class="muted">-</span>') +
            (o.review_views !== null ? '<div class="small muted">' + PW.members(o.review_views) + ' views' + (o.review_likes !== null ? ', ' + PW.members(o.review_likes) + ' likes' : '') + '</div>' :
              o.review_stats ? '<div class="small muted">' + esc(o.review_stats) + '</div>' : '') + '</td>' +
            '<td class="act"><button type="button" class="alt small-btn oropen" data-id="' + esc(o.outreach_id) + '">' + (open ? 'Close' : 'Open') + '</button></td></tr>' +
            (open ? '<tr class="rvdetail"><td colspan="5">' + outreachDetail(o) + '</td></tr>' : '');
        }).join('') + '</tbody></table>');
    }
    $('main').innerHTML = html.join('');
    bindOutreach();
    if ($('orcopy')) document.querySelector('tr.on').scrollIntoView({ block: 'nearest' });
  };

  function bindOutreach() {
    PW.remember('pwkol_by', $('cwho'));
    $('orfilter').addEventListener('change', function () { out.ostatus = this.value; K.renderOutreach(); });
    Array.prototype.forEach.call(document.querySelectorAll('.oropen'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        out.oopen = out.oopen === id ? '' : id;
        out.omsg = '';
        K.renderOutreach();
      });
    });
    if (!$('orsave')) return;
    var id = out.oopen;
    var o = K.state.data.outreach.filter(function (x) { return x.outreach_id === id; })[0];
    $('orcopy').addEventListener('click', function () {
      PW.copy($('ortext').value, function (ok) { say('ormsg', ok ? 'Copied. Paste it in a message to @' + o.handle + '.' : 'Could not copy: select the text and copy it.', ok ? 'okc' : 'badc'); });
    });
    var save = function (button, extra) {
      var name = who();
      if (!name) return say('ormsg', 'Type your name in Saved by (above the list) first.', 'badc');
      var body = { outreach_id: id, saved_by: name, status: $('orstatus').value, scheduled_for: $('orsched').value, visited_at: $('orvisit').value,
        review_url: $('orurl').value, review_views: $('orviews').value, review_likes: $('orlikes').value, review_comments: $('orcomments').value,
        cost_vnd: $('orcost').value, note: $('ornote').value };
      if (o.status === 'To send') body.invite_text = $('ortext').value;
      button.disabled = true;
      say('ormsg', 'Saving…');
      PW.api('outreachSave', Object.assign(body, extra || {})).then(function (r) {
        out.omsg = '<span class="okc">' + esc(r.data.message) + '</span>';
        return K.reload();
      }).catch(function (err) {
        button.disabled = false;
        say('ormsg', err.message, 'badc');
      });
    };
    $('orsave').addEventListener('click', function () { save(this); });
    if ($('orsent')) $('orsent').addEventListener('click', function () { save(this, { status: 'Contacted' }); });
    if ($('orundo')) {
      $('orundo').addEventListener('click', function () {
        var b = this;
        if (b.getAttribute('data-armed') !== '1') {
          b.setAttribute('data-armed', '1');
          b.textContent = 'Sure? Delete the invitation';
          return;
        }
        var name = who();
        if (!name) return say('ormsg', 'Type your name in Saved by (above the list) first.', 'badc');
        b.disabled = true;
        say('ormsg', 'Undoing…');
        PW.api('outreachUndo', { outreach_id: id, saved_by: name }).then(function (r) {
          out.oopen = '';
          out.omsg = '';
          rv.sum = '<span class="okc">' + esc(r.data.message) + '</span>';
          return K.reload(function () { location.hash = 'review'; });
        }).catch(function (err) {
          b.disabled = false;
          say('ormsg', err.message, 'badc');
        });
      });
    }
  }
})();
