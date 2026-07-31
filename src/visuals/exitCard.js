import { createCanvas } from 'canvas';

const W = 800;
const H = 420;
const PROFIT = '#00d4aa';
const LOSS = '#ff4757';
const NEUTRAL = '#8a93b0';
const LABEL = '#8a93b0';
const TEXT = '#e8ecf4';
const DIM = '#5a627d';
const PANEL = 'rgba(255, 255, 255, 0.04)';
const PANEL_BORDER = 'rgba(255, 255, 255, 0.06)';
const ACCENT = '#5b8cff';

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fmtSol(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '\u2014';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(4)}`;
}

function fmtPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '\u2014';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function fmtUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '\u2014';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '\u2014';
  const totalSec = Math.floor(n / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function shortMint(mint) {
  if (!mint || typeof mint !== 'string') return '\u2014';
  if (mint.length <= 10) return mint;
  return `${mint.slice(0, 6)}\u2026${mint.slice(-4)}`;
}

function pickAccent(pnlSol) {
  const n = Number(pnlSol);
  if (!Number.isFinite(n) || n === 0) return NEUTRAL;
  return n > 0 ? PROFIT : LOSS;
}

// ── Background ──────────────────────────────────────────────

function drawBackground(ctx) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#16213e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.85, 0, 20, W * 0.85, 0, 320);
  glow.addColorStop(0, 'rgba(91, 140, 255, 0.10)');
  glow.addColorStop(1, 'rgba(91, 140, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

// ── Header: CLOSED badge + reason pill + symbol ────────────

function drawHeader(ctx, position, accent) {
  // CLOSED badge
  const badgeX = 32;
  const badgeY = 28;
  const badgeH = 26;
  ctx.font = 'bold 12px sans-serif';
  const badgeText = 'CLOSED';
  const badgeW = ctx.measureText(badgeText).width + 20;
  ctx.fillStyle = `${accent}26`;
  roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(badgeText, badgeX + 10, badgeY + badgeH / 2 + 1);

  // exit reason pill
  const reason = String(position.exit_reason || position.exitReason || 'EXIT');
  ctx.font = '600 11px sans-serif';
  const reasonW = ctx.measureText(reason).width + 16;
  const reasonX = badgeX + badgeW + 8;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  roundedRect(ctx, reasonX, badgeY, reasonW, badgeH, 6);
  ctx.fill();
  ctx.fillStyle = '#c8cee0';
  ctx.fillText(reason, reasonX + 8, badgeY + badgeH / 2 + 1);

  // token symbol — right side
  ctx.font = 'bold 22px sans-serif';
  const symbol = String(position.symbol || shortMint(position.mint)).toUpperCase();
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(symbol, W - 32, 50);

  // mint subtitle
  ctx.font = '10px sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(shortMint(position.mint), W - 32, 66);
}

// ── Divider ─────────────────────────────────────────────────

function drawDivider(ctx, y) {
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, y);
  ctx.lineTo(W - 32, y);
  ctx.stroke();
}

// ── PNL Hero panel (big SOL + arrow + percentage) ──────────

function drawPnlHero(ctx, position, accent) {
  const pnlSol = Number(position.pnl_sol ?? position.pnlSol ?? 0);
  const pnlPct = Number(position.pnl_percent ?? position.pnlPercent ?? 0);
  const isProfit = pnlSol > 0;
  const isLoss = pnlSol < 0;

  // Hero panel background
  const panelX = 32;
  const panelY = 90;
  const panelW = W - 64;
  const panelH = 170;
  ctx.fillStyle = PANEL;
  roundedRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.fill();
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Accent stripe left edge
  ctx.fillStyle = `${accent}55`;
  roundedRect(ctx, panelX, panelY, 4, panelH, 2);
  ctx.fill();

  // Big directional arrow
  ctx.font = 'bold 64px sans-serif';
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const arrow = isProfit ? '\u2197' : isLoss ? '\u2198' : '\u2192';
  ctx.fillText(arrow, W / 2 - 140, panelY + 80);

  // Big SOL number
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(`${fmtSol(pnlSol)} SOL`, W / 2, panelY + 60);

  // Percentage below SOL
  ctx.font = '600 22px sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(fmtPct(pnlPct), W / 2, panelY + 92);

  // Outcome label
  ctx.font = 'bold 14px sans-serif';
  const outcome = isProfit ? 'PROFIT' : isLoss ? 'LOSS' : 'BREAK-EVEN';
  ctx.fillText(outcome, W / 2, panelY + 120);

  // Outcome badge top-right of hero
  const badgeW = ctx.measureText(outcome).width + 20;
  const badgeX = panelX + panelW - badgeW - 24;
  const badgeY = panelY + 14;
  ctx.fillStyle = `${accent}26`;
  roundedRect(ctx, badgeX, badgeY, badgeW, 24, 5);
  ctx.fill();
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = accent;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(outcome, badgeX + badgeW / 2, badgeY + 13);
}

// ── Compact 4-column stats row ─────────────────────────────

function drawStatsRow(ctx, position) {
  const panelX = 32;
  const panelY = 278;
  const panelW = W - 64;
  const panelH = 66;
  ctx.fillStyle = PANEL;
  roundedRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.fill();
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  const cols = [
    { label: 'DEPOSITED', value: `${fmtSol(position.size_sol)} SOL` },
    {
      label: 'DURATION',
      value: fmtDuration(
        (position.closed_at_ms ?? Date.now()) -
        (position.opened_at_ms ?? Date.now())
      ),
    },
    { label: 'ENTRY MCAP', value: fmtUsd(position.entry_mcap) },
    { label: 'EXIT MCAP', value: fmtUsd(position.exit_mcap) },
  ];
  const colW = (panelW - 48) / cols.length;
  const x0 = panelX + 24;

  // vertical separators between columns
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  for (let i = 1; i < cols.length; i++) {
    const sx = x0 + colW * i;
    ctx.beginPath();
    ctx.moveTo(sx, panelY + 10);
    ctx.lineTo(sx, panelY + panelH - 10);
    ctx.stroke();
  }

  cols.forEach((col, i) => {
    const x = x0 + colW * i + colW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 9px sans-serif';
    ctx.fillStyle = LABEL;
    ctx.fillText(col.label, x, panelY + 20);

    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = TEXT;

    // dynamic font-size for long strings
    const measured = ctx.measureText(col.value).width;
    if (measured > colW - 12) {
      ctx.font = 'bold 12px sans-serif';
    }
    ctx.fillText(col.value, x, panelY + 48);
  });
}

// ── Footer ─────────────────────────────────────────────────

function drawFooter(ctx, position) {
  ctx.font = '10px sans-serif';
  ctx.fillStyle = DIM;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const opened = position.opened_at_ms
    ? new Date(position.opened_at_ms).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
    : '\u2014';
  ctx.fillText(`Opened: ${opened}`, 32, H - 22);

  ctx.textAlign = 'right';
  const closed = position.closed_at_ms
    ? new Date(position.closed_at_ms).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
    : '\u2014';
  ctx.fillText(`Closed: ${closed}`, W - 32, H - 22);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#3f4660';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('CHARON', W / 2, H - 22);
}

// ── Main export ────────────────────────────────────────────

export async function generateExitCard(position) {
  if (!position || typeof position !== 'object') {
    throw new Error('generateExitCard: position object is required');
  }

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';
  ctx.patternQuality = 'bilinear';
  ctx.quality = 'bilinear';

  const accent = pickAccent(position.pnl_sol ?? position.pnlSol);

  drawBackground(ctx);
  drawHeader(ctx, position, accent);
  drawDivider(ctx, 80);
  drawPnlHero(ctx, position, accent);
  drawDivider(ctx, 268);
  drawStatsRow(ctx, position);
  drawFooter(ctx, position);

  return canvas.toBuffer('image/png');
}

export default generateExitCard;
