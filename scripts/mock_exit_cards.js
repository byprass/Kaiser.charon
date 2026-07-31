// Generate mock exit cards for Option B and Option C visual proposals
// Usage: node scripts/mock_exit_cards.js

import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

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
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
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

// ============================================================
// SHARED BACKGROUND
// ============================================================
function drawBackground(ctx, accentOverride) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  if (accentOverride === PROFIT) {
    grad.addColorStop(0, '#0a2a1f');
    grad.addColorStop(1, '#16213e');
  } else if (accentOverride === LOSS) {
    grad.addColorStop(0, '#2a0f1a');
    grad.addColorStop(1, '#16213e');
  } else {
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.85, 0, 20, W * 0.85, 0, 320);
  glow.addColorStop(0, 'rgba(91, 140, 255, 0.10)');
  glow.addColorStop(1, 'rgba(91, 140, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function drawDivider(ctx, y) {
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, y);
  ctx.lineTo(W - 32, y);
  ctx.stroke();
}

function drawFooter(ctx, position) {
  ctx.font = '10px sans-serif';
  ctx.fillStyle = DIM;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const opened = position.opened_at_ms ? new Date(position.opened_at_ms).toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : '\u2014';
  ctx.fillText(`Opened: ${opened}`, 32, H - 22);

  ctx.textAlign = 'right';
  const closed = position.closed_at_ms ? new Date(position.closed_at_ms).toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : '\u2014';
  ctx.fillText(`Closed: ${closed}`, W - 32, H - 22);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#3f4660';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('CHARON', W / 2, H - 22);
}

// ============================================================
// OPTION B: PNL HERO
// ============================================================

function drawOptionBHeader(ctx, position, accent) {
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
  const reason = position.exit_reason || 'EXIT';
  ctx.font = '600 11px sans-serif';
  const reasonW = ctx.measureText(reason).width + 16;
  const reasonX = badgeX + badgeW + 8;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  roundedRect(ctx, reasonX, badgeY, reasonW, badgeH, 6);
  ctx.fill();
  ctx.fillStyle = '#c8cee0';
  ctx.fillText(reason, reasonX + 8, badgeY + badgeH / 2 + 1);

  // token symbol
  ctx.font = 'bold 22px sans-serif';
  const symbol = String(position.symbol || 'BONK').toUpperCase();
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(symbol, W - 32, 50);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(shortMint(position.mint), W - 32, 66);
}

function drawOptionBHero(ctx, position, accent) {
  const pnlSol = Number(position.pnl_sol);
  const pnlPct = Number(position.pnl_percent);
  const isProfit = pnlSol > 0;
  const isLoss = pnlSol < 0;
  const isBreakEven = !isProfit && !isLoss;

  // Hero panel
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

  // Accent stripe left
  ctx.fillStyle = `${accent}55`;
  roundedRect(ctx, panelX, panelY, 4, panelH, 2);
  ctx.fill();

  // Big arrow
  ctx.font = 'bold 64px sans-serif';
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const arrow = isProfit ? '\u2197' : isLoss ? '\u2198' : '\u2192';
  ctx.fillText(arrow, W / 2 - 130, panelY + 80);

  // Big SOL number
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillStyle = accent;
  const solText = `${fmtSol(pnlSol)} SOL`;
  ctx.fillText(solText, W / 2, panelY + 62);

  // Percentage
  ctx.font = '600 22px sans-serif';
  ctx.fillStyle = accent;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fmtPct(pnlPct), W / 2, panelY + 92);

  // Outcome label
  ctx.font = 'bold 14px sans-serif';
  const outcome = isProfit ? 'PROFIT' : isLoss ? 'LOSS' : 'BREAK-EVEN';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(outcome, W / 2, panelY + 120);

  // Outcome badge top-right
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

function drawOptionBStats(ctx, position, accent) {
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
    { label: 'DURATION', value: fmtDuration((position.closed_at_ms || Date.now()) - position.opened_at_ms) },
    { label: 'ENTRY MCAP', value: fmtUsd(position.entry_mcap) },
    { label: 'EXIT MCAP', value: fmtUsd(position.exit_mcap) },
  ];
  const colW = (panelW - 48) / cols.length;
  const x0 = panelX + 24;

  cols.forEach((col, i) => {
    const x = x0 + colW * i + colW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 9px sans-serif';
    ctx.fillStyle = LABEL;
    ctx.fillText(col.label, x, panelY + 20);
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = TEXT;
    ctx.fillText(col.value, x, panelY + 48);
  });
}

function generateOptionB(position) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';

  const accent = pickAccent(position.pnl_sol);
  drawBackground(ctx);
  drawOptionBHeader(ctx, position, accent);
  drawDivider(ctx, 78);
  drawOptionBHero(ctx, position, accent);
  drawDivider(ctx, 268);
  drawOptionBStats(ctx, position, accent);
  drawFooter(ctx, position);
  return canvas.toBuffer('image/png');
}

// ============================================================
// OPTION C: THEMED BACKGROUND + BANNER
// ============================================================

function drawOptionCBackground(ctx, accent) {
  // Themed gradient: green for profit, red for loss, neutral blue
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (accent === PROFIT) {
    grad.addColorStop(0, '#0a2f1a');
    grad.addColorStop(0.5, '#142830');
    grad.addColorStop(1, '#16213e');
  } else if (accent === LOSS) {
    grad.addColorStop(0, '#2f0a14');
    grad.addColorStop(0.5, '#281420');
    grad.addColorStop(1, '#16213e');
  } else {
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Themed glow top-right
  const glow = ctx.createRadialGradient(W * 0.8, 0, 30, W * 0.8, 0, 350);
  if (accent === PROFIT) {
    glow.addColorStop(0, 'rgba(0, 212, 170, 0.12)');
    glow.addColorStop(1, 'rgba(0, 212, 170, 0)');
  } else if (accent === LOSS) {
    glow.addColorStop(0, 'rgba(255, 71, 87, 0.12)');
    glow.addColorStop(1, 'rgba(255, 71, 87, 0)');
  } else {
    glow.addColorStop(0, 'rgba(91, 140, 255, 0.08)');
    glow.addColorStop(1, 'rgba(91, 140, 255, 0)');
  }
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Confetti dots for profit
  if (accent === PROFIT) {
    const dots = [
      [120, 60], [340, 25], [580, 70], [700, 30], [200, 140],
      [450, 55], [650, 120], [90, 180], [520, 140], [380, 95]
    ];
    dots.forEach(([x, y]) => {
      ctx.fillStyle = 'rgba(0, 212, 170, 0.25)';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // a few gold dots
    const gold = [[160, 90], [600, 45], [720, 90], [300, 160]];
    gold.forEach(([x, y]) => {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.20)';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Warning stripe for loss (bottom)
  if (accent === LOSS) {
    ctx.fillStyle = 'rgba(255, 71, 87, 0.08)';
    for (let i = 0; i < 6; i++) {
      const sx = i * 160 - 40;
      ctx.beginPath();
      ctx.moveTo(sx, 380);
      ctx.lineTo(sx + 120, 0);
      ctx.lineTo(sx + 160, 0);
      ctx.lineTo(sx + 40, 380);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawOptionCHeader(ctx, position, accent) {
  // Outcome banner stretched full width instead of small badge
  const isProfit = position.pnl_sol > 0;
  const isLoss = position.pnl_sol < 0;

  // Full-width outcome banner
  const bannerH = 38;
  const bannerGrad = ctx.createLinearGradient(0, 0, W, 0);
  if (isProfit) {
    bannerGrad.addColorStop(0, 'rgba(0, 212, 170, 0.30)');
    bannerGrad.addColorStop(0.5, 'rgba(0, 212, 170, 0.06)');
    bannerGrad.addColorStop(1, 'rgba(0, 212, 170, 0.02)');
  } else if (isLoss) {
    bannerGrad.addColorStop(0, 'rgba(255, 71, 87, 0.30)');
    bannerGrad.addColorStop(0.5, 'rgba(255, 71, 87, 0.06)');
    bannerGrad.addColorStop(1, 'rgba(255, 71, 87, 0.02)');
  }
  ctx.fillStyle = bannerGrad;
  ctx.fillRect(0, 0, W, bannerH);

  // Outcome text in banner
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const outcome = isProfit ? 'TRADE CLOSED \u2022 PROFIT' : isLoss ? 'TRADE CLOSED \u2022 LOSS' : 'TRADE CLOSED \u2022 BREAK-EVEN';
  ctx.fillText(outcome, 32, bannerH / 2 + 1);

  // exit reason
  const reason = position.exit_reason || 'EXIT';
  ctx.font = '600 11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#c8cee0';
  ctx.fillText(reason, W - 32, bannerH / 2 + 1);

  // Token symbol below banner
  ctx.font = 'bold 22px sans-serif';
  const symbol = String(position.symbol || 'BONK').toUpperCase();
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(symbol, 32, 72);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(shortMint(position.mint), 32, 86);

  // PnL quick-preview top-right
  ctx.textAlign = 'right';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = accent;
  const pnlSol = Number(position.pnl_sol);
  ctx.fillText(`${fmtSol(pnlSol)} SOL`, W - 32, 70);
  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(fmtPct(position.pnl_percent), W - 32, 90);
}

function drawOptionCColumns(ctx, position, accent) {
  // Three column layout similar to current but with themed accent
  const columns = [
    { label: 'DEPOSITED', value: `${fmtSol(position.size_sol)} SOL` },
    {
      label: 'PNL',
      value: `${fmtPct(position.pnl_percent)}`,
      sub: `${fmtSol(position.pnl_sol)} SOL`,
      accent: accent,
    },
    {
      label: 'DURATION',
      value: fmtDuration((position.closed_at_ms || Date.now()) - position.opened_at_ms),
    },
  ];

  const padX = 32;
  const colW = (W - padX * 2) / columns.length;
  const y = 124;

  // PnL column accent background
  const pnlX = padX + colW;
  ctx.fillStyle = `${accent}10`;
  roundedRect(ctx, pnlX, y - 6, colW, 80, 10);
  ctx.fill();
  ctx.strokeStyle = `${accent}30`;
  ctx.lineWidth = 1;
  ctx.stroke();

  columns.forEach((col, i) => {
    const x = padX + colW * i + colW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 10px sans-serif';
    ctx.fillStyle = LABEL;
    ctx.fillText(col.label, x, y + 12);

    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = col.accent || TEXT;
    ctx.fillText(col.value, x, y + 44);

    if (col.sub) {
      ctx.font = '600 12px sans-serif';
      ctx.fillStyle = col.accent || LABEL;
      ctx.fillText(col.sub, x, y + 64);
    }
  });
}

function drawOptionCSummary(ctx, position, accent) {
  const panelX = 32;
  const panelY = 222;
  const panelW = W - 64;
  const panelH = 120;
  ctx.fillStyle = PANEL;
  roundedRect(ctx, panelX, panelY, panelW, panelH, 12);
  ctx.fill();
  ctx.strokeStyle = `${accent}20`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Lock icon
  const iconX = panelX + 24;
  const iconY = panelY + 20;
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(iconX + 8, iconY + 4, 5, Math.PI, 0);
  ctx.lineTo(iconX + 16, iconY + 4);
  ctx.stroke();
  roundedRect(ctx, iconX, iconY + 8, 16, 12, 2);
  ctx.fill();
  ctx.restore();

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('POSITION SUMMARY', iconX + 36, iconY + 12);

  // 2x2 grid
  const stats = [
    { label: 'Entry mcap', value: fmtUsd(position.entry_mcap) },
    { label: 'Exit mcap', value: fmtUsd(position.exit_mcap) },
    { label: 'Strategy', value: String(position.strategy_id || 'sniper').toUpperCase() },
    { label: 'Mode', value: String(position.execution_mode || 'dry_run').toUpperCase() },
  ];
  const gridX = panelX + 24;
  const gridY = panelY + 56;
  const cellW = (panelW - 48) / 2;
  const cellH = 32;

  stats.forEach((stat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = gridX + col * cellW;
    const y = gridY + row * cellH;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 10px sans-serif';
    ctx.fillStyle = LABEL;
    ctx.fillText(stat.label, x, y);
    ctx.font = '600 14px sans-serif';
    ctx.fillStyle = TEXT;
    ctx.fillText(stat.value, x, y + 18);
  });
}

function generateOptionC(position) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';

  const accent = pickAccent(position.pnl_sol);
  drawOptionCBackground(ctx, accent);
  drawOptionCHeader(ctx, position, accent);
  drawDivider(ctx, 98);
  drawOptionCColumns(ctx, position, accent);
  drawOptionCSummary(ctx, position, accent);
  drawFooter(ctx, position);
  return canvas.toBuffer('image/png');
}

// ============================================================
// MAIN: generate all 4 mock cards
// ============================================================

const PROFIT_POS = {
  mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  symbol: 'BONK',
  size_sol: 0.1,
  pnl_sol: 2.45,
  pnl_percent: 245.0,
  entry_mcap: 42500,
  exit_mcap: 146300,
  opened_at_ms: Date.now() - (3 * 3600 * 1000 + 12 * 60 * 1000),
  closed_at_ms: Date.now(),
  exit_reason: 'TP_HIT',
  strategy_id: 'sniper',
  execution_mode: 'live',
};

const LOSS_POS = {
  mint: '7Vx9GsRLfUTRXnpP5GDbKUEsrxCuCAtm4KnNLzBMLm39',
  symbol: 'JEET',
  size_sol: 0.1,
  pnl_sol: -1.09,
  pnl_percent: -52.3,
  entry_mcap: 18500,
  exit_mcap: 8700,
  opened_at_ms: Date.now() - (47 * 60 * 1000),
  closed_at_ms: Date.now(),
  exit_reason: 'STOP_LOSS',
  strategy_id: 'sniper',
  execution_mode: 'dry_run',
};

const outDir = '/home/ubuntu/Kaiser.charon/scripts';

function save(buffer, name) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, buffer);
  console.log(`Saved: ${p}`);
}

// Generate all 4
save(generateOptionB(PROFIT_POS), 'optionB_profit.png');
save(generateOptionB(LOSS_POS), 'optionB_loss.png');
save(generateOptionC(PROFIT_POS), 'optionC_profit.png');
save(generateOptionC(LOSS_POS), 'optionC_loss.png');

console.log('\nDone! 4 mock cards generated.');
