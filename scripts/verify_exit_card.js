// Quick verify: generate exit cards with the real generateExitCard
import { writeFileSync } from 'fs';
import { generateExitCard } from '../src/visuals/exitCard.js';

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
  execution_mode: 'dry_run',
};

const outDir = '/home/ubuntu/Kaiser.charon/scripts';

const pb = await generateExitCard(PROFIT_POS);
writeFileSync(`${outDir}/exitCard_profit.png`, pb);
console.log('Saved exitCard_profit.png');

const lb = await generateExitCard(LOSS_POS);
writeFileSync(`${outDir}/exitCard_loss.png`, lb);
console.log('Saved exitCard_loss.png');
