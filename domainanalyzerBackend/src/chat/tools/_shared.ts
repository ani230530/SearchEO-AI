// Shared plumbing for agent tools.
//
// Tools call the app's OWN HTTP endpoints, forwarding the caller's JWT, so each
// endpoint's existing ownership/auth checks apply unchanged. Outputs are
// trimmed to render-/token-friendly shapes.

export interface ToolContext {
  /** Caller's JWT, forwarded to internal API calls. */
  jwt: string;
  /** Domain currently in focus in the UI (X-Domain-Id), or null. */
  currentDomainId: number | null;
}

const PORT = Number(process.env.PORT) || 3002;
const INTERNAL_BASE = `http://localhost:${PORT}/api`;

export async function apiCall<T = any>(
  jwt: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${INTERNAL_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!res.ok) {
    const msg = data && typeof data === 'object' && data.error ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

/** Resolve the target domain id (explicit arg → current focus → error). */
export function resolveDomainId(input: { domainId?: number }, ctx: ToolContext): number {
  const id = input.domainId ?? ctx.currentDomainId ?? null;
  if (id == null) {
    throw new Error('No domain specified. Call listDomains and ask the user which domain to use.');
  }
  return id;
}
