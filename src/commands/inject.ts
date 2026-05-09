import clipboard from 'clipboardy';
import path from 'node:path';
import type { Command } from 'commander';
import { getHeadEntry, getProjectStore } from '../lib/store.js';
import { formatContextForInjection, writeAgentsFile } from '../lib/inject.js';
import { printSuccess, printWarning } from '../utils/display.js';

interface InjectOptions {
  codex?: boolean;
  agentsMd?: boolean;
  clipOnly?: boolean;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerInjectCommand(program: Command): void {
  program
    .command('inject')
    .description('Inject the latest captured context into your next AI tool')
    .option('--codex', 'Output raw context to stdout for piping into codex exec -')
    .option('--no-agents-md', 'Skip writing AGENTS.md')
    .option('--clip-only', 'Only copy to clipboard')
    .action(async (options: InjectOptions) => {
      try {
        const projectPath = process.cwd();
        const projectName = path.basename(projectPath);
        const project = await getProjectStore(projectPath);
        const entry = await getHeadEntry(projectPath);

        if (!entry) {
          printWarning('No captured context found for this project. Run `cb capture` first.');
          return;
        }

        const output = formatContextForInjection({
          projectName,
          entry,
          entries: project?.entries,
        });

        const actions: string[] = [];
        const shouldWriteAgents = !options.clipOnly && options.agentsMd !== false;

        if (shouldWriteAgents) {
          const agentsPath = await writeAgentsFile(projectPath, output);
          actions.push(`AGENTS.md written: ${agentsPath}`);
        }

        try {
          await clipboard.write(output);
          actions.push('Clipboard updated');
        } catch (error: unknown) {
          actions.push(`Clipboard skipped: ${getErrorMessage(error)}`);
        }

        if (options.codex) {
          process.stdout.write(output);
        }

        const confirmation = [
          ...actions,
          'Paste the copied context into browser-based tools as needed.',
        ];

        if (options.codex) {
          console.error(confirmation.join('\n'));
        } else {
          printSuccess('Context injected', confirmation);
        }
      } catch (error: unknown) {
        printWarning(`Inject failed: ${getErrorMessage(error)}`);
        process.exitCode = 1;
      }
    });
}
