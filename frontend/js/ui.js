/**
 * Presentación: emojis y clases CSS por humor.
 */

/** @type {Record<'happy'|'neutral'|'angry', string>} */
export const MOOD_EMOJI = {
  happy: "😺",
  neutral: "😐",
  angry: "😾",
};

/** @type {Record<'happy'|'neutral'|'angry', string>} */
export const MOOD_LABEL = {
  happy: "Contento",
  neutral: "Normal",
  angry: "Enfadado",
};

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

  if (!pet || !moodText || !s24 || !s7 || !inter) return;

  const { mood, activity } = data;
  const emoji = MOOD_EMOJI[mood.mood] ?? MOOD_EMOJI.neutral;

  pet.textContent = emoji;
  pet.dataset.mood = mood.mood;
  pet.className = "pet";
  pet.classList.add(`pet--${mood.mood}`);

  if (moodBadge) {
    moodBadge.textContent = MOOD_LABEL[mood.mood] ?? MOOD_LABEL.neutral;
    moodBadge.dataset.mood = mood.mood;
    moodBadge.className = "mood-badge";
    moodBadge.classList.add(`mood-badge--${mood.mood}`);
  }

  moodText.textContent = mood.message || "—";

  s24.textContent = String(activity.contributions_last_24h);
  s7.textContent = String(activity.contributions_last_7d);
  inter.textContent = String(activity.interactions_last_7d);
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
    pet.textContent = "💀";
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
 * @param {HTMLElement} root
 */
export function setLoading(root, loading) {
  root.classList.toggle("app--loading", loading);
  const btn = root.querySelector("[data-action-refresh]");
  if (btn instanceof HTMLButtonElement) btn.disabled = loading;
}
