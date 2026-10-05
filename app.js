/* Interface state is separate from the pure algorithms in engine.js. */
(() => {
  'use strict';
  const E = window.DeliveryEngine, $ = id => document.getElementById(id);
  const money = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const decimal = (n, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : '∞';
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STORAGE = 'nexus-delivery-scenario-v1'; let exportUrl = null;
  let scenario, result = null, zoom = 1, inspected = null, playback = 0, playing = false, animation = 0, lastFrame = 0, experiments = [], benchmarking = false;
  const views = {
    overview: ['Operations overview', 'A clear plan for every package, road and deadline.'],
    network: ['Road network', 'Explore the roads, play your route and test disruptions.'],
    deliveries: ['Delivery manifest', 'Your orders and roads, with every decision explained.'],
    algorithms: ['Algorithm lab', 'Inspect the computation behind your delivery plan.'],
    experiments: ['Performance experiments', 'Compare solution quality and measured runtime.']
  };
  function timeLabel(minutes, precise = false) {
    const [h, m] = scenario.config.start.split(':').map(Number);
    const total = h * 60 + m + (precise ? Math.ceil(minutes - 1e-8) : Math.round(minutes));
    const day = Math.floor(total / 1440);
    return `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}${day ? ` (+${day}d)` : ''}`;
  }
  function notice(message, type = '') {
    $('notice').textContent = message; $('notice').className = 'notice' + (type ? ' ' + type : ''); $('notice').hidden = false;
    $('notice').setAttribute('role', type === 'error' ? 'alert' : 'status');
  }
  function persist() { try { localStorage.setItem(STORAGE, JSON.stringify(scenario)); } catch { /* App also works when storage is unavailable. */ } }
  function readConfig() {
    const c = {};
    Object.keys(E.defaults).forEach(key => { c[key] = key === 'start' ? $(key).value : Number($(key).value); });
    return E.validateConfig(c);
  }
  function syncConfig() { Object.keys(E.defaults).forEach(key => { $(key).value = scenario.config[key]; }); }
  function setView() {
    const key = location.hash.slice(1) in views ? location.hash.slice(1) : 'overview';
    Object.keys(views).forEach(v => { $('view-' + v).hidden = v !== key; });
    document.querySelectorAll('[data-view]').forEach(link => {
      const active = link.dataset.view === key; link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    $('pageTitle').textContent = views[key][0]; $('pageSub').textContent = views[key][1];
    if (key !== 'network') stopPlayback();
    renderMaps();
  }
  function optimize(message = 'Plan computed. Every selected delivery meets its deadline and vehicle capacity.') {
    stopPlayback(); playback = 0;
    result = E.solve(scenario); scenario = result.scenario; persist(); renderAll();
    notice(message + (result.optimized.order.length ? '' : ' No delivery is feasible in this scenario.'), result.optimized.order.length ? '' : 'warning');
  }
  function runFromSettings() {
    try {
      if (!$('configForm').reportValidity()) return;
      const c = readConfig();
      const regenerate = ['nodeCount', 'density', 'seed', 'maxProfit', 'speed'].some(k => c[k] !== scenario.config[k]);
      if (regenerate) scenario = E.generate(c);
      else scenario = E.validateScenario({ ...scenario, config: c });
      optimize(regenerate ? 'New scenario generated from your settings and optimized.' : undefined);
      syncConfig(); $('disruptionSummary').hidden = true;
    } catch (error) { notice(error.message, 'error'); }
  }
  function point(n) { return { x: 75 + n.x * 8.5, y: 50 + n.y * 5.5 }; }
  function routeRoads(plan) {
    const keys = new Set(); if (plan) plan.legs.forEach(leg => leg.edges.forEach(e => keys.add(e.id))); return keys;
  }
  function renderMaps() {
    if (!scenario) return;
    const selected = new Set(result?.optimized.order || []), active = routeRoads(result?.optimized), mst = new Set(result?.mst.edges.map(e => e.id) || []);
    ['overviewMap', 'networkMap'].forEach(id => {
      const svg = $(id), full = id === 'networkMap';
      const width = 1000 / (full ? zoom : 1), height = 650 / (full ? zoom : 1);
      svg.setAttribute('viewBox', `${(1000 - width) / 2} ${(650 - height) / 2} ${width} ${height}`);
      let markup = `<defs><pattern id="grid-${id}" width="45" height="45" patternUnits="userSpaceOnUse"><path d="M45 0H0V45" fill="none" stroke="#dde5d4" stroke-width=".8"/></pattern><marker id="arrow-${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 1L8 5L0 9" fill="none" stroke="#1d8361" stroke-width="2"/></marker></defs><rect x="-1000" y="-1000" width="3000" height="2650" fill="#eef2e8"/><rect width="1000" height="650" fill="url(#grid-${id})"/><path d="M-20 485C120 370 230 500 350 490S600 295 720 400S860 360 1030 240" fill="none" stroke="#dfe8d3" stroke-width="40"/><text x="800" y="616" fill="#9cab93" font-size="9" letter-spacing="2">SYNTHETIC SERVICE AREA</text>`;
      scenario.edges.forEach(e => {
        const a = point(scenario.nodes[e.u]), b = point(scenario.nodes[e.v]);
        const stroke = e.blocked ? '#c45c4f' : e.delay > 1 ? '#c88b40' : '#c3cdb9';
        markup += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${e.blocked || e.delay > 1 ? 2.5 : 1.5}" ${e.blocked ? 'stroke-dasharray="6 5"' : ''} opacity="${e.blocked ? '.85' : '.6'}"><title>${escape(`Road ${e.id}: ${decimal(e.distance)} km, ${decimal(e.minutes * e.delay)} min${e.blocked ? ' · CLOSED' : ''}`)}</title></line>`;
        if (full && $('showMst').checked && mst.has(e.id)) markup += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#bb8b4d" stroke-width="3" stroke-dasharray="6 4"/>`;
      });
      if (result) result.optimized.legs.forEach(leg => {
        leg.nodes.slice(1).forEach((nodeId, index) => {
          const a = point(scenario.nodes[leg.nodes[index]]), b = point(scenario.nodes[nodeId]);
          markup += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#1d8361" stroke-width="3.5" opacity=".8" marker-end="url(#arrow-${id})"/>`;
        });
      });
      scenario.nodes.forEach(n => {
        const p = point(n), depot = n.id === 0, chosen = selected.has(n.id), stopNo = result?.optimized.order.indexOf(n.id) + 1;
        const tooltip = depot ? 'Warehouse · start and return' : `${n.name}: ${n.weight} kg, ${money(n.profit)}, deadline ${timeLabel(n.deadline)}`;
        markup += `<g class="node-button" data-node="${n.id}" role="button" tabindex="0" aria-label="${escape(tooltip)}"><title>${escape(tooltip)}</title><circle cx="${p.x}" cy="${p.y}" r="${depot ? 22 : 16}" fill="${depot ? '#183f30' : chosen ? '#248663' : '#bdc8b4'}" stroke="${inspected === n.id ? '#c89546' : '#fff'}" stroke-width="${inspected === n.id ? 4 : 3}"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="${depot ? 14 : 11}" font-weight="650" fill="${chosen || depot ? 'white' : '#536447'}">${depot ? 'W' : n.id}</text><text x="${p.x}" y="${p.y + 31}" text-anchor="middle" fill="${depot ? '#254c36' : '#6f7b66'}" font-size="10" font-weight="${depot ? 650 : 400}">${depot ? 'WAREHOUSE' : chosen ? `Stop ${stopNo} · ${money(n.profit)}` : `C${n.id}`}</text></g>`;
      });
      if (full && result) { const p = playbackPosition(); markup += `<g id="routeVehicle" transform="translate(${p.x} ${p.y})" aria-label="Vehicle position"><circle r="12" fill="#efae48" stroke="white" stroke-width="3"/><path d="M-4 0h8M0 -4v8" stroke="#66481f" stroke-width="2"/></g>`; }
      svg.innerHTML = markup;
    });
    $('mapLabel').textContent = `${scenario.nodes.length - 1} CUSTOMERS · ${active.size} ROUTE ROADS`;
  }
  function playbackPosition() {
    let at = point(scenario.nodes[0]);
    if (!result) return at;
    for (const leg of result.optimized.legs) {
      if (playback < leg.departure) return point(scenario.nodes[leg.from]);
      let time = leg.departure;
      for (let i = 0; i < leg.edges.length; i++) {
        const duration = leg.edges[i].minutes * leg.edges[i].delay;
        const a = point(scenario.nodes[leg.nodes[i]]), b = point(scenario.nodes[leg.nodes[i + 1]]);
        if (playback <= time + duration) { const f = Math.max(0, Math.min(1, (playback - time) / duration)); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
        time += duration; at = b;
      }
    }
    return at;
  }
  function stopPlayback() { playing = false; cancelAnimationFrame(animation); lastFrame = 0; $('playBtn').textContent = '▷ Play route'; }
  function renderPlayback() { $('timeline').value = playback; $('playbackTime').textContent = timeLabel(playback); const p = playbackPosition(); if ($('routeVehicle')) $('routeVehicle').setAttribute('transform', `translate(${p.x} ${p.y})`); }
  function frame(now) {
    if (!playing) return;
    if (lastFrame) playback += (now - lastFrame) / 1000 * 5;
    lastFrame = now; playback = Math.min(playback, result.optimized.minutes); renderPlayback();
    if (playback >= result.optimized.minutes) stopPlayback(); else animation = requestAnimationFrame(frame);
  }
  function inspectNode(id) {
    inspected = id; const n = scenario.nodes[id];
    const stop = result?.optimized.stops.find(s => s.id === id), excluded = result?.exclusions.find(e => e.id === id);
    $('nodeInspector').innerHTML = id === 0 ? '<strong>Warehouse W</strong> · One vehicle starts and returns here. Transit through a customer does not count as a delivery.' : `<strong>${escape(n.name)}</strong> · ${n.weight} kg · ${money(n.profit)} · Complete by ${timeLabel(n.deadline)} (${n.deadline} min). ${stop ? `Scheduled ${timeLabel(stop.completion, true)} · ${decimal(stop.slack)} min slack.` : escape(excluded?.reason || 'Optimize to get a schedule.')}`;
    renderMaps();
  }
  function renderOverview() {
    const r = result, p = r.optimized, g = r.greedy;
    $('profitVal').textContent = money(p.profit); $('profitSub').textContent = `${money(p.profit - g.profit)} more than greedy${g.profit ? ` · ${decimal((p.profit / g.profit - 1) * 100)}%` : ''}`;
    $('servedVal').textContent = `${p.order.length} / ${scenario.config.nodeCount}`; $('servedSub').textContent = `${decimal(p.order.length / scenario.config.nodeCount * 100)}% of delivery demand served`;
    $('distanceVal').textContent = `${decimal(p.distance)} km`; $('distanceSub').textContent = `${decimal(p.minutes)} min · including depot return`;
    $('ontimeVal').textContent = p.order.length ? '100%' : '—'; $('ontimeSub').textContent = p.order.length ? `All ${p.order.length} stops complete before deadline` : 'No feasible stops to evaluate';
    $('methodPill').textContent = r.method === 'exact' ? 'EXACT DEADLINE-AWARE DP' : 'DP + FEASIBLE ROUTE HEURISTIC'; $('methodPill').className = 'pill ' + (r.method === 'exact' ? 'green' : 'amber');
    $('scheduleSubtitle').textContent = `Vehicle 01 · departure ${scenario.config.start}`; $('stopCount').textContent = `${p.order.length} STOPS`;
    $('stopList').innerHTML = p.stops.length ? p.stops.map((s, i) => {
      const n = scenario.nodes[s.id];
      return `<div class="stop"><span class="stop-num">${i + 1}</span><div><strong>${escape(n.name)}</strong><p>${n.weight} kg · ${money(n.profit)} · due ${timeLabel(n.deadline)}</p></div><div class="stop-time">${timeLabel(s.completion, true)}<small>${decimal(s.slack)} min slack</small></div></div>`;
    }).join('') : '<div class="empty-state">No feasible deliveries.<br>Increase capacity, extend deadlines or restore roads.</div>';
    $('routeFooter').innerHTML = `<span>↩ Warehouse return ${timeLabel(p.minutes, true)}</span><span>${p.order.length ? decimal(p.averageLatency) : '—'} min avg completion</span>`;
    const max = Math.max(1, r.bound.profit);
    $('profitBars').innerHTML = [['Greedy baseline', g.profit, ''], [r.method === 'exact' ? 'Exact DP plan' : 'DP route plan', p.profit, 'plan'], ['Capacity bound', r.bound.profit, 'bound']].map(([name, value, style]) => `<div class="bar-row"><span>${name}</span><div class="bar-track"><div class="bar-fill ${style}" style="width:${value / max * 100}%"></div></div><strong>${money(value)}</strong></div>`).join('');
    $('boundNote').textContent = `Capacity bound ignores joint route deadlines. ${money(r.bound.profit - p.profit)} separates this bound from the feasible plan.`;
    $('loadValue').innerHTML = `${p.weight} <small>/ ${scenario.config.capacity} kg</small>`; const percent = p.weight / scenario.config.capacity * 100;
    $('loadBar').style.width = percent + '%'; $('loadPct').textContent = `${decimal(percent, 0)}% used`; $('loadRemaining').textContent = `${scenario.config.capacity - p.weight} kg available`;
    $('capacityNote').textContent = `${p.order.length} packages loaded. Each package is indivisible; skipped customers carry no load.`;
    $('runtimePill').textContent = `${decimal(r.timings.total, 2)} ms TOTAL`;
    $('executionTrace').innerHTML = [['Kruskal backbone', `${r.mst.edges.length} edges · ${decimal(r.mst.distance)} km`], ['Dijkstra shortest paths', `${r.shortest.length} sources · ${decimal(r.timings.dijkstra, 2)} ms`], ['Floyd–Warshall APSP', `${decimal(r.timings.floyd, 2)} ms · verified`], ['Greedy feasible schedule', `${g.order.length} stops · ${money(g.profit)}`], ['0/1 knapsack upper bound', `${money(r.bound.profit)} · ${decimal(r.timings.knapsack, 2)} ms`], [r.method === 'exact' ? 'Deadline-aware subset DP' : 'Feasible insertion + comparison', `${decimal(r.timings.route, 2)} ms · ${p.order.length} stops`]].map(([label, detail]) => `<li><span>${label}</span><strong>${detail}</strong></li>`).join('');
  }
  function renderData() {
    $('deliveryRows').innerHTML = scenario.nodes.slice(1).map(n => {
      const stop = result.optimized.stops.find(s => s.id === n.id), inGreedy = result.greedy.order.includes(n.id), exclusion = result.exclusions.find(e => e.id === n.id);
      return `<tr data-order="${n.id}"><td>C${n.id}</td><td><input type="text" data-field="name" maxlength="80" value="${escape(n.name)}" aria-label="Customer ${n.id} name" required></td><td><input type="number" data-field="weight" min="1" max="500" step="1" value="${n.weight}" aria-label="Customer ${n.id} weight" required></td><td><input type="number" data-field="profit" min="0" max="100000" step="1" value="${n.profit}" aria-label="Customer ${n.id} profit" required></td><td><input type="number" data-field="deadline" min="1" max="1440" step="1" value="${n.deadline}" aria-label="Customer ${n.id} deadline" required></td><td class="${inGreedy ? 'positive' : 'muted'}">${inGreedy ? 'Selected' : '—'}</td><td class="${stop ? 'positive' : 'muted'}">${stop ? 'Selected' : 'Skipped'}</td><td>${stop ? `${timeLabel(stop.completion, true)} · ${decimal(stop.slack)} min slack` : escape(exclusion?.reason || '—')}</td></tr>`;
    }).join('');
    $('roadRows').innerHTML = scenario.edges.map(e => `<tr data-road="${e.id}"><td>${e.u ? 'C' + e.u : 'W'} ↔ ${e.v ? 'C' + e.v : 'W'}</td><td><input type="number" data-field="distance" min="0.001" max="1000" step="any" value="${e.distance}" aria-label="Road ${e.id} distance" required></td><td><input type="number" data-field="minutes" min="0.001" max="1440" step="any" value="${e.minutes}" aria-label="Road ${e.id} travel time" required></td><td><input type="number" data-field="delay" min="1" max="20" step="any" value="${e.delay}" aria-label="Road ${e.id} delay multiplier" required></td><td><input type="checkbox" data-field="blocked" ${e.blocked ? 'checked' : ''} aria-label="Close road ${e.id}"></td></tr>`).join('');
  }
  function saveData(type) {
    try {
      const next = JSON.parse(JSON.stringify(scenario));
      const rows = document.querySelectorAll(type === 'orders' ? '[data-order]' : '[data-road]');
      for (const row of rows) {
        const node = type === 'orders' ? next.nodes[Number(row.dataset.order)] : next.edges.find(e => e.id === row.dataset.road);
        for (const input of row.querySelectorAll('input')) {
          if (!input.reportValidity()) return;
          node[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.type === 'text' ? input.value.trim() : Number(input.value);
        }
      }
      scenario = E.validateScenario(next); optimize('Dataset saved and a new feasible schedule computed.');
    } catch (error) { notice(error.message, 'error'); }
  }
  function renderAlgorithms() {
    const r = result, t = r.timings;
    $('algorithmCards').innerHTML = [['01', 'Kruskal MST', t.mst, 'O(E log E)', `${r.mst.components === 1 ? 'Connected tree' : r.mst.components + ' connected components'} · ${decimal(r.mst.distance)} km`], ['02', 'Dijkstra × all sources', t.dijkstra, 'O(V(V + E) log V)', 'Adjacency list + binary heap'], ['03', 'Floyd–Warshall', t.floyd, 'O(V³)', 'All-pairs travel time'], ['04', 'Greedy insertion', t.greedy, 'O(n³)', 'Profit/weight ordering'], ['05', r.method === 'exact' ? 'Deadline subset DP' : 'DP route heuristic', t.route + t.knapsack, r.method === 'exact' ? 'O(nW + 2ⁿn²)' : 'O(nW + n³)', r.method === 'exact' ? 'Exact feasible profit' : 'Feasible, not globally optimal']].map(([n, name, ms, complexity, desc]) => `<article class="algo-tile"><div class="algo-num">ALGORITHM ${n}</div><h3>${name}</h3><strong>${decimal(ms, 2)} <small>ms</small></strong><p>${complexity}<br>${desc}</p></article>`).join('');
    $('guaranteeText').textContent = r.method === 'exact' ? 'This scenario has at most 12 customers. The subset DP finds the maximum attainable profit across all feasible delivery subsets and orders, with earliest depot return as its tie-break. Every selected package fits the vehicle and every stop completes before its deadline.' : 'This scenario has more than 12 customers. The plan uses knapsack selection and feasible insertion, compared with the greedy baseline. It is guaranteed feasible and earns at least the greedy profit, but it does not guarantee the globally best route. The capacity-only knapsack result provides a profit upper bound.';
    let matches = true;
    r.allPairs.forEach((row, i) => row.forEach((v, j) => { if (v !== r.shortest[i].distances[j] && Math.abs(v - r.shortest[i].distances[j]) > 1e-7) matches = false; }));
    $('pathCheck').textContent = matches ? 'DIJKSTRA = FLOYD · ALL PAIRS' : 'PATH CHECK FAILED';
    $('pathRows').innerHTML = scenario.nodes.slice(1).map(n => {
      const path = E.reconstruct(r.shortest[0], 0, n.id);
      return `<tr><td>${escape(n.name)}</td><td>${path ? path.nodes.map(id => id === 0 ? 'W' : 'C' + id).join(' → ') : 'Unreachable'}</td><td>${path ? decimal(path.minutes) : '∞'}</td><td>${path ? decimal(path.distance) : '—'}</td><td>${path ? `${timeLabel(path.minutes + scenario.config.service, true)} / due ${timeLabel(n.deadline)}` : '—'}</td></tr>`;
    }).join('');
    $('floydTable').innerHTML = '<thead><tr><th>From / to</th>' + scenario.nodes.map(n => `<th>${n.id ? 'C' + n.id : 'W'}</th>`).join('') + '</tr></thead><tbody>' + r.allPairs.map((row, i) => `<tr><th>${i ? 'C' + i : 'W'}</th>${row.map((v, j) => `<td${i === j ? ' class="muted"' : ''}>${decimal(v)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  }
  function renderAll() {
    $('scenarioLabel').textContent = 'Scenario ' + scenario.config.seed;
    const closed = scenario.edges.filter(e => e.blocked).length;
    $('scenarioMeta').textContent = `${scenario.config.nodeCount} customers · ${scenario.edges.length} roads · ${scenario.config.capacity} kg${closed ? ` · ${closed} closed` : ''}`;
    renderOverview(); renderData(); renderAlgorithms(); renderMaps();
    $('roadSelect').innerHTML = scenario.edges.map(e => `<option value="${e.id}" ${e.blocked ? 'disabled' : ''}>${e.u ? 'C' + e.u : 'W'} ↔ ${e.v ? 'C' + e.v : 'W'} · ${decimal(e.minutes * e.delay)} min${e.blocked ? ' · CLOSED' : ''}</option>`).join('');
    const active = routeRoads(result.optimized), next = scenario.edges.find(e => active.has(e.id) && !e.blocked);
    if (next) $('roadSelect').value = next.id;
    $('timeline').max = Math.max(0.1, result.optimized.minutes); $('playBtn').disabled = !result.optimized.order.length; $('exportPlan').disabled = !result; renderPlayback();
    if (inspected !== null && scenario.nodes[inspected]) inspectNode(inspected); else { inspected = null; $('nodeInspector').textContent = 'Select a node to see its package, profit and deadline.'; }
  }
  function download(name, content, mime) {
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = URL.createObjectURL(new Blob([content], { type: mime }));
    $('downloadExport').href = exportUrl; $('downloadExport').download = name;
    $('exportTitle').textContent = name; $('exportContent').value = content; $('exportStatus').textContent = '';
    $('exportDialog').showModal();
  }
  function csv(rows) {
    return '\uFEFF' + rows.map(row => row.map(value => {
      let s = String(value ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
  }
  async function runExperiments() {
    if (benchmarking) return;
    benchmarking = true; $('experimentBtn').disabled = true; $('exportExperiments').disabled = true;
    $('experimentProgress').hidden = false; $('experimentProgress').textContent = 'Preparing benchmark…';
    const rows = [], cases = [[8, .1, 10], [12, .22, 25], [20, .35, 35], [40, .6, 60]];
    try {
      for (let i = 0; i < cases.length; i++) {
        $('experimentProgress').textContent = `Running configuration ${i + 1} / ${cases.length} · three repeated solves`;
        await new Promise(resolve => setTimeout(resolve, 10));
        const [nodeCount, density, capacity] = cases[i], data = E.generate({ ...scenario.config, nodeCount, density, capacity });
        const runs = Array.from({ length: 3 }, () => E.solve(data)), r = runs[0];
        rows.push({ nodeCount, density, capacity, method: r.method, greedy: r.greedy.profit, profit: r.optimized.profit, bound: r.bound.profit, ontime: r.optimized.stops.length ? '100%' : 'N/A', ms: runs.reduce((s, run) => s + run.timings.total, 0) / 3, stable: runs.every(run => JSON.stringify(run.optimized.order) === JSON.stringify(r.optimized.order) && run.optimized.profit === r.optimized.profit) });
      }
      experiments = rows;
      $('experimentRows').innerHTML = rows.map(r => `<tr><td>${r.nodeCount}</td><td>${r.density}</td><td>${r.capacity} kg</td><td>${r.method === 'exact' ? 'Exact DP' : 'Heuristic'}</td><td>${money(r.greedy)}</td><td class="positive">${money(r.profit)}</td><td>${money(r.bound)}</td><td>${r.ontime}</td><td>${decimal(r.ms, 2)} ms</td><td>${r.stable ? '✓ Yes' : 'No'}</td></tr>`).join('');
      const gain = rows.reduce((sum, r) => sum + r.profit - r.greedy, 0);
      $('policyOutput').innerHTML = `<strong>Recommendation from these runs:</strong> The recommended plans earned ${money(gain)} more than greedy in total. Use exact subset DP for small scenarios (up to 12 customers), and compare feasible heuristics for larger scenarios. Capacity-only profit is an upper bound; use schedule completion and deadline slack when deciding which deliveries to commit to.`;
      $('experimentProgress').textContent = 'Benchmark complete · 12 solves · ' + (rows.every(r => r.stable) ? 'all repeated solutions stable.' : 'inspect unstable results.'); $('exportExperiments').disabled = false;
    } catch (error) { $('experimentProgress').textContent = error.message; notice(error.message, 'error'); }
    finally { benchmarking = false; $('experimentBtn').disabled = false; }
  }
  $('configForm').addEventListener('submit', event => {
    event.preventDefault(); try { scenario = E.generate(readConfig()); syncConfig(); $('disruptionSummary').hidden = true; optimize('Scenario regenerated with your seed and optimized.'); } catch (error) { notice(error.message, 'error'); }
  });
  $('optimizeBtn').addEventListener('click', runFromSettings);
  $('saveDeliveries').addEventListener('click', () => saveData('orders')); $('saveRoads').addEventListener('click', () => saveData('roads'));
  $('exportScenario').addEventListener('click', () => download(`nexus-scenario-${scenario.config.seed}.json`, JSON.stringify(scenario, null, 2), 'application/json'));
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('Scenario JSON must be smaller than 1 MB.');
      const next = E.validateScenario(JSON.parse(await file.text())); scenario = next; inspected = null; syncConfig(); $('disruptionSummary').hidden = true; optimize(`Imported ${file.name} and computed a feasible plan.`);
    } catch (error) { notice('Import failed: ' + error.message, 'error'); } finally { event.target.value = ''; }
  });
  $('exportPlan').addEventListener('click', () => {
    const p = result.optimized;
    const rows = [['Stop', 'Customer ID', 'Customer', 'Weight (kg)', 'Profit (INR)', 'Arrival (min)', 'Completion (min)', 'Completion time', 'Deadline (min)', 'Slack (min)', 'Solver']];
    p.stops.forEach((s, i) => { const n = scenario.nodes[s.id]; rows.push([i + 1, n.id, n.name, n.weight, n.profit, decimal(s.arrival, 3), decimal(s.completion, 3), timeLabel(s.completion, true), s.deadline, decimal(s.slack, 3), result.method]); });
    rows.push(['RETURN', 0, 'Warehouse', '', '', '', decimal(p.minutes, 3), timeLabel(p.minutes, true), '', '', result.method]);
    rows.push(['TOTAL', '', '', p.weight, p.profit, '', '', '', '', '', `${decimal(p.distance, 3)} km`]);
    download('nexus-delivery-plan.csv', csv(rows), 'text/csv;charset=utf-8'); notice('Delivery plan CSV is ready in the export preview.');
  });
  $('disruptionForm').addEventListener('submit', event => {
    event.preventDefault(); try {
      const before = result.optimized, edge = $('roadSelect').value;
      scenario = E.disrupt(scenario, edge, $('disruptionType').value, 2); optimize(`Road ${edge} changed. Shortest paths and delivery schedule recomputed.`);
      $('disruptionSummary').hidden = false; $('disruptionSummary').textContent = `Before → after: ${money(before.profit)} → ${money(result.optimized.profit)} profit · ${decimal(before.distance)} → ${decimal(result.optimized.distance)} km · ${before.order.length} → ${result.optimized.order.length} stops. ${result.mst.components > 1 ? `Network has ${result.mst.components} disconnected components; unreachable orders are excluded.` : 'The remaining road network is connected.'}`;
    } catch (error) { notice(error.message, 'error'); }
  });
  $('restoreRoads').addEventListener('click', () => { scenario.edges.forEach(e => { e.blocked = false; e.delay = 1; }); $('disruptionSummary').hidden = true; optimize('All road closures and delay multipliers cleared. Plan recomputed.'); });
  $('showMst').addEventListener('change', renderMaps);
  $('zoomIn').addEventListener('click', () => { zoom = Math.min(2, zoom + .2); renderMaps(); });
  $('zoomOut').addEventListener('click', () => { zoom = Math.max(.7, zoom - .2); renderMaps(); });
  $('zoomReset').addEventListener('click', () => { zoom = 1; renderMaps(); });
  ['overviewMap', 'networkMap'].forEach(id => {
    $(id).addEventListener('click', event => { const target = event.target.closest('[data-node]'); if (target) { inspectNode(Number(target.dataset.node)); if (id === 'overviewMap') location.hash = 'network'; } });
    $(id).addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key) && event.target.dataset.node !== undefined) { event.preventDefault(); inspectNode(Number(event.target.dataset.node)); if (id === 'overviewMap') location.hash = 'network'; } });
  });
  $('playBtn').addEventListener('click', () => { if (playing) stopPlayback(); else if (result?.optimized.order.length) { if (playback >= result.optimized.minutes) playback = 0; playing = true; lastFrame = 0; $('playBtn').textContent = 'Ⅱ Pause route'; animation = requestAnimationFrame(frame); } });
  $('resetPlayback').addEventListener('click', () => { stopPlayback(); playback = 0; renderPlayback(); });
  $('timeline').addEventListener('input', () => { stopPlayback(); playback = Number($('timeline').value); renderPlayback(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
  $('experimentBtn').addEventListener('click', runExperiments);
  $('closeExport').addEventListener('click', () => $('exportDialog').close());
  $('copyExport').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('exportContent').value); $('exportStatus').textContent = 'Copied.'; }
    catch { $('exportContent').focus(); $('exportContent').select(); $('exportStatus').textContent = 'Contents selected. Press Ctrl+C to copy.'; }
  });
  $('exportExperiments').addEventListener('click', () => download('nexus-experiments.csv', csv([['Customers', 'Density', 'Capacity (kg)', 'Solver', 'Greedy profit', 'Plan profit', 'Capacity bound', 'On time', 'Mean runtime (ms)', 'Stable x3'], ...experiments.map(r => [r.nodeCount, r.density, r.capacity, r.method, r.greedy, r.profit, r.bound, r.ontime, decimal(r.ms, 3), r.stable])]), 'text/csv;charset=utf-8'));
  window.addEventListener('hashchange', setView);
  try { const saved = localStorage.getItem(STORAGE); scenario = saved ? E.validateScenario(JSON.parse(saved)) : E.generate(E.defaults); } catch { scenario = E.generate(E.defaults); }
  syncConfig(); optimize('Ready. This repeatable synthetic scenario has been optimized locally.'); setView();
})();
