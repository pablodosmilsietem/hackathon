# Tamagotchi GitHub (hackathon)

Mascota según actividad en GitHub. **Ventana flotante:** `tamagotchi-float/` + API en `backend/`.

## Encender el programa

1. **Python 3.10+**, venv en la raíz del repo:
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements-desktop.txt
   ```
2. **`.env`** en la raíz (mismas claves para todo el equipo; copiad de `.env.example` si hace falta). Sin `GITHUB_CLIENT_ID` + `SECRET_KEY` (u OAuth/token según el README largo de antes) no hay datos de usuario.
3. **Un solo comando (recomendado):**
   ```bash
   python launch_desktop.py
   ```
   Arranca el API en `http://127.0.0.1:8000` y abre la ventana flotante.

**Alternativa:** `python main.py` (solo API + navegador) o dos terminales: `SKIP_OPEN_BROWSER=1 python main.py` y `cd tamagotchi-float && python run.py`.

**Linux (WebKit):** si falla la ventana, ver `tamagotchi-float/README.md` (GTK + venv `--system-site-packages`).

## Documentación útil

| Qué | Dónde |
|-----|--------|
| **Guía larga (arquitectura, OAuth, juego del gato, front, float, PyInstaller, Git)** | [`docs/GUIA_COMPLETA.md`](docs/GUIA_COMPLETA.md) |
| **Contrato API, de dónde salen commits/contribuciones, JSON, funciones Python (`GithubFetcher`, filtrado)** | [`docs/BACKEND.md`](docs/BACKEND.md) (§3.3) |
| Variables de entorno (plantilla sin secretos) | `.env.example` |
| API interactiva | Con el servidor en marcha: `http://127.0.0.1:8000/docs` |
| UI sin backend | `http://127.0.0.1:8000/?mock=1` |

## `.env` y repo público

- El equipo puede compartir un **`.env` común** por el canal que acordéis (no hace falta que esté en git).
- **Antes de publicar el repo** sin filtrar secretos: no subir `.env` al historial; rotar `SECRET_KEY` y credenciales OAuth/token si alguna vez se coló en un commit.

## Estructura rápida

`backend/` → FastAPI + GitHub · `frontend/` → UI estática · `launch_desktop.py` → API + ventana · `frontend/shared/status.js` → normalización del JSON de `/api/status`.
