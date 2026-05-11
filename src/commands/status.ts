import fs from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { loadConfig } from '../lib/config.js';
import { getCurrentBranch } from '../lib/git.js';
import { getHeadEntry, getProjectStore } from '../lib/store.js';
import { formatRelativeTime, printInfoPanel } from '../utils/display.js';

function formatTimeout(timeoutMs: number | null): string {
  return timeoutMs === null ? 'none' : `${timeoutMs}ms`;
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show the current ContextBridge status for this project')
    .action(async () => {
      const projectPath = process.cwd();
      const projectName = path.basename(projectPath);
      const config = await loadConfig();
      const project = await getProjectStore(projectPath);
      const entry = await getHeadEntry(projectPath);
      const branch = await getCurrentBranch(projectPath);

      let agentsPresent = false;
      try {
        await fs.access(path.join(projectPath, 'AGENTS.md'));
        agentsPresent = true;
      } catch {
        agentsPresent = false;
      }

      printInfoPanel('ContextBridge Status', [
        `Project: ${projectName}`,
        `Branch: ${branch ?? 'unknown'}`,
        `Current focus: ${entry?.summary?.currentFocus ?? 'Unknown'}`,
        `Last captured: ${entry ? formatRelativeTime(entry.timestamp) : 'Never'}`,
        `Total sessions: ${project?.entries.length ?? 0}`,
        `AGENTS.md: ${agentsPresent ? 'present' : 'missing'}`,
        `LLM provider: ${config.provider}`,
        `Model: ${config.model ?? 'default'}`,
        ...(config.provider === 'ollama' ? [
          `Ollama URL: ${config.baseUrl ?? 'http://127.0.0.1:11434'}`,
          `Ollama timeout: ${formatTimeout(config.ollamaTimeoutMs)}`,
        ] : []),
      ]);
    });
}
