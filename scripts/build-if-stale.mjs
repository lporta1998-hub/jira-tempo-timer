/**
 * Builds the web UI (dist/) only when its sources changed since the last build.
 * Used by the menu bar app and the cross-platform launcher, so a `git pull`
 * is picked up on the next start on every OS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILT = path.join(APP_DIR, 'dist', 'index.html');
const INPUTS = ['src', 'index.html', 'vite.config.js', 'package-lock.json'];

function newestMtime(p) {
  let stat;
  try {
    stat = fs.statSync(p);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;
  return fs.readdirSync(p).reduce((max, name) => Math.max(max, newestMtime(path.join(p, name))), stat.mtimeMs);
}

export function uiIsStale() {
  if (!fs.existsSync(BUILT)) return true;
  const builtAt = fs.statSync(BUILT).mtimeMs;
  return INPUTS.some((input) => newestMtime(path.join(APP_DIR, input)) > builtAt);
}

export async function buildUi({ quiet = true } = {}) {
  const { build } = await import('vite');
  await build({
    root: APP_DIR,
    configFile: path.join(APP_DIR, 'vite.config.js'),
    logLevel: quiet ? 'warn' : 'info',
  });
}

/** Returns true if a build ran. */
export async function buildUiIfStale(options) {
  if (!uiIsStale()) return false;
  await buildUi(options);
  return true;
}
