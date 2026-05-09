import fs from 'node:fs/promises';
import path from 'node:path';

const EXCLUDED_NAMES = new Set([
  'node_modules',
  'dist',
  '.git',
  '.agents',
  '.codex',
  'AGENTS.md',
  'package-lock.json',
]);

async function readIfPresent(filePath: string, limit = 1800): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.slice(0, limit).trim();
  } catch {
    return '';
  }
}

function compactReadme(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('```'))
    .slice(0, 14)
    .join('\n')
    .slice(0, 900);
}

async function collectFiles(root: string, current = '', output: string[] = []): Promise<string[]> {
  const target = path.join(root, current);
  let entries = await fs.readdir(target, { withFileTypes: true });
  entries = entries
    .filter((entry) => !EXCLUDED_NAMES.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relativePath = path.join(current, entry.name);

    if (entry.isDirectory()) {
      if (output.length >= 12) {
        break;
      }

      await collectFiles(root, relativePath, output);
      continue;
    }

    if (/\.(ts|tsx|js|jsx|json|md)$/i.test(entry.name)) {
      output.push(relativePath);
    }

    if (output.length >= 12) {
      break;
    }
  }

  return output;
}

function formatPackageMetadata(content: string): string {
  if (!content) {
    return '';
  }

  try {
    const pkg = JSON.parse(content) as {
      name?: string;
      description?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    return [
      `name: ${pkg.name ?? 'Unknown'}`,
      `description: ${pkg.description ?? 'Unknown'}`,
      `scripts: ${Object.keys(pkg.scripts ?? {}).slice(0, 8).join(', ') || 'Unknown'}`,
      `dependencies: ${Object.keys(pkg.dependencies ?? {}).slice(0, 12).join(', ') || 'Unknown'}`,
    ].join('\n');
  } catch {
    return content;
  }
}

export async function buildProjectGrounding(projectPath: string): Promise<string> {
  const packageJson = await readIfPresent(path.join(projectPath, 'package.json'));
  const readme = await readIfPresent(path.join(projectPath, 'README.md'));
  const files = await collectFiles(projectPath);

  const parts = [
    packageJson ? `package.json:\n${formatPackageMetadata(packageJson)}` : '',
    readme ? `README excerpt:\n${compactReadme(readme)}` : '',
    files.length > 0 ? `Relevant files:\n${files.map((file) => `- ${file}`).join('\n')}` : '',
  ].filter(Boolean);

  return parts.join('\n\n');
}
