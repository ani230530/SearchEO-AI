import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve(__dirname, '..');
const APPROVED_FILES = new Set([
  path.join(SRC_DIR, 'services', 'openAiClient.ts'),
  path.join(SRC_DIR, 'services', 'openRouterClient.ts'),
  __filename,
]);

const FORBIDDEN_PATTERNS = [
  new RegExp(`new ${'OpenAI'}`),
  new RegExp(`create${'OpenRouter'}`),
  new RegExp(`https://${'openrouter'}.ai/api`),
  new RegExp(`chat\\.completions\\.${'create'}`),
  new RegExp(`embeddings\\.${'create'}`),
];

function collectSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'testSupport') return [];
      return collectSourceFiles(fullPath);
    }
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('provider client boundary', () => {
  it('keeps direct paid provider clients inside approved wrappers', () => {
    const violations = collectSourceFiles(SRC_DIR)
      .filter((file) => !APPROVED_FILES.has(file))
      .flatMap((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return FORBIDDEN_PATTERNS.flatMap((pattern) =>
          pattern.test(source) ? [`${path.relative(SRC_DIR, file)} matched ${pattern}`] : []
        );
      });

    expect(violations).toEqual([]);
  });
});
