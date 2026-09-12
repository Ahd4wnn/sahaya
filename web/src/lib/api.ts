/**
 * API client.
 *
 * Access tokens live in memory only; the refresh token is the one thing kept in
 * localStorage. On a 401 the client transparently refreshes once and replays the
 * request, and concurrent 401s share a single refresh so a page with six
 * queries does not fire six rotations (which replay-detection would read as
 * token theft and log the user out).
 */

/**
 * Where the API lives.
 *
 * Empty in development: Vite proxies `/api` to the local server, so calls are
 * same-origin and there is no CORS in the loop at all. In production it is
 * `https://api.sahaya.life` (web/.env.production), because the site and the
 * API are separate origins -- which is also why the backend's CORS_ORIGINS has
 * to name the site.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const BASE = `${API_ORIGIN}/api/v1`;
const REFRESH_KEY = "sahaya.refresh";

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setTokens(access: string | null, refresh?: string | null) {
  accessToken = access;
  if (refresh !== undefined) {
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else localStorage.removeItem(REFRESH_KEY);
  }
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function hasSession() {
  return Boolean(accessToken || getRefreshToken());
}

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }

  /** The paywall, as opposed to a genuine permission failure. */
  get isPaywall() {
    return this.status === 402;
  }

  /** A state conflict -- "already reviewed", "their membership lapsed". Not
   *  something a membership prompt can fix, so it must not show one. */
  get isConflict() {
    return this.status === 409;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let detail = response.statusText;
  let body: unknown;
  try {
    body = await response.json();
    const d = (body as { detail?: unknown })?.detail;
    if (typeof d === "string") detail = d;
    else if (Array.isArray(d) && d[0]?.msg) detail = String(d[0].msg);
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(response.status, detail, body);
}

async function refreshAccess(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  const response = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });

  if (!response.ok) {
    setTokens(null, null);
    return null;
  }
  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
  };
  setTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

function sharedRefresh(): Promise<string | null> {
  refreshInFlight ??= refreshAccess().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

type Options = Omit<RequestInit, "body"> & { body?: unknown; retry?: boolean };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { body, retry = true, headers, ...rest } = options;

  const isFormData = body instanceof FormData;
  const response = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      ...(isFormData ? {} : body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && retry) {
    const fresh = await sharedRefresh();
    if (fresh) return api<T>(path, { ...options, retry: false });
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Fetch a private file (an ID document) and return it as an object URL.
 *
 * `<img>` and `<iframe>` cannot send an Authorization header, and private files
 * are deliberately not reachable without one. So they are fetched here and
 * handed to the element as `blob:` URLs. The caller must revoke the URL.
 */
export async function apiBlobUrl(path: string, retry = true): Promise<string> {
  const response = await fetch(`${BASE}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (response.status === 401 && retry) {
    const fresh = await sharedRefresh();
    if (fresh) return apiBlobUrl(path, false);
  }
  if (!response.ok) throw await parseError(response);
  return URL.createObjectURL(await response.blob());
}

/** Restore a session on page load. Returns true if a session came back. */
export async function bootstrapSession(): Promise<boolean> {
  if (accessToken) return true;
  if (!getRefreshToken()) return false;
  return (await sharedRefresh()) !== null;
}

/**
 * The access token for the realtime socket, refreshed first if only a refresh
 * token is held. The socket sends this in its first frame -- browsers cannot
 * put an Authorization header on a WebSocket.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  if (accessToken) return accessToken;
  return sharedRefresh();
}

/** Force a refresh -- used when the socket is closed with 4401 because the
 *  token it presented had expired while the tab sat idle. */
export function refreshAccessToken(): Promise<string | null> {
  return sharedRefresh();
}

export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      // Repeated keys, matching FastAPI's list query parsing.
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** The server's own words when it sent any, otherwise the fallback. The API's
 *  error messages are written for people, so they are shown as they are. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}
