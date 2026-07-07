/**
 * Terminal UI helpers — colors, spinners, prompts, banners.
 * Zero dependencies. Uses ANSI escape codes.
 */

const isColorSupported = (() => {
  if (process.env['NO_COLOR']) return false;
  if (process.env['FORCE_COLOR']) return true;
  if (process.stdout && !process.stdout.isTTY) return false;
  return true;
})();

const wrap = (open: number, close: number) => (s: string) =>
  isColorSupported ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const color = {
  reset: wrap(0, 0),
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  inverse: wrap(7, 27),
  strikethrough: wrap(9, 29),

  black: wrap(30, 39),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  white: wrap(37, 39),
  gray: wrap(90, 39),

  bgRed: wrap(41, 49),
  bgGreen: wrap(42, 49),
  bgYellow: wrap(43, 49),
  bgBlue: wrap(44, 49),
  bgMagenta: wrap(45, 49),
  bgCyan: wrap(46, 49),
};

export const symbols = {
  check: color.green('✓'),
  cross: color.red('✗'),
  warn: color.yellow('⚠'),
  info: color.cyan('ℹ'),
  arrow: color.cyan('→'),
  bullet: color.dim('•'),
  dot: color.dim('·'),
  star: color.yellow('★'),
};

/**
 * Print the ag-doctor banner.
 */
export function printBanner(): void {
  const banner = `
${color.cyan('╔══════════════════════════════════════════════════════════════╗')}
${color.cyan('║')}  ${color.bold(color.cyan('ag-doctor'))} ${color.dim('— Antigravity Environment Doctor')}              ${color.cyan('║')}
${color.cyan('║')}  ${color.dim('Diagnose · Repair · Configure')}                              ${color.cyan('║')}
${color.cyan('╚══════════════════════════════════════════════════════════════╝')}`;
  console.log(banner);
}

/**
 * Print a section header.
 */
export function section(title: string): void {
  console.log();
  console.log(`${color.bold(color.cyan('▌'))} ${color.bold(title)}`);
  console.log(color.dim('─'.repeat(Math.max(40, title.length + 4))));
}

/**
 * Print a key-value pair with consistent alignment.
 */
export function kv(key: string, value: string, status?: 'ok' | 'warn' | 'err'): void {
  const icon =
    status === 'ok'
      ? symbols.check
      : status === 'warn'
        ? symbols.warn
        : status === 'err'
          ? symbols.cross
          : symbols.bullet;
  const paddedKey = color.dim(key.padEnd(28, ' '));
  console.log(`  ${icon} ${paddedKey} ${value}`);
}

/**
 * Print a status line with a colored badge.
 */
export function statusLine(label: string, status: 'ok' | 'warn' | 'err' | 'info', detail?: string): void {
  const badge = {
    ok: color.bgGreen(color.bold(' OK ')),
    warn: color.bgYellow(color.bold(' WARN ')),
    err: color.bgRed(color.bold(' FAIL ')),
    info: color.bgCyan(color.bold(' INFO ')),
  }[status];
  const paddedLabel = label.padEnd(28, ' ');
  console.log(`  ${badge} ${color.bold(paddedLabel)} ${detail ? color.dim(detail) : ''}`);
}

/**
 * Print a success message.
 */
export function success(msg: string): void {
  console.log(`${symbols.check} ${color.green(msg)}`);
}

/**
 * Print an error message.
 */
export function error(msg: string): void {
  console.log(`${symbols.cross} ${color.red(msg)}`);
}

/**
 * Print a warning message.
 */
export function warn(msg: string): void {
  console.log(`${symbols.warn} ${color.yellow(msg)}`);
}

/**
 * Print an info message.
 */
export function info(msg: string): void {
  console.log(`${symbols.info} ${color.cyan(msg)}`);
}

/**
 * Print a step message (during a process).
 */
export function step(msg: string): void {
  console.log(`${symbols.arrow} ${msg}`);
}

/**
 * Print a simple spinner (single-frame, no animation to keep it dependency-free).
 */
export function spinner(msg: string): void {
  process.stdout.write(`  ${color.cyan('◌')} ${msg}...\n`);
}

/**
 * Read a line from stdin.
 */
export async function prompt(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? color.dim(` [${defaultValue}]`) : '';
  process.stdout.write(`${color.cyan('?')} ${color.bold(question)}${suffix}: `);
  return new Promise((resolve) => {
    const rl = require('node:readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.once('line', (line: string) => {
      rl.close();
      resolve(line.trim() || defaultValue || '');
    });
  });
}

/**
 * Prompt for a secret (hidden input).
 */
export async function promptSecret(question: string): Promise<string> {
  process.stdout.write(`${color.cyan('?')} ${color.bold(question)}: `);
  return new Promise((resolve) => {
    const rl = require('node:readline').createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    // Hide input
    if (process.stdin && typeof (process.stdin as any).on === 'function') {
      (process.stdin as any).on('data', () => {});
    }
    const stdin = process.openStdin();
    const muted = (() => {
      try {
        // Best-effort mute on POSIX terminals
        if (process.stdin.isTTY) {
          process.stdin.setRawMode?.(true);
          process.stdout.write('\x1b[?25l'); // hide cursor
        }
      } catch {
        // ignore
      }
      return true;
    })();
    void muted;
    let input = '';
    stdin.on('data', (ch: Buffer) => {
      const s = ch.toString('utf8');
      switch (s) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdout.write('\n');
          stdin.pause();
          rl.close();
          try {
            if (process.stdin.isTTY) {
              process.stdin.setRawMode?.(false);
              process.stdout.write('\x1b[?25h');
            }
          } catch {
            // ignore
          }
          resolve(input);
          break;
        case '\u0003':
          process.exit(1);
          break;
        case '\u007f':
        case '\b':
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          input += s;
          process.stdout.write('*');
          break;
      }
    });
  });
}

/**
 * Prompt for a yes/no confirmation.
 */
export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const suffix = defaultYes ? color.dim(' [Y/n]') : color.dim(' [y/N]');
  const answer = await prompt(`${question}${suffix}`, defaultYes ? 'y' : 'n');
  return /^y(es)?$/i.test(answer);
}

/**
 * Prompt user to choose from a list of options.
 */
export async function choose(question: string, options: string[]): Promise<number> {
  console.log(`  ${color.cyan('?')} ${color.bold(question)}`);
  options.forEach((opt, i) => {
    const num = color.cyan(`  ${(i + 1).toString().padStart(2)})`);
    console.log(`${num} ${opt}`);
  });
  while (true) {
    const answer = await prompt(color.dim('Choose'), '1');
    const n = parseInt(answer, 10);
    if (!isNaN(n) && n >= 1 && n <= options.length) return n - 1;
    warn(`Please enter a number between 1 and ${options.length}`);
  }
}

/**
 * Format a duration in ms to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

/**
 * Format bytes to a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
