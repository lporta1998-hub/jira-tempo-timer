/**
 * Local record of worklogs successfully submitted by this app
 * (data/history.json). Used for the "Today" summary when Tempo is not
 * configured, and as a fallback if Tempo cannot be queried.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, writeFileSecure } from './config.js';

const FILE = path.join(DATA_DIR, 'history.json');
const MAX_ENTRIES = 2000;

export function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

export function appendHistory(entry) {
  const list = readHistory();
  const full = { id: crypto.randomUUID(), loggedAt: new Date().toISOString(), ...entry };
  list.push(full);
  writeFileSecure(FILE, JSON.stringify(list.slice(-MAX_ENTRIES), null, 2));
  return full;
}
