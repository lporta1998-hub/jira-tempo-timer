#!/usr/bin/env node
/**
 * Start the tray app automatically when you log in to Windows.
 *
 *   autostart.cmd install     register it to start at login (and start it now)
 *   autostart.cmd uninstall   remove it from login and quit it
 *   autostart.cmd status      show whether it is registered and running
 *
 * Uses your per-user "Run" registry key (HKCU\Software\Microsoft\Windows\CurrentVersion\Run),
 * so it needs no admin rights. It launches Electron directly, so no console window appears.
 * The app shows up as "JiraTempoTimer" in Task Manager → Startup apps, where you can also
 * turn it off.
 *
 * For testing on other systems: JTT_DRY_RUN=1 prints the registry commands instead of running them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALUE_NAME = 'JiraTempoTimer';
const DRY_RUN = process.env.JTT_DRY_RUN === '1';
const isWindows = process.platform === 'win32';

if (!isWindows && !DRY_RUN) {
  console.error('This script is for Windows. On macOS/Linux use ./autostart.sh');
  process.exit(1);
}
process.chdir(APP_DIR);

function reg(regArgs) {
  if (DRY_RUN) {
    console.log(`[dry run] reg ${regArgs.map((a) => (/\s|"/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
    return { status: regArgs[0] === 'query' ? 1 : 0, stdout: '' };
  }
  return spawnSync('reg', regArgs, { encoding: 'utf8' });
}

function electronPath() {
  try {
    return createRequire(import.meta.url)('electron');
  } catch {
    return null;
  }
}

function port() {
  try {
    const line = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^\s*PORT\s*=/.test(l)).pop();
    if (line) return line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    /* no .env */
  }
  return process.env.PORT || '3001';
}

async function isRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${port()}/api/health`, {
      headers: { 'X-JTT-Client': '1' },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Asks a running copy to quit (the single-instance handler in electron/main.js does it). */
function quitRunning(electron) {
  if (!electron || DRY_RUN) return;
  spawnSync(electron, [APP_DIR, '--quit'], { timeout: 15000 });
}

function registered() {
  const r = reg(['query', RUN_KEY, '/v', VALUE_NAME]);
  return r.status === 0;
}

async function install() {
  console.log('Preparing (npm install + build)…');
  const npm = spawnSync('npm', ['install', '--no-fund', '--no-audit'], { stdio: 'inherit', shell: isWindows, cwd: APP_DIR });
  if (npm.status !== 0) throw new Error('npm install failed');
  const { buildUi } = await import(pathToFileURL(path.join(APP_DIR, 'scripts', 'build-if-stale.mjs')).href);
  await buildUi();

  const electron = electronPath();
  if (!electron) throw new Error('Electron is missing; run npm install.');

  // e.g.  "C:\...\electron.exe" "C:\...\jira-tempo-timer" --background
  const command = `"${electron}" "${APP_DIR}" --background`;
  const r = reg(['add', RUN_KEY, '/v', VALUE_NAME, '/t', 'REG_SZ', '/d', command, '/f']);
  if (r.status !== 0) throw new Error(`Could not write the Run registry key: ${r.stderr || r.stdout}`);
  console.log(`Registered to start at login (${RUN_KEY}\\${VALUE_NAME}).`);

  // Restart so the running copy matches what will start at login.
  quitRunning(electron);
  if (!DRY_RUN) spawn(electron, [APP_DIR, '--background'], { cwd: APP_DIR, detached: true, stdio: 'ignore' }).unref();

  for (let i = 0; i < 40 && !DRY_RUN; i++) {
    if (await isRunning()) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (DRY_RUN || (await isRunning())) {
    console.log(`✔ Running. Look for the stopwatch icon in the system tray (http://localhost:${port()} also works).`);
    console.log("  If you don't see it, click the ^ arrow next to the clock and drag the icon onto the taskbar.");
  } else {
    console.log(`⚠ Registered, but the app didn't answer yet. Check the log: ${path.join(APP_DIR, 'logs', 'server.log')}`);
  }
}

function uninstall() {
  const r = reg(['delete', RUN_KEY, '/v', VALUE_NAME, '/f']);
  console.log(r.status === 0 ? 'Removed from login.' : 'It was not registered to start at login.');
  quitRunning(electronPath());
  console.log('Asked the running app to quit.');
}

async function status() {
  console.log(`Autostart: ${registered() ? 'enabled' : 'not installed'}`);
  console.log(`App:       ${(await isRunning()) ? `running at http://localhost:${port()}` : 'not running'}`);
  console.log(`Log:       ${path.join(APP_DIR, 'logs', 'server.log')}`);
}

const command = process.argv[2];
try {
  if (command === 'install') await install();
  else if (command === 'uninstall') uninstall();
  else if (command === 'status') await status();
  else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 7).join('\n').replace(/^ \* ?/gm, ''));
    if (command) process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
