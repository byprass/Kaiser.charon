#!/usr/bin/env python3
"""Charon HTML dashboard — mobile-friendly, Chart.js, auto-refresh."""
import sqlite3, json, time, os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

DB = "/home/ubuntu/Kaiser.charon/charon.sqlite"
REFRESH_SEC = 30
# Audit started: 2026-07-05 19:21:19 UTC (when LLM was disabled)
AUDIT_START_MS = 1783250479272
# Blocked routes (kept in sync with orchestrator.js)
BLOCKED_ROUTES = ['dual_source', 'fee_graduated_trending', 'pumpfun_pregrad', 'trending']


def q(sql, params=()):
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute(sql, params)]
    conn.close()
    return rows


def pnl_data():
    now_ms = int(time.time() * 1000)
    day = 86400000
    results = {}
    for label, cutoff in [("24h", now_ms - day), ("7d", now_ms - 7 * day), ("audit", AUDIT_START_MS)]:
        r = q("""SELECT COUNT(*) as total, ROUND(AVG(pnl_sol),4) as avg_pnl,
            ROUND(SUM(pnl_sol),4) as total_pnl,
            SUM(CASE WHEN exit_reason='TRAILING_TP' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN exit_reason='SL' THEN 1 ELSE 0 END) as losses
        FROM dry_run_positions WHERE status='closed' AND closed_at_ms > ?""", (cutoff,))
        if r and r[0]["total"]:
            d = r[0]
            d["wr"] = round(100 * d["wins"] / max(d["wins"] + d["losses"], 1), 1)
            results[label] = d
    return results


def route_tokens_data():
    """Token-level PnL grouped by route with summary stats."""
    rows = q("""
        SELECT
            symbol,
            COALESCE(json_extract(snapshot_json,'$.candidate.signals.route'), 'unknown') as route,
            ROUND(pnl_sol,4) as pnl_sol,
            ROUND(pnl_percent,1) as pnl_pct,
            exit_reason,
            datetime(closed_at_ms/1000,'unixepoch','localtime') as closed_at,
            ROUND((closed_at_ms - opened_at_ms)/60000.0,1) as hold_min,
            json_extract(snapshot_json,'$.filters.requiredMcapUsd') as required_mcap,
            json_extract(snapshot_json,'$.filters.requiredLiqUsd') as required_liq
        FROM dry_run_positions
        WHERE status = 'closed'
        ORDER BY
            CASE WHEN route IN ('pumpportal_graduated','trenches_completed','fee_trending','graduated_trending') THEN 0 ELSE 1 END,
            route,
            pnl_sol DESC
    """)
    # Build grouped structure
    routes_map = {}
    for r in rows:
        rt = r['route']
        if rt not in routes_map:
            routes_map[rt] = {'route': rt, 'trades': 0, 'wins': 0, 'losses': 0, 'total_pnl': 0, 'blocked': rt in BLOCKED_ROUTES, 'tokens': []}
        routes_map[rt]['trades'] += 1
        routes_map[rt]['total_pnl'] += r['pnl_sol'] or 0
        if (r['pnl_sol'] or 0) > 0:
            routes_map[rt]['wins'] += 1
        else:
            routes_map[rt]['losses'] += 1
        routes_map[rt]['tokens'].append(r)
    # Sort routes: active first, then by total_pnl desc
    result = sorted(routes_map.values(), key=lambda x: (x['blocked'], -x['total_pnl']))
    return result


HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>Charon Monitor</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:12px;max-width:100vw;overflow-x:hidden}
h1{font-size:18px;margin-bottom:12px;color:#58a6ff}
h2{font-size:14px;margin-bottom:8px;color:#8b949e}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;text-align:center}
.card .label{font-size:11px;color:#8b949e;text-transform:uppercase}
.card .value{font-size:24px;font-weight:700;margin-top:4px}
.card .sub{font-size:11px;color:#8b949e;margin-top:2px}
.green{color:#3fb950}
.red{color:#f85149}
.orange{color:#d2991d}
.blue{color:#58a6ff}
.chart-box{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:12px}
canvas{max-height:300px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:8px 6px;border-bottom:1px solid #30363d;color:#8b949e;font-weight:500;position:sticky;top:0;background:#161b22}
td{padding:6px;border-bottom:1px solid #21262d}
tr:hover{background:#1c2128}
.refresh{font-size:11px;color:#484f58;text-align:center;margin-top:12px}
.pnl-positive{color:#3fb950}
.pnl-negative{color:#f85149}
.badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600}
.badge-blocked{background:#3d1f1f;color:#f85149}
.badge-active{background:#1f3d1f;color:#3fb950}
.route-header{cursor:pointer;user-select:none}
.route-header:hover{background:#1c2128}
.route-header .arrow{display:inline-block;width:12px;transition:transform .2s}
.route-header.open .arrow{transform:rotate(90deg)}
.route-body{display:none}
.route-body.show{display:table-row-group}
.summary-row{font-size:11px;color:#8b949e}
.summary-row td{padding:4px 6px}
.token-row td{font-size:11px}
.tabs{display:flex;gap:4px;margin-bottom:12px}
.tab{background:#161b22;border:1px solid #30363d;color:#8b949e;padding:6px 16px;border-radius:6px 6px 0 0;cursor:pointer;font-size:12px}
.tab.active{background:#1c2128;color:#c9d1d9;border-bottom-color:#1c2128}
.tab-content{display:none}
.tab-content.active{display:block}
.filter-bar{margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap}
.filter-chip{background:#21262d;border:1px solid #30363d;border-radius:12px;padding:2px 10px;font-size:11px;cursor:pointer}
.filter-chip.active{background:#1f3d1f;border-color:#3fb950;color:#3fb950}
</style>
</head>
<body>
<h1>🛶 Charon Audit Monitor</h1>

<div class="tabs">
  <div class="tab active" onclick="switchTab('overview')">Overview</div>
  <div class="tab" onclick="switchTab('routes')">Route Tokens</div>
</div>

<div id="tab-overview" class="tab-content active">
  <div class="stats" id="stats"></div>
  <div class="chart-box"><h2>PnL Timeline (since LLM off)</h2><canvas id="pnlChart"></canvas></div>
  <div class="chart-box"><h2>Route PnL (since LLM off)</h2><canvas id="routeChart"></canvas></div>
  <div class="chart-box"><h2>Recent Trades</h2><table id="trades"></table></div>
</div>

<div id="tab-routes" class="tab-content">
  <div class="chart-box"><h2>Tokens by Route — PnL Breakdown</h2>
    <table>
      <thead><tr><th>Route</th><th>Trades</th><th>WR</th><th>Total PnL</th><th>Status</th><th></th></tr></thead>
      <tbody id="routeTokens"></tbody>
    </table>
  </div>
</div>

<div class="refresh">Auto-refresh: __REFRESH__s</div>
<script>
const REFRESH = __REFRESH__;
let pnlChart, routeChart;

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase().includes(name)));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
}

async function load() {
  const r = await fetch('/api/data');
  const d = await r.json();
  renderStats(d.pnl);
  renderChart(d.timeline);
  renderRoutes(d.routes);
  renderTrades(d.trades);
}

async function loadRoutes() {
  const r = await fetch('/api/routes');
  const routes = await r.json();
  renderRouteTokens(routes);
}

function renderStats(pnl) {
  const d = pnl['24h'] || {};
  const d7 = pnl['7d'] || {};
  const da = pnl['audit'] || {};
  const cl = (v) => v >= 0 ? 'green' : 'red';
  document.getElementById('stats').innerHTML = `
    <div class="card"><div class="label">Total PnL</div><div class="value ${cl(d.total_pnl||0)}">${(d.total_pnl||0).toFixed(3)} SOL</div><div class="sub">24h</div></div>
    <div class="card"><div class="label">Win Rate</div><div class="value ${(d.wr||0)>=50?'green':'orange'}">${d.wr||0}%</div><div class="sub">${d.wins||0}W / ${d.losses||0}L</div></div>
    <div class="card"><div class="label">24h Trades</div><div class="value blue">${d.total||0}</div><div class="sub">avg ${(d.avg_pnl||0).toFixed(4)} SOL</div></div>
    <div class="card"><div class="label">7d PnL</div><div class="value ${cl(d7.total_pnl||0)}">${(d7.total_pnl||0).toFixed(3)} SOL</div><div class="sub">${d7.wins||0}W / ${d7.losses||0}L</div></div>
    <div class="card"><div class="label">Audit PnL</div><div class="value ${cl(da.total_pnl||0)}">${(da.total_pnl||0).toFixed(3)} SOL</div><div class="sub">${da.wins||0}W / ${da.losses||0}L (${da.wr||0}%)</div></div>
    <div class="card"><div class="label">Open</div><div class="value blue">${d.open||0}</div><div class="sub">positions</div></div>
    <div class="card"><div class="label">Candidates</div><div class="value blue">${d.candidates||0}</div><div class="sub">${d.filtered||0} filtered, ${d.buys||0} buys</div></div>
  `;
}

function renderChart(timeline) {
  const labels = timeline.map(t => t.time?.slice(11,16) || '');
  const data = timeline.map(t => t.pnl_sol);
  const colors = data.map(v => v >= 0 ? '#3fb95033' : '#f8514933');
  const borders = data.map(v => v >= 0 ? '#3fb950' : '#f85149');
  if (pnlChart) pnlChart.destroy();
  pnlChart = new Chart(document.getElementById('pnlChart'), {
    type: 'bar',
    data: {labels, datasets: [{data, backgroundColor: colors, borderColor: borders, borderWidth: 1}]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {legend: {display: false}},
      scales: {
        x: {ticks: {color: '#484f58', maxTicksLimit: 20, font: {size: 9}}},
        y: {ticks: {color: '#484f58', callback: v => v.toFixed(2), font: {size: 10}}}
      }
    }
  });
}

function renderRoutes(routes) {
  const labels = routes.map(r => r.route);
  const data = routes.map(r => r.total_pnl);
  const colors = data.map(v => v >= 0 ? '#3fb950' : '#f85149');
  if (routeChart) routeChart.destroy();
  routeChart = new Chart(document.getElementById('routeChart'), {
    type: 'bar',
    data: {labels, datasets: [{data, backgroundColor: colors, borderRadius: 4}]},
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {legend: {display: false}},
      scales: {
        x: {ticks: {color: '#484f58', callback: v => v.toFixed(2), font: {size: 10}}},
        y: {ticks: {color: '#8b949e', font: {size: 10}}}
      }
    }
  });
}

function renderTrades(trades) {
  const rows = trades.slice(0,20).map(t => `
    <tr>
      <td>${t.symbol||'?'}</td>
      <td style="color:#8b949e;font-size:10px">${t.route||'-'}</td>
      <td class="${t.pnl_sol>=0?'pnl-positive':'pnl-negative'}">${(t.pnl_sol||0).toFixed(4)}</td>
      <td>${t.pnl_pct?.toFixed(1)||0}%</td>
      <td>${t.exit_reason||'?'}</td>
      <td style="color:#484f58">${t.closed_at?.slice(5,16)||''}</td>
    </tr>`).join('');
  document.getElementById('trades').innerHTML = `
    <tr><th>Token</th><th>Route</th><th>PnL SOL</th><th>%</th><th>Exit</th><th>Time</th></tr>${rows}`;
}

function renderRouteTokens(routes) {
  let html = '';
  for (const route of routes) {
    const wr = route.trades > 0 ? (100 * route.wins / route.trades).toFixed(1) : '0.0';
    const pnlClass = route.total_pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    const badge = route.blocked
      ? '<span class="badge badge-blocked">BLOCKED</span>'
      : '<span class="badge badge-active">ACTIVE</span>';
    const routeId = route.route.replace(/[^a-zA-Z0-9]/g, '_');

    html += `<tr class="route-header" onclick="toggleRoute('${routeId}')">
      <td><span class="arrow" id="arrow_${routeId}">▶</span> <strong>${route.route}</strong></td>
      <td>${route.trades}</td>
      <td>${wr}%</td>
      <td class="${pnlClass}">${route.total_pnl >= 0 ? '+' : ''}${route.total_pnl.toFixed(4)} SOL</td>
      <td>${badge}</td>
      <td style="color:#484f58;font-size:10px">${route.wins}W/${route.losses}L</td>
    </tr>`;

    // Token rows (hidden by default)
    html += `<tbody class="route-body" id="body_${routeId}">`;
    for (const t of route.tokens) {
      const pnlCls = t.pnl_sol >= 0 ? 'pnl-positive' : 'pnl-negative';
      const hold = t.hold_min != null ? t.hold_min.toFixed(1) + 'm' : '?';
      html += `<tr class="token-row">
        <td style="padding-left:24px">${t.symbol || '?'}</td>
        <td class="${pnlCls}">${t.pnl_sol >= 0 ? '+' : ''}${(t.pnl_sol||0).toFixed(4)}</td>
        <td>${(t.pnl_pct||0) >= 0 ? '+' : ''}${(t.pnl_pct||0).toFixed(1)}%</td>
        <td>${t.exit_reason || '?'}</td>
        <td>${hold}</td>
        <td style="color:#484f58">${(t.closed_at || '').slice(5,16)}</td>
      </tr>`;
    }
    html += '</tbody>';
  }
  document.getElementById('routeTokens').innerHTML = html;
}

function toggleRoute(id) {
  const body = document.getElementById('body_' + id);
  const arrow = document.getElementById('arrow_' + id);
  const header = arrow.parentElement.parentElement;
  if (body) {
    body.classList.toggle('show');
    header.classList.toggle('open');
  }
}

// Initial load
load();
loadRoutes();
setInterval(() => { load(); loadRoutes(); }, REFRESH * 1000);
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.replace("__REFRESH__", str(REFRESH_SEC)).encode())
        elif path == "/api/data":
            try:
                pnl = pnl_data()
                d24 = pnl.get("24h", {})
                open_r = q("SELECT COUNT(*) as c FROM dry_run_positions WHERE status='open'")
                cand_r = q("""SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='buy' THEN 1 ELSE 0 END) as buys,
                    SUM(CASE WHEN status='filtered' THEN 1 ELSE 0 END) as filtered
                FROM candidates WHERE created_at_ms > (strftime('%s','now')-86400)*1000""")
                d24["open"] = open_r[0]["c"] if open_r else 0
                if cand_r:
                    d24["candidates"] = cand_r[0]["total"]
                    d24["filtered"] = cand_r[0]["filtered"]
                    d24["buys"] = cand_r[0]["buys"]

                timeline = q("""SELECT datetime(closed_at_ms/1000,'unixepoch','localtime') as time,
                    ROUND(pnl_sol,4) as pnl_sol FROM dry_run_positions
                    WHERE status='closed' AND closed_at_ms >= ?
                    ORDER BY closed_at_ms ASC""", (AUDIT_START_MS,))
                routes = q("""SELECT json_extract(snapshot_json,'$.candidate.signals.route') as route,
                    ROUND(SUM(pnl_sol),4) as total_pnl FROM dry_run_positions
                    WHERE status='closed' AND closed_at_ms >= ?
                    GROUP BY route ORDER BY total_pnl ASC""", (AUDIT_START_MS,))
                trades = q("""SELECT symbol, ROUND(pnl_sol,4) as pnl_sol,
                    ROUND(pnl_percent,1) as pnl_pct, exit_reason,
                    COALESCE(json_extract(snapshot_json,'$.candidate.signals.route'), '-') as route,
                    datetime(closed_at_ms/1000,'unixepoch','localtime') as closed_at
                    FROM dry_run_positions WHERE status='closed' AND closed_at_ms >= ?
                    ORDER BY closed_at_ms DESC LIMIT 20""", (AUDIT_START_MS,))

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"pnl": pnl, "timeline": timeline, "routes": routes, "trades": trades}).encode())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        elif path == "/api/routes":
            try:
                data = route_tokens_data()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(data).encode())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"[dashboard] Charon Monitor on 0.0.0.0:{port}")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
