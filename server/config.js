/**
 * Configuration storage.
 *
 * Settings entered in the UI are stored in data/config.enc.json, encrypted
 * with AES-256-GCM. The key comes from CONFIG_SECRET (in .env) or, if that
 * is not set, from a random key in data/.key (file mode 600).
 *
 * Values in .env / environment variables always win over the stored file
 * and are shown as "locked" in the Settings screen.
 *
 * Secrets (API tokens) are NEVER sent back to the browser: publicConfig()
 * only reports whether they are set.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.enc.json');
const KEY_FILE = path.join(DATA_DIR, '.key');

/** Every configurable field, the env var that can override it, and whether it is secret. */
export const FIELDS = {
  jiraBaseUrl: { env: 'JIRA_BASE_URL' },
  jiraEmail: { env: 'JIRA_EMAIL' },
  jiraApiToken: { env: 'JIRA_API_TOKEN', secret: true },
  jiraAccountId: { env: 'JIRA_ACCOUNT_ID' },
  tempoApiToken: { env: 'TEMPO_API_TOKEN', secret: true },
  tempoBaseUrl: { env: 'TEMPO_BASE_URL' },
  roundingMinutes: { env: 'ROUNDING_MINUTES' },
};

const DEFAULTS = {
  tempoBaseUrl: 'https://api.tempo.io',
  roundingMinutes: '1',
};

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

/** Writes a file atomically (tmp + rename) with owner-only permissions. */
export function writeFileSecure(file, contents) {
  ensureDataDir();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, { mode: 0o600 });
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    // Windows: rename can fail while antivirus or an indexer briefly holds the file.
    if (!['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
    fs.copyFileSync(tmp, file);
    fs.rmSync(tmp, { force: true });
  }
}

function getKey() {
  if (process.env.CONFIG_SECRET) {
    return crypto.createHash('sha256').update(process.env.CONFIG_SECRET).digest();
  }
  ensureDataDir();
  if (!fs.existsSync(KEY_FILE)) {
    fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function decrypt(payload) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function readStored() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return decrypt(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  } catch (err) {
    console.error(
      `[config] Could not decrypt ${CONFIG_FILE} (${err.message}). ` +
        'Did CONFIG_SECRET or data/.key change? Re-enter your settings to overwrite it.'
    );
    return {};
  }
}

/** "your-domain.atlassian.net/" -> "https://your-domain.atlassian.net" */
function normalizeUrl(value) {
  if (!value) return '';
  let url = String(value).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export function envLockedFields() {
  return Object.keys(FIELDS).filter((f) => process.env[FIELDS[f].env]);
}

/** Effective config: defaults <- stored file <- environment variables. */
export function loadConfig() {
  const stored = readStored();
  const cfg = { ...DEFAULTS };
  for (const [field, meta] of Object.entries(FIELDS)) {
    const fromEnv = process.env[meta.env];
    if (fromEnv) cfg[field] = fromEnv.trim();
    else if (stored[field] != null && stored[field] !== '') cfg[field] = String(stored[field]).trim();
  }
  cfg.jiraBaseUrl = normalizeUrl(cfg.jiraBaseUrl);
  cfg.tempoBaseUrl = normalizeUrl(cfg.tempoBaseUrl) || DEFAULTS.tempoBaseUrl;
  cfg.roundingMinutes = Math.max(1, Math.min(60, Number(cfg.roundingMinutes) || 1));
  return cfg;
}

/**
 * Merges a patch from the Settings screen into the stored config.
 *  - Secret fields: '' or undefined means "keep the existing value"; null clears it.
 *  - Other fields: null or '' clears it.
 */
export function saveConfig(patch) {
  const stored = readStored();
  for (const [field, meta] of Object.entries(FIELDS)) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (meta.secret && (value === undefined || value === '')) continue;
    if (value === null || value === '') {
      delete stored[field];
      continue;
    }
    stored[field] = String(value).trim();
  }
  if (stored.jiraBaseUrl) {
    const url = normalizeUrl(stored.jiraBaseUrl);
    try {
      new URL(url);
    } catch {
      const err = new Error(`Invalid Jira base URL: ${stored.jiraBaseUrl}`);
      err.status = 400;
      throw err;
    }
    stored.jiraBaseUrl = url;
  }
  writeFileSecure(CONFIG_FILE, JSON.stringify(encrypt(stored), null, 2));
  return loadConfig();
}

/** Safe-to-send view of the config: secrets replaced with booleans. */
export function publicConfig(cfg = loadConfig()) {
  return {
    jiraBaseUrl: cfg.jiraBaseUrl || '',
    jiraEmail: cfg.jiraEmail || '',
    jiraAccountId: cfg.jiraAccountId || '',
    tempoBaseUrl: cfg.tempoBaseUrl || '',
    roundingMinutes: cfg.roundingMinutes,
    hasJiraApiToken: Boolean(cfg.jiraApiToken),
    hasTempoApiToken: Boolean(cfg.tempoApiToken),
    jiraConfigured: Boolean(cfg.jiraBaseUrl && cfg.jiraEmail && cfg.jiraApiToken),
    // Where worklogs will be sent: Tempo if a token exists, else Jira native worklogs.
    mode: cfg.tempoApiToken ? 'tempo' : 'jira',
    envLocked: envLockedFields(),
  };
}
