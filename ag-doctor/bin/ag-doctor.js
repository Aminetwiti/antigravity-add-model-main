#!/usr/bin/env node
/**
 * ag-doctor — entry point shim.
 * Resolves the compiled entry from dist/ relative to this file.
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const entry = path.join(__dirname, '..', 'dist', 'index.js');
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('ag-doctor: failed to start:', err.message);
  process.exit(1);
});
