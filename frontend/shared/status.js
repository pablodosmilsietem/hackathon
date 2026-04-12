/**
 * Contrato API + presentación del humor: una sola fuente para web y extensión VS Code.
 * Si cambian campos JSON o alias, edita solo este archivo.
 *
 * @typedef {'happy'|'neutral'|'angry'} Mood
 *
 * @typedef {Object} GitHubActivity
 * @property {number} contributions_last_24h
 * @property {number} contributions_last_7d
 * @property {number} interactions_last_7d
 * @property {number} commits_today_utc commits en el día civil UTC (fecha del push)
 * @property {number} commits_this_week_utc semana ISO lun–dom UTC
 * @property {number} commits_in_events_feed suma en todas las páginas de /events leídas
 *
 * @typedef {Object} MoodState
 * @property {Mood} mood
 * @property {string} message
 *
 * @typedef {Object} StatusPayload
 * @property {GitHubActivity} activity
 * @property {MoodState} mood
 * @property {string} [authHint] p.ej. needs_github_connect (falta token/OAuth en servidor)
 */

/** @type {Record<Mood, string>} */
export const MOOD_EMOJI = {
  happy: "😺",
  neutral: "😼",
  angry: "😾",
  dead: "💀"

};

/** @type {Record<Mood, string>} */
export const MOOD_LABEL = {
  happy: "Contento",
  neutral: "Normal",
  angry: "Enfadado",
  dead: "Muerto"
};

const MOOD_SET = new Set(["happy", "neutral", "angry", "dead"]);

/**
 * @param {unknown} data
 * @returns {StatusPayload}
 */
export function normalizeStatusPayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Respuesta vacía o no es JSON objeto");
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  const activity =
    raw.activity && typeof raw.activity === "object"
      ? /** @type {Record<string, unknown>} */ (raw.activity)
      : {};

  const mood =
    raw.mood && typeof raw.mood === "object"
      ? /** @type {Record<string, unknown>} */ (raw.mood)
      : {};

  const moodKey =
    typeof mood.mood === "string" && MOOD_SET.has(mood.mood)
      ? /** @type {Mood} */ (mood.mood)
      : "neutral";

  const authHint =
    typeof raw.auth_hint === "string" && raw.auth_hint.length > 0 ? raw.auth_hint : undefined;

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
      commits_today_utc: pickActivityInt(activity, ["commits_today_utc"]),
      commits_this_week_utc: pickActivityInt(activity, ["commits_this_week_utc"]),
      commits_in_events_feed: pickActivityInt(activity, ["commits_in_events_feed"]),
    },
    mood: {
      mood: moodKey,
      message: typeof mood.message === "string" ? mood.message : "",
    },
    ...(authHint ? { authHint } : {}),
  };
}

/**
 * @param {Record<string, unknown>} activity
 * @param {string[]} keys
 */
function pickActivityInt(activity, keys) {
  for (const key of keys) {
    if (key in activity) return toNonNegInt(activity[key]);
  }
  return 0;
}

/** @param {unknown} value */
function toNonNegInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
