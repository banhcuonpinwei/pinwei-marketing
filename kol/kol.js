/*
 * The KOL site's main page: the Creators list (search, filters, 15 per page) and "Add a creator" by
 * profile link, and the tabs: #creators, #review, #outreach (drawn by review.js) and #dashboard (dashboard.js),
 * through window.KOL. The AI providers and TikTok data panel shows on the Creators tab.
 */
(function () {
  'use strict';
  var esc = PW.esc;
  var $ = function (id) { return document.getElementById(id); };
  var PAGE = 15;
  var state = { data: null, tab: 'creators', search: '', platform: 'All', status: 'All', sort: 'newest', page: 0, addOpen: false, classifying: false, classMsg: '' };
  var TABS = ['creators', 'review', 'outreach', 'dashboard'];

  function tabFromHash() {
    var t = String(location.hash || '').replace(/^#/, '').split('&')[0];
    return TABS.indexOf(t) >= 0 ? t : 'creators';
  }

  function showError(err) {
    $('main').innerHTML = err && err.auth ? PW.noKeyHtml() : '<p class="note bad">' + esc(err && err.message || err) + '</p>';
  }

  /** "3 days ago", "today" from an ISO date. */
  function ago(iso) {
    if (!iso) return '';
    var days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? '1 day ago' : days + ' days ago';
  }

  function load() {
    if (!window.PW_CONFIG.api) {
      $('main').innerHTML = '<p class="note warn">The KOL web app is not deployed yet, so there is nothing to show. ' +
        'See kol/README.md, One-time setup.</p>';
      return;
    }
    if (!PW.token()) return showError({ auth: true });
    state.tab = tabFromHash();
    window.addEventListener('hashchange', function () {
      state.tab = tabFromHash();
      if (state.data) render();
    });
    PW.api('bootstrap').then(function (r) {
      state.data = r.data;
      render();
      loadAi();
    }, showError);
  }

  // ------------------------------------------------------------ AI providers panel (right column)

  var ai = { status: null, edit: '', msg: '', busy: false };
  var HEALTH = {
    'ok': ['ok', 'Answering. Used in this order: the first that answers wins.'],
    'not used yet': ['not used yet', 'Has a key but has not answered yet. Click Test all to try it.'],
    'resting': ['resting', 'Hit its quota (HTTP 429). Skipped until it may be asked again; the next provider answers meanwhile.'],
    'failing': ['failing', 'The last 3 calls failed (error, network or quota). Check its key or model, or move it down.'],
    'no key': ['no key', 'No API key yet: it is skipped. Add one to use it.'],
    'no account id': ['no account id', 'Cloudflare needs the account id as well as the token.'],
    'not in the chain': ['not in the chain', 'Has a key but is not in the order list.'],
  };

  function loadAi() {
    PW.api('aiStatus').then(function (r) { ai.status = r.data; renderAi(); }, function (err) {
      $('aipanel').innerHTML = '<div class="card aicard"><p class="small badc">' + esc(err.message) + '</p></div>';
    });
  }

  function healthPill(h) {
    var x = HEALTH[h] || [h, ''];
    return hint('<span class="pill h-' + esc(h.replace(/ /g, '-')) + '">' + esc(x[0]) + '</span>', x[1], 'r');
  }

  function quotaLine(p) {
    if (p.neurons_limit) {
      var used = p.neurons_today || 0;
      var share = Math.min(1, used / p.neurons_limit);
      return hint('<span class="qbar2"><span class="qfill' + (share > 0.8 ? ' high' : '') + '" style="width:' + Math.round(share * 100) + '%"></span></span>' +
        num(Math.round(used)) + ' / ' + num(p.neurons_limit) + ' neurons today',
        'Cloudflare\'s free allowance is ' + num(p.neurons_limit) + ' neurons a day; each answer reports its cost (about 2-3 neurons). Counted from today\'s answers.');
    }
    if (p.remaining) {
      return hint('Left: ' + esc(p.remaining), 'What the provider reported with its last answer (' + esc(String(p.remaining_at).slice(0, 16).replace('T', ' ')) +
        ' UTC). The key may be shared with other projects, which use the same quota.');
    }
    return hint('<span class="muted">quota not reported</span>', 'This provider does not say how much is left. Watch for "resting" and quota hits.');
  }

  function providerForm(p) {
    var isNew = !p;
    var known = (ai.status.providers || []).filter(function (x) { return !x.custom; });
    return '<div class="aiform">' +
      (isNew ? '<label for="ainame">Provider</label><select id="ainame">' + known.map(function (x) {
        return '<option value="' + esc(x.name) + '">' + esc(x.name) + (x.key_hint ? ' (change key)' : '') + '</option>';
      }).join('') + '<option value="other">Other (OpenAI-compatible)</option></select>' +
        '<div id="aiother" hidden><label for="ainewname">Name</label><input type="text" id="ainewname" maxlength="20" placeholder="e.g. openrouter">' +
        '<label for="aiurl">Address</label><input type="url" id="aiurl" placeholder="https://api.example.com/v1"></div>' : '') +
      '<label for="aikey">API key' + (p && p.key_hint ? ' <span class="muted small">now ' + esc(p.key_hint) + ', leave empty to keep</span>' : '') + '</label>' +
      '<input type="password" id="aikey" autocomplete="off" placeholder="Paste the key">' +
      '<label for="aimodel">Model' + (p && p.default_model ? ' <span class="muted small">default ' + esc(p.default_model) + '</span>' : '') + '</label>' +
      '<input type="text" id="aimodel" maxlength="120" value="' + esc(p ? p.model : '') + '">' +
      (isNew || (p && p.needs_account) ? '<div id="aiacct"' + (isNew ? ' hidden' : '') + '><label for="aiaccount">Cloudflare account id</label>' +
        '<input type="text" id="aiaccount" maxlength="32" placeholder="32 letters and digits"></div>' : '') +
      '<div class="row"><button type="button" id="aisave">Save and test</button><button type="button" class="alt" id="aicancel">Cancel</button></div>' +
      '<p class="small muted">The key is kept only in the script\'s Script Properties; this page never gets it back.</p></div>';
  }

  function renderAi() {
    var s = ai.status;
    var out = ['<div class="card aicard"><div class="aihead"><b>AI providers</b>' +
      '<button type="button" class="alt small-btn" id="aitest"' + (ai.busy ? ' disabled' : '') + '>Test all</button></div>'];
    out.push('<p class="small ' + (s.warning ? 'badc' : 'muted') + '">' + hint(s.working + ' of ' + s.providers.filter(function (p) { return p.position >= 0; }).length +
      ' working', 'Production needs ' + s.min + ': one main and two backups. When one runs out of quota, the next one answers.') +
      (s.warning ? '<br>' + esc(s.warning) : '') + '</p>');
    out.push('<ol class="ailist">' + s.providers.map(function (p) {
      var inChain = p.position >= 0;
      var head = '<div class="airow"><span class="ainame">' + (inChain ? (p.position + 1) + '. ' : '') + esc(p.name) + '</span>' + healthPill(p.health) + '</div>';
      if (!p.key_hint) {
        return '<li class="aiitem off">' + head + '<div class="small aiact"><button type="button" class="link-btn aiedit" data-name="' + esc(p.name) + '">Add a key</button>' +
          (inChain ? ' <button type="button" class="link-btn aimove" data-name="' + esc(p.name) + '" data-dir="up">Up</button>' +
            ' <button type="button" class="link-btn aimove" data-name="' + esc(p.name) + '" data-dir="down">Down</button>' : '') + '</div>' +
          (ai.edit === p.name ? providerForm(p) : '') + '</li>';
      }
      var t = p.today;
      return '<li class="aiitem">' + head +
        '<div class="small muted aimodel">' + esc(p.model) + (p.custom ? ' · added' : '') + '</div>' +
        '<div class="small">' + hint('Today: ' + t.ok + ' ok' + (t.failed ? ', ' + t.failed + ' failed' : '') + (t.avg_ms ? ' · ' + (Math.round(t.avg_ms / 100) / 10) + ' s' : ''),
          'Answers today (Vietnam time), including tests. "failed" counts errors, network problems, quota hits and unusable answers.' +
          (p.last && p.last.status !== 'ok' ? '\nLast problem: ' + p.last.message : '')) +
        (p.quota_hits_week ? ' · ' + hint('<span class="warnc">' + p.quota_hits_week + ' quota hit' + (p.quota_hits_week > 1 ? 's' : '') + ' this week</span>',
          'Times it answered 429 (out of quota) in the last 7 days. Often? Add another key or provider.') : '') + '</div>' +
        '<div class="small">' + quotaLine(p) + '</div>' +
        '<div class="small aiact"><button type="button" class="link-btn aiedit" data-name="' + esc(p.name) + '">Change key or model</button>' +
        (inChain ? ' <button type="button" class="link-btn aimove" data-name="' + esc(p.name) + '" data-dir="up">Up</button>' +
          ' <button type="button" class="link-btn aimove" data-name="' + esc(p.name) + '" data-dir="down">Down</button>' : '') +
        ' <button type="button" class="link-btn airemove" data-name="' + esc(p.name) + '">Remove</button></div>' +
        (ai.edit === p.name ? providerForm(p) : '') + '</li>';
    }).join('') + '</ol>');
    out.push(ai.edit === 'new' ? providerForm(null) : '<button type="button" class="alt small-btn" id="aiadd">Add a provider or key</button>');
    out.push('<p class="small" id="aimsg">' + ai.msg + '</p></div>');
    out.push(tiktokCard(state.data));
    $('aipanel').innerHTML = out.join('');
    bindAi();
  }

  var usd = function (x) { return '$' + Number(x || 0).toFixed(2); };

  /** TikTok data: the PW runner (profiles, free) and Apify (the weekly search: spend against the budget, last runs). */
  function tiktokCard(d) {
    if (!d || !d.apify) return '';
    var a = d.apify;
    var rn = d.runner || {};
    var out = ['<div class="card aicard"><div class="aihead"><b>TikTok data</b></div>'];
    var last = rn.last;
    out.push('<div class="small">' + hint('Profiles: ' + (last ? 'runner ' + esc(ago(last.at)) + ', ' + last.read + ' read' + (last.failed ? ', ' + last.failed + ' failed' : '') : 'runner not run yet') +
      ' · ' + rn.waiting + ' waiting', 'The PW runner (kol/runner, on an office computer) opens each waiting TikTok profile as a guest, scrolls to the last ' +
      '30 days and saves what PW creator would read. Free; up to ' + rn.per_run + ' profiles a run. Waiting: new creators, and those read more than ' +
      'apify_refresh_days ago.' + (last && last.stopped ? '\nLast run stopped: ' + last.stopped : '') + (last && last.message ? '\n' + last.message : '')) +
      ' · ' + hint('puzzle alerts: ' + (rn.alerts ? 'Telegram' : 'this computer only'), 'When TikTok shows a puzzle the runner shows a notification on its ' +
      'computer' + (rn.alerts ? ' and writes to Telegram' : '; add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to Script Properties (the Ops Monitor bot\'s ' +
      'two values work) to get it on Telegram too') + ', then waits 30 minutes for someone to drag the slider.') + '</div>');
    if (!a.on) {
      out.push('<div class="small muted">' + hint('Search: not set up', 'Add APIFY_TOKEN (Apify > Settings > API & Integrations) to Script Properties. ' +
        'Apify then searches the food hashtags every week on its own servers and adds the creators it finds; no Pin Wei account is used.') + '</div></div>');
      return out.join('');
    }
    var u = a.usage || {};
    if (u.error) {
      out.push('<p class="small badc">' + esc(u.error) + '</p>');
    } else {
      var share = a.budget ? Math.min(1, u.used / a.budget) : 0;
      out.push('<div class="small">' + hint('<span class="qbar2"><span class="qfill' + (share > 0.8 ? ' high' : '') + '" style="width:' + Math.round(share * 100) + '%"></span></span>' +
        usd(u.used) + ' of ' + usd(a.budget) + ' this month', 'What the Apify account has spent this month, for every use (Google reviews too), against the ' +
        'budget in Config (apify_month_budget_usd). Past the budget no run starts until next month.' + (u.limit ? ' The plan allows ' + usd(u.limit) + '.' : '')) + '</div>');
    }
    out.push('<div class="small">' + hint('Search: ' + esc(a.search_day || 'off') + ' 06:00', 'Each ' + (a.search_day || '(no day set)') + ' at 06:00, the newest videos of these ' +
      'hashtags (Config apify_hashtags): #' + a.hashtags.join(' #') + '. Their authors in Vietnam become creators; those outside the follower range or verified are ' +
      'kept but not read further.') + '</div>');
    if (a.profiles_per_day > 0) {
      out.push('<div class="small">' + hint('Apify backup: ' + a.profiles_per_day + ' profiles a day', 'Apify also reads the newest videos of ' + a.profiles_per_day +
        ' waiting profiles each morning (Config apify_profiles_per_day, about $0.03 each). Set it to 0 while the runner works.') + '</div>');
    }
    if (a.runs.length) {
      out.push('<ol class="ailist">' + a.runs.map(function (r) {
        return '<li class="aiitem"><div class="small">' + hint(esc(r.kind) + ' · ' + esc(String(r.started_at).slice(0, 10)) + ' · ' + esc(r.status) +
          (r.cost_usd !== null ? ' · ' + usd(r.cost_usd) : ''), r.message || r.status) + '</div></li>';
      }).join('') + '</ol>');
    }
    out.push('</div>');
    return out.join('');
  }

  function aiSay(text, cls) {
    ai.msg = '<span class="' + (cls || '') + '">' + esc(text) + '</span>';
    if ($('aimsg')) $('aimsg').innerHTML = ai.msg;
  }

  function whoOrSay() {
    var who = $('cwho') ? $('cwho').value.trim() : '';
    if (!who) aiSay('Type your name in Saved by (above the list) first.', 'badc');
    return who;
  }

  function aiCall(action, body, done) {
    ai.busy = true;
    PW.api(action, body).then(function (r) {
      ai.busy = false;
      if (done) done(r.data);
      return PW.api('aiStatus').then(function (st) { ai.status = st.data; renderAi(); });
    }).catch(function (err) {
      ai.busy = false;
      renderAi();
      aiSay(err.message, 'badc');
    });
  }

  function bindAi() {
    $('aitest').addEventListener('click', function () {
      this.disabled = true;
      aiSay('Testing every provider…');
      aiCall('aiTest', {}, function (d) { ai.msg = '<span class="small">' + d.lines.map(esc).join('<br>') + '</span>'; ai.status = d.status; });
    });
    if ($('aiadd')) $('aiadd').addEventListener('click', function () { ai.edit = 'new'; ai.msg = ''; renderAi(); });
    Array.prototype.forEach.call(document.querySelectorAll('.aiedit'), function (b) {
      b.addEventListener('click', function () { ai.edit = ai.edit === b.getAttribute('data-name') ? '' : b.getAttribute('data-name'); ai.msg = ''; renderAi(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.aimove'), function (b) {
      b.addEventListener('click', function () {
        aiCall('aiMoveProvider', { name: b.getAttribute('data-name'), dir: b.getAttribute('data-dir') }, function (d) { ai.msg = esc(d.message); });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.airemove'), function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-armed') !== '1') {
          b.setAttribute('data-armed', '1');
          b.textContent = 'Sure? Remove the key';
          return;
        }
        var who = whoOrSay();
        if (!who) return;
        aiCall('aiRemoveProvider', { name: b.getAttribute('data-name'), saved_by: who }, function (d) { ai.msg = esc(d.message); });
      });
    });
    if ($('ainame')) {
      var sync = function () {
        var other = $('ainame').value === 'other';
        $('aiother').hidden = !other;
        $('aiacct').hidden = $('ainame').value !== 'cloudflare';
        var p = (ai.status.providers || []).filter(function (x) { return x.name === $('ainame').value; })[0];
        $('aimodel').value = p ? p.model : '';
      };
      $('ainame').addEventListener('change', sync);
      sync();
    }
    if ($('aicancel')) $('aicancel').addEventListener('click', function () { ai.edit = ''; renderAi(); });
    if ($('aisave')) {
      $('aisave').addEventListener('click', function () {
        var who = whoOrSay();
        if (!who) return;
        var name = ai.edit === 'new' ? ($('ainame').value === 'other' ? $('ainewname').value : $('ainame').value) : ai.edit;
        var body = { name: name, key: $('aikey').value, model: $('aimodel').value, saved_by: who };
        if ($('aiurl') && $('ainame').value === 'other') body.url = $('aiurl').value;
        if ($('aiaccount')) body.account = $('aiaccount').value;
        this.disabled = true;
        aiSay('Saving and testing…');
        aiCall('aiSaveProvider', body, function (d) { ai.edit = ''; ai.msg = '<span class="' + (d.test && d.test.ok ? 'okc' : 'badc') + '">' + esc(d.message) + '</span>'; });
      });
    }
  }

  function visible() {
    var s = state.search.trim().toLowerCase().replace(/^@/, '');
    var list = state.data.creators.filter(function (c) {
      return (state.platform === 'All' || c.platform === state.platform) && (state.status === 'All' || c.status === state.status) &&
        (!s || c.handle.indexOf(s) >= 0 || c.display_name.toLowerCase().indexOf(s) >= 0 || c.note.toLowerCase().indexOf(s) >= 0);
    });
    return sortList(list, state.sort);
  }

  /**
   * The rates every creator shows, as they are: no points, no score (the user, 2026-10-28: read them like ad metrics).
   * [key in c.rates, column, what it means].
   */
  var RATES = [
    ['like', 'Like / view', 'Average likes per video divided by average views: the share of viewers who liked it.'],
    ['comment', 'Comment / view', 'Comments per view: viewers who cared enough to write.'],
    ['save', 'Save / view', 'Saves per view (TikTok only): viewers keeping the video for later, the nearest thing to "I want to go there".'],
    ['share', 'Share / view', 'Shares per view (TikTok only): viewers sending it to someone.'],
    ['view', 'View / follower', 'Average views per video divided by followers: 2x = the videos reach twice their follower count.'],
  ];
  var SORTS = [['newest', 'Newest first']].concat(RATES.map(function (r) { return [r[0], 'Highest ' + r[1].toLowerCase()]; }), [['followers', 'Most followers']]);

  function rateText(key, v) {
    if (v === null || v === undefined) return '-';
    if (key === 'view') return Math.round(v * 10) / 10 + 'x';
    var p = v * 100;
    return (p < 1 ? p.toFixed(2) : p.toFixed(1)) + '%';
  }

  /** Each rate over every creator that has it: quartiles, the yardstick a cell is read against. Kept per data load. */
  var stats = { data: null, by: {} };
  function rateStats() {
    if (stats.data === state.data) return stats.by;
    var by = {};
    RATES.forEach(function (r) {
      var xs = state.data.creators.map(function (c) { return c.rates ? c.rates[r[0]] : null; })
        .filter(function (x) { return x !== null && x !== undefined; }).sort(function (a, b) { return a - b; });
      var q = function (p) { return xs[Math.round(p * (xs.length - 1))]; };
      by[r[0]] = xs.length ? { n: xs.length, p25: q(0.25), median: q(0.5), p75: q(0.75) } : { n: 0 };
    });
    stats = { data: state.data, by: by };
    return by;
  }

  /** One rate cell: the value, bold in our top quarter, grey in the bottom quarter, the median and range on hover. */
  function rateCell(c, r) {
    var v = c.rates ? c.rates[r[0]] : null;
    if (v === null || v === undefined) return '<td class="n rt" data-th="' + r[1] + '"><span class="muted">-</span></td>';
    var st = rateStats()[r[0]];
    var cls = st.n < 8 ? '' : v >= st.p75 ? 'hi' : v <= st.p25 ? 'lo' : '';
    var help = r[2] + '\nOur ' + st.n + ' creators: median ' + rateText(r[0], st.median) + ', middle half ' + rateText(r[0], st.p25) + ' to ' +
      rateText(r[0], st.p75) + '.' + (cls === 'hi' ? '\nThis one is in the top quarter.' : cls === 'lo' ? '\nThis one is in the bottom quarter.' : '');
    return '<td class="n rt" data-th="' + r[1] + '">' + hint('<span class="' + cls + '">' + rateText(r[0], v) + '</span>', help, 'r') + '</td>';
  }

  function rateHeads() {
    return RATES.map(function (r) { return '<th class="n">' + hint(r[1], r[2], 'r') + '</th>'; }).join('');
  }

  function rateCells(c) {
    return RATES.map(function (r) { return rateCell(c, r); }).join('');
  }

  /** Highest first by a rate (or followers); those without it at the end. "newest" keeps the list's order. */
  function sortList(list, sort) {
    if (!sort || sort === 'newest') return list;
    var val = function (c) { var v = sort === 'followers' ? c.followers : c.rates ? c.rates[sort] : null; return v === undefined ? null : v; };
    return list.slice().sort(function (a, b) {
      var x = val(a);
      var y = val(b);
      return x === null && y === null ? 0 : x === null ? 1 : y === null ? -1 : y - x;
    });
  }

  function sortSelect(id, value) {
    return '<select id="' + id + '" aria-label="Order">' + SORTS.map(function (s) {
      return '<option value="' + s[0] + '"' + (s[0] === value ? ' selected' : '') + '>' + esc(s[1]) + '</option>';
    }).join('') + '</select>';
  }

  /** Why the rules leave a creator out (verified, follower range, not food, not HCMC), in red. */
  function excludedLine(c) {
    return c.excluded ? '<div class="small">' + hint('<span class="badc">' + esc(c.exclude_reason) + '</span>',
      'Left out by the rules (Config): not shown in Review.') + '</div>' : '';
  }

  /** A word or number with an explanation shown on hover (or on tap, through focus, on a phone). */
  function hint(html, text, cls) {
    return '<span class="hint' + (cls ? ' ' + cls : '') + '" tabindex="0" data-hint="' + esc(text) + '">' + html + '</span>';
  }

  var num = function (x) { return Number(x).toLocaleString('en-US'); };
  var pct = function (x) { return Math.round(Number(x) * 1000) / 10 + '%'; };

  /** Who gave an answer: "counted" when the counts decided it, else the AI or a person. */
  function decidedBy(cl, label) {
    if (cl.by === 'manual') return 'Set by hand.';
    if (cl.by === 'counts') return 'Decided by counting the captions (the counts were clear, so no AI).';
    return new RegExp('counts: [^;]*' + label).test(cl.method) ? 'Decided by counting the captions.' : 'Judged by the AI (the counts were not clear).';
  }

  /** "Food yes 6/10 · HCMC yes · ads low · tone good", each with what it means and the counts behind it. */
  function classLine(cl) {
    if (!cl) return '';
    var n = cl.posts_seen || 0;
    var counted = n ? ' ' + cl.food_posts + '/' + n : '';
    var food = hint('Food ' + esc(cl.is_food_reviewer) + counted,
      'Food creator: food or drinks in about a third of recent posts or more (mixed with travel or comedy is fine).\n' +
      (n ? cl.food_posts + ' of ' + n + ' recent captions are about food' + (cl.food_tags ? ': ' + cl.food_tags : '') + '.\n' : '') +
      'View-boosting tags (#xuhuong, #fyp, #viral …) are not counted.\n' + decidedBy(cl, 'food'));
    var hcmc = hint('HCMC ' + esc(cl.based_in_hcmc),
      'Lives in Ho Chi Minh City, so the creator is for all three branches.\nNeeds the city named (Sài Gòn, TP.HCM) or two different districts: ' +
      'one district alone is not enough, names repeat in other cities.\n' + (cl.place_evidence ? 'Found: ' + cl.place_evidence + '.\n' : '') + decidedBy(cl, 'HCMC'));
    var ads = hint('ads ' + esc(cl.ad_density),
      'Share of posts that are paid or sponsored (hợp tác, tài trợ, #ad, discount codes, shop links).\nlow under 20%, medium 20-50%, high over 50%.\n' +
      (n ? cl.ad_posts + ' of ' + n + ' recent captions look sponsored.\n' : '') + decidedBy(cl, 'ads'));
    // Tone is left out (the user, 2026-10-28): a tone that does not land shows in the rates anyway.
    return '<div class="small cls">' + food + ' · ' + hcmc + ' · ' + ads + (cl.by === 'manual' ? ' · by hand' : '') + '</div>';
  }

  /** "Every morning at 07:00: last run today 07:04, 3 classified." or how to turn it on. */
  function dailyLine(daily) {
    if (!daily) return '';
    var what = 'Every morning at 06:00 Apify runs the weekly TikTok search (on its day), and at 07:00 the sheet classifies new creators ' +
      '(counts first, the AI only when unclear) and recomputes every score. TikTok profiles are read by the PW runner (see TikTok data); ' +
      'Instagram numbers still come from PW creator.';
    if (!daily.on) return hint('Morning run: off', what + '\nTurn it on in the sheet: Pin Wei KOL > Classify and score every morning.');
    var last = daily.last ? 'last run ' + ago(daily.last.at) : 'not run yet';
    return hint('Morning run: on, 0' + daily.hour + ':00 · ' + esc(last), what + (daily.last ? '\nLast run: ' + daily.last.message : ''));
  }

  /** One line under the list instead of a glossary: the details are in the hints. */
  function keyLine(cfg) {
    return '<p class="keyline small muted">Hover (or tap) any underlined word or number to see what it means. The rates are as they are, from the ' +
      'newest saved numbers (TikTok: the videos of the last 30 days): <b>bold</b> = top quarter of our creators, grey = bottom quarter. ' +
      'Creators from ' + num(cfg.follower_min) + ' to ' + num(cfg.follower_max) + ' followers · <span class="badc">red</span> = left out, with the reason.</p>';
  }

  function options(list, value, allLabel) {
    return ['All'].concat(list).map(function (x) {
      return '<option value="' + esc(x) + '"' + (x === value ? ' selected' : '') + '>' + esc(x === 'All' ? allLabel : x) + '</option>';
    }).join('');
  }

  /** Classified creators not left out: what the Review tab shows (it sorts them itself). */
  function reviewQueue() {
    return state.data.creators.filter(function (c) { return c.status === 'Classified' && !c.excluded; });
  }

  function openOutreach() {
    var open = state.data.outreach_config.open;
    return state.data.outreach.filter(function (o) { return open.indexOf(o.status) >= 0; });
  }

  function renderTabs() {
    var n = { review: reviewQueue().length, outreach: openOutreach().length };
    var label = { creators: 'Creators', review: 'Review', outreach: 'Outreach', dashboard: 'Dashboard' };
    $('tabs').innerHTML = TABS.map(function (t) {
      return '<a href="#' + t + '"' + (state.tab === t ? ' class="on" aria-current="page"' : '') + '>' + label[t] + (n[t] ? ' <span class="cnt">' + n[t] + '</span>' : '') + '</a>';
    }).join('') + '<a href="install.html">Bookmark</a>';
  }

  function render() {
    renderTabs();
    var solo = state.tab !== 'creators';
    document.querySelector('.kgrid').classList.toggle('solo', solo);
    $('aipanel').hidden = solo;
    if (state.tab === 'review') return window.KOL.renderReview();
    if (state.tab === 'outreach') return window.KOL.renderOutreach();
    if (state.tab === 'dashboard') return window.KOL.renderDashboard();
    renderCreators();
  }

  /** Reloads everything from the sheet, then draws the current tab; then(done) after. */
  function reload(done) {
    return PW.api('bootstrap').then(function (all) {
      state.data = all.data;
      render();
      if (done) done();
    });
  }

  /** The "Saved by" box every tab has (the name is kept in this browser). */
  function whoBox() {
    return '<label for="cwho">Saved by</label><input type="text" id="cwho" maxlength="60" placeholder="Your name" list="people">' +
      '<datalist id="people">' + state.data.people.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>';
  }

  function renderCreators() {
    var d = state.data;
    var list = visible();
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var shown = list.slice(state.page * PAGE, (state.page + 1) * PAGE);
    var out = [];
    out.push('<div class="qbar cbar"><input type="search" id="csearch" placeholder="Find a creator" value="' + esc(state.search) + '">' +
      '<select id="cplatform" aria-label="Platform">' + options(d.platforms, state.platform, 'All platforms') + '</select>' +
      '<select id="cstatus" aria-label="Status">' + options(d.statuses, state.status, 'All statuses') + '</select>' +
      sortSelect('csort', state.sort) + whoBox() + '</div>');
    out.push('<details class="card addcreator"' + (d.creators.length && !state.addOpen ? '' : ' open') + '><summary>Add a creator</summary><div class="agrid">' +
      '<div><label for="aurl">Instagram or TikTok profile link</label><input type="url" id="aurl" placeholder="https://www.instagram.com/… or https://www.tiktok.com/@…"></div>' +
      '<div><label for="afollowers">Followers (optional)</label><input type="text" id="afollowers" placeholder="e.g. 12,3K"></div>' +
      '<div><label for="anote">Note (optional)</label><input type="text" id="anote" maxlength="500"></div>' +
      '</div><div class="row"><button type="button" id="aadd">Add creator</button><span class="small" id="amsg"></span></div>' +
      '<p class="muted small">For exact numbers and the bio, open the profile and click the PW creator bookmark instead.</p></details>');
    var ai = d.ai_providers.length
      ? (d.pending_classification ? ' · <button type="button" class="alt small-btn" id="cclass"' + (state.classifying ? ' disabled' : '') + '>Classify ' +
        d.pending_classification + ' new</button>' : ' · all classified') +
        ' <span class="muted small">AI: ' + esc(d.ai_providers.join(' → ')) + '</span>'
      : ' · <span class="small warnc">No AI key in Script Properties: classify by hand.</span>';
    var due = d.creators.filter(function (c) { return c.recapture_due; }).length;
    out.push('<p class="qsum">' + list.length + (list.length === d.creators.length ? '' : ' of ' + d.creators.length) + ' creators' + ai +
      ' <span class="small" id="cmsg">' + state.classMsg + '</span></p>');
    out.push('<p class="small muted">' + dailyLine(d.daily) + (due ? ' · ' + hint('<span class="warnc">' + due + ' to capture again</span>',
      'Their last capture is a week old or more: open each profile and click PW creator. TikTok creators are read by the PW runner; ' +
      'Instagram ones need the click (nothing logs in with a Pin Wei account).') : '') + '</p>');
    if (!d.creators.length) {
      out.push('<p class="note">No creators yet. Paste a profile link above, or open a profile on Instagram or TikTok and click the ' +
        '<a href="install.html">PW creator bookmark</a>.</p>');
    } else if (!shown.length) {
      out.push('<p class="note">No creator matches.</p>');
    } else {
      out.push('<table class="list ctable"><thead><tr><th>Creator</th><th class="n">' + hint('Followers', 'From the latest capture of the profile.', 'r') + '</th>' +
        rateHeads() + '<th>' + hint('Status', 'New: just added. Classified: the counts and the AI (or a person) classified it; it waits in Review. ' +
          'Approved: invited (see Outreach). Rejected: left out at review, with the reason.', 'r') + '</th><th>Note</th></tr></thead><tbody>' +
        shown.map(function (c) {
          return '<tr><td class="who" data-th="Creator"><a href="' + esc(c.profile_url) + '" target="_blank" rel="noopener">@' + esc(c.handle) + '</a>' +
            (c.display_name ? ' <span class="muted">' + esc(c.display_name) + '</span>' : '') + (c.verified ? ' <span class="tag">Verified</span>' : '') +
            '<div class="muted small">' + esc(c.platform) + ' · ' + esc(c.source) + ' · added ' + esc(ago(c.added_at)) + (c.added_by ? ' by ' + esc(c.added_by) : '') +
            ' · ' + (c.snapshots ? hint('numbers ' + esc(c.last_snapshot), c.snapshots + (c.snapshots === 1 ? ' day' : ' days') + ' with saved numbers (one a day).') :
              'no numbers yet') + (c.recapture_due ? ' · ' + hint('<span class="warnc">capture again</span>', 'The last capture is a week old or more. Open the profile ' +
              'and click PW creator to save new numbers and captions.') : '') + '</div>' +
            classLine(c.classification) + excludedLine(c) + '</td>' +
            '<td class="n" data-th="Followers">' + PW.members(c.followers) + '</td>' + rateCells(c) +
            '<td class="stc" data-th="Status"><span class="st st-' + esc(c.status.toLowerCase()) + '">' + esc(c.status) + '</span>' +
            (c.status === 'Rejected' ? '<div class="small muted">' + esc(c.reject_reason) + '</div><button type="button" class="link-btn small reopen" data-id="' +
              esc(c.creator_id) + '">Back to review</button>' : '') + '</td>' +
            '<td class="nt" data-th="Note">' + esc(c.note) + '</td></tr>';
        }).join('') + '</tbody></table>');
      if (pages > 1) {
        out.push('<div class="pager"><button type="button" class="alt" id="cprev"' + (state.page === 0 ? ' disabled' : '') + '>Previous</button>' +
          '<span class="muted">Page ' + (state.page + 1) + ' of ' + pages + '</span>' +
          '<button type="button" class="alt" id="cnext"' + (state.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>');
      }
    }
    if (d.creators.length) out.push(keyLine(d.score_config));
    $('main').innerHTML = out.join('');
    bind();
  }

  function bind() {
    PW.remember('pwkol_by', $('cwho'));
    document.querySelector('.addcreator').addEventListener('toggle', function () { state.addOpen = this.open; });
    $('csearch').addEventListener('input', function () {
      state.search = this.value;
      state.page = 0;
      var pos = this.selectionStart;
      render();
      $('csearch').focus();
      $('csearch').setSelectionRange(pos, pos);
    });
    $('cplatform').addEventListener('change', function () { state.platform = this.value; state.page = 0; render(); });
    $('cstatus').addEventListener('change', function () { state.status = this.value; state.page = 0; render(); });
    $('csort').addEventListener('change', function () { state.sort = this.value; state.page = 0; render(); });
    if ($('cclass')) $('cclass').addEventListener('click', classifyAll);
    Array.prototype.forEach.call(document.querySelectorAll('.reopen'), function (b) {
      b.addEventListener('click', function () {
        var who = $('cwho').value.trim();
        if (!who) { $('cmsg').innerHTML = '<span class="badc">Type your name in Saved by first.</span>'; return; }
        b.disabled = true;
        PW.api('reviewReopen', { creator_id: b.getAttribute('data-id'), saved_by: who }).then(function (r) {
          return reload(function () { $('cmsg').innerHTML = '<span class="okc">' + esc(r.data.message) + '</span>'; });
        }).catch(function (err) { b.disabled = false; $('cmsg').innerHTML = '<span class="badc">' + esc(err.message) + '</span>'; });
      });
    });
    if ($('cprev')) $('cprev').addEventListener('click', function () { state.page--; render(); });
    if ($('cnext')) $('cnext').addEventListener('click', function () { state.page++; render(); });
    $('aadd').addEventListener('click', function () {
      var b = this;
      var m = $('amsg');
      var who = $('cwho').value.trim();
      m.className = 'small badc';
      if (!who) { m.textContent = 'Type your name in Saved by first.'; return; }
      b.disabled = true;
      m.className = 'small';
      m.textContent = 'Adding…';
      PW.api('creatorSave', { url: $('aurl').value, followers: $('afollowers').value, note: $('anote').value, saved_by: who }).then(function (r) {
        state.search = '';
        state.status = 'All';
        state.platform = 'All';
        return PW.api('bootstrap').then(function (all) {
          state.data = all.data;
          render();
          $('amsg').className = 'small okc';
          $('amsg').textContent = r.data.message;
          $('aurl').focus();
        });
      }).catch(function (err) {
        b.disabled = false;
        m.className = 'small badc';
        m.textContent = err.message;
      });
    });
  }

  /**
   * Classifies the pending creators a few at a time (each call waits for the AI), until none are left, the
   * whole provider chain fails, or a round makes no progress. Then the list reloads with the new scores.
   */
  function classifyAll() {
    var total = 0;
    state.classifying = true;
    var say = function (text, cls) {
      state.classMsg = '<span class="' + (cls || '') + '">' + esc(text) + '</span>';
      if ($('cmsg')) $('cmsg').innerHTML = state.classMsg;
    };
    say('Classifying…');
    $('cclass').disabled = true;
    var counted = 0;
    var round = function () {
      return PW.api('classifyRun').then(function (r) {
        total += r.data.classified;
        counted += r.data.by_counts || 0;
        var done = total + ' classified' + (counted ? ' (' + counted + ' by the counts alone, no AI)' : '');
        if (r.data.error) return say(done + '. ' + r.data.left + ' need the AI, which stopped: ' + r.data.error, 'badc');
        if (r.data.left && r.data.classified) {
          say(done + ', ' + r.data.left + ' left…');
          return round();
        }
        say(done + '.', 'okc');
      });
    };
    round().catch(function (err) { say('Stopped: ' + err.message, 'badc'); }).then(function () {
      state.classifying = false;
      return PW.api('bootstrap').then(function (all) { state.data = all.data; render(); loadAi(); });
    }).catch(showError);
  }

  window.KOL = { state: state, hint: hint, classLine: classLine, rateHeads: rateHeads, rateCells: rateCells, rateText: rateText,
    sortList: sortList, sortSelect: sortSelect, excludedLine: excludedLine, ago: ago, num: num, reviewQueue: reviewQueue,
    openOutreach: openOutreach, reload: reload, whoBox: whoBox, showError: showError };
  load();
})();
