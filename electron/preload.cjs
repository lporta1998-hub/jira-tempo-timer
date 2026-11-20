/**
 * The only bridge between the menu bar app (main process) and the web UI.
 * The page gets `window.trayBridge`; it has no other access to Electron or Node.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayBridge', {
  /** Tell the menu bar the timer changed: { ticket, runningSince, accumulatedSeconds }. */
  sendState: (state) => ipcRenderer.send('timer-state', state),
  /** Commands from the tray menu: 'toggle' | 'stop' | 'settings'. Returns an unsubscribe function. */
  onCommand: (callback) => {
    const handler = (_event, command) => callback(command);
    ipcRenderer.on('tray-command', handler);
    return () => ipcRenderer.removeListener('tray-command', handler);
  },
  /** Fit the popover to the page's content height. */
  resize: (height) => ipcRenderer.send('resize', height),
  /** Hide the popover (e.g. on Escape). */
  hide: () => ipcRenderer.send('hide'),
});
