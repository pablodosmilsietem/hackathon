import { MOOD_LABEL } from "../shared/status.js";

export { MOOD_EMOJI, MOOD_LABEL } from "../shared/status.js";

/** @type {Record<import('../shared/status.js').Mood, string>} */
const PET_SVG = {
  happy: "images/pet-happy.svg",
  neutral: "images/pet-neutral.svg",
  angry: "images/pet-angry.svg",
};

const PET_ERROR = "images/pet-error.svg";

/**
 * @param {HTMLElement} pet
 * @param {string} src
 * @param {string} alt
 */
function setPetImage(pet, src, alt) {
  const img = pet.querySelector("[data-pet-img]");
  if (img instanceof HTMLImageElement) {
    img.src = src;
    img.alt = alt;
  }
}

/**
 * @param {import('./api.js').StatusPayload} data
 * @param {HTMLElement} root
 */
export function renderStatus(data, root) {
  const pet = root.querySelector("[data-pet]");
  const moodBadge = root.querySelector("[data-mood-badge]");
  const moodText = root.querySelector("[data-mood-text]");
  const s24 = root.querySelector("[data-stat-github-24]");
  const s7 = root.querySelector("[data-stat-github-7]");
  const inter = root.querySelector("[data-stat-github-interactions-7]");
  const stoday = root.querySelector("[data-stat-github-today]");
  const sweek = root.querySelector("[data-stat-github-week]");
  const sfeed = root.querySelector("[data-stat-github-feed]");

  if (!pet || !moodText) return;

  const { mood, activity } = data;
  const label = MOOD_LABEL[mood.mood] ?? MOOD_LABEL.neutral;
  const src = PET_SVG[mood.mood] ?? PET_SVG.neutral;

  setPetImage(pet, src, label);
  pet.dataset.mood = mood.mood;
  pet.className = "pet";
  pet.classList.add(`pet--${mood.mood}`);

  if (moodBadge) {
    moodBadge.textContent = label;
    moodBadge.dataset.mood = mood.mood;
    moodBadge.className = "mood-badge";
    moodBadge.classList.add(`mood-badge--${mood.mood}`);
  }

  moodText.textContent = mood.message || "—";

  if (s24) s24.textContent = String(activity.contributions_last_24h ?? 0);
  if (s7) s7.textContent = String(activity.contributions_last_7d ?? 0);
  if (inter) inter.textContent = String(activity.interactions_last_7d ?? 0);
  if (stoday) stoday.textContent = String(activity.commits_today_utc ?? 0);
  if (sweek) sweek.textContent = String(activity.commits_this_week_utc ?? 0);
  if (sfeed) sfeed.textContent = String(activity.commits_in_events_feed ?? 0);
}

/**
 * @param {string} message
 * @param {HTMLElement} root
 */
export function renderError(message, root) {
  const pet = root.querySelector("[data-pet]");
  const moodText = root.querySelector("[data-mood-text]");
  const moodBadge = root.querySelector("[data-mood-badge]");
  if (pet) {
    setPetImage(pet, PET_ERROR, "Error");
    pet.className = "pet pet--error";
    delete pet.dataset.mood;
  }
  if (moodBadge) {
    moodBadge.textContent = "Error";
    moodBadge.className = "mood-badge mood-badge--error";
  }
  if (moodText) moodText.textContent = message;
}

/**
 * Actualización en segundo plano: no atenúa la pantalla ni cambia la mascota al huevo
 * (evita el parpadeo al recargar o al refresco automático en modo flotante).
 *
 * @param {HTMLElement} root
 */
export function setLoading(root, loading) {
  root.toggleAttribute("aria-busy", loading);
  const btn = root.querySelector("[data-action-refresh]");
  if (btn instanceof HTMLButtonElement) btn.disabled = loading;
}
