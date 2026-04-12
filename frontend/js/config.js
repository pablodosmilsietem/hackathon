/**
 * Contrato con el backend: siempre se hace fetch a rutas HTTP (mismo origen por defecto).
 *
 * - `baseUrl: ""` → URLs relativas (recomendado con `python main.py`: API y front en el mismo host).
 * - Si el front se sirve en otro puerto/origen, pon aquí el origen del API, ej. "http://127.0.0.1:8000".
 *
 * Modo mock (sin backend): añade `?mock=1` a la URL de la página (solo desarrollo del UI).
 */
export const API_CONFIG = {
  /** Origen del API; vacío = mismo origen que la página */
  baseUrl: "",
  endpoints: {
    status: "/api/status",
  },
  /** Retraso simulado en modo `?mock=1` (ms) */
  mockDelayMs: 450,
};

/**
 * @returns {boolean}
 */
export function isMockMode() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mock") === "1";
}

/**
 * Ventana flotante (pywebview): `?float=1` en la URL → poll cada 5 s y sin botón manual.
 * @returns {boolean}
 */
export function isFloatMode() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("float") === "1";
}
