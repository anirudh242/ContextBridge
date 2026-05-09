import type { Command } from 'commander';
import { loadConfig, setOllamaTimeout } from '../lib/config.js';
import { printInfoPanel, printSuccess, printWarning } from '../utils/display.js';

function formatTimeout(timeoutMs: number | null): string {
  return timeoutMs === null ? 'none' : `${timeoutMs}ms`;
}

function parseTimeout(input: string): number | null {
  const normalised = input.trim().toLowerCase();

  if (normalised === 'none' || normalised === 'off' || normalised === 'disabled') {
    return null;
  }

  const parsed = Number.parseInt(normalised, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error('Timeout must be a positive number of milliseconds or `none`.');
  }

  return parsed;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerTimeoutCommand(program: Command): void {
  program
    .command('timeout')
    .description('Show or set the Ollama summarisation timeout')
    .argument('[value]', 'Timeout in milliseconds, or `none` to disable the timeout entirely')
    .action(async (value?: string) => {
      try {
        if (!value) {
          const config = await loadConfig();
          printInfoPanel('Ollama Timeout', [
            `Current timeout: ${formatTimeout(config.ollamaTimeoutMs)}`,
            'Set a new value with `cb timeout <milliseconds>` or disable it with `cb timeout none`.',
          ]);
          return;
        }

        const timeoutMs = parseTimeout(value);
        const config = await setOllamaTimeout(timeoutMs);

        printSuccess('Timeout updated', [
          `Ollama timeout: ${formatTimeout(config.ollamaTimeoutMs)}`,
        ]);
      } catch (error: unknown) {
        printWarning(`Timeout update failed: ${getErrorMessage(error)}`);
        process.exitCode = 1;
      }
    });
}
