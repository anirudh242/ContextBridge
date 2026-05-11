import type { Command } from 'commander';
import { getProjectStore } from '../lib/store.js';
import { formatRelativeTime, printPanel, printWarning } from '../utils/display.js';

interface LogOptions {
  limit?: string;
  branch?: string;
}

export function registerLogCommand(program: Command): void {
  program
    .command('log')
    .description('Show version history for captured sessions')
    .option('--limit <number>', 'Show the last N entries', '10')
    .option('--branch <name>', 'Filter entries by git branch')
    .action(async (options: LogOptions) => {
      const projectPath = process.cwd();
      const project = await getProjectStore(projectPath);

      if (!project || project.entries.length === 0) {
        printWarning('No captured sessions found for this project.');
        return;
      }

      const limit = Number.parseInt(options.limit ?? '10', 10);
      const filtered = project.entries
        .filter((entry) => !options.branch || entry.branch === options.branch)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, Number.isNaN(limit) ? 10 : limit);

      if (filtered.length === 0) {
        printWarning('No captured sessions match the selected filters.');
        return;
      }

      filtered.forEach((entry, index) => {
        const summary = entry.summary;
        const task = summary?.currentFocus ?? 'Unknown';
        const lines = [
          `#${index + 1}  ${entry.branch ?? 'unknown'}  ${formatRelativeTime(entry.timestamp)}`,
          `Focus: ${task}`,
          `Direction: ${summary?.currentDirection || 'Unknown'}`,
          `Decisions: ${summary?.decisions.slice(0, 3).join(' | ') || 'Unknown'}`,
          `Next steps: ${summary?.nextSteps.slice(0, 3).join(' | ') || 'Unknown'}`,
        ];

        printPanel(lines.join('\n'));
      });
    });
}
