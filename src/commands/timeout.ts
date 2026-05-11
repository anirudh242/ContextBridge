import type { Command } from 'commander';
import { loadConfig, setTimeout } from '../lib/config.js';
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
    .description('Show or set the Ollama summarisation timeout (Ollama provider only)')
    .argument('[value]', 'Timeout in milliseconds, or `none` to disable the timeout entirely')
    .action(async (value?: string) => {
      try {
        const config = await loadConfig();
        
        if (config.provider !== 'ollama') {
          printWarning('Timeout settings only apply when the Ollama provider is active.');
          return;
        }

        if (!value) {
          printInfoPanel('Ollama Timeout', [
            `Current timeout: ${formatTimeout(config.ollamaTimeoutMs)}`,
            'Set a new value with `cb timeout <milliseconds>` or disable it with `cb timeout none`.',
          ]);
          return;
        }

        const timeoutMs = parseTimeout(value);
        const updatedConfig = await setTimeout(timeoutMs);

        printSuccess('Timeout updated', [
          `Ollama timeout: ${formatTimeout(updatedConfig.ollamaTimeoutMs)}`,
        ]);
      } catch (error: unknown) {
        printWarning(`Timeout update failed: ${getErrorMessage(error)}`);
        process.exitCode = 1;
      }
    });
}
