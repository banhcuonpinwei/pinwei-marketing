/*
 * Dashboard tab: loads its own numbers ("dashboard" API call) the first time it opens, then on Refresh.
 * Charts follow the data-viz rules: categorical slots 1-3 for Page / IG / Group (validated, CVD-safe on
 * white; aqua is under 3:1, so a legend, value labels and a table view carry identity), the fixed status
 * palette for Live / Pending / Removed with text labels, thin columns with a 2px gap, hover tooltips.
 */
(function () {
  'use strict';
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var SERIES = [['Page', 'Facebook Page', 'var(--s1)'], ['IG', 'Instagram', 'var(--s2)'], ['Group', 'Groups', 'var(--s3)']];
  var STATUS = [['Live', 'Live', 'var(--st-good)'], ['Pending approval', 'Pending', 'var(--st-warn)'], ['Removed', 'Removed', 'var(--st-bad)'],
    ['Posted', 'Not checked yet', 'var(--st-none)']];
  var loaded = false;
  var asTable = false;
  var data = null;

  function pct(n) { return n === null || n === undefined ? '-' : n + '%'; }
  function num(n) { return n === null || n === undefined ? '-' : Number(n).toLocaleString('en-US'); }
  function weekLabel(w) { return String(w).replace(/^\d{4}-/, ''); }

  function tile(label, value, note) {
    return '<div class="tile"><div class="tile-label">' + esc(label) + '</div><div class="tile-value">' + esc(value) + '</div>' +
      (note ? '<div class="muted small">' + esc(note) + '</div>' : '') + '</div>';
  }

  function legend(items) {
    return '<div class="legend">' + items.map(function (s) {
      return '<span class="key"><span class="swatch" style="background:' + s[2] + '"></span>' + esc(s[1]) + '</span>';
    }).join('') + '</div>';
  }

  /** Stacked columns, one per week; the total on the cap; hover shows the split. */
  function weekChart(rows) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.Page + r.IG + r.Group; }).concat([1]));
    var top = Math.max(4, Math.ceil(max / 4) * 4);
    var ticks = [0, top / 4, top / 2, (top * 3) / 4, top];
    var h = 160;
    var cols = rows.map(function (r, i) {
      var total = r.Page + r.IG + r.Group;
      var segs = SERIES.filter(function (s) { return r[s[0]] > 0; });
      return '<div class="col" data-i="' + i + '" tabindex="0" aria-label="' + esc(r.week + ': ' + total + ' posts') + '">' +
        '<div class="cap">' + (total ? total : '') + '</div>' +
        '<div class="stack" style="height:' + Math.round((total / top) * h) + 'px">' +
        segs.map(function (s, j) {
          return '<div class="seg' + (j === segs.length - 1 ? ' top' : '') + '" style="flex:' + r[s[0]] + ';background:' + s[2] + '"></div>';
        }).join('') + '</div><div class="xlab">' + esc(weekLabel(r.week)) + '</div></div>';
    }).join('');
    return '<div class="chart" style="--h:' + h + 'px"><div class="yaxis">' + ticks.slice().reverse().map(function (t) {
      return '<span>' + t + '</span>';
    }).join('') + '</div><div class="plot">' + ticks.map(function (t) {
      return '<div class="grid" style="bottom:' + Math.round((t / top) * h) + 'px"></div>';
    }).join('') + '<div class="cols">' + cols + '</div></div><div class="tip" id="dTip" hidden></div></div>';
  }

  function weekTable(rows) {
    return '<table class="list dash-table"><thead><tr><th>Week</th>' + SERIES.map(function (s) { return '<th class="n">' + esc(s[1]) + '</th>'; }).join('') +
      '<th class="n">Total</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td>' + esc(r.week) + '</td>' + SERIES.map(function (s) { return '<td class="n">' + r[s[0]] + '</td>'; }).join('') +
          '<td class="n">' + (r.Page + r.IG + r.Group) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /** One 100% bar of group post outcomes; every part also written out with its count and share. */
  function statusBar(st) {
    var total = STATUS.reduce(function (a, s) { return a + st[s[0]]; }, 0);
    if (!total) return '<p class="muted">No group posts in these weeks.</p>';
    return '<div class="sbar">' + STATUS.filter(function (s) { return st[s[0]]; }).map(function (s) {
      return '<div class="sseg" style="flex:' + st[s[0]] + ';background:' + s[2] + '" title="' + esc(s[1] + ': ' + st[s[0]]) + '"></div>';
    }).join('') + '</div><div class="legend">' + STATUS.map(function (s) {
      return '<span class="key"><span class="swatch" style="background:' + s[2] + '"></span>' + esc(s[1]) + ' <b>' + st[s[0]] + '</b>' +
        ' <span class="muted">(' + Math.round((st[s[0]] / total) * 100) + '%)</span></span>';
    }).join('') + '</div>';
  }

  function table(head, rows, empty) {
    if (!rows.length) return '<p class="muted">' + esc(empty) + '</p>';
    return '<div class="scroll-x"><table class="list dash-table"><thead><tr>' + head.map(function (h) {
      return '<th' + (h[1] ? ' class="n"' : '') + '>' + esc(h[0]) + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (c, i) { return '<td' + (head[i][1] ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
  }

  function render() {
    var d = data;
    var t = d.tiles;
    var out = [];
    out.push('<div class="dash-head"><p class="muted">Weeks ' + esc(d.period) + ' (last 8). <a href="#" id="dRefresh">Refresh</a></p></div>');
    out.push('<div class="tiles">' +
      tile('Posts', num(t.posts), t.group_posts + ' in groups') +
      tile('Group posts live', pct(t.live_rate), 'of those checked') +
      tile('Group posts removed', pct(t.removed_rate), 'of those checked') +
      tile('Leads', num(t.leads), 'comments asking to book or buy') +
      tile('Groups not posted', num(t.stale_groups), d.stale_days + '+ days') + '</div>');
    out.push('<div class="dash-grid"><section class="card"><h2 class="card-title">Posts per week <a href="#" id="dAsTable" class="small">' +
      (asTable ? 'Show chart' : 'Show as table') + '</a></h2>' + (asTable ? weekTable(d.per_week) : legend(SERIES) + weekChart(d.per_week)) + '</section>');
    out.push('<section class="card"><h2 class="card-title">How group posts end up</h2>' + statusBar(d.status) + '</section></div>');
    out.push('<section class="card"><h2 class="card-title">Engagement by channel</h2>' + table(
      [['Channel'], ['Posts', 1], ['With numbers', 1], ['Reactions', 1], ['Comments', 1], ['Avg reactions', 1], ['Avg comments', 1], ['Views', 1], ['Leads', 1]],
      d.by_channel.map(function (c) {
        return [esc({ Page: 'Facebook Page', IG: 'Instagram', Group: 'Groups' }[c.channel]), c.posts, c.measured, num(c.reactions), num(c.comments),
          num(c.avg_reactions), num(c.avg_comments), c.channel === 'Group' ? '-' : num(c.views), c.leads];
      }), 'No posts yet.') + '</section>');
    out.push('<section class="card"><h2 class="card-title">Engagement by group</h2>' + table(
      [['Group'], ['Posts', 1], ['Live', 1], ['Removed', 1], ['Pending', 1], ['Avg reactions', 1], ['Avg comments', 1], ['Leads', 1]],
      d.by_group.map(function (g) {
        return [esc(g.name), g.posts, g.live, g.removed, g.pending, num(g.avg_reactions), num(g.avg_comments), g.leads];
      }), 'No group posts in these weeks.') + '</section>');
    out.push('<div class="dash-grid"><section class="card"><h2 class="card-title">Groups not posted for ' + d.stale_days + '+ days' +
      (d.stale_total > d.stale.length ? ' (' + d.stale_total + ', longest first)' : '') + '</h2>' + table(
      [['Group'], ['Members', 1], ['Last post'], ['Days', 1]],
      d.stale.map(function (g) {
        return [esc(g.name), num(g.members), g.last_post ? esc(g.last_post.slice(0, 10)) : 'never', g.days === null ? '-' : g.days];
      }), 'Every group had a post in the last ' + d.stale_days + ' days.') + '</section>');
    out.push('<section class="card"><h2 class="card-title">Groups that remove posts</h2>' + table(
      [['Group'], ['Removed', 1], ['Checked', 1], ['Removed rate', 1]],
      d.removers.map(function (g) { return [esc(g.name), g.removed, g.checked, g.rate + '%']; }),
      'None yet. A group shows here after 2 checked posts with at least one removed.') + '</section></div>');
    $('t-dash').innerHTML = out.join('');
    $('dRefresh').addEventListener('click', function (ev) { ev.preventDefault(); load(); });
    $('dAsTable').addEventListener('click', function (ev) { ev.preventDefault(); asTable = !asTable; render(); });
    hover();
  }

  /** Tooltip for each week column: hover or keyboard focus. */
  function hover() {
    var tip = $('dTip');
    if (!tip) return;
    Array.prototype.forEach.call($('t-dash').querySelectorAll('.col'), function (col) {
      var show = function () {
        var r = data.per_week[Number(col.getAttribute('data-i'))];
        tip.innerHTML = '<b>' + esc(r.week) + '</b>' + SERIES.map(function (s) {
          return '<div><span class="swatch" style="background:' + s[2] + '"></span>' + esc(s[1]) + ' <b>' + r[s[0]] + '</b></div>';
        }).join('');
        tip.hidden = false;
        var box = col.getBoundingClientRect();
        var host = col.closest('.chart').getBoundingClientRect();
        tip.style.left = Math.min(box.left - host.left + box.width / 2 + 8, host.width - 150) + 'px';
        tip.style.top = '8px';
      };
      col.addEventListener('mouseenter', show);
      col.addEventListener('focus', show);
      col.addEventListener('mouseleave', function () { tip.hidden = true; });
      col.addEventListener('blur', function () { tip.hidden = true; });
    });
  }

  function load() {
    $('t-dash').innerHTML = '<p class="muted">Loading…</p>';
    PW.api('dashboard').then(function (r) {
      data = r.data;
      loaded = true;
      render();
    }, function (err) {
      $('t-dash').innerHTML = err.auth ? PW.noKeyHtml() : '<p class="note bad">' + esc(err.message) + '</p>';
    });
  }

  window.PW_DASHBOARD = { show: function () { if (!loaded) load(); } };
  if (String(location.hash) === '#dash' && PW.key) load();
})();
