/**
 * Menu bar / system tray app.
 *
 *  - Runs the local server in-process (or reuses one already running on PORT).
 *  - Shows a tray icon; on macOS the elapsed time appears next to it.
 *  - Left-click: toggle a small popover with the compact UI.
 *    Right-click (or any click on Linux): menu with Start/Pause, Stop & Log, Settings, Quit.
 *
 * The web UI stays the single source of truth for the timer. It reports its
 * state over IPC (see preload.cjs), and the tray sends commands back. The
 * popover window is hidden rather than closed, so the timer keeps running.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Tray, Menu, nativeImage, screen, shell, ipcMain } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
// JTT_URL lets you point the tray at the Vite dev server (http://localhost:5173).
const APP_URL = (process.env.JTT_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const WIDTH = 360;
const MAX_HEIGHT = 640;
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

let tray = null;
let win = null;
let quitting = false;
let lastShownAt = 0;
/** Mirror of the page's timer, used for the tray title and menu. */
let timer = { ticket: null, runningSince: null, accumulatedSeconds: 0 };

// Only one copy: launching again just shows the popover.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(init).catch((err) => {
    console.error(err);
    app.quit();
  });
}

// Menu bar apps don't get a Dock icon.
if (isMac) app.dock?.hide();
app.setName('Jira Tempo Timer');

// Keep running when the popover is hidden.
app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  quitting = true;
});

async function serverIsUp() {
  try {
    const res = await fetch(`${APP_URL}/api/health`, {
      headers: { 'X-JTT-Client': '1' },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function init() {
  if (!process.env.JTT_URL && !(await serverIsUp())) {
    const { startServer } = await import('../server/index.js');
    await startServer({ port: PORT });
  }
  createWindow();
  createTray();
  setInterval(updateTray, 1000);

  // First run (nothing configured yet): open the popover so Settings is visible.
  try {
    const res = await fetch(`${APP_URL}/api/settings`, { headers: { 'X-JTT-Client': '1' } });
    if (!(await res.json()).jiraConfigured) win.once('ready-to-show', () => showWindow());
  } catch {
    /* the page will show the error itself */
  }
}

// ---------------------------------------------------------------- window

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH,
    height: 220,
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The timer must keep ticking while the popover is hidden.
      backgroundThrottling: false,
    },
  });

  win.loadURL(`${APP_URL}/?tray=1`);

  // Server not ready yet (e.g. just after login)? Keep retrying.
  win.webContents.on('did-fail-load', (_e, _code, _desc, url, isMainFrame) => {
    if (isMainFrame) setTimeout(() => win?.loadURL(`${APP_URL}/?tray=1`), 2000);
  });

  // Links (e.g. "Open ABC-1 in Jira") open in the normal browser. Nothing else may load in the popover.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  // Behave like a popover: hide when you click elsewhere.
  win.on('blur', () => {
    // Ignore the blur that can arrive right after showing it from a tray click.
    if (Date.now() - lastShownAt > 300 && !win.webContents.isDevToolsOpened()) win.hide();
  });
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

/** Places the popover under the menu bar icon (or above it when the taskbar is at the bottom). */
function positionWindow() {
  if (!win) return;
  const [w, h] = win.getSize();
  const tb = tray?.getBounds?.() ?? { x: 0, y: 0, width: 0, height: 0 };
  const hasBounds = tb.width > 0 && tb.height > 0;
  const anchor = hasBounds ? { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 } : screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(anchor).workArea;

  let x = Math.round(anchor.x - w / 2);
  const trayAtTop = anchor.y < area.y + area.height / 2;
  let y = trayAtTop
    ? Math.round((hasBounds ? tb.y + tb.height : anchor.y) + 6)
    : Math.round((hasBounds ? tb.y : anchor.y) - h - 6);

  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - w - 8));
  y = Math.max(area.y + 4, Math.min(y, area.y + area.height - h - 4));
  win.setPosition(x, y, false);
}

function showWindow() {
  if (!win) return;
  positionWindow();
  lastShownAt = Date.now();
  win.show();
  win.focus();
}

function toggleWindow() {
  if (win?.isVisible()) win.hide();
  else showWindow();
}

function send(command) {
  win?.webContents.send('tray-command', command);
}

// ----------------------------------------------------------------- IPC

ipcMain.on('timer-state', (_event, state) => {
  timer = {
    ticket: state?.ticket ?? null,
    runningSince: state?.runningSince ?? null,
    accumulatedSeconds: Number(state?.accumulatedSeconds) || 0,
  };
  updateTray(true);
});

ipcMain.on('resize', (_event, height) => {
  if (!win) return;
  const h = Math.max(80, Math.min(MAX_HEIGHT, Math.ceil(Number(height) || 0)));
  const [, current] = win.getContentSize();
  if (h === current) return;
  // Some window managers (GTK on Linux) ignore programmatic resizes of non-resizable windows.
  win.setResizable(true);
  win.setContentSize(WIDTH, h, false);
  win.setResizable(false);
  if (win.isVisible()) positionWindow();
});

ipcMain.on('hide', () => win?.hide());

// ----------------------------------------------------------------- tray

function elapsedSeconds() {
  const running = timer.runningSince ? Math.max(0, (Date.now() - timer.runningSince) / 1000) : 0;
  return Math.floor(timer.accumulatedSeconds + running);
}

/** 754 -> "12:34", 4354 -> "1:12:34" */
function formatElapsed(total) {
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function currentState() {
  if (timer.runningSince) return 'running';
  if (timer.accumulatedSeconds > 0) return 'paused';
  return 'idle';
}

const icons = {};
function icon(state) {
  const name = isMac ? `${state}Template` : state;
  if (!icons[name]) {
    // nativeImage picks up the @2x file automatically on high-DPI screens.
    const img = nativeImage.createFromPath(path.join(__dirname, 'icons', `${name}.png`));
    if (isMac) img.setTemplateImage(true);
    icons[name] = img;
  }
  return icons[name];
}

function createTray() {
  tray = new Tray(icon('idle'));
  tray.setToolTip('Jira Tempo Timer');
  if (isLinux) {
    // Most Linux trays only support a context menu, not click events.
    tray.setContextMenu(buildMenu());
  } else {
    tray.on('click', toggleWindow);
    tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  }
  updateTray(true);
}

let lastState = null;
/** Refreshes the icon, the macOS title and the tooltip. `force` also rebuilds the Linux menu. */
function updateTray(force = false) {
  if (!tray) return;
  const state = currentState();
  const elapsed = elapsedSeconds();
  const key = timer.ticket?.key;

  if (force || state !== lastState) tray.setImage(icon(state));
  if (isMac) {
    const title = state === 'idle' ? '' : ` ${formatElapsed(elapsed)}`;
    tray.setTitle(title, { fontType: 'monospacedDigit' });
  }
  const label = key ? `${key} — ${state === 'idle' ? 'ready' : `${formatElapsed(elapsed)} ${state}`}` : 'No ticket selected';
  tray.setToolTip(`Jira Tempo Timer\n${label}`);
  if (isLinux && (force || state !== lastState)) tray.setContextMenu(buildMenu());
  lastState = state;
}

function buildMenu() {
  const state = currentState();
  const t = timer.ticket;
  const summary = t ? `${t.key}  ${t.summary.length > 40 ? `${t.summary.slice(0, 39)}…` : t.summary}` : 'No ticket selected';

  return Menu.buildFromTemplate([
    { label: summary, enabled: false },
    ...(state !== 'idle' ? [{ label: `${formatElapsed(elapsedSeconds())} · ${state}`, enabled: false }] : []),
    { type: 'separator' },
    {
      label: state === 'running' ? 'Pause' : state === 'paused' ? 'Resume' : 'Start',
      click: () => (t ? send('toggle') : showWindow()),
    },
    {
      label: 'Stop & Log Work…',
      enabled: state !== 'idle',
      click: () => {
        showWindow();
        send('stop');
      },
    },
    { type: 'separator' },
    { label: 'Show Timer', click: showWindow },
    {
      label: 'Settings…',
      click: () => {
        showWindow();
        send('settings');
      },
    },
    { type: 'separator' },
    { label: 'Quit Jira Tempo Timer', role: 'quit' },
  ]);
}
