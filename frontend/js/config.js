/**
 * Punto único para conectar con el backend real.
 * Ese backend debería agregar datos de la API de GitHub (usuario / eventos / contribuciones),
 * no solo `git` en un repo local.
 *
 * - Pon useMock: false y ajusta baseUrl / endpoints cuando tengas el API.
 * - Si el servidor usa otra ruta, solo cambia `endpoints.status`.
 */
export const API_CONFIG = {
  baseUrl: "http://127.0.0.1:8000",
  endpoints: {
    status: "/api/status",
  },
  /** true = no hace fetch; usa datos ficticios con la misma forma que el API real */
  useMock: true,
  /** Simula latencia de red (ms) en modo mock */
  mockDelayMs: 450,
};
