# Tamagotchi GitHub — Hackathon de productividad

Mascota tipo **Tamagotchi** cuyo humor refleja **actividad agregada en GitHub** (definida por el backend). El **frontend solo habla con una API HTTP** (`fetch`); el equipo puede cambiar la lógica del servidor sin tocar el JS, respetando el contrato JSON.

---

## Arranque en un solo comando

Con el venv activo y dependencias instaladas, **desde la raíz del repo**:

```bash
python main.py
```

Se abre el navegador en `http://127.0.0.1:8000/` con la UI y las peticiones van a `GET /api/status` en el mismo origen.

Documentación del contrato y cómo montar el backend: **[docs/BACKEND.md](docs/BACKEND.md)**.

---

## Requisitos previos

| Qué | Para qué |
|-----|----------|
| **Python 3.10+** (recomendado 3.11+) | Backend y `venv` |
| **Navegador moderno** | Interfaz Tamagotchi |

Node.js **no** es necesario para el front en desarrollo (se sirve con FastAPI).

---

## Entorno virtual e instalación

Desde la raíz del proyecto (`hackathon/`):

**Linux / macOS**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

**Windows**

```bash
python -m venv .venv
.venv\Scripts\activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

---

## Dependencias Python (`backend/requirements.txt`)

| Paquete | Uso |
|---------|-----|
| **fastapi** | API REST |
| **uvicorn** | Servidor ASGI |
| **pydantic-settings** | Variables de entorno (opcional; GitHub token, etc.) |

---

## Frontend y API

- **`frontend/js/config.js`**: `baseUrl` vacío = mismo origen que la página (recomendado con `python main.py`). Si el API está en otro host, pon aquí su URL.
- **Mock sin backend**: abre la app con **`?mock=1`** en la URL (datos ficticios en `frontend/js/api.js`).

---

## Estructura del repo

| Ruta | Contenido |
|------|-----------|
| `main.py` | Entrada: API + estáticos + abrir navegador |
| `backend/main.py` | FastAPI: rutas `/api/*` y montaje de `frontend/` |
| `frontend/` | HTML, CSS, JS |
| `docs/BACKEND.md` | Contrato HTTP/JSON para quien implementa el backend |
| `.env.example` | Plantilla de variables (token GitHub, etc.) |

---

## Más ayuda

- Contrato detallado, CORS y GitHub: [docs/BACKEND.md](docs/BACKEND.md).
- API interactiva con el servidor en marcha: `http://127.0.0.1:8000/docs`.
