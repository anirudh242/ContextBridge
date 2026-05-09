import { simpleGit, type SimpleGit } from 'simple-git';
import type { GitContext } from '../types.js';

const EXCLUDED_PATHS = ['node_modules', 'dist', 'AGENTS.md'];

function createGit(projectPath: string): SimpleGit {
  return simpleGit({
    baseDir: projectPath,
    binary: 'git',
    trimmed: false,
  });
}

function buildPathspec(): string[] {
  return ['.', ...EXCLUDED_PATHS.map((entry) => `:(exclude)${entry}`)];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function isGitRepository(projectPath: string): Promise<boolean> {
  try {
    return await createGit(projectPath).checkIsRepo();
  } catch {
    return false;
  }
}

export async function getCurrentBranch(projectPath: string): Promise<string> {
  try {
    if (!(await isGitRepository(projectPath))) {
      return 'no-git';
    }

    const branch = await createGit(projectPath).branchLocal();
    return branch.current || 'detached';
  } catch {
    return 'unknown';
  }
}

async function hasHeadCommit(git: SimpleGit): Promise<boolean> {
  try {
    await git.revparse(['--verify', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

async function hasPreviousCommit(git: SimpleGit): Promise<boolean> {
  try {
    await git.revparse(['--verify', 'HEAD~1']);
    return true;
  } catch {
    return false;
  }
}

export async function getGitContext(projectPath: string): Promise<GitContext> {
  const warnings: string[] = [];

  try {
    const repo = await isGitRepository(projectPath);

    if (!repo) {
      warnings.push('Git repository not detected. Skipping git diff and git log capture.');
      return {
        diff: '',
        log: '',
        status: '',
        warnings,
      };
    }

    const git = createGit(projectPath);
    const headExists = await hasHeadCommit(git);

    let diff = '';
    let log = '';
    let status = '';

    if (headExists) {
      log = await git.raw(['log', '--oneline', '-5']);

      if (await hasPreviousCommit(git)) {
        diff = await git.raw(['diff', 'HEAD~1', 'HEAD', '--', ...buildPathspec()]);
      } else {
        diff = await git.diff(['HEAD', '--', ...buildPathspec()]);
      }
    } else {
      warnings.push('No commits found yet. Capturing unstaged diff only.');
      diff = await git.diff(['--', ...buildPathspec()]);
      status = (await git.raw(['status', '--short', '--', ...buildPathspec()])).trim();
    }

    if (!status) {
      status = (await git.raw(['status', '--short', '--', ...buildPathspec()])).trim();
    }

    return {
      diff,
      log,
      status,
      warnings,
    };
  } catch (error: unknown) {
    warnings.push(`Git capture failed: ${getErrorMessage(error)}`);
    return {
      diff: '',
      log: '',
      status: '',
      warnings,
    };
  }
}
