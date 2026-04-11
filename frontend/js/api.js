import { API_CONFIG } from "./config.js";

/**
 * Actividad agregada en tu cuenta de GitHub (no un repo local concreto).
 * Si el JSON del servidor usa otros nombres, adapta `normalizeStatusPayload`.
 *
 * @typedef {Object} GitHubActivity
 * @property {number} contributions_last_24h  Contribuciones/atribuciones en GitHub (~24 h)
 * @property {number} contributions_last_7d   Misma métrica, ventana 7 días
 * @property {number} interactions_last_7d    Interacciones agregadas (PRs, issues, comentarios, etc.)
 *
 * @typedef {Object} MoodState
 * @property {'happy'|'neutral'|'angry'} mood
 * @property {string} message
 *
 * @typedef {Object} StatusPayload
 * @property {GitHubActivity} activity
 * @property {MoodState} mood
 */

/** Respuesta ficticia: simula datos de la API de GitHub / tu backend */
const MOCK_STATUS = {
  activity: {
    contributions_last_24h: 4,
    contributions_last_7d: 23,
    interactions_last_7d: 12,
  },
  mood: {
    mood: "happy",
    message: "¡Buen ritmo en GitHub! Sigue contribuyendo.",
  },
};

const MOOD_SET = new Set(["happy", "neutral", "angry"]);

/**
 * @param {unknown} data
 * @returns {StatusPayload}
 */
export function normalizeStatusPayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Respuesta vacía o no es JSON objeto");
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  const activity = raw.activity && typeof raw.activity === "object"
    ? /** @type {Record<string, unknown>} */ (raw.activity)
    : {};

  const mood = raw.mood && typeof raw.mood === "object"
    ? /** @type {Record<string, unknown>} */ (raw.mood)
    : {};

  const moodKey = typeof mood.mood === "string" && MOOD_SET.has(mood.mood)
    ? /** @type {'happy'|'neutral'|'angry'} */ (mood.mood)
    : "neutral";

  return {
    activity: {
      contributions_last_24h: pickActivityInt(activity, [
        "contributions_last_24h",
        "github_contributions_last_24h",
        "commits_last_24h",
      ]),
      contributions_last_7d: pickActivityInt(activity, [
        "contributions_last_7d",
        "github_contributions_last_7d",
        "commits_last_7d",
      ]),
      interactions_last_7d: pickActivityInt(activity, [
        "interactions_last_7d",
        "github_interactions_last_7d",
        "public_events_last_7d",
        "push_events_last_7d",
      ]),
    },
    mood: {
      mood: moodKey,
      message: typeof mood.message === "string" ? mood.message : "",
    },
  };
}

/**
 * @param {Record<string, unknown>} activity
 * @param {string[]} keys orden de preferencia
 */
function pickActivityInt(activity, keys) {
  for (const key of keys) {
    if (key in activity) return toNonNegInt(activity[key]);
  }
  return 0;
}

function toNonNegInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function buildStatusUrl() {
  const base = API_CONFIG.baseUrl.replace(/\/$/, "");
  const path = API_CONFIG.endpoints.status.startsWith("/")
    ? API_CONFIG.endpoints.status
    : `/${API_CONFIG.endpoints.status}`;
  return `${base}${path}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Estado de humor + actividad en GitHub.
 * @returns {Promise<StatusPayload>}
 */
export async function fetchStatus() {
  if (API_CONFIG.useMock) {
    await delay(API_CONFIG.mockDelayMs);
    return normalizeStatusPayload(MOCK_STATUS);
  }

  const url = buildStatusUrl();
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`No se pudo conectar (${msg})`);
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
