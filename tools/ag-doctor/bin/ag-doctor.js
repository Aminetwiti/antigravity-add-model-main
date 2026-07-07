#!/usr/bin/env node
/**
 * ag-doctor — Antigravity Environment Doctor
 *
 * Diagnose, repair, and configure your Antigravity + MITM environment.
 * Zero external dependencies. Works on Windows, macOS, and Linux.
 *
 * Usage:
 *   ag-doctor status              # Quick status overview
 *   ag-doctor doctor [--repair]   # Diagnose (and optionally repair) issues
 *   ag-doctor logs [--tail N]     # Show recent logs
 *   ag-doctor provider add        # Add a custom provider interactively
 *   ag-doctor mitm start|stop     # Manage MITM HTTPS proxy
 *   ag-doctor config show|edit    # Inspect or edit custom_models.json
 *   ag-doctor --help              # Show all commands
 */

import { runStatus } from './src/commands/status.js';
import { runDoctor } from './src/commands/doctor.js';
import { runLogs } from './src/commands/logs.js';
import { runProvider } from './src/commands/provider.js';
import { runMitm } from './src/commands/mitm.js';
import { runConfig } from './src/commands/config.js';
import { printBanner, color } from './src/lib/ui.js';

const VERSION = '1.0.0';

function showHelp(): void {
  printBanner();
  console.log(`
${color.bold('USAGE')}
  ${color.cyan('ag-doctor')} ${color.dim('<command>')} ${color.dim('[options]')}

${color.bold('COMMANDS')}
  ${color.green('status')}              Show quick environment status overview
  ${color.green('doctor')}              Run full diagnostics (use ${color.yellow('--repair')} to fix issues)
  ${color.green('logs')}                View recent logs (use ${color.yellow('--tail N')} to limit lines)
  ${color.green('provider')}            Manage custom providers
    ${color.dim('add')}                Add a new provider interactively
    ${color.dim('list')}               List configured providers
    ${color.dim('test <name>')}        Test connectivity for a configured model
  ${color.green('mitm')}                Manage MITM HTTPS proxy (port 443)
    ${color.dim('start')}              Start MITM proxy (admin required)
    ${color.dim('stop')}               Stop running MITM proxy
    ${color.dim('status')}             Check MITM proxy status
    ${color.dim('cert')}               Reinstall MITM CA certificate
  ${color.green('config')}              Manage custom_models.json
    ${color.dim('show')}               Print current configuration
    ${color.dim('path')}               Print path to config file
    ${color.dim('edit')}               Open config in default editor
    ${color.dim('reset')}              Reset to default configuration

${color.bold('OPTIONS')}
  ${color.yellow('--repair')}            Auto-repair detected issues (doctor command)
  ${color.yellow('--tail <N>')}          Show only the last N log lines (default: 50)
  ${color.yellow('--json')}              Output machine-readable JSON
  ${color.yellow('-h, --help')}          Show this help message
  ${color.yellow('-v, --version')}       Show version

${color.bold('EXAMPLES')}
  ${color.dim('$')} ag-doctor status
  ${color.dim('$')} ag-doctor doctor --repair
  ${color.dim('$')} ag-doctor provider add
  ${color.dim('$')} ag-doctor mitm cert
  ${color.dim('$')} ag-doctor logs --tail 100

${color.bold('MORE INFO')}
  ${color.dim('Docs:')}    docs/ANTIGRAVITY_SETUP.md
  ${color.dim('Repo:')}    https://github.com/Aminetwiti/antigravity-add-model-main
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(`ag-doctor v${VERSION}`);
    process.exit(0);
  }

  const command = args[0];
  const rest = args.slice(1);

  try {
    switch (command) {
      case 'status':
        await runStatus(rest);
        break;
      case 'doctor':
        await runDoctor(rest);
        break;
      case 'logs':
        await runLogs(rest);
        break;
      case 'provider':
        await runProvider(rest);
        break;
      case 'mitm':
        await runMitm(rest);
        break;
      case 'config':
        await runConfig(rest);
        break;
      default:
        console.error(`${color.red('✗')} Unknown command: ${color.yellow(command)}`);
        console.log(`Run ${color.cyan('ag-doctor --help')} for usage.`);
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${color.red('✗ Error:')} ${message}`);
    if (process.env['AG_DEBUG']) {
      console.error(err);
    }
    process.exit(1);
  }
}

main();
