(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  // Row field positions in the compact array: [rank, slug, name, category,
  // chains, tvl, change_7d, age_days, implied, growthMult, maturityMult].
  var R = { rank: 0, slug: 1, name: 2, cat: 3, chains: 4, tvl: 5, chg: 6, age: 7, implied: 8, gMult: 9, mMult: 10 };
  var L = { slug: 0, name: 1, cat: 2, chains: 3, tvl: 4, mcap: 5, chg: 6 };

  var WL = {};
  // Watchlist ships as board ranks (DATA.wl); rows are in rank order.
  DATA.wl.forEach(function (n) { var r = DATA.rows[n - 1]; if (r) WL[r[R.slug]] = true; });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
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
  function chainMultOf(row) {
    var n = row[R.chains] ? row[R.chains].length : 0;
    return 1 + Math.min(Math.max(n - 1, 0), 4) * 0.02;
  }
  function multipleOf(cat) {
    var m = DATA.multiples[cat || 'Other'];
    return m === undefined ? DATA.fallback_multiple : m;
  }
  // implied = round(tvl x multiple(category) x growth x maturity x chains).
  // multiple(category) is the median mcap/TVL of that category's live protocols
  // in this snapshot (fallback 0.205); the farm plan below is the same derivation
  // main.ts writes to board.json (lib/model.ts farmSteps), so the page and the
  // board show the same strings.
  function impliedOf(row) {
    var growth = Math.min(100, Math.max(-50, row[R.chg] === null || row[R.chg] === undefined ? 0 : row[R.chg]));
    var gMult = 1 + (growth / 100) * 0.5;
    var age = row[R.age] === null || row[R.age] === undefined ? 365 : row[R.age];
    var mMult = 0.6 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.4;
    return Math.max(1, Math.round(row[R.tvl] * multipleOf(row[R.cat]) * gMult * mMult * chainMultOf(row)));
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

  // --- Farm plan: the same derivation as lib/model.ts farmSteps. ---
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
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the supply open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield aggregator') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('leveraged farm') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and keep it staked.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and place one small position on a market that settles after 7 days.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it in your wallet.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Top up $' + capital + ' through ' + name + ' on ' + chain + ' and make one real payment with it.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of ' + name + "'s index token on " + chain + ' and hold it.';
    if (c.indexOf('launchpad') >= 0) return 'Stake $' + capital + ' of USDC in ' + name + "'s launch pool on " + chain + ' and join one sale.';
    if (c.indexOf('otc') >= 0) return 'Place one $' + capital + ' order on ' + name + "'s OTC desk on " + chain + ' and settle it.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + ' and use its native app once a week.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s governance vault on " + chain + ' and vote once.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'Each week, borrow a small amount against the supply and repay it, or add a little more collateral.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Each week, swap a small amount through the pool or add and remove a little liquidity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis trading') >= 0) return 'Each week, open and close one small hedged trade and leave the margin in place.';
    if (c.indexOf('prediction') >= 0) return 'Each week, place one small position on a new market that is still open.';
    if (c.indexOf('bridge') >= 0) return 'Each week, bridge a small amount again so the route stays active.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Each week, restake the rewards the position earned.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Each week, claim the yield and mint a little more of the asset.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Each week, check the vault allocation and rebalance a small amount if the vault allows it.';
    if (c.indexOf('insurance') >= 0) return 'Each week, check the policy status and renew or top it up before it lapses.';
    return 'Each week, make one qualifying action such as a deposit, a swap, a vote or a claim.';
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
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm with ' + p.name + ', and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open ' + p.name + "'s own points or rewards page from the link it publishes and check your points; claim only from that page.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet address, the dates and every transaction hash for ' + p.name + ' in a farm log, so you can repeat the position or unwind it cleanly.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  function rowObj(row) {
    return { name: row[R.name], category: row[R.cat], chains: row[R.chains], tvl_usd: row[R.tvl], age_days: row[R.age] };
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r[R.cat] || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r[R.name], r[R.slug], r[R.cat], (r[R.chains] || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a[R.name].toLowerCase(); bv = b[R.name].toLowerCase(); }
      else if (key === 'rank') { av = a[R.rank]; bv = b[R.rank]; }
      else if (key === 'tvl') { av = a[R.tvl]; bv = b[R.tvl]; }
      else if (key === 'growth') { av = a[R.chg] === null ? -Infinity : a[R.chg]; bv = b[R.chg] === null ? -Infinity : b[R.chg]; }
      else if (key === 'age') { av = a[R.age] === null ? Infinity : a[R.age]; bv = b[R.age] === null ? Infinity : b[R.age]; }
      else { av = a[R.implied]; bv = b[R.implied]; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a[R.slug] < b[R.slug] ? -1 : a[R.slug] > b[R.slug] ? 1 : 0;
    });
  }

  function header() {
    var stats = el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist protocol is ranked' })),
      el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' below the $50M floor' })),
      el('div', { class: 'stat' }, el('span', { text: 'Snapshot date' }), el('b', { text: DATA.as_of }), el('small', { text: 'DefiLlama protocol index' })),
      el('div', { class: 'stat' }, el('span', { text: 'Model version' }), el('b', { text: DATA.model_version }), el('small', { text: 'category-median multiples' }))
    );
    return el('header', { class: 'top' },
      el('div', { class: 'top-row' },
        el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
        el('div', { class: 'top-meta' },
          el('span', { html: 'Snapshot <b>' + DATA.as_of + '</b>' }),
          el('span', { html: 'Model <b>' + DATA.model_version + '</b>' }),
          el('span', { html: '<b>' + DATA.board_size + '</b> rows' })
        )
      ),
      stats
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', { html: 'The board ranks <b>' + DATA.board_size + ' protocols that record no token</b> by what their launch would be worth if their record stayed as it is. The watchlist — every protocol with at least $50M of TVL and no token on record — is the floor: the radar adds ' + DATA.early_size + ' more below it, and sets the ' + DATA.live_size + ' largest live-token protocols aside with their market caps. Implied value is this entry\u2019s model, not a promise, and never a prediction that a token will launch.' })
      ),
      el('aside', { class: 'model-note' },
        el('h2', { text: 'The model, in one line' }),
        el('div', { class: 'formula' }, 'implied = round( tvl x multiple(category) x growth x maturity x chains )'),
        el('p', { text: 'multiple(category) is the median market-cap / TVL of the live protocols in that category, from this snapshot; categories with fewer than 3 live protocols use the fallback 0.205. Growth is the 7-day TVL change clamped to -50..100%, maturity grows with age up to 3 years, and each extra chain adds 2% (max 4).' })
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r[R.cat] || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r[R.cat] || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function nameCell(r) {
    var line = el('div', { class: 'rowline' }, el('b', { text: r[R.name] }));
    if (WL[r[R.slug]]) line.appendChild(el('span', { class: 'badge', text: 'Watchlist' }));
    return el('td', null, el('div', { class: 'name' }, line,
      el('span', { class: 'sub', text: (r[R.cat] || 'Other') + ' on ' + (r[R.chains] && r[R.chains].length ? r[R.chains].slice(0, 2).join(', ') : 'an unnamed chain') + (r[R.chains] && r[R.chains].length > 2 ? ' +' + (r[R.chains].length - 2) : '') })
    ));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 1;
    DATA.rows.forEach(function (r) { if (r[R.implied] > max) max = r[R.implied]; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r[R.chg] === null ? 'n/a' : fmtPct(r[R.chg]);
      var growthClass = r[R.chg] === null ? '' : r[R.chg] >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r[R.slug] ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r[R.slug]); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r[R.slug]); } }
      },
        el('td', { class: 'num', text: String(r[R.rank]) }),
        nameCell(r),
        el('td', { class: 'num', text: fmtUsd(r[R.tvl]) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r[R.age]) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r[R.implied] / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r[R.implied]) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest first. Select a row for its breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r[L.name] }), el('span', { class: 'sub', text: (r[L.cat] || 'Other') + ' on ' + (r[L.chains] && r[L.chains].length ? r[L.chains].slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r[L.tvl]) }),
        el('td', { class: 'num ' + (r[L.chg] !== null && r[L.chg] >= 0 ? 'pos' : 'neg'), text: fmtPct(r[L.chg]) }),
        el('td', { class: 'num', text: fmtUsd(r[L.mcap]) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'These protocols already trade, so their market cap is a fact, not a model.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var entries = Object.keys(DATA.multiples).map(function (k) { return [k, DATA.multiples[k]]; });
    entries.sort(function (a, b) { return b[1] - a[1]; });
    var tiles = entries.map(function (e) {
      return el('div', { class: 'mult' }, el('span', { text: e[0] }), el('b', { text: 'x' + e[1].toFixed(3) }));
    });
    tiles.push(el('div', { class: 'mult fallback' }, el('span', { text: 'Fallback (fewer than 3 live)' }), el('b', { text: 'x' + DATA.fallback_multiple.toFixed(3) })));
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures; no name is special-cased. Each category is priced at the median market-cap / TVL of the protocols in it whose token already trades.' }),
      el('div', { class: 'formula', text: 'implied = round( tvl_usd x multiple(category) x (1 + clamp(change_7d, -50, 100) / 100 x 0.5) x (0.6 + min(age_days, 1095) / 1095 x 0.4) x (1 + min(chains - 1, 4) x 0.02) )' }),
      el('div', { class: 'mult-grid' }, tiles),
      el('p', { class: 'footnote', text: 'Age is the time since first listing; an unlisted age uses 365 days and a missing 7-day change counts as 0%. The early radar is every genuine pre-token protocol below the floor; live-token protocols are set aside with their market caps.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r[R.slug] === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(rowObj(row));
    var recomputed = impliedOf(row);
    var base = Math.round(row[R.tvl] * multipleOf(row[R.cat]));
    var match = recomputed === row[R.implied];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'eyebrow', text: 'Rank ' + row[R.rank] + ' of ' + DATA.board_size + (WL[row[R.slug]] ? '  \u00b7  Watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row[R.name] }),
        el('p', { class: 'sub', text: (row[R.cat] || 'Other') + ' on ' + (row[R.chains] && row[R.chains].length ? row[R.chains].join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'At a glance' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row[R.tvl]) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row[R.chg]) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row[R.age]) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { text: String(row[R.chains] ? row[R.chains].length : 0) }))
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Model breakdown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Base: TVL x multiple (' + (row[R.cat] || 'Other') + ' x' + multipleOf(row[R.cat]).toFixed(3) + ')' }), el('b', { text: fmtUsd(base) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: String(row[R.gMult]) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: String(row[R.mMult]) })),
        el('div', null, el('span', { text: 'Chain multiplier (' + (row[R.chains] ? row[R.chains].length : 0) + ' chains)' }), el('b', { text: chainMultOf(row).toFixed(2) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row[R.implied]) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (match ? ', the same number board.json carries.' : ', which differs from the board.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
