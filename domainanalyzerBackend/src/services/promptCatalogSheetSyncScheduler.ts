import { spawn } from 'child_process';
import path from 'path';

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 30_000;

let schedulerTimer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

function readIntervalMs(env = process.env): number {
  const raw = Number(env.PROMPT_CATALOG_SYNC_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, raw);
}

function scriptPath(): string {
  return path.resolve(__dirname, '../../scripts/sync-prompt-catalog-from-sheet.cjs');
}

export async function runPromptCatalogSheetSyncOnce(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath(), '--apply'], {
      cwd: path.resolve(__dirname, '../..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`prompt catalog sheet sync exited ${code}: ${stderr || stdout}`));
    });
  });
}

async function tick(reason: 'startup' | 'interval'): Promise<void> {
  if (inFlight) {
    console.log(`[prompt-catalog-sync] skipped ${reason}; previous sync still running`);
    return;
  }

  inFlight = (async () => {
    const startedAt = Date.now();
    try {
      const output = await runPromptCatalogSheetSyncOnce();
      const durationMs = Date.now() - startedAt;
      console.log(`[prompt-catalog-sync] ${reason} sync complete in ${durationMs}ms`);
      if (output) console.log(output);
    } catch (error) {
      console.warn('[prompt-catalog-sync] sync failed', error);
    } finally {
      inFlight = null;
    }
  })();

  await inFlight;
}

export function startPromptCatalogSheetSyncScheduler(env = process.env): () => void {
  if (env.DISABLE_PROMPT_CATALOG_SHEET_SYNC === 'true') {
    console.log('[prompt-catalog-sync] scheduler disabled by env');
    return () => undefined;
  }
  if (schedulerTimer) {
    return () => undefined;
  }

  const intervalMs = readIntervalMs(env);
  void tick('startup');
  schedulerTimer = setInterval(() => {
    void tick('interval');
  }, intervalMs);
  schedulerTimer.unref?.();
  console.log(`[prompt-catalog-sync] watching Google Sheet (${intervalMs}ms interval)`);

  return () => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  };
}
