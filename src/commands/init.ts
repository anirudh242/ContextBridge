import fs from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import {
  ensureConfig,
  getConfigPath,
  registerProjectInConfig,
} from '../lib/config.js';
import { ensureProjectStore, getStorePath } from '../lib/store.js';
import { isGitRepository } from '../lib/git.js';
import { printInfo, printSuccess, printWarning } from '../utils/display.js';

function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

async function ensureAgentsGitignore(projectPath: string): Promise<boolean> {
  const gitignorePath = path.join(projectPath, '.gitignore');

  try {
    const existing = await fs.readFile(gitignorePath, 'utf8');

    if (!existing.split('\n').map((line) => line.trim()).includes('AGENTS.md')) {
      const prefix = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
      await fs.writeFile(gitignorePath, `${existing}${prefix}AGENTS.md\n`, 'utf8');
    }

    return true;
  } catch (error: unknown) {
    if (getErrorCode(error) === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialise ContextBridge for the current project')
    .action(async () => {
      const projectPath = process.cwd();
      const projectName = path.basename(projectPath);

      const gitRepo = await isGitRepository(projectPath);
      if (!gitRepo) {
        printWarning('No git repository detected in the current directory. Git capture will degrade gracefully.');
      }

      const config = await ensureConfig();
      await registerProjectInConfig(projectName, projectPath);
      await ensureProjectStore(projectPath, projectName);
      const gitignoreUpdated = await ensureAgentsGitignore(projectPath);

      printSuccess(
        'ContextBridge initialised',
        [
          `Project: ${projectName}`,
          `Config: ${getConfigPath()}`,
          `Store: ${getStorePath()}`,
          `Model: ${config.defaultModel}`,
          'Next: cb capture, then cb inject',
          `AGENTS.md gitignored: ${gitignoreUpdated ? 'yes' : 'no .gitignore found'}`,
        ],
      );

      printInfo('Ollama should be running locally before you use `cb capture`.');
    });
}
