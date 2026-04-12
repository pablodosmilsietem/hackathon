import { isFloatMode, isMockMode } from "./config.js";
import { fetchAuthStatus, fetchPetConfig, fetchStatus, resetPet, savePetConfig } from "./api.js";
import { renderError, renderStatus, setLoading, startPetLiveTicker } from "./ui.js";

const POLL_MS = isFloatMode() ? 5_000 : 60_000;

const OAUTH_ERROR_TEXT = {
  oauth_not_configured: [
    "Este enlace es para OAuth «web» (CLIENT_ID + SECRET + callback).",
    "Más fácil: en .env pon solo GITHUB_CLIENT_ID y en la OAuth App de GitHub activa «Device flow». Luego usa el botón «Conectar con GitHub» (flujo dispositivo).",
    "Si prefieres OAuth web: copia .env.example → .env, rellena CLIENT_SECRET y GITHUB_OAUTH_REDIRECT_URI, y reinicia.",
  ].join("\n"),
  access_denied: "Has cancelado el acceso en GitHub.",
  invalid_state: "Sesión de seguridad caducada. Prueba de nuevo.",
  missing_oauth_params: "Respuesta incompleta de GitHub.",
  token_exchange_failed: "No se pudo completar el inicio de sesión.",
  no_token: "GitHub no devolvió token.",
};

function getRoot() {
  const el = document.querySelector("[data-app]");
  if (!el) throw new Error("Falta [data-app] en el HTML");
  return el;
}

function stripOAuthParamsFromUrl() {
  const u = new URL(window.location.href);
  let changed = false;
  for (const k of ["error", "msg"]) {
    if (u.searchParams.has(k)) {
      u.searchParams.delete(k);
      changed = true;
    }
  }
  if (changed) {
    const q = u.searchParams.toString();
    window.history.replaceState({}, "", u.pathname + (q ? `?${q}` : "") + u.hash);
  }
}

function setGateVisible(visible) {
  const gate = document.querySelector("[data-auth-gate]");
  const root = document.querySelector("[data-app]");
  if (gate) gate.hidden = !visible;
  if (root) root.setAttribute("aria-hidden", visible ? "true" : "false");
}

function showGateError(el, authJsonError) {
  if (!el) return;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("error");
  const msg = params.get("msg");
  if (code && code in OAUTH_ERROR_TEXT) {
    el.textContent = OAUTH_ERROR_TEXT[code];
  } else if (msg) {
    el.textContent = decodeURIComponent(msg.replace(/\+/g, " "));
  } else if (typeof authJsonError === "string") {
    el.textContent = authJsonError;
  } else {
    el.textContent = "";
  }
  stripOAuthParamsFromUrl();
}

/** @type {null | { oauth_configured: boolean, device_oauth_available?: boolean, connected: boolean, login: string | null, env_token_configured?: boolean }} */
let lastAuthStatus = null;

/** Recuerda en el navegador/webview que hubo sesión (el token real sigue en la cookie del servidor). */
const SESSION_HINT_KEY = "tamagotchi_github_session_hint_v1";
const SESSION_HINT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function readSessionHint() {
  try {
    const raw = localStorage.getItem(SESSION_HINT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (typeof o?.ts !== "number" || typeof o?.login !== "string") return null;
    if (Date.now() - o.ts > SESSION_HINT_MAX_AGE_MS) {
      localStorage.removeItem(SESSION_HINT_KEY);
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

function writeSessionHint(login) {
  try {
    localStorage.setItem(SESSION_HINT_KEY, JSON.stringify({ login, ts: Date.now() }));
  } catch {
    /* sin espacio o ventana privada */
  }
}

function clearSessionHint() {
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* */
  }
}

const GATE_TEXT_OAUTH = `Pulsa el botón: se abrirá GitHub para que inicies sesión y autorices la app (alcance read:user). No tienes que copiar tokens a mano.`;

const GATE_TEXT_DEVICE = `Pulsa «Conectar con GitHub» y luego «Abrir GitHub (navegador)» si no se abre solo. Autoriza en GitHub y vuelve aquí. Necesitas GITHUB_CLIENT_ID y «Device flow» en tu OAuth App.`;

const GATE_TEXT_SETUP = `Hace falta al menos una de estas opciones en .env (raíz del proyecto): (A) GITHUB_CLIENT_ID con Device flow en GitHub, o (B) OAuth completo (CLIENT_ID + SECRET + REDIRECT_URI), o (C) GITHUB_TOKEN / GITHUB_LOGIN. Copia desde .env.example.`;

function currentReturnToParam() {
  const path = window.location.pathname + window.location.search;
  return encodeURIComponent(path || "/");
}

function wireAuthLinks() {
  const ret = currentReturnToParam();
  const hrefGh = `/auth/github?return_to=${ret}`;
  const hrefOut = `/auth/logout?return_to=${ret}`;
  for (const sel of ["[data-auth-github-link]", "[data-connect-github-inline]"]) {
    const el = document.querySelector(sel);
    if (el) el.setAttribute("href", hrefGh);
  }
  const out = document.querySelector("[data-auth-logout-link]");
  if (out) out.setAttribute("href", hrefOut);
}

/**
 * @param {"oauth" | "device" | "setup"} mode
 */
function applyGateCopy(mode) {
  const el = document.querySelector("[data-auth-gate-text]");
  if (!el) return;
  if (mode === "oauth") el.textContent = GATE_TEXT_OAUTH;
  else if (mode === "device") el.textContent = GATE_TEXT_DEVICE;
  else el.textContent = GATE_TEXT_SETUP;
}

function setDeviceHint(visible, text = "") {
  document.querySelectorAll("[data-device-hint]").forEach((el) => {
    el.textContent = text;
    el.hidden = !visible;
  });
}

/** @param {typeof lastAuthStatus} [status] */
function syncConnectButtons(status = lastAuthStatus) {
  const linkGate = document.querySelector("[data-auth-github-link]");
  const btnGate = document.querySelector("[data-auth-device-start]");
  const linkIn = document.querySelector("[data-connect-github-inline]");
  const btnIn = document.querySelector("[data-auth-device-inline]");
  const oauth = status?.oauth_configured === true;
  const device = status?.device_oauth_available === true;
  const showWeb = oauth || (!oauth && !device);
  const showDev = device && !oauth;
  if (linkGate) {
    linkGate.hidden = !showWeb;
    linkGate.style.display = "";
  }
  if (btnGate) {
    btnGate.hidden = !showDev;
    btnGate.style.display = "";
  }
  if (linkIn) {
    linkIn.hidden = !showWeb;
    linkIn.style.display = "";
  }
  if (btnIn) {
    btnIn.hidden = !showDev;
    btnIn.style.display = "";
  }
  if (showWeb) wireAuthLinks();
}

function setConnectRowVisible(visible) {
  document.querySelectorAll("[data-auth-connect-row], [data-auth-connect-row-banner]").forEach((el) => {
    el.hidden = !visible;
  });
}

function hideDeviceFlowUI() {
  document.querySelectorAll("[data-device-flow-panel]").forEach((el) => {
    el.hidden = true;
  });
  setConnectRowVisible(true);
  if (lastAuthStatus) syncConnectButtons(lastAuthStatus);
}

function showDeviceFlowUI(user_code, verification_uri) {
  setDeviceHint(false, "");
  const gate = document.querySelector("[data-auth-gate]");
  const gateVisible = Boolean(gate && !gate.hidden);

  document.querySelectorAll("[data-device-flow-panel]").forEach((panel) => {
    const inGate = Boolean(gate?.contains(panel));
    const show = gateVisible ? inGate : !inGate;
    panel.hidden = !show;
    if (!show) return;
    const input = panel.querySelector("[data-device-user-code]");
    if (input instanceof HTMLInputElement) input.value = user_code;
    const a = panel.querySelector("[data-device-open-github]");
    if (a instanceof HTMLAnchorElement) a.href = verification_uri;
  });
  setConnectRowVisible(false);
  try {
    window.open(verification_uri, "_blank", "noopener,noreferrer");
  } catch {
    /* pywebview suele bloquear window.open */
  }
}

function gateAuthMode() {
  if (lastAuthStatus?.oauth_configured) return "oauth";
  if (lastAuthStatus?.device_oauth_available) return "device";
  return "setup";
}

async function startDeviceFlow() {
  const gate = document.querySelector("[data-auth-gate]");
  if (gate?.hidden) {
    setGateVisible(true);
    wireAuthLinks();
    syncConnectButtons(lastAuthStatus);
    applyGateCopy(gateAuthMode());
  }

  hideDeviceFlowUI();

  const errEl = document.querySelector("[data-auth-gate-error]");
  if (errEl) errEl.textContent = "";
  setDeviceHint(true, "Conectando con GitHub…");

  try {
    const r = await fetch("/api/auth/device/start", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = typeof j.detail === "string" ? j.detail : "";
      setDeviceHint(
        true,
        detail
          ? `GitHub respondió: ${detail}\n\n¿OAuth App con «Device flow» activado? (Settings → Developer settings → tu app)`
          : "No se pudo iniciar. ¿OAuth App con Device flow activado?",
      );
      return;
    }
    const user_code = j.user_code;
    const verification_uri = j.verification_uri;
    const interval = Number(j.interval) || 5;
    if (typeof user_code !== "string" || typeof verification_uri !== "string") {
      setDeviceHint(true, "Respuesta inválida del servidor.");
      return;
    }

    showDeviceFlowUI(user_code, verification_uri);

    const pollMs = Math.max(5000, interval * 1000);
    const poll = async () => {
      const sr = await fetch("/api/auth/device/status", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const d = await sr.json().catch(() => ({}));
      if (d.status === "ok") {
        hideDeviceFlowUI();
        window.location.reload();
        return;
      }
      if (d.status === "expired" || d.status === "error") {
        hideDeviceFlowUI();
        const m = d.message;
        setDeviceHint(
          true,
          m === "access_denied"
            ? "Has denegado el acceso en GitHub."
            : "Tiempo agotado o error. Cierra y vuelve a pulsar Conectar.",
        );
        return;
      }
      const next = Math.max(pollMs, (Number(d.interval) || interval) * 1000);
      setTimeout(poll, next);
    };
    setTimeout(poll, pollMs);
  } catch {
    hideDeviceFlowUI();
    setDeviceHint(true, "Error de red con el servidor.");
  }
}

document.addEventListener("click", (e) => {
  const t = /** @type {HTMLElement} */ (e.target);
  if (t.closest("[data-copy-user-code]")) {
    const panel = t.closest("[data-device-flow-panel]");
    const input = panel?.querySelector("[data-device-user-code]");
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
      void (async () => {
        try {
          await navigator.clipboard.writeText(input.value);
        } catch {
          try {
            document.execCommand("copy");
          } catch {
            /* sin permiso clipboard */
          }
        }
      })();
    }
    return;
  }
  if (t.closest("[data-auth-device-start], [data-auth-device-inline]")) {
    e.preventDefault();
    void startDeviceFlow();
  }
});

async function refresh() {
  const root = getRoot();
  setLoading(root, true);
  try {
    const data = await fetchStatus();
    renderStatus(data, root);
    syncResetPetButton(data, root);
    const banner = document.querySelector("[data-connect-banner]");
    if (data.authHint === "needs_github_connect") {
      wireAuthLinks();
      syncConnectButtons(lastAuthStatus);
      if (banner) banner.hidden = false;
    } else {
      if (banner) banner.hidden = true;
      setDeviceHint(false, "");
      const needOauthOnly =
        Boolean(lastAuthStatus?.oauth_configured) && !lastAuthStatus?.connected;
      if (!needOauthOnly) setGateVisible(false);
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AuthRequiredError") {
      hideResetActionsRow(root);
      clearSessionHint();
      wireAuthLinks();
      syncConnectButtons(lastAuthStatus);
      applyGateCopy(gateAuthMode());
      setGateVisible(true);
      const errEl = document.querySelector("[data-auth-gate-error]");
      if (errEl) errEl.textContent = "La sesión ha caducado. Vuelve a conectar GitHub.";
      return;
    }
    const msg = e instanceof Error ? e.message : "Error desconocido";
    hideResetActionsRow(root);
    renderError(
      isMockMode()
        ? `${msg} (revisa MOCK en api.js o shared/status.js)`
        : `${msg}. ¿Backend en marcha (python main.py)? ¿CORS si usas otro origen?`,
      root,
    );
  } finally {
    setLoading(root, false);
  }
}

/**
 * Muestra «Nuevo gato» solo con humor muerto y sesión OAuth (el backend exige cookie).
 * @param {import('./api.js').StatusPayload} data
 * @param {HTMLElement} root
 */
function syncResetPetButton(data, root) {
  const btn = root.querySelector("[data-action-reset-pet]");
  const row = root.querySelector("[data-device-actions]");
  if (!(btn instanceof HTMLButtonElement)) return;
  const localDead = root.getAttribute("data-pet-local-dead") === "true";
  const show =
    (data.mood.mood === "dead" || localDead) && lastAuthStatus?.connected === true;
  btn.hidden = !show;
  if (row instanceof HTMLElement) row.hidden = !show;
  if (!show) btn.disabled = false;
}

/** Oculta la fila de acciones (p. ej. error de red: no mostrar reset hasta nuevo estado válido). */
function hideResetActionsRow(root) {
  const btn = root.querySelector("[data-action-reset-pet]");
  const row = root.querySelector("[data-device-actions]");
  if (btn instanceof HTMLButtonElement) {
    btn.hidden = true;
    btn.disabled = false;
  }
  if (row instanceof HTMLElement) row.hidden = true;
}

function wirePetConfigForm() {
  const form = document.querySelector("[data-pet-config-form]");
  if (!form || !(form instanceof HTMLFormElement)) return;
  if (form.dataset.wired === "1") return;
  form.dataset.wired = "1";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void (async () => {
      const msg = document.querySelector("[data-pet-config-msg]");
      const fd = new FormData(form);
      const initialRaw = fd.get("initial_sec");
      const bonusRaw = fd.get("commit_bonus_sec");
      const initial_sec = typeof initialRaw === "string" ? parseInt(initialRaw, 10) : NaN;
      const commit_bonus_sec = typeof bonusRaw === "string" ? parseInt(bonusRaw, 10) : NaN;
      if (msg) msg.textContent = "";
      if (!Number.isFinite(initial_sec) || !Number.isFinite(commit_bonus_sec)) {
        if (msg) msg.textContent = "Números no válidos.";
        return;
      }
      try {
        await savePetConfig({ initial_sec, commit_bonus_sec });
        if (msg) {
          msg.textContent =
            "Guardado. El bonus aplica en el siguiente commit nuevo. El tiempo inicial, al pulsar «Nuevo gato» o al reconectar.";
        }
      } catch (er) {
        if (msg) msg.textContent = er instanceof Error ? er.message : "Error al guardar.";
      }
    })();
  });
}

async function loadPetConfigForm() {
  const panel = document.querySelector("[data-app-config]");
  if (!panel) return;
  if (isMockMode() || !lastAuthStatus?.connected) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const msg = document.querySelector("[data-pet-config-msg]");
  if (msg) msg.textContent = "";
  try {
    const c = await fetchPetConfig();
    const form = document.querySelector("[data-pet-config-form]");
    const ini = form?.querySelector("[name='initial_sec']");
    const bon = form?.querySelector("[name='commit_bonus_sec']");
    if (ini instanceof HTMLInputElement) ini.value = String(c.initial_sec);
    if (bon instanceof HTMLInputElement) bon.value = String(c.commit_bonus_sec);
  } catch {
    if (msg) msg.textContent = "No se pudo cargar la configuración.";
  }
}

function startApp(root) {
  wireAuthLinks();
  syncConnectButtons(lastAuthStatus);

  wirePetConfigForm();
  void loadPetConfigForm();

  root.querySelector("[data-action-reset-pet]")?.addEventListener("click", () => {
    void (async () => {
      try {
        await resetPet();
        await refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al reiniciar";
        const moodText = root.querySelector("[data-mood-text]");
        if (moodText) moodText.textContent = msg;
      }
    })();
  });

  const logoutRow = document.querySelector("[data-session-logout]");
  if (logoutRow && lastAuthStatus?.connected) {
    logoutRow.hidden = false;
  }

  startPetLiveTicker(getRoot);

  void refresh();
  setInterval(() => {
    void refresh();
  }, POLL_MS);
}

function consumeGithubDeviceParam() {
  const u = new URL(window.location.href);
  if (u.searchParams.get("github_device") !== "1") return false;
  u.searchParams.delete("github_device");
  const q = u.searchParams.toString();
  window.history.replaceState({}, "", u.pathname + (q ? `?${q}` : "") + u.hash);
  return true;
}

async function main() {
  const root = getRoot();
  const gateError = document.querySelector("[data-auth-gate-error]");
  const autoDevice = consumeGithubDeviceParam();

  if (isMockMode()) {
    setGateVisible(false);
    lastAuthStatus = {
      oauth_configured: false,
      device_oauth_available: false,
      connected: false,
      login: null,
    };
    startApp(root);
    return;
  }

  try {
    lastAuthStatus = await fetchAuthStatus();
  } catch {
    wireAuthLinks();
    syncConnectButtons(null);
    setGateVisible(true);
    if (gateError) gateError.textContent = "No se pudo contactar con el servidor.";
    return;
  }

  const envToken = lastAuthStatus.env_token_configured === true;
  const connectViaSession =
    lastAuthStatus.oauth_configured === true ||
    lastAuthStatus.device_oauth_available === true;
  const needsLoginGate = !lastAuthStatus.connected && connectViaSession;
  const needsSetupGate = !lastAuthStatus.connected && !connectViaSession && !envToken;

  if (needsLoginGate || needsSetupGate) {
    if (needsSetupGate) clearSessionHint();
    const rememberEl = document.querySelector("[data-session-last-login]");
    if (rememberEl) {
      const hint = needsLoginGate ? readSessionHint() : null;
      if (hint?.login) {
        rememberEl.textContent = `Última sesión en este equipo: ${hint.login}`;
        rememberEl.hidden = false;
      } else {
        rememberEl.textContent = "";
        rememberEl.hidden = true;
      }
    }
    wireAuthLinks();
    syncConnectButtons(lastAuthStatus);
    applyGateCopy(gateAuthMode());
    setGateVisible(true);
    showGateError(gateError, null);
    if (
      autoDevice &&
      lastAuthStatus.device_oauth_available &&
      !lastAuthStatus.oauth_configured &&
      !lastAuthStatus.connected
    ) {
      if (gateError) gateError.textContent = "";
      void startDeviceFlow();
    }
    return;
  }

  setGateVisible(false);
  setDeviceHint(false, "");
  if (gateError) gateError.textContent = "";
  const rememberDone = document.querySelector("[data-session-last-login]");
  if (rememberDone) {
    rememberDone.textContent = "";
    rememberDone.hidden = true;
  }
  if (lastAuthStatus.connected && lastAuthStatus.login) {
    writeSessionHint(lastAuthStatus.login);
  }
  startApp(root);
}

main();
