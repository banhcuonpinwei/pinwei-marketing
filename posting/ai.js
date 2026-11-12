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

  // Rewrite all: the runs still going ({pipeline_ids, total, failed}), asked every 6 seconds until they end.
  var rewriting = null;

  function newIdeas() {
    return (data && data.ideas || []).filter(function (i) { return i.status === 'New'; });
  }

  function rewriteAll() {
    var ids = newIdeas().map(function (i) { return i.idea_id; });
    PW.api('aiIdeaRewriteAll', { idea_ids: ids }).then(function (r) {
      rewriting = { pipeline_ids: r.data.pipeline_ids, total: r.data.pipeline_ids.length, failed: [] };
      note = r.data.skipped.length ? 'Not rewritten (already moved on): ' + r.data.skipped.join(', ') : '';
      render();
      setTimeout(pollRewrites, 6000);
    }, function (e) {
      note = 'Not started: ' + e.message;
      render();
    });
  }

  function pollRewrites() {
    if (!rewriting) return;
    PW.api('aiJobs', { pipeline_ids: rewriting.pipeline_ids }).then(function (r) {
      var going = [];
      r.data.forEach(function (j) {
        if (j.status === 'active') { going.push(j.pipeline_id); return; }
        if (j.idea) data.ideas = data.ideas.map(function (x) { return x.idea_id === j.idea.idea_id ? j.idea : x; });
        else rewriting.failed.push(j.error || j.status);
      });
      rewriting.pipeline_ids = going;
      if (!going.length) {
        var n = rewriting.total - rewriting.failed.length;
        note = n + ' of ' + rewriting.total + ' ideas rewritten.' + (rewriting.failed.length ? ' Not rewritten: ' + rewriting.failed[0] : '');
        rewriting = null;
      } else {
        setTimeout(pollRewrites, 6000);
      }
      PW.keep('aiStatus', data);
      render();
    }, function () { setTimeout(pollRewrites, 6000); });
  }

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
    var ap = d.apify;
    var money = '<table class="spend"><thead><tr><th>Spent</th><th>This month</th><th>Today</th></tr></thead><tbody>' +
      '<tr><td data-th="Spent">OpenAI</td><td data-th="This month">' + usd(d.spend.month_used_usd) + ' of ' + usd(d.spend.monthly_cap_usd) + ' USD</td>' +
      '<td data-th="Today">' + usd(d.spend.day_used_usd) + ' of ' + usd(d.spend.daily_cap_usd) + ' USD</td></tr>' +
      (ap ? '<tr><td data-th="Spent">Apify</td><td data-th="This month">' + (ap.error ? '<span class="muted">not read: ' + esc(ap.error) + '</span>'
        : usd(ap.month_used_usd) + ' of ' + usd(ap.monthly_cap_usd) + ' USD' + (ap.cycle_start ? ' <span class="muted">(since ' + esc(ap.cycle_start) + ')</span>' : '')) +
        '</td><td data-th="Today" class="muted">no daily limit</td></tr>' : '') +
      (ap && !ap.error ? '<tr><td data-th="Spent"><b>Total</b></td><td data-th="This month"><b>' + usd(d.spend.month_used_usd + ap.month_used_usd) + ' USD</b></td><td></td></tr>' : '') +
      '</tbody></table><p class="muted small">Today is Vietnam time. Apify counts its own billing cycle and is read every 10 minutes.</p>';
    var pb = d.playbook;
    var playbook = '<p class="muted small">Playbook: ' + (pb ? 'updated ' + esc(new Date(pb.at).toLocaleDateString('en-GB')) + ', ' +
      (pb.applied || []).length + ' change' + ((pb.applied || []).length === 1 ? '' : 's') + '. ' + esc(pb.summary || '') +
      ((pb.applied || []).length ? ' (' + (pb.applied || []).map(function (c) { return esc(c.action + ' ' + c.rule_id); }).join(', ') + ')' : '')
      : 'not updated by the AI yet. It updates on the 1st of each month; rules marked locked in the sheet are never changed.') + '</p>';
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
      (rewriting ? '<button type="button" disabled>Rewriting: ' + (rewriting.total - rewriting.pipeline_ids.length) + ' of ' + rewriting.total + ' done</button>'
        : d.enabled && newIdeas().length ? '<button type="button" class="alt" id="aiRewriteAll">Rewrite all ideas</button>' : '') +
      (d.enabled ? '<button type="button" class="alt" id="aiPlaybook">Update Playbook</button>' : '') +
      (d.enabled ? '<button type="button" class="alt" id="aiStop">Stop AI</button>' : '') +
      '<button type="button" class="alt" id="aiRefresh">Refresh AI</button></div>' +
      (d.can_research ? '<p class="muted small">' + esc(d.can_research) + '</p>' : '');
    return '<div class="card ai-card">' + head + runInfo + money + facts + playbook + rows.join('') + buttons +
      (note ? '<p class="note">' + esc(note) + '</p>' : '') + '</div>';
  }

  /**
   * The ideas as cards in two columns: the pool to pick from (place them in your own week) and the ideas made for a
   * dated event or holiday. A card opens the preview: the suggested post as it would look on Facebook, then its layout.
   */
  function ideasTable() {
    var list = (data.ideas || []).filter(function (i) { return i.status !== 'Replaced'; });
    if (!list.length) return '<h3 class="ai-h">Ideas</h3><p class="muted">No ideas yet.</p>';
    var events = [];
    var pool = [];
    list.forEach(function (i, k) { (i.event ? events : pool).push(k); });
    var column = function (title, lead, keys) {
      return '<section class="idea-col"><h3 class="ai-h">' + title + '</h3><p class="muted small">' + lead + '</p>' +
        (keys.length ? keys.map(function (k) { return ideaCard(list[k], k); }).join('') : '<p class="muted small">None this time.</p>') + '</section>';
    };
    return '<div class="idea-board">' +
      column('Ideas to pick from', pool.length + ' ideas. Open one to read the suggested post; place the ones you like in your own week.', pool) +
      column('Holidays and events', 'Made for a date: post on or before it.', events) + '</div>';
  }

  function ideaCard(i, k) {
    var state = i.status === 'New' ? '' : '<span class="tag">' + esc(i.status) + '</span>';
    return '<button type="button" class="idea-card' + (i.status === 'Dismissed' ? ' is-off' : '') + '" data-idea="' + k + '">' +
      (i.event ? '<span class="idea-when">' + esc(i.event) + ' · post ' + esc(i.suggested_at || '') + '</span>' : '') +
      '<span class="idea-title">' + esc(i.title) + '</span>' +
      '<span class="idea-hook">' + esc(i.hook) + '</span>' +
      '<span class="idea-meta">' + esc(i.goal) + ' · ' + esc(TYPE_NAMES[i.content_type] || i.content_type) + ' · ' + esc(i.branch) +
      ((i.facts_missing || []).length ? ' · <span class="badc">' + i.facts_missing.length + ' to check</span>' : '') + ' ' + state + '</span></button>';
  }

  /** The preview of one idea, like a post on Facebook, then its layout and what to check. Esc or Close shuts it. */
  function openPreview(i) {
    var old = document.getElementById('ideaPreview');
    if (old) old.remove();
    var text = i.sample_post || [i.hook, i.angle].filter(Boolean).join('\n\n');
    var sources = (i.sources || []).map(function (u) { return link(u); }).filter(Boolean).join('<br>');
    var checks = (i.facts_missing || []).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('');
    var wrap = document.createElement('div');
    wrap.id = 'ideaPreview';
    wrap.className = 'preview-wrap';
    wrap.innerHTML = '<div class="preview" role="dialog" aria-modal="true" aria-labelledby="pvTitle">' +
      '<div class="preview-head"><b id="pvTitle">' + esc(i.title) + '</b><button type="button" class="alt" id="pvClose">Close</button></div>' +
      '<div class="preview-body">' +
      '<h4 class="pv-h">Suggested post</h4>' +
      '<article class="fb-post"><div class="fb-top"><img src="pinwei-mark.jpg" alt="" width="40" height="40"><div><b>Pin Wei</b>' +
      '<div class="muted small">' + esc(i.event ? i.event + ' · ' + (i.suggested_at || '') : 'Any day') + ' · ' + esc(i.branch === 'All' ? 'all branches' : i.branch) + '</div></div></div>' +
      '<div class="fb-text">' + esc(text) + '</div>' +
      '<div class="fb-photo"><span>Photo</span>' + esc(String(i.image_brief || '').replace(/^Ảnh: /, '')) + '</div>' +
      '<div class="fb-bar"><span>Like</span><span>Comment</span><span>Share</span></div></article>' +
      (i.sample_post ? '' : '<p class="muted small">This idea was made before suggested posts existed: run the research again for one.</p>') +
      '<h4 class="pv-h">Layout</h4><div class="pv-layout">' + esc(i.layout || i.angle || '') + '</div>' +
      (checks ? '<h4 class="pv-h">Check before posting</h4><ul class="pv-checks">' + checks + '</ul>' : '') +
      ((i.facts_needed || []).length ? '<p class="muted small">Uses Knowledge: ' + esc(i.facts_needed.join(', ')) + '</p>' : '') +
      (i.why ? '<p class="muted small">From findings ' + esc(i.why) + (sources ? ':<br>' + sources : '') + '</p>' : '') +
      '</div>' +
      (i.status === 'New' ? '<div class="preview-edit"><label for="pvAsk">Rewrite this idea with AI (no new research, about 0.01 USD)</label>' +
        '<div class="row"><input type="text" id="pvAsk" maxlength="300" placeholder="Optional: what to change, e.g. funnier, shorter, focus on the combo">' +
        '<button type="button" class="alt" id="pvRewrite">Rewrite with AI</button></div><p class="small muted" id="pvNote"></p></div>' : '') +
      '<div class="preview-foot">' +
      (['New', 'Writing', 'Written'].indexOf(i.status) >= 0 ? '<button type="button" id="pvWrite">' + (i.status === 'New' ? 'Write 3 drafts' : 'Open drafts') + '</button>' : '') +
      (i.status === 'New' ? '<button type="button" class="alt" id="pvDismiss">Dismiss</button>' : '<span class="tag">' + esc(i.status) + '</span>') +
      '</div></div>';
    document.body.appendChild(wrap);
    var close = function () {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
    };
    var onKey = function (ev) { if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', function (ev) { if (ev.target === wrap) close(); });
    document.getElementById('pvClose').addEventListener('click', close);
    document.getElementById('pvClose').focus();
    if (document.getElementById('pvWrite')) {
      document.getElementById('pvWrite').addEventListener('click', function () { close(); writeIdea(i); });
    }
    if (document.getElementById('pvDismiss')) {
      twoClick(document.getElementById('pvDismiss'), 'Click again: set it aside', function () {
        close();
        call('ideaDismiss', { idea_id: i.idea_id }, 'Idea set aside.');
      });
    }
    if (document.getElementById('pvRewrite')) {
      document.getElementById('pvRewrite').addEventListener('click', function () {
        var btn = document.getElementById('pvRewrite');
        var say = function (t) { var n = document.getElementById('pvNote'); if (n) n.textContent = t; };
        btn.disabled = true;
        say('Rewriting… about 20 seconds.');
        rewriteIdea(i, document.getElementById('pvAsk').value.trim(), say, function (fresh) {
          if (!document.getElementById('ideaPreview')) return;
          close();
          openPreview(fresh);
        }, function () { if (document.getElementById('pvRewrite')) document.getElementById('pvRewrite').disabled = false; });
      });
    }
  }

  /**
   * Rewrite with AI on one idea: starts the small run, asks how it goes every 4 seconds, then puts the new idea in the
   * list (and in what this browser keeps) and hands it back to draw the preview again.
   */
  function rewriteIdea(idea, instruction, say, done, failed) {
    var finish = function (job) {
      if (job.status === 'done' && job.idea) {
        data.ideas = (data.ideas || []).map(function (x) { return x.idea_id === job.idea.idea_id ? job.idea : x; });
        PW.keep('aiStatus', data);
        render();
        done(job.idea);
        return;
      }
      if (job.status !== 'active') {
        var err = (job.steps || []).filter(function (s) { return s.error; }).map(function (s) { return s.error; })[0] || job.status;
        say('Not rewritten: ' + err);
        failed();
        return;
      }
      setTimeout(function () {
        PW.api('aiJob', { pipeline_id: job.pipeline_id }).then(function (r) { finish(r.data); }, function (e) { say('Still working (' + e.message + ')…'); finish(job); });
      }, 4000);
    };
    PW.api('aiIdeaRewrite', { idea_id: idea.idea_id, instruction: instruction }).then(function (r) { finish(r.data); }, function (e) {
      say('Not started: ' + e.message);
      failed();
    });
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
    if (q('aiRewriteAll')) {
      var n = newIdeas().length;
      twoClick(q('aiRewriteAll'), 'Click again: rewrite ' + n + ' ideas (about ' + usd(n * 0.01) + ' USD)', rewriteAll);
    }
    if (q('aiPlaybook')) {
      twoClick(q('aiPlaybook'), 'Click again: update the Playbook (about 0.10 USD)', function () {
        call('aiPlaybookNow', {}, 'Playbook update started. The changes land in the Playbook sheet in a few minutes; press Refresh AI then.');
      });
    }
    if (q('aiStop')) {
      twoClick(q('aiStop'), 'Click again: stop every AI step', function () {
        call('aiStop', {}, 'AI stopped. Set ai_enabled to TRUE in Config to turn it on again.');
      });
    }
    var ideas = (d.ideas || []).filter(function (i) { return i.status !== 'Replaced'; });
    Array.prototype.forEach.call(box.querySelectorAll('button[data-idea]'), function (b) {
      b.addEventListener('click', function () { openPreview(ideas[Number(b.getAttribute('data-idea'))]); });
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
    box.innerHTML = (loading ? '<p class="muted small">Refreshing the AI part…</p>' : '') + statusCard() + ideasTable() + findingsTable();
    bind();
  }

  /**
   * Loads the AI part. The first time, what this browser got last time is drawn at once (marked as being refreshed),
   * so the tab never waits on Apps Script to show something; the fresh answer replaces it.
   */
  function load(force) {
    if (loading || (data && !force)) { render(); return Promise.resolve(); }
    if (!data) {
      var last = PW.remembered('aiStatus');
      if (last) data = last.data;
    }
    loading = true;
    render();
    return PW.api('aiStatus', {}).then(function (r) {
      loading = false;
      data = r.data;
      PW.keep('aiStatus', r.data);
      render();
    }, function (err) {
      loading = false;
      if (err && err.auth) PW.forget('aiStatus');
      note = 'The AI part did not load: ' + err.message;
      render();
    });
  }

  // ------------------------------------------------------------ New post: the AI card

  var JOB_KEY = 'pw_ai_job';
  var SCORE_NAMES = { hook: 'Hook (first line)', see_more: 'Earns "See more"', specific: 'Specific, sensory', no_fluff: 'No fluff',
    info_block: 'Info block', brevity: 'Short and clear', voice: 'Voice', readability: 'Easy to read', cta: 'Call to action', trend_fit: 'Fits the moment',
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
      Object.keys(SCORE_NAMES).map(function (s) { return '<tr><td>' + esc(SCORE_NAMES[s]) + '</td><td class="n">' + esc(d.scores[s] === undefined ? '' : d.scores[s]) + '</td></tr>'; }).join('') +
      '</tbody></table>' + (d.issues || []).map(function (i) {
        return '<p class="small"><b>' + esc(i.quote) + '</b><br>' + esc(i.fix) + '</p>';
      }).join('') + '</details>' : '';
    var badge = d.style === 'revise' ? '' : d.passed ? '<span class="tag st-done">Passed</span>' : '<span class="tag st-failed">Needs work</span>';
    return '<div class="draft"><div class="draft-head"><b>' + esc(d.style_name) + '</b>' + badge +
      (d.avg !== null && d.avg !== undefined ? '<span class="muted small">' + esc(d.avg) + ' / ' + esc(d.scale || 10) + '</span>' : '') +
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

  // helper.js loads before this file and may already have drawn the page (from the answer kept in this browser):
  // put the AI parts in their places now, or they would wait for a redraw that may never come.
  if (document.getElementById('aiPlan')) window.PW_AI.mount(document.getElementById('aiPlan'), String(location.hash) === '#plan');
  if (document.getElementById('aiCompose')) window.PW_AI.mountCompose(document.getElementById('aiCompose'));
})();
