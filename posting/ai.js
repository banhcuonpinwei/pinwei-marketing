/*
 * The AI part of the Content plan tab: this week's ideas and research, the last run's steps, the money spent, and the
 * buttons (Research again, Run again, Stop AI, Dismiss, Useful / Not useful). It loads its own data ("aiStatus") the
 * first time the tab opens, and again after a button or on Refresh AI. Flat tables, navy buttons, no icons; buttons
 * that cost money or stop things need two clicks.
 */
(function () {
  'use strict';
  var esc = PW.esc;
  var data = null;
  var loading = false;
  var box = null;
  var note = '';

  var STEP_NAMES = {
    collect_internal: 'Read Pin Wei posts', collect_kol: 'Read TikTok (KOL)', collect_competitors: 'Start competitor read',
    wait_competitors: 'Competitor posts', research_web: 'Web research', structure_research: 'Findings', ideas: 'Ideas', check_ideas: 'Check ideas',
  };
  var KIND_NAMES = { trend: 'Trend', event: 'Event', competitor: 'Competitor', own: 'Our posts', season: 'Season', other: 'Other' };
  var TYPE_NAMES = { Food: 'Food / new dish', Promo: 'Promo / combo', Trend: 'Trend / fun', Brand: 'Brand / customers' };

  function usd(n) { return (Number(n) || 0).toFixed(2); }

  function link(u, text) {
    if (!/^https?:\/\//i.test(String(u))) return '';
    return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(text || String(u).replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)) + '</a>';
  }

  /** A button that acts on the second click (the first one says what will happen). */
  function twoClick(btn, ask, go) {
    var armed = null;
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      if (!armed) {
        btn.textContent = ask;
        armed = setTimeout(function () { armed = null; btn.textContent = label; }, 5000);
        return;
      }
      clearTimeout(armed);
      armed = null;
      btn.disabled = true;
      btn.textContent = 'Working…';
      go();
    });
  }

  function call(action, body, done) {
    return PW.api(action, body).then(function (r) {
      note = done || '';
      return load(true);
    }, function (err) {
      note = 'Not done: ' + err.message;
      render();
    });
  }

  function statusCard() {
    var d = data;
    var rows = [];
    var p = d.pipeline;
    var head = '<div class="row ai-head"><b>AI research</b>' + (d.enabled ? '<span class="tag st-on">On</span>' : '<span class="tag">Off</span>') + '</div>';
    if (!d.data_store) return '<div class="card ai-card">' + head + '<p class="note bad">The data store did not answer: ' + esc(d.error || '') + '</p></div>';
    var money = '<p class="muted small">Spent this month ' + usd(d.spend.month_used_usd) + ' of ' + usd(d.spend.monthly_cap_usd) +
      ' USD · today ' + usd(d.spend.day_used_usd) + ' of ' + usd(d.spend.daily_cap_usd) + ' USD (Vietnam time).</p>';
    var kn = d.knowledge || { total: 0, verified: 0 };
    var facts = '<p class="muted small">Knowledge: ' + kn.verified + ' of ' + kn.total + ' facts verified. ' +
      (kn.verified < 10 ? 'Ideas can only use verified facts; verify the branches, opening hours, main dishes and running promos in the Knowledge sheet.' : '') + '</p>';
    if (p) {
      // One line when all went well; the step table opens by itself when a step failed, waits for money or is stuck.
      var done = p.steps.filter(function (s) { return s.status === 'done' || s.status === 'skipped'; }).length;
      var trouble = p.steps.some(function (s) { return ['failed', 'dead', 'blocked', 'abandoned'].indexOf(s.status) >= 0; });
      rows.push('<details class="ai-steps"' + (trouble ? ' open' : '') + '><summary>' + done + ' of ' + p.steps.length + ' steps done' +
        (trouble ? ' · a step needs attention' : '') + '</summary><table class="list"><thead><tr><th>Step</th><th>Status</th><th>Note</th></tr></thead><tbody>' +
        p.steps.map(function (s) {
          return '<tr><td data-th="Step">' + esc(STEP_NAMES[s.step] || s.step) + '</td><td data-th="Status"><span class="tag st-' + esc(s.status) + '">' + esc(s.status) +
            '</span>' + (s.attempts > 1 ? ' <span class="muted small">try ' + s.attempts + '</span>' : '') + '</td><td data-th="Note" class="small">' + esc(s.error || '') + '</td></tr>';
        }).join('') + '</tbody></table></details>');
    }
    var runInfo = p ? '<p class="muted small">Last run ' + esc(p.week) + ' · ' + esc(p.status) + ' · started ' +
      esc(new Date(p.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</p>'
      : '<p class="muted small">No research yet. It runs every Monday from 05:00, ideas around 07:30.</p>';
    var blocked = p && p.steps.some(function (s) { return s.status === 'blocked'; });
    var buttons = '<div class="ai-actions">' +
      '<button type="button" id="aiResearch"' + (d.can_research ? ' disabled title="' + esc(d.can_research) + '"' : '') + '>Research again</button>' +
      (p && (p.status === 'failed' || blocked) ? '<button type="button" class="alt" id="aiAgain">Run again</button>' : '') +
      (d.enabled ? '<button type="button" class="alt" id="aiStop">Stop AI</button>' : '') +
      '<button type="button" class="alt" id="aiRefresh">Refresh AI</button></div>' +
      (d.can_research ? '<p class="muted small">' + esc(d.can_research) + '</p>' : '');
    return '<div class="card ai-card">' + head + runInfo + money + facts + rows.join('') + buttons +
      (note ? '<p class="note">' + esc(note) + '</p>' : '') + '</div>';
  }

  function ideasTable() {
    var list = (data.ideas || []).filter(function (i) { return i.status !== 'Replaced'; });
    if (!list.length) return '<h3 class="ai-h">Ideas this week</h3><p class="muted">No ideas yet.</p>';
    return '<h3 class="ai-h">Ideas this week</h3><table class="list ai-ideas"><thead><tr><th>Post on</th><th>Idea</th><th>Goal</th><th>Photo</th><th>Facts</th><th></th></tr></thead><tbody>' +
      list.map(function (i, k) {
        var missing = (i.facts_missing || []).map(function (m) { return '<div class="bad small">Missing: ' + esc(m) + '</div>'; }).join('');
        var needed = (i.facts_needed || []).length ? '<div class="muted small">Uses: ' + esc(i.facts_needed.join(', ')) + '</div>' : '';
        var sources = (i.sources || []).map(function (u) { return link(u); }).filter(Boolean).join(' · ');
        return '<tr' + (i.status === 'Dismissed' ? ' class="muted"' : '') + '><td data-th="Post on" class="nowrap">' + esc(i.suggested_at || '-') + '</td>' +
          '<td data-th="Idea"><b>' + esc(i.title) + '</b><div>' + esc(i.hook) + '</div><div class="muted small">' + esc(i.angle) + '</div>' +
          (i.why ? '<div class="muted small">From findings ' + esc(i.why) + (sources ? ': ' + sources : '') + '</div>' : '') + '</td>' +
          '<td data-th="Goal">' + esc(i.goal) + '<div class="muted small">' + esc(TYPE_NAMES[i.content_type] || i.content_type) + ' · ' + esc(i.branch) + '</div></td>' +
          '<td data-th="Photo" class="small">' + esc(i.image_brief) + '</td>' +
          '<td data-th="Facts">' + (missing || needed || '<span class="muted small">-</span>') + '</td>' +
          '<td class="nowrap">' + (i.status === 'New' ? '<button type="button" class="alt" data-dismiss="' + k + '">Dismiss</button>'
            : '<span class="tag">' + esc(i.status) + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function findingsTable() {
    var list = data.findings || [];
    var avoid = list.filter(function (f) { return f.finding_id === 'avoid'; })[0];
    var rows = list.filter(function (f) { return f.finding_id !== 'avoid'; });
    if (!rows.length) return '<h3 class="ai-h">Research this week</h3><p class="muted">No findings yet.</p>';
    return '<h3 class="ai-h">Research this week</h3><table class="list ai-findings"><thead><tr><th>Finding</th><th>For Pin Wei</th><th>Sources</th><th>Useful?</th></tr></thead><tbody>' +
      rows.map(function (f, k) {
        var btn = function (v, label) {
          return '<button type="button" class="' + (f.rating === v ? '' : 'alt') + '" data-rate="' + k + '" data-v="' + v + '">' + label + '</button>';
        };
        return '<tr><td data-th="Finding"><b>' + esc(f.finding_id) + ' · ' + esc(f.title) + '</b><div class="muted small">' + esc(KIND_NAMES[f.kind] || f.kind) +
          ' · ' + esc(f.market) + ' · ' + esc(f.confidence) + '</div><div>' + esc(f.summary) + '</div></td>' +
          '<td data-th="For Pin Wei">' + esc(f.why_pin_wei) + '<div class="muted small">' + esc(f.angle) + '</div></td>' +
          '<td data-th="Sources" class="small">' + ((f.evidence || []).map(function (e) { return link(e.url); }).filter(Boolean).join('<br>') || '<span class="muted">our data</span>') + '</td>' +
          '<td data-th="Useful?" class="nowrap">' + btn('useful', 'Useful') + btn('not_useful', 'Not useful') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (avoid && avoid.avoid ? '<p class="muted small">Avoid: ' + esc(avoid.avoid) + '</p>' : '');
  }

  function bind() {
    var d = data;
    var q = function (id) { return document.getElementById(id); };
    if (q('aiRefresh')) q('aiRefresh').addEventListener('click', function () { note = ''; load(true); });
    if (q('aiResearch') && !q('aiResearch').disabled) {
      twoClick(q('aiResearch'), 'Click again: research now (about 0.5 USD)', function () {
        call('aiResearchNow', {}, 'Research started. Ideas come in about 10 minutes; press Refresh AI then.');
      });
    }
    if (q('aiAgain')) {
      twoClick(q('aiAgain'), 'Click again: run again', function () {
        call('aiRunAgain', { pipeline_id: d.pipeline.pipeline_id }, 'Running again.');
      });
    }
    if (q('aiStop')) {
      twoClick(q('aiStop'), 'Click again: stop every AI step', function () {
        call('aiStop', {}, 'AI stopped. Set ai_enabled to TRUE in Config to turn it on again.');
      });
    }
    var ideas = (d.ideas || []).filter(function (i) { return i.status !== 'Replaced'; });
    Array.prototype.forEach.call(box.querySelectorAll('button[data-dismiss]'), function (b) {
      twoClick(b, 'Click again', function () {
        call('ideaDismiss', { idea_id: ideas[Number(b.getAttribute('data-dismiss'))].idea_id }, 'Idea set aside.');
      });
    });
    var findings = (d.findings || []).filter(function (f) { return f.finding_id !== 'avoid'; });
    Array.prototype.forEach.call(box.querySelectorAll('button[data-rate]'), function (b) {
      b.addEventListener('click', function () {
        var f = findings[Number(b.getAttribute('data-rate'))];
        var v = b.getAttribute('data-v');
        b.disabled = true;
        call('findingRate', { pipeline_id: f.pipeline_id, finding_id: f.finding_id, rating: f.rating === v ? '' : v }, 'Thanks: the monthly Playbook learns from this.');
      });
    });
  }

  function render() {
    if (!box) return;
    if (!data) {
      box.innerHTML = '<div class="card ai-card"><div class="row ai-head"><b>AI research</b></div><p class="muted">' +
        (loading ? 'Loading the research and ideas…' : esc(note || 'Not loaded.')) + '</p></div>';
      return;
    }
    box.innerHTML = statusCard() + ideasTable() + findingsTable();
    bind();
  }

  function load(force) {
    if (loading || (data && !force)) { render(); return Promise.resolve(); }
    loading = true;
    render();
    return PW.api('aiStatus', {}).then(function (r) {
      loading = false;
      data = r.data;
      render();
    }, function (err) {
      loading = false;
      note = 'The AI part did not load: ' + err.message;
      render();
    });
  }

  /**
   * Called by helper.js each time the Content plan is drawn (loadNow false: draw what is known) and when its tab
   * opens (loadNow true: load it the first time). Other tabs never wait on it.
   */
  window.PW_AI = {
    mount: function (el, loadNow) {
      box = el;
      if (loadNow) load(false);
      else render();
    },
  };
})();
