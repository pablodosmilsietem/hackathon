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
    commits_last_5m: 1,
    interactions_last_7d: 12,
    commits_today_utc: 2,
    commits_this_week_utc: 18,
    commits_in_events_feed: 340,
  },
  mood: {
    mood: "happy",
    message: "¡Buen ritmo en GitHub! Sigue contribuyendo.",
  },
  pet_timer: {
    seconds_remaining: 180,
    initial_sec: 300,
    commit_bonus_sec: 60,
    window_sec: 300,
    grace_remaining_sec: 0,
    stale_in_sec: 180,
    bar_denominator_sec: 300,
    commits_last_5m: 1,
  },
};

export { normalizeStatusPayload };

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = API_CONFIG.baseUrl.replace(/\/$/, "");
  return base ? `${base}${p}` : p;
}

function buildStatusUrl() {
  const path = API_CONFIG.endpoints.status.startsWith("/")
    ? API_CONFIG.endpoints.status
    : `/${API_CONFIG.endpoints.status}`;
  return apiUrl(path);
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

/**
 * Reinicia la fecha de nacimiento de la mascota (sesión OAuth). Requiere cookie de sesión.
 * @returns {Promise<{ status: string }>}
 */
export async function resetPet() {
  if (isMockMode()) {
    return { status: "pet_reset" };
  }
  const res = await fetch(apiUrl("/api/reset_pet"), {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) {
    throw new Error("Hace falta sesión con GitHub para reiniciar la mascota.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      if (j && typeof j.detail === "string") detail = j.detail;
    } catch {
      /* */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * @returns {Promise<{ commit_bonus_sec: number, initial_sec: number }>}
 */
export async function fetchPetConfig() {
  if (isMockMode()) {
    return { commit_bonus_sec: 60, initial_sec: 300 };
  }
  const res = await fetch(apiUrl("/api/pet_config"), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * @param {{ commit_bonus_sec?: number, initial_sec?: number }} body
 */
export async function savePetConfig(body) {
  if (isMockMode()) {
    return {
      ok: true,
      commit_bonus_sec: body.commit_bonus_sec ?? 60,
      initial_sec: body.initial_sec ?? 300,
    };
  }
  const res = await fetch(apiUrl("/api/pet_config"), {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      if (j && typeof j.detail === "string") detail = j.detail;
    } catch {
      /* */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}
