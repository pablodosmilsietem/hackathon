import { MOOD_LABEL } from "../shared/status.js";

export { MOOD_EMOJI, MOOD_LABEL } from "../shared/status.js";

/** @type {Record<import('../shared/status.js').Mood, string>} */
const PET_SVG = {
  happy: "images/pet-happy.svg",
  neutral: "images/pet-neutral.svg",
  angry: "images/pet-angry.svg",
  dead: "images/pet-dead.svg",
};

const PET_ERROR = "images/pet-error.svg";

/** @type {null | { baseMood: string, baseLabel: string, initial: number, bonus: number, den: number, remainingFloor: number, syncWallSec: number }} */
let petLiveClock = null;

let petLiveIntervalId = /** @type {ReturnType<typeof setInterval> | null} */ (null);

/**
 * @param {number} totalSec
 */
function formatMmSs(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * @param {HTMLElement} root
 * @param {import('../shared/status.js').PetTimer | undefined} petTimer
 * @param {import('../shared/status.js').MoodState} mood
 */
function petLiveRemainingSec() {
  if (!petLiveClock) return null;
  return Math.max(0, petLiveClock.remainingFloor - (Date.now() / 1000 - petLiveClock.syncWallSec));
}

/**
 * @param {HTMLElement} root
 */
function paintPetLiveFrame(root) {
  const wrap = root.querySelector("[data-pet-timer]");
  const label = root.querySelector("[data-pet-timer-label]");
  const track = root.querySelector("[data-pet-timer-track]");
  const fill = root.querySelector("[data-pet-timer-fill]");
  const pet = root.querySelector("[data-pet]");
  if (!(wrap instanceof HTMLElement) || !(label instanceof HTMLElement)) return;
  if (!(track instanceof HTMLElement) || !(fill instanceof HTMLElement)) return;

  if (!petLiveClock) {
    wrap.hidden = true;
    track.hidden = true;
    wrap.classList.remove("pet-timer--urgent");
    return;
  }

  const { initial, bonus, den, baseMood, baseLabel } = petLiveClock;
  const rem = petLiveRemainingSec();
  wrap.hidden = false;
  track.hidden = false;

  if (rem <= 0) {
    label.textContent = "Sin tiempo de vida.";
    fill.style.width = "0%";
    wrap.classList.add("pet-timer--urgent");
  } else {
    label.textContent = `Te quedan ${formatMmSs(rem)} de vida · +${formatMmSs(bonus)} por commit`;
    fill.style.width = `${Math.min(100, (rem / den) * 100)}%`;
    wrap.classList.toggle("pet-timer--urgent", rem <= Math.max(30, Math.floor(initial / 5)));
  }

  if (!(pet instanceof HTMLElement)) return;

  const LIFE = ["pet--life-ok", "pet--life-warn", "pet--life-danger", "pet--life-sad"];
  for (const c of LIFE) pet.classList.remove(c);

  if (baseMood === "dead" || rem <= 0) return;

  const ratio = rem / Math.max(initial, 60);
  const sadAbs = Math.max(18, Math.floor(initial * 0.08));
  /** @type {"ok"|"warn"|"danger"|"sad"} */
  let tier;
  if (rem <= sadAbs) tier = "sad";
  else if (ratio <= 0.22 || rem <= 50) tier = "danger";
  else if (ratio <= 0.48) tier = "warn";
  else tier = "ok";

  if (tier === "sad") {
    pet.classList.add("pet--life-sad");
    setPetImage(pet, PET_SVG.angry, "Agobiado");
    pet.className = `pet pet--angry pet--life-sad`;
    return;
  }

  pet.classList.add(`pet--life-${tier}`);
  const src = PET_SVG[/** @type {keyof typeof PET_SVG} */ (baseMood)] ?? PET_SVG.neutral;
  setPetImage(pet, src, baseLabel);
  pet.className = `pet pet--${baseMood} pet--life-${tier}`;
}

function renderPetTimer(root, petTimer, mood) {
  const wrap = root.querySelector("[data-pet-timer]");
  if (!(wrap instanceof HTMLElement)) return;

  if (!petTimer || mood.mood === "dead") {
    wrap.hidden = true;
    wrap.classList.remove("pet-timer--urgent");
    const track = root.querySelector("[data-pet-timer-track]");
    if (track instanceof HTMLElement) track.hidden = true;
    return;
  }

  if (typeof petTimer.seconds_remaining === "number") {
    wrap.hidden = false;
    return;
  }

  const label = root.querySelector("[data-pet-timer-label]");
  const track = root.querySelector("[data-pet-timer-track]");
  const fill = root.querySelector("[data-pet-timer-fill]");
  if (!(label instanceof HTMLElement) || !(track instanceof HTMLElement) || !(fill instanceof HTMLElement)) return;

  wrap.hidden = false;

  const win = petTimer.window_sec ?? 300;
  const grace = petTimer.grace_remaining_sec ?? 0;
  const stale = petTimer.stale_in_sec;

  if (grace > 0) {
    label.textContent = `Tiempo para tu primer push: ${formatMmSs(grace)}`;
    const urgentGrace = grace <= Math.max(30, Math.floor(win / 5));
    track.hidden = false;
    fill.style.width = `${Math.min(100, (grace / win) * 100)}%`;
    wrap.classList.toggle("pet-timer--urgent", urgentGrace);
  } else if (stale != null) {
    const urgent = stale <= Math.max(30, Math.floor(win / 5));
    label.textContent = urgent
      ? `⚠️ La ventana de commits caduca en ~${formatMmSs(stale)}`
      : `Tu último push deja de contar en ~${formatMmSs(stale)}`;
    track.hidden = false;
    fill.style.width = `${Math.min(100, (stale / win) * 100)}%`;
    wrap.classList.toggle("pet-timer--urgent", urgent);
  } else {
    label.textContent = "Sin push reciente en el feed de GitHub; haz uno para alimentar al gato.";
    track.hidden = true;
    wrap.classList.remove("pet-timer--urgent");
    fill.style.width = "0%";
  }
}

/**
 * @param {import('./api.js').StatusPayload} data
 * @param {HTMLElement} root
 */
export function syncPetLiveClock(data, root) {
  const petTimer = data.petTimer;
  const mood = data.mood;
  if (!petTimer || mood.mood === "dead" || typeof petTimer.seconds_remaining !== "number") {
    petLiveClock = null;
    const pet = root.querySelector("[data-pet]");
    if (pet) {
      for (const c of ["pet--life-ok", "pet--life-warn", "pet--life-danger", "pet--life-sad"]) {
        pet.classList.remove(c);
      }
    }
    paintPetLiveFrame(root);
    return;
  }

  const label = MOOD_LABEL[mood.mood] ?? MOOD_LABEL.neutral;
  const initial = petTimer.initial_sec ?? petTimer.window_sec ?? 300;
  const sr = petTimer.seconds_remaining;
  const den =
    petTimer.bar_denominator_sec ?? Math.max(initial, sr, 1);

  petLiveClock = {
    baseMood: mood.mood,
    baseLabel: label,
    initial,
    bonus: petTimer.commit_bonus_sec ?? 0,
    den,
    remainingFloor: sr,
    syncWallSec: Date.now() / 1000,
  };
  paintPetLiveFrame(root);
}

/**
 * @param {() => HTMLElement} getRoot
 */
export function startPetLiveTicker(getRoot) {
  if (petLiveIntervalId != null) {
    clearInterval(petLiveIntervalId);
  }
  petLiveIntervalId = window.setInterval(() => {
    try {
      paintPetLiveFrame(getRoot());
    } catch {
      /* */
    }
  }, 1000);
}

export function clearPetLiveClock(root) {
  petLiveClock = null;
  const pet = root.querySelector("[data-pet]");
  if (pet) {
    for (const c of ["pet--life-ok", "pet--life-warn", "pet--life-danger", "pet--life-sad"]) {
      pet.classList.remove(c);
    }
  }
}

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
  const stoday = root.querySelector("[data-stat-github-today]");

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

  renderPetTimer(root, data.petTimer, mood);
  syncPetLiveClock(data, root);

  if (stoday) stoday.textContent = String(activity.commits_today_utc ?? 0);
}

/**
 * @param {string} message
 * @param {HTMLElement} root
 */
export function renderError(message, root) {
  clearPetLiveClock(root);
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
  const timer = root.querySelector("[data-pet-timer]");
  if (timer instanceof HTMLElement) {
    timer.hidden = true;
    timer.classList.remove("pet-timer--urgent");
  }
  const track = root.querySelector("[data-pet-timer-track]");
  if (track instanceof HTMLElement) track.hidden = true;
}

/**
 * Indica carga en curso; deshabilita «Nuevo gato» si está visible (el refresco es solo por intervalo).
 *
 * @param {HTMLElement} root
 */
export function setLoading(root, loading) {
  root.toggleAttribute("aria-busy", loading);
  const resetBtn = root.querySelector("[data-action-reset-pet]");
  if (resetBtn instanceof HTMLButtonElement && !resetBtn.hidden) resetBtn.disabled = loading;
}
