/*
 * The Dashboard tab of the KOL site (drawn through window.KOL, from kol.js), counted by the "dashboard" API call each
 * time the tab opens. It answers two questions: what needs doing today (a to-do list with names, each linking to the
 * tab where it is done), and whether the invitations pay off (replies, visits, reviews, views and cost per 1,000
 * views, Barter and Paid apart). Rates are only worded as findings once 5 invitations were sent. Tables, no charts.
 */
(function () {
  'use strict';
  var K = window.KOL;
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var MIN_FOR_RATES = 5;
  var data = null;
  var loading = false;

  function tile(label, value, note, tab) {
    return '<a class="tile ktile" href="#' + tab + '"><div class="tile-label">' + esc(label) + '</div><div class="tile-value">' + esc(value) + '</div>' +
      '<div class="muted small">' + esc(note) + '</div></a>';
  }

  function who(o) {
    return '<a href="' + esc(o.profile_url) + '" target="_blank" rel="noopener">@' + esc(o.handle) + '</a>';
  }

  function branch(o) {
    return esc(o.branch === 'Any' ? 'they choose' : o.branch);
  }

  var days = function (n) { return n === 0 ? 'today' : n === 1 ? '1 day ago' : n + ' days ago'; };
  var vnd = function (n) { return n === null || n === undefined ? '-' : K.num(n) + ' ₫'; };

  /** One to-do: a heading with its count, the names (at most 6), and the tab where it is done. */
  function task(title, items, line, tab, help) {
    if (!items.length) return '';
    return '<li class="kdo"><div class="kdohead"><b>' + esc(title) + '</b> <span class="cnt">' + items.length + '</span>' +
      (help ? ' <span class="small muted">' + esc(help) + '</span>' : '') + ' <a class="small" href="#' + tab + '">Open ' + tab + '</a></div>' +
      '<div class="small">' + items.slice(0, 6).map(line).join(' · ') + (items.length > 6 ? ' · and ' + (items.length - 6) + ' more' : '') + '</div></li>';
  }

  function todo(t) {
    var review = t.review.top.map(function (c) { return { handle: c.handle, profile_url: c.profile_url, like_rate: c.like_rate }; });
    var rows = [
      t.review.n ? '<li class="kdo"><div class="kdohead"><b>Review creators</b> <span class="cnt">' + t.review.n + '</span> <span class="small muted">highest like / view first</span>' +
        ' <a class="small" href="#review">Open review</a></div><div class="small">' + review.map(function (c) {
          return who(c) + (c.like_rate !== null ? ' <span class="muted">' + K.rateText('like', c.like_rate) + '</span>' : '');
        }).join(' · ') + (t.review.n > review.length ? ' · and ' + (t.review.n - review.length) + ' more' : '') + '</div></li>' : '',
      task('Send invitations', t.send, function (o) { return who(o) + ' <span class="muted">approved ' + days(o.days) + '</span>'; }, 'outreach',
        'written, not sent yet'),
      task('Follow up', t.follow_up, function (o) { return who(o) + ' <span class="muted">sent ' + days(o.days) + '</span>'; }, 'outreach',
        'sent ' + t.follow_up_days + '+ days ago, no reply yet'),
      task('Visits', t.visits, function (o) {
        return who(o) + ' <span class="' + (o.passed ? 'warnc' : 'muted') + '">' + esc(o.date) + (o.passed ? ', date passed: did they come?' : '') + ', ' + branch(o) + '</span>';
      }, 'outreach', 'in the next 7 days'),
      task('Ask about the review', t.review_due, function (o) { return who(o) + ' <span class="muted">visited ' + days(o.days) + '</span>'; }, 'outreach',
        'visited ' + t.review_due_days + '+ days ago, no video yet'),
      task('Add the review numbers', t.numbers, function (o) { return who(o); }, 'outreach', 'posted, views not entered'),
    ].join('');
    return rows ? '<ul class="kdolist">' + rows + '</ul>' : '<p class="muted">Nothing to do right now.</p>';
  }

  function cell(r, k) {
    if (k === 'sent') return K.num(r.sent);
    return K.num(r[k]) + (r.sent ? ' <span class="muted">(' + Math.round((r[k] / r.sent) * 100) + '%)</span>' : '');
  }

  function results(res) {
    var all = res.All;
    if (!all.sent) return '<p class="muted small">No invitation sent yet. Once some are marked as sent, this shows how many reply, come and post, Barter and Paid apart.</p>';
    var rows = [['sent', 'Sent'], ['replied', 'Replied'], ['visited', 'Visited'], ['posted', 'Posted a review'], ['declined', 'Declined']];
    return '<div class="scroll-x"><table class="list kdtable"><thead><tr><th></th><th class="n">Barter</th><th class="n">Paid</th><th class="n">All</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + r[1] + '</td><td class="n">' + cell(res.Barter, r[0]) + '</td><td class="n">' + cell(res.Paid, r[0]) + '</td><td class="n">' + cell(all, r[0]) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (all.sent < MIN_FOR_RATES ? '<p class="small muted">Only ' + all.sent + ' sent: too few to judge the rates yet.</p>' :
      '<p class="small">' + Math.round((all.replied / all.sent) * 100) + '% reply and ' + Math.round((all.posted / all.sent) * 100) + '% end with a review.</p>');
  }

  function reviews(rows, t) {
    if (!rows.length) return '<p class="muted small">No review posted yet. In Outreach, set Posted and enter the views, likes and the cost.</p>';
    var head = '<p class="small"><b>' + t.posted + '</b> reviews · ' + (t.measured ? '<b>' + K.num(t.views) + '</b> views in all, <b>' + K.num(t.avg_views) + '</b> a review' : 'no views entered yet') +
      (t.cost_per_1k_views !== null ? ' · ' + K.hint('<b>' + vnd(t.cost_per_1k_views) + '</b> per 1,000 views', 'Cost entered (meal or fee) divided by the views of the reviews that have both.') : '') + '</p>';
    return head + '<div class="scroll-x"><table class="list kdtable"><thead><tr><th>Posted</th><th>Creator</th><th>Invitation</th><th class="n">Views</th><th class="n">Likes</th>' +
      '<th class="n">' + K.hint('Views / followers', 'How far the video went beyond their followers: 2.0 = twice their follower count.', 'r') + '</th>' +
      '<th class="n">Cost</th><th class="n">Per 1,000 views</th><th></th></tr></thead><tbody>' + rows.map(function (o) {
        return '<tr><td>' + esc(o.posted_at) + '</td><td>' + who(o) + '</td><td>' + esc(o.invite_type) + ' · ' + branch(o) + '</td><td class="n">' + (o.views === null ? '-' : K.num(o.views)) +
          '</td><td class="n">' + (o.likes === null ? '-' : K.num(o.likes)) + '</td><td class="n">' + (o.views_per_follower === null ? '-' : o.views_per_follower.toFixed(2)) +
          '</td><td class="n">' + vnd(o.cost) + '</td><td class="n">' + vnd(o.cost_per_1k_views) + '</td><td>' +
          (o.review_url ? '<a href="' + esc(o.review_url) + '" target="_blank" rel="noopener">Open</a>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function pool(p, rejected) {
    return '<p class="small"><b>' + p.ready + '</b> ' + K.hint('ready to invite', 'Food creators in HCMC with numbers, not left out by the rules, never invited or rejected.') +
      ' (' + p.nano + ' nano, ' + p.micro + ' micro; ' + p.with_growth + ' with growth measured) · <b>' + p.new_7d + '</b> found in the last 7 days · <b>' + p.waiting_profile +
      '</b> ' + K.hint('waiting for their profile', 'New creators the PW runner has not read yet (it reads up to 30 each weekday at 10:00), so not classified yet.') + '</p>' +
      (rejected.length ? '<div class="scroll-x"><table class="list kdtable"><thead><tr><th>Why creators were rejected</th><th class="n">Creators</th></tr></thead><tbody>' +
        rejected.map(function (r) { return '<tr><td>' + esc(r.reason) + '</td><td class="n">' + r.n + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="small muted">A reason that comes up often is worth fixing at the source: the Apify hashtags or the rules in Config.</p>' : '');
  }

  function draw() {
    var d = data;
    var t = d.todo;
    var out = ['<p class="qsum">Counted from the sheets just now. <button type="button" class="link-btn" id="kdrefresh">Refresh</button></p>'];
    out.push('<div class="tiles">' + tile('To review', K.num(t.review.n), 'creators waiting', 'review') + tile('To send', K.num(t.send.length), 'invitations written', 'outreach') +
      tile('To follow up', K.num(t.follow_up.length), 'no reply for ' + t.follow_up_days + '+ days', 'outreach') +
      tile('Visits this week', K.num(t.visits.filter(function (v) { return !v.passed; }).length), 'next 7 days', 'outreach') + '</div>');
    out.push('<section class="card"><h2 class="card-title">To do</h2>' + todo(t) + '</section>');
    out.push('<div class="kdgrid"><section class="card"><h2 class="card-title">Invitations: what came of them</h2>' + results(d.results) + '</section>');
    out.push('<section class="card"><h2 class="card-title">Creators to invite next</h2>' + pool(d.pool, d.rejected) + '</section></div>');
    out.push('<section class="card"><h2 class="card-title">Reviews posted</h2>' + reviews(d.reviews, d.review_totals) + '</section>');
    $('main').innerHTML = out.join('');
    $('kdrefresh').addEventListener('click', load);
  }

  function load() {
    if (loading) return;
    loading = true;
    if (!data) $('main').innerHTML = '<p class="muted">Counting…</p>';
    PW.api('dashboard').then(function (r) {
      loading = false;
      data = r.data;
      if (K.state.tab === 'dashboard') draw();
    }, function (err) {
      loading = false;
      if (K.state.tab === 'dashboard') K.showError(err);
    });
  }

  /** Draws what it has at once (if anything), and counts again. */
  K.renderDashboard = function () {
    if (data) draw();
    load();
  };
})();
