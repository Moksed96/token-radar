// Token Radar's dashboard (model radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail view with the
// model's own inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// The value model, in one function: a protocol's implied value is its TVL times its category's
// comparable multiple (the median market-cap-to-TVL ratio of the live protocols in its category,
// shrunk toward the global median when the category is thin, clamped to [0.05, 1.00]), times a
// growth multiplier from its seven-day change, times a maturity multiplier from how long it has run
// with no token on record. The page recomputes every row from those same figures and checks the
// number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }
  function round4(n) { return Math.round(n * 1e4) / 1e4; }

  // The category multiple: each row carries the multiple it was scored with (its category's
  // comparable, shrunk toward the global median when the category is thin, clamped to [0.05, 1.00]).
  function multipleOf(row) {
    return row.comparable ? row.comparable.multiple : Math.min(1.0, Math.max(0.05, DATA.comparables.global_median));
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * multipleOf(row) * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL, age and
  // growth decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var growth = p.change_7d === null || p.change_7d === undefined ? 0 : Math.min(120, Math.max(-60, p.change_7d));
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    if (p.chains && p.chains.length >= 2) {
      steps.push({ text: 'Repeat the deposit on ' + p.chains[1] + ' as well, so the position is counted on two chains instead of one.', cost: 'another $' + capital + ' of capital and about $4 of gas', time: '10 minutes to set up' });
    }
    if (growth > 10) {
      steps.push({ text: 'Growth is hot right now, so re-check the protocol\u2019s TVL and its points page every week while the seven-day change stays above 10%.', cost: 'no fee to check', time: '5 minutes a week' });
    }
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl > 0) params.set('minTvl', String(state.minTvl));
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    var watchlist = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', {}, el('span', { class: 'brand-name', text: 'TOKEN RADAR' }), el('h1', { text: 'Token Radar: pre-token protocols ranked by implied value' }))),
      el('div', { class: 'top-meta', 'aria-label': 'Snapshot metadata' },
        el('span', { text: 'Generated ' + new Date(DATA.as_of + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) }),
        el('span', { text: DATA.board_size + ' protocols ranked' }),
        el('span', { text: DATA.watchlist_size + ' on the watchlist' }),
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Model ' + DATA.model_version })));
  }

  function lede() {
    var watchlist = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    var n = DATA.rows.length;
    var top = DATA.rows[0];
    var facts = el('aside', { class: 'facts', 'aria-label': 'Board summary' },
      el('div', { class: 'fact' }, el('span', { text: 'Protocols ranked' }), el('b', { text: String(n) })),
      el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: watchlist + ' / ' + DATA.watchlist_size })),
      el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: fmtUsd(top.implied_value_usd) })),
      el('div', { class: 'fact' }, el('span', { text: 'Live comparables' }), el('b', { text: String(DATA.live_size) })));
    return el('section', { class: 'lede' },
      el('div', {},
        el('p', {},
          'Implied value is ', el('b', { text: 'TVL × category multiple × growth × maturity' }), ': a protocol is worth what its own category\u2019s live protocols trade at per dollar of TVL, stretched or shrunk by its seven-day change and by how long it has run with no token on record. Every row carries a farm plan — a capital amount, a hold period and the weekly actions. Select any row and the detail view shows the arithmetic, the comparable set behind it, and whether the page\u2019s recomputation matches the board\u2019s number.'),
        el('p', {},
          el('b', { text: 'No token on record' }), ' means the snapshot records no market cap, no CoinGecko id and no symbol for a protocol. A token may still exist off-record — the two highest rows, USD Decentralized and Bittensor Tao, are the cases: ', el('b', { text: 'USD Decentralized (USDD)' }), ' and ', el('b', { text: 'Bittensor Tao (dTAO)' }), ' both rank in the top 10 on the snapshot\u2019s own figures, and their implied values should be read with that caveat.')),
      facts);
  }

  function controls(onChange) {
    var cats = ['all'].concat(Object.keys(DATA.comparables.by_category).sort());
    var chains = ['all'].concat(Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort());
    var q = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search protocols' });
    q.addEventListener('input', function (e) { state.q = e.target.value; onChange(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Category' });
    cats.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All categories' : c });
      if (state.category === c) o.selected = true;
      cat.appendChild(o);
    });
    cat.addEventListener('change', function (e) { state.category = e.target.value; onChange(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Chain' });
    chains.forEach(function (c) {
      var o = el('option', { value: c, text: c === 'all' ? 'All chains' : c });
      if (state.chain === c) o.selected = true;
      chain.appendChild(o);
    });
    chain.addEventListener('change', function (e) { state.chain = e.target.value; onChange(); });
    var tvl = el('select', { id: 'minTvl', 'aria-label': 'Minimum TVL' });
    [['0', 'Any TVL'], ['10000000', '≥ $10M TVL'], ['50000000', '≥ $50M TVL'], ['100000000', '≥ $100M TVL'], ['500000000', '≥ $500M TVL'], ['1000000000', '≥ $1B TVL']].forEach(function (pair) {
      var o = el('option', { value: pair[0], text: pair[1] });
      if (String(state.minTvl) === pair[0]) o.selected = true;
      tvl.appendChild(o);
    });
    tvl.addEventListener('change', function (e) { state.minTvl = Number(e.target.value); onChange(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlistOnly', checked: state.watchlistOnly ? 'checked' : null });
    wl.addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; onChange(); });
    var tabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Board tab' });
    [['pre-token', 'Pre-token'], ['live', 'Live comparables']].forEach(function (pair) {
      tabs.appendChild(el('button', {
        type: 'button', 'aria-pressed': String(state.tab === pair[0]), text: pair[1],
        onclick: function () { state.tab = pair[0]; render(); }
      }));
    });
    var count = el('span', { class: 'count', id: 'count' });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), q),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Min TVL' }), tvl),
      el('label', { class: 'check', for: 'watchlistOnly' }, wl, ' Watchlist only'),
      tabs, count);
  }

  function sortHead(label, key) {
    var arrow = state.sort === key ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    return el('th', {}, el('button', {
      type: 'button', text: label + arrow,
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      }
    }));
  }

  function boardTable(list) {
    var max = DATA.rows.length > 0 ? DATA.rows[0].implied_value_usd : 1;
    var body = el('tbody', {});
    list.forEach(function (row) {
      var growth = row.change_7d === null || row.change_7d === undefined ? 'n/a' : fmtPct(row.change_7d);
      var growthClass = row.change_7d === null ? 'num' : row.change_7d >= 0 ? 'num pos' : 'num neg';
      var tr = el('tr', { 'data-selected': state.selected === row.slug ? 'true' : 'false', tabindex: '0', role: 'button', 'aria-label': row.name + ' details' },
        el('td', { class: 'num', text: String(row.rank) }),
        el('td', {}, el('div', { class: 'name' },
          el('span', {}, el('b', { text: row.name }), row.watchlist ? el('span', { class: 'badge', text: 'Watchlist' }) : null),
          el('span', { class: 'sub', text: row.category + ' · ' + (row.chains || []).join(', ') + ' · ' + fmtAge(row.age_days) }))),
        el('td', { class: 'num', text: fmtUsd(row.tvl_usd) }),
        el('td', { class: growthClass, text: growth }),
        el('td', {}, el('div', { class: 'implied' },
          el('span', { class: 'num', text: fmtUsd(row.implied_value_usd) }),
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(1, Math.min(100, row.implied_value_usd / max * 100)).toFixed(1) + '%' })))));
      tr.addEventListener('click', function () { state.selected = row.slug; render(); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.selected = row.slug; render(); } });
      body.appendChild(tr);
    });
    return el('section', { class: 'panel', 'aria-label': 'Pre-token board' },
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {},
          sortHead('#', 'rank'), sortHead('Protocol', 'name'), sortHead('TVL', 'tvl'), sortHead('7d', 'growth'), sortHead('Implied value', 'implied'))),
        body)));
  }

  function liveTable() {
    var live = DATA.live.slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; });
    var body = el('tbody', {});
    live.forEach(function (p) {
      var ratio = p.tvl_usd > 0 ? p.mcap_usd / p.tvl_usd : null;
      body.appendChild(el('tr', {},
        el('td', {}, el('div', { class: 'name' }, el('b', { text: p.name }), el('span', { class: 'sub', text: p.category }))),
        el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
        el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
        el('td', { class: 'num', text: ratio === null ? 'n/a' : fmtMult(ratio) }),
        el('td', {}, el('span', { class: 'status live', text: 'live' }))));
    });
    return el('section', { class: 'panel', 'aria-label': 'Live comparables' },
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'Market cap' }), el('th', { text: 'TVL' }), el('th', { text: 'Mcap / TVL' }), el('th', { text: 'Status' }))),
        body)));
  }

  function modelPanel() {
    var cats = Object.entries(DATA.comparables.by_category).sort(function (a, b) { return b[1].multiple - a[1].multiple; });
    var tbody = el('tbody', {});
    cats.forEach(function (pair) {
      var c = pair[1];
      tbody.appendChild(el('tr', {},
        el('td', { text: pair[0] }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: c.median === null ? 'n/a' : fmtUsd(c.median) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })));
    });
    return el('section', { class: 'panel model', 'aria-label': 'How the value is built' },
      el('h2', { text: 'How the value is built' }),
      el('p', { class: 'formula', html: 'implied value = <b>TVL</b> × <b>category multiple</b> × <b>growth</b> × <b>maturity</b><br>growth = 1 + (7d change × 0.5), with the change clamped to [−60, +120], so growth stays in [0.70, 1.60]<br>maturity = 0.60 + min(age, 1095) / 1095 × 0.40<br>category multiple = the median market-cap/TVL ratio of the live protocols in the category; with fewer than 3 live protocols the global median applies, with 3 or more the median is shrunk toward the global median (weight 3), clamped to [0.05, 1.00]' }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'comp-table' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live' }), el('th', { class: 'num', text: 'Median mcap/TVL' }), el('th', { class: 'num', text: 'Multiple used' }))),
        tbody)),
      el('p', { class: 'note', html: '<b>What the radar does not rank.</b> ' + DATA.early_size + ' clean pre-token protocols sit below the $100M watchlist floor and are shown on the board below that floor — they are the early radar, not the top table. Twenty further protocols pass the same cleanliness checks and clear the floor but are left off: each is a wrapped, staked, bridged or vault product of a protocol that trades, so its implied value would double-count one market cap. The dashboard lists their count in the gate, not their names, and the board never ranks them.' }));
  }

  function detail(row) {
    var dlg = el('dialog', { class: 'detail' });
    var model = DATA.model;
    var growthRaw = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(120, Math.max(-60, row.change_7d));
    var growthMult = 1 + (growthRaw / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var mult = multipleOf(row);
    var c = row.comparable || { category_median: null, n: 0, multiple: mult };
    var pageImplied = impliedOf(row, model);
    var steps = farmSteps(row);
    var basis;
    if (c.n >= 3) basis = 'Median mcap/TVL of ' + c.n + ' live ' + row.category + ' protocols: ' + fmtUsd(c.category_median) + ', shrunk toward the global median ' + fmtUsd(DATA.comparables.global_median) + ' with a weight of 3 (the category carries ' + (c.n / (c.n + 3)).toFixed(2) + ' of the weight).';
    else if (c.n > 0) basis = 'Only ' + c.n + ' live comparable in ' + row.category + ' — fewer than 3 — so the global median ' + fmtUsd(DATA.comparables.global_median) + ' applies. Multiple: ' + fmtMult(c.multiple) + '.';
    else basis = 'No live comparable in ' + (row.category || 'this category') + ' — the global median ' + fmtUsd(DATA.comparables.global_median) + ' applies. Multiple: ' + fmtMult(mult) + '.';
    dlg.appendChild(el('div', { class: 'detail-head' },
      el('div', {},
        el('div', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.rows.length + (row.watchlist ? ' · watchlist' : '') }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: row.category + ' · ' + (row.chains || []).join(', ') + ' · ' + fmtAge(row.age_days) + ' old' })),
      el('button', {
        type: 'button', class: 'close', text: 'Close', 'aria-label': 'Close detail',
        onclick: function () { state.selected = null; render(); }
      })));
    dlg.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Snapshot' }),
      el('div', { class: 'equation' },
        el('div', {}, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', {}, el('span', { text: '7d change' }), el('b', { text: row.change_7d === null ? 'unknown' : fmtPct(row.change_7d) })),
        el('div', {}, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) }))),
      el('p', { class: 'basis', text: 'The snapshot records no token for ' + row.name + ': no market cap, no CoinGecko id and no symbol. That is the record the board ranks on.' })));
    dlg.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The model\u2019s arithmetic' }),
      el('div', { class: 'equation' },
        el('div', {}, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', {}, el('span', { text: '× category multiple (' + row.category + ')' }), el('b', { text: fmtMult(mult) })),
        el('div', {}, el('span', { text: '× growth (' + fmtPct(growthRaw) + ' 7d)' }), el('b', { text: growthMult.toFixed(2) + 'x' })),
        el('div', {}, el('span', { text: '× maturity (' + fmtAge(age) + ' old)' }), el('b', { text: maturity.toFixed(2) + 'x' })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'basis', text: basis + ' The page recomputes this row as ' + fmtUsd(pageImplied) + (pageImplied === row.implied_value_usd ? ', the same number board.json carries.' : ' — a mismatch with the ' + fmtUsd(row.implied_value_usd) + ' board.json carries.') })));
    dlg.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s, i) {
        var parts = s.split(' Cost: ');
        var head = parts[0] || '';
        var rest = parts[1] || '';
        return el('li', {}, el('b', { text: head }), el('span', { class: 'cost', text: 'Cost: ' + rest }));
      }))));
    dlg.addEventListener('close', function () { if (state.selected) { state.selected = null; render(); } });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) { state.selected = null; render(); } });
    return dlg;
  }

  function empty(onClear) {
    return el('section', { class: 'panel empty' },
      el('h2', { text: 'No protocols match these filters' }),
      el('p', { text: 'Try a different search or a lower minimum TVL.' }),
      el('button', { type: 'button', class: 'button primary', text: 'Clear filters', onclick: onClear }));
  }

  function render() {
    writeHash();
    app.setAttribute('aria-busy', 'true');
    var onChange = function () { render(); };
    var list = rows();
    var sorted = state.tab === 'pre-token' ? sortedRows(list) : null;
    var clear = function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchlistOnly = false; render();
    };
    var shell = el('div', { class: 'shell' }, header(), lede(), controls(onChange));
    var table = state.tab === 'pre-token'
      ? (list.length > 0 ? boardTable(sorted) : empty(clear))
      : liveTable();
    shell.appendChild(table);
    shell.appendChild(modelPanel());
    app.innerHTML = '';
    app.appendChild(shell);
    var count = document.getElementById('count');
    if (count) count.textContent = state.tab === 'pre-token' ? list.length + ' of ' + DATA.rows.length + ' rows' : DATA.live.length + ' live comparables';
    var sel = state.selected ? DATA.rows.find(function (r) { return r.slug === state.selected; }) : null;
    if (sel) {
      var d = detail(sel);
      document.body.appendChild(d);
      d.showModal();
    } else {
      Array.from(document.querySelectorAll('dialog.detail')).forEach(function (n) { n.remove(); });
    }
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  if (window.location.hash.indexOf('#') === 0 && !window.location.hash.includes('p=')) state.selected = null;
  render();
})();
