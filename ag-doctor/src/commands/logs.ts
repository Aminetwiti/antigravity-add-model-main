/**
 * `ag-doctor logs [-f] [-n N]` — show language_server logs.
 */
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import type { CommandContext } from '../types';
import { getLsLogPath, getAntigravityDataDir } from '../core/paths';
import { error, info } from '../cli/output';

export async function runLogs(ctx: CommandContext, opts: { follow?: boolean; lines?: number; source?: string }): Promise<number> {
  const source = opts.source || 'language_server';
  let targetPath = '';

  switch (source) {
    case 'language_server':
      targetPath = getLsLogPath();
      break;
    case 'ag-doctor':
      targetPath = path.join(getAntigravityDataDir(), 'daemon.log');
      break;
    case 'proxy':
      targetPath = path.join(getAntigravityDataDir(), 'serve.log'); // Using serve.log as proxy equivalent for now
      break;
    case 'patch':
      targetPath = path.join(getAntigravityDataDir(), 'recovery.log'); // Adjust if patch writes to a different log
      break;
    default:
      targetPath = getLsLogPath();
  }

  if (!fs.existsSync(targetPath)) {
    error(`Log file not found: ${targetPath}`);
    return 1;
  }
  info(`Log: ${targetPath}`);
  const lines = opts.lines ?? 50;

  if (!opts.follow) {
    const content = fs.readFileSync(targetPath, 'utf-8');
    const tail = content.split(/\r?\n/).slice(-lines).join('\n');
    console.log(tail);
    return 0;
  }

  // Follow mode
  let pos = fs.statSync(targetPath).size;
  console.log(`--- following ${targetPath} (Ctrl+C to stop) ---`);
  const tick = setInterval(() => {
    fs.stat(targetPath, (err, st) => {
      if (err) return;
      if (st.size > pos) {
        const stream = fs.createReadStream(targetPath, { start: pos, end: st.size });
        stream.on('data', (chunk) => process.stdout.write(chunk));
        pos = st.size;
      }
    });
  }, 500);
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      clearInterval(tick);
      resolve();
    });
  });
  return 0;
}
