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

  /**
   * Two tables from one list (the buttons' index points into it): ideas made for a dated event or holiday, with the
   * day to post, then the pool to pick from and place in your own schedule, without dates.
   */
  function ideasTable() {
    var list = (data.ideas || []).filter(function (i) { return i.status !== 'Replaced'; });
    if (!list.length) return '<h3 class="ai-h">Ideas</h3><p class="muted">No ideas yet.</p>';
    var events = [];
    var pool = [];
    list.forEach(function (i, k) { (i.event ? events : pool).push(k); });
    var head = function (first) {
      return '<table class="list ai-ideas"><thead><tr>' + (first ? '<th>' + first + '</th>' : '') +
        '<th>Idea</th><th>Goal</th><th>Photo</th><th>Facts</th><th></th></tr></thead><tbody>';
    };
    return (events.length ? '<h3 class="ai-h">Events and holidays</h3><p class="muted small">Ideas made for a date: post on or before it.</p>' +
        head('Event') + events.map(function (k) { return ideaRow(list[k], k, true); }).join('') + '</tbody></table>' : '') +
      '<h3 class="ai-h">Ideas to pick from</h3><p class="muted small">' + pool.length + ' ideas: pick the ones you like and place them in your own week.</p>' +
      (pool.length ? head('') + pool.map(function (k) { return ideaRow(list[k], k, false); }).join('') + '</tbody></table>' : '');
  }

  function ideaRow(i, k, isEvent) {
        var missing = (i.facts_missing || []).map(function (m) { return '<div class="bad small">Missing: ' + esc(m) + '</div>'; }).join('');
        var needed = (i.facts_needed || []).length ? '<div class="muted small">Uses: ' + esc(i.facts_needed.join(', ')) + '</div>' : '';
        var sources = (i.sources || []).map(function (u) { return link(u); }).filter(Boolean).join(' · ');
        return '<tr' + (i.status === 'Dismissed' ? ' class="muted"' : '') + '>' +
          (isEvent ? '<td data-th="Event"><b>' + esc(i.event) + '</b><div class="muted small">Post ' + esc(i.suggested_at || '') + '</div></td>' : '') +
          '<td data-th="Idea"><b>' + esc(i.title) + '</b><div>' + esc(i.hook) + '</div><div class="muted small">' + esc(i.angle) + '</div>' +
          (i.why ? '<div class="muted small">From findings ' + esc(i.why) + (sources ? ': ' + sources : '') + '</div>' : '') + '</td>' +
          '<td data-th="Goal">' + esc(i.goal) + '<div class="muted small">' + esc(TYPE_NAMES[i.content_type] || i.content_type) + ' · ' + esc(i.branch) + '</div></td>' +
          '<td data-th="Photo" class="small">' + esc(i.image_brief) + '</td>' +
          '<td data-th="Facts">' + (missing || needed || '<span class="muted small">-</span>') + '</td>' +
          '<td class="nowrap">' +
          (['New', 'Writing', 'Written'].indexOf(i.status) >= 0 ? '<button type="button" data-write="' + k + '">' + (i.status === 'New' ? 'Write post' : 'Open drafts') + '</button>' : '') +
          (i.status === 'New' ? '<button type="button" class="alt" data-dismiss="' + k + '">Dismiss</button>' : '') +
          (i.status !== 'New' ? '<span class="tag">' + esc(i.status) + '</span>' : '') + '</td></tr>';
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
    Array.prototype.forEach.call(box.querySelectorAll('button[data-write]'), function (b) {
      b.addEventListener('click', function () { writeIdea(ideas[Number(b.getAttribute('data-write'))]); });
    });
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

  // ------------------------------------------------------------ New post: the AI card

  var JOB_KEY = 'pw_ai_job';
  var SCORE_NAMES = { hook: 'Hook', voice: 'Voice', readability: 'Easy to read', cta: 'Call to action', trend_fit: 'Fits the moment',
    originality: 'Original', fact_tone: 'Facts said well' };
  var STEP_LABELS = { write: 'Writing 3 versions', validate: 'Checking facts and prices', review: 'Scoring', rewrite: 'Rewriting the weak ones',
    validate_rewrite: 'Checking the rewrites', save: 'Saving', revise: 'Editing' };
  var cbox = null;
  var job = null;
  var cnote = '';
  var timer = null;
  var lastHasText = false;

  function keepJob() {
    try {
      if (job && job.status === 'active') localStorage.setItem(JOB_KEY, job.pipeline_id);
      else localStorage.removeItem(JOB_KEY);
    } catch (e) { /* private window */ }
  }

  function poll() {
    clearTimeout(timer);
    if (!job || job.status !== 'active') return;
    timer = setTimeout(function () {
      PW.api('aiJob', { pipeline_id: job.pipeline_id }).then(function (r) {
        job = r.data;
        cnote = '';
        keepJob();
        renderCompose();
        poll();
      }, function (err) {
        cnote = 'Could not ask how it goes: ' + err.message + '. It keeps going on the server; it asks again in a moment.';
        renderCompose();
        poll();
      });
    }, 4000);
  }

  function start(action, body, what) {
    cnote = '';
    job = { status: 'starting', what: what };
    renderCompose();
    PW.api(action, body).then(function (r) {
      job = r.data;
      keepJob();
      renderCompose();
      poll();
    }, function (err) {
      job = null;
      cnote = 'Not started: ' + err.message;
      renderCompose();
    });
  }

  /** Content plan > Write post: the composer opens and the idea is written there. */
  function writeIdea(idea) {
    location.hash = '#compose';
    start('aiWrite', { idea_id: idea.idea_id }, idea.title);
  }

  function issueList(d) {
    var out = [];
    (d.blocking || []).forEach(function (b) {
      out.push(b.rule === 'placeholder' ? '<li class="warnc">Fill in before posting: ' + esc(b.quote || '') + '</li>'
        : '<li class="badc">' + esc(b.message) + (b.quote ? ' <span class="muted">(' + esc(b.quote) + ')</span>' : '') + '</li>');
    });
    (d.placeholders || []).slice(1).forEach(function (p) { out.push('<li class="warnc">Fill in before posting: ' + esc(p) + '</li>'); });
    (d.warnings || []).forEach(function (w) { out.push('<li class="muted">' + esc(w.message) + '</li>'); });
    return out.length ? '<ul class="draft-issues">' + out.join('') + '</ul>' : '';
  }

  function draftBlock(d, k) {
    var scores = d.scores ? '<details class="draft-more"><summary>Scores and editor notes</summary><table class="list small"><tbody>' +
      Object.keys(SCORE_NAMES).map(function (s) { return '<tr><td>' + esc(SCORE_NAMES[s]) + '</td><td class="n">' + esc(d.scores[s]) + '</td></tr>'; }).join('') +
      '</tbody></table>' + (d.issues || []).map(function (i) {
        return '<p class="small"><b>' + esc(i.quote) + '</b><br>' + esc(i.fix) + '</p>';
      }).join('') + '</details>' : '';
    var badge = d.style === 'revise' ? '' : d.passed ? '<span class="tag st-done">Passed</span>' : '<span class="tag st-failed">Needs work</span>';
    return '<div class="draft"><div class="draft-head"><b>' + esc(d.style_name) + '</b>' + badge +
      (d.avg !== null && d.avg !== undefined ? '<span class="muted small">' + esc(d.avg) + ' / 5</span>' : '') +
      (d.rewritten ? '<span class="muted small">rewritten once</span>' : '') + '</div>' +
      '<div class="draft-text">' + esc(d.text) + '</div>' + issueList(d) + scores +
      '<button type="button" data-use="' + k + '">Use this draft</button></div>';
  }

  function quickBar() {
    return '<div class="quick-edit"><b class="small">Quick edit of the text in the box</b><div class="quick">' +
      '<button type="button" class="alt" data-quick="shorter">Shorter</button><button type="button" class="alt" data-quick="funnier">Funnier</button>' +
      '<button type="button" class="alt" data-quick="offer">Push the offer</button><button type="button" class="alt" data-quick="question">End with a question</button></div>' +
      '<div class="row"><input type="text" id="aiAsk" maxlength="300" placeholder="Or say what to change"><button type="button" class="alt" id="aiAskGo">Edit</button></div></div>';
  }

  function renderCompose() {
    if (!cbox) return;
    var c = window.PW_COMPOSE;
    var html = '<h2 class="card-title">Write with AI</h2>';
    if (!job) {
      html += '<p class="muted small">Pick an idea in Content plan (Write post), or say what the post is about. The AI writes 3 versions, ' +
        'checks every price and promo against Knowledge, and scores them. About 0.1 USD.</p>' +
        '<label for="aiTopic">What is the post about?</label><input type="text" id="aiTopic" maxlength="300" placeholder="e.g. Hot rice rolls on a rainy morning">' +
        '<p class="muted small">Uses the branch, content type and goal chosen on the left.</p>' +
        '<button type="button" id="aiFree">Write 3 drafts</button>';
    } else if (job.status === 'starting' || job.status === 'active') {
      var now = (job.steps || []).filter(function (s) { return s.status === 'running' || s.status === 'waiting'; })[0];
      var title = job.brief ? job.brief.title || '' : job.what || '';
      html += (title ? '<p><b>' + esc(title) + '</b></p>' : '') +
        '<p class="muted">' + esc(now ? STEP_LABELS[now.step] || now.step : 'Starting') + '… This takes about a minute; you can keep writing on the left.</p>';
    } else {
      var b = job.brief || {};
      if (job.type === 'write' && b.title) {
        html += '<div class="draft-idea"><b>' + esc(b.title) + '</b>' + (b.image_brief ? '<p class="small">' + esc(b.image_brief) + '</p>' : '') +
          ((b.facts_missing || []).length ? '<p class="small badc">Missing facts: ' + esc(b.facts_missing.join('; ')) + '</p>' : '') + '</div>';
      }
      if (job.status !== 'done') {
        var failed = (job.steps || []).filter(function (s) { return s.error; }).map(function (s) { return s.error; })[0] || job.status;
        html += '<p class="note bad">It did not finish: ' + esc(failed) + '</p>';
      }
      html += (job.drafts || []).map(draftBlock).join('');
      html += '<p class="small"><a href="#" id="aiOver">Start over</a></p>';
    }
    if (c && c.getText().trim().length >= 30 && (!job || job.status === 'done' || job.status === 'failed')) html += quickBar();
    if (cnote) html += '<p class="note">' + esc(cnote) + '</p>';
    cbox.innerHTML = html;
    bindCompose();
  }

  function bindCompose() {
    var c = window.PW_COMPOSE;
    var q = function (id) { return document.getElementById(id); };
    if (q('aiFree')) {
      q('aiFree').addEventListener('click', function () {
        var topic = q('aiTopic').value.trim();
        if (!topic) { cnote = 'Say what the post is about first.'; renderCompose(); return; }
        var f = c.fields();
        start('aiWrite', { topic: topic, content_type: f.content_type, goal: f.goal, branch: f.branch }, topic);
      });
    }
    if (q('aiOver')) q('aiOver').addEventListener('click', function (ev) { ev.preventDefault(); job = null; cnote = ''; keepJob(); renderCompose(); });
    Array.prototype.forEach.call(cbox.querySelectorAll('button[data-use]'), function (btn) {
      btn.addEventListener('click', function () {
        var d = job.drafts[Number(btn.getAttribute('data-use'))];
        var b = job.brief || {};
        c.setText(d.text);
        c.setRefs({ idea_id: b.idea_id || d.idea_id || '', ai_draft_id: d.draft_id });
        if (job.type === 'write') c.setFields({ topic: b.title, branch: b.branch, content_type: b.content_type, goal: b.goal });
        PW.api('aiPick', { draft_id: d.draft_id }).then(function () {}, function () {});
        cnote = 'Put in the box. Edit it, fill every [CẦN XÁC NHẬN: …], then Post.';
        renderCompose();
      });
    });
    var ask = function (body) {
      var f = c.fields();
      var refs = c.refs();
      start('aiRevise', Object.assign({ text: c.getText(), draft_id: refs.ai_draft_id, idea_id: refs.idea_id, branch: f.branch }, body), 'Quick edit');
    };
    Array.prototype.forEach.call(cbox.querySelectorAll('button[data-quick]'), function (btn) {
      btn.addEventListener('click', function () { ask({ quick: btn.getAttribute('data-quick') }); });
    });
    if (q('aiAskGo')) {
      q('aiAskGo').addEventListener('click', function () {
        var v = q('aiAsk').value.trim();
        if (v) ask({ instruction: v });
      });
    }
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
    /** The AI card of New post; a write still going when the page was left is picked up again. */
    mountCompose: function (el) {
      cbox = el;
      var saved = null;
      try { saved = localStorage.getItem(JOB_KEY); } catch (e) { saved = null; }
      if (saved && !job) {
        job = { pipeline_id: saved, status: 'active', steps: [] };
        poll();
      }
      renderCompose();
    },
    /** The composer text changed (quick edit shows once there is a text) or a new post was started. */
    composeChanged: function () {
      // Only when the quick edits appear or go (30 characters): typing must not redraw the card.
      var has = !!(window.PW_COMPOSE && window.PW_COMPOSE.getText().trim().length >= 30);
      if (has !== lastHasText) { lastHasText = has; renderCompose(); }
    },
    composeReset: function () { clearTimeout(timer); job = null; cnote = ''; keepJob(); renderCompose(); },
  };
})();
