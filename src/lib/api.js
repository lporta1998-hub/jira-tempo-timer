/**
 * Fetch wrapper for the local server. Adds the X-JTT-Client header the
 * server requires, and turns failures into ApiError with useful flags.
 */
export class ApiError extends Error {
  constructor(message, { status = 0, code, network = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.network = network; // true = local server unreachable
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'X-JTT-Client': '1',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Local server is not reachable — is `npm run dev` still running?', { network: true });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, { status: res.status, code: data?.code });
  }
  return data;
}
