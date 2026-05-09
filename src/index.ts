#!/usr/bin/env node

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerCaptureCommand } from './commands/capture.js';
import { registerInjectCommand } from './commands/inject.js';
import { registerLogCommand } from './commands/log.js';
import { registerStatusCommand } from './commands/status.js';
import { registerTimeoutCommand } from './commands/timeout.js';

const program = new Command();

program
  .name('cb')
  .description('Persistent, versioned AI project context for every coding tool you use.')
  .version('0.1.0');

registerInitCommand(program);
registerCaptureCommand(program);
registerInjectCommand(program);
registerLogCommand(program);
registerStatusCommand(program);
registerTimeoutCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ContextBridge failed: ${message}`);
  process.exitCode = 1;
});
