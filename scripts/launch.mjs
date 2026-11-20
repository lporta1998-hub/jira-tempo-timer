#!/usr/bin/env node
/**
 * Cross-platform launcher: what start.sh does, without bash. Used by start.cmd
 * on Windows, and works anywhere Node runs.
 *
 *   node scripts/launch.mjs            build if needed, run on http://localhost:3001, open browser
 *   node scripts/launch.mjs --tray     system tray / menu bar app
 *   node scripts/launch.mjs --dev      hot-reload dev mode on http://localhost:5173
 *   node scripts/launch.mjs --no-open  don't open the browser
 *
 * Only Node built-ins are imported up front, because dependencies may not be
 * installed yet on the first run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(5, 9).join('\n').replace(/^ \* ?/gm, ''));
  process.exit(0);
}
for (const a of args) {
  if (!['--tray', '--dev', '--no-open'].includes(a)) fail(`Unknown option: ${a} (try --help)`);
}

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) fail(`Node.js ${process.version} is too old; version 20 or newer is required.`);

process.chdir(APP_DIR);

// --- Port: environment, then .env, then 3001 (same as the server) -------------------
function readPort() {
  if (process.env.PORT) return process.env.PORT;
  try {
    const line = fs
      .readFileSync(path.join(APP_DIR, '.env'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^\s*PORT\s*=/.test(l))
      .pop();
    if (line) return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  } catch {
    /* no .env */
  }
  return '3001';
}
const PORT = readPort();
process.env.PORT = PORT;
const URL_ = args.has('--dev') ? 'http://localhost:5173' : `http://localhost:${PORT}`;

// --- Helpers ---------------------------------------------------------------------------
function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Runs npm (npm is a .cmd file on Windows, which needs a shell to start). */
function npm(npmArgs, options = {}) {
  return spawnSync('npm', npmArgs, { stdio: 'inherit', shell: isWindows, cwd: APP_DIR, ...options });
}

async function isUp(url) {
  try {
    const res = await fetch(`${url.replace('://localhost', '://127.0.0.1')}/api/health`, {
      headers: { 'X-JTT-Client': '1' },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (args.has('--no-open')) return;
  const [cmd, cmdArgs] = isWindows
    ? ['explorer.exe', [url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => console.log(`Open ${url} in your browser.`)).unref();
  } catch {
    console.log(`Open ${url} in your browser.`);
  }
}

async function openWhenUp(url) {
  for (let i = 0; i < 60; i++) {
    if (await isUp(url)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  openBrowser(url);
}

// --- Dependencies: install when missing or when package-lock.json changed ----------------
function depsOutdated() {
  const marker = path.join(APP_DIR, 'node_modules', '.package-lock.json');
  if (!fs.existsSync(marker)) return true;
  return fs.statSync(path.join(APP_DIR, 'package-lock.json')).mtimeMs > fs.statSync(marker).mtimeMs;
}

// --- Main ------------------------------------------------------------------------------
if (!args.has('--tray') && (await isUp(URL_))) {
  console.log(`Jira Tempo Timer is already running at ${URL_}`);
  openBrowser(URL_);
  process.exit(0);
}

if (depsOutdated()) {
  console.log('Installing dependencies…');
  const r = npm(['install', '--no-fund', '--no-audit']);
  if (r.status !== 0) fail('npm install failed.');
}

if (args.has('--dev')) {
  console.log(`Starting in dev mode at ${URL_} (Ctrl+C to stop)…`);
  openWhenUp(URL_);
  const child = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: isWindows, cwd: APP_DIR });
  child.on('exit', (code) => process.exit(code ?? 0));
} else if (args.has('--tray')) {
  // The tray app rebuilds the UI itself when needed, then starts (or reuses) the server.
  const electron = createRequire(import.meta.url)('electron'); // path to the Electron binary
  const extra = process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : [];
  spawn(electron, [APP_DIR, ...extra], { cwd: APP_DIR, detached: true, stdio: 'ignore' }).unref();
  console.log('Menu bar app started. Look for the stopwatch icon in the system tray.');
  if (isWindows) {
    console.log('(On Windows it may be hidden under the ^ arrow. Drag it onto the taskbar to keep it visible.)');
  }
} else {
  const { buildUiIfStale } = await import(pathToFileURL(path.join(APP_DIR, 'scripts', 'build-if-stale.mjs')).href);
  if (await buildUiIfStale({ quiet: false })) console.log('UI built.');
  const { startServer } = await import(pathToFileURL(path.join(APP_DIR, 'server', 'index.js')).href);
  await startServer();
  console.log(`Running at ${URL_} (Ctrl+C to stop)`);
  openBrowser(URL_);
}
