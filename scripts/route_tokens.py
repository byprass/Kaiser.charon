#!/usr/bin/env python3
"""List tokens by signal route with PnL details — reads charon.sqlite directly."""
import sqlite3, sys

DB = "/home/ubuntu/Kaiser.charon/charon.sqlite"

def fmt_sol(v):
    return round(float(v or 0), 4)

def by_route(route_filter=None):
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    where = ""
    params = ()
    if route_filter:
        where = "WHERE route = ?"
        params = (route_filter,)

    rows = conn.execute(f"""
        SELECT
            symbol,
            COALESCE(json_extract(snapshot_json,'$.candidate.signals.route'), 'unknown') as route,
            ROUND(pnl_sol,4) as pnl_sol,
            ROUND(pnl_percent,1) as pnl_pct,
            exit_reason,
            datetime(closed_at_ms/1000,'unixepoch','localtime') as closed_at,
            datetime(opened_at_ms/1000,'unixepoch','localtime') as opened_at,
            ROUND((closed_at_ms - opened_at_ms)/60000.0,1) as hold_min
        FROM dry_run_positions
        WHERE status = 'closed'
        {where}
        ORDER BY
            CASE WHEN route = ? THEN 0 ELSE 1 END,
            route,
            pnl_sol DESC
    """, params + (route_filter or 'pumpportal_graduated',))

    results = [dict(r) for r in rows]
    conn.close()
    return results

def flag(v):
    return "🟢" if v >= 0 else "🔴"

if __name__ == "__main__":
    route_filter = sys.argv[1] if len(sys.argv) > 1 else None

    results = by_route(route_filter)
    if not results:
        print("No data.")
        sys.exit(0)

    current_route = None
    route_totals = {}
    for r in results:
        rt = r['route']
        route_totals[rt] = route_totals.get(rt, {'trades': 0, 'wins': 0, 'losses': 0, 'pnl': 0})
        route_totals[rt]['trades'] += 1
        route_totals[rt]['pnl'] += r['pnl_sol']
        if r['pnl_sol'] > 0:
            route_totals[rt]['wins'] += 1
        else:
            route_totals[rt]['losses'] += 1

    # Summary per route
    blocked = ['dual_source', 'fee_graduated_trending', 'pumpfun_pregrad', 'trending']
    hdr = f"{'Route':<30} {'Trades':>6} {'WR':>7} {'Total PnL':>10}  Status"
    print(hdr)
    print("-" * len(hdr))
    for rt, stats in sorted(route_totals.items(), key=lambda x: x[1]['pnl'], reverse=True):
        wr = f"{round(100*stats['wins']/max(stats['trades'],1),1)}%"
        pnl = f"{flag(stats['pnl'])} {stats['pnl']:+.4f} SOL"
        status = "🔴 blocked" if rt in blocked else "✅ aktif"
        print(f"{rt:<30} {stats['trades']:>6} {wr:>7} {pnl:>17}  {status}")

    print()
    print("=" * 90)
    print(f"{'Token':<15} {'Route':<30} {'PnL':>10} {'%':>7} {'Exit':<16} {'Hold':>7} {'Closed'}")
    print("-" * 90)

    for r in results:
        rt = r['route']
        if rt != current_route:
            current_route = rt
            b = blocked_note = " [BLOCKED]" if rt in blocked else ""
            print(f"\n── {rt}{blocked_note} ──────────────────────────────────────────────")
        print(f"{r['symbol'] or '?':<15} {rt:<30} {flag(r['pnl_sol'])} {r['pnl_sol']:>+8.4f} {r['pnl_pct']:>+6.1f}% {r['exit_reason'] or '?':<16} {r['hold_min']:>5.1f}m {r['closed_at'] or ''}")
