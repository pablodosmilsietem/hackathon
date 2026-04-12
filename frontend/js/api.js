import { API_CONFIG, isMockMode } from "./config.js";
import { normalizeStatusPayload } from "../shared/status.js";

/**
 * Re-exporta tipos del contrato (definidos en `shared/status.js`).
 *
 * @typedef {import('../shared/status.js').StatusPayload} StatusPayload
 * @typedef {import('../shared/status.js').GitHubActivity} GitHubActivity
 * @typedef {import('../shared/status.js').MoodState} MoodState
 */

/** Respuesta ficticia: simula datos de la API de GitHub / tu backend */
const MOCK_STATUS = {
  activity: {
    contributions_last_24h: 4,
    contributions_last_7d: 23,
    interactions_last_7d: 12,
    commits_today_utc: 2,
    commits_this_week_utc: 18,
    commits_in_events_feed: 340,
  },
  mood: {
    mood: "happy",
    message: "¡Buen ritmo en GitHub! Sigue contribuyendo.",
  },
};

export { normalizeStatusPayload };

function buildStatusUrl() {
  const path = API_CONFIG.endpoints.status.startsWith("/")
    ? API_CONFIG.endpoints.status
    : `/${API_CONFIG.endpoints.status}`;
  const base = API_CONFIG.baseUrl.replace(/\/$/, "");
  if (!base) return path;
  return `${base}${path}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Estado de humor + actividad en GitHub.
 * @returns {Promise<StatusPayload>}
 */
/**
 * Estado OAuth / sesión (misma cookie que /api/status).
 * @returns {Promise<{ oauth_configured: boolean, device_oauth_available?: boolean, connected: boolean, login: string | null, env_token_configured?: boolean }>}
 */
export async function fetchAuthStatus() {
  const path = "/api/auth/status";
  const base = API_CONFIG.baseUrl.replace(/\/$/, "");
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al leer estado de sesión`);
  }
  return res.json();
}

export async function fetchStatus() {
  if (isMockMode()) {
    await delay(API_CONFIG.mockDelayMs);
    return normalizeStatusPayload(MOCK_STATUS);
  }

  const url = buildStatusUrl();
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`No se pudo conectar (${msg})`);
  }

  if (res.status === 401) {
    let detail = "";
    try {
      const j = await res.json();
      if (j && typeof j.detail === "string") detail = j.detail;
    } catch {
      /* ignore */
    }
    if (detail === "github_login_required") {
      const err = new Error("Debes conectar GitHub");
      err.name = "AuthRequiredError";
      throw err;
    }
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("La respuesta no es JSON válido");
  }

  return normalizeStatusPayload(json);
}
