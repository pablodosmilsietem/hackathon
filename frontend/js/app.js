import { isMockMode } from "./config.js";
import { fetchStatus } from "./api.js";
import { renderError, renderStatus, setLoading } from "./ui.js";

const POLL_MS = 60_000;

function getRoot() {
  const el = document.querySelector("[data-app]");
  if (!el) throw new Error("Falta [data-app] en el HTML");
  return el;
}

async function refresh() {
  const root = getRoot();
  setLoading(root, true);
  try {
    const data = await fetchStatus();
    renderStatus(data, root);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    renderError(
      isMockMode()
        ? `${msg} (revisa MOCK en api.js o normalizeStatusPayload)`
        : `${msg}. ¿Backend en marcha (python main.py)? ¿CORS si usas otro origen?`,
      root,
    );
  } finally {
    setLoading(root, false);
  }
}

function main() {
  const root = getRoot();
  const refreshBtn = root.querySelector("[data-action-refresh]");
  refreshBtn?.addEventListener("click", () => {
    void refresh();
  });

  void refresh();
  setInterval(() => {
    void refresh();
  }, POLL_MS);
}

main();
