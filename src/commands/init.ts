import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import type { Command } from 'commander';
import type { LLMProvider } from '../types.js';
import {
  ensureConfig,
  getConfigPath,
  registerProjectInConfig,
  setProvider,
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

      console.log('\nContextBridge works best with an LLM for summarisation.\n');
      console.log('  [1] Anthropic (Claude Haiku) — recommended, fast, accurate');
      console.log('  [2] OpenAI (GPT-4o Mini) — good alternative');
      console.log('  [3] Gemini (Gemini Flash) — Google\'s option');
      console.log('  [4] Ollama (local) — private, no API key needed, requires Ollama installed\n');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const choice = await rl.question('Choose a provider [1-4, default: 4]: ');
      let providerName: LLMProvider = 'ollama';
      let apiKey: string | undefined;

      if (choice.trim() === '1') {
        providerName = 'anthropic';
        apiKey = await rl.question('Enter your Anthropic API key: ');
      } else if (choice.trim() === '2') {
        providerName = 'openai';
        apiKey = await rl.question('Enter your OpenAI API key: ');
      } else if (choice.trim() === '3') {
        providerName = 'gemini';
        apiKey = await rl.question('Enter your Gemini API key: ');
      }

      rl.close();

      await setProvider({ provider: providerName, apiKey: apiKey?.trim() || undefined });

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
          `Provider: ${config.provider}`,
          'Next: cb capture, then cb inject',
          `AGENTS.md gitignored: ${gitignoreUpdated ? 'yes' : 'no .gitignore found'}`,
        ],
      );

      if (config.provider === 'ollama') {
        printInfo('Make sure Ollama is running before you use `cb capture`. Start it with: ollama serve');
      }
    });
}
