# Tamagotchi Git — Hackathon de productividad

Proyecto de hackathon tipo **Tamagotchi** ligado a **Git**: la mascota refleja tu ritmo de trabajo según commits (y, más adelante, pushes u otras métricas). Si llevas tiempo sin commitear, “se enfada”; si hay buena actividad, está contenta.

Hay dos partes: un **backend en Python** (API que lee el repositorio con Git) y un **frontend** (página web que muestra la mascota y los datos).

---

## Requisitos previos

| Qué | Para qué |
|-----|----------|
| **Python 3.10 o superior** (recomendado 3.11+) | Backend y herramientas (`venv`, `pip`) |
| **Git** instalado y en el `PATH` | El backend ejecutará comandos como `git log` sobre el repo que vigiles |
| Navegador moderno | Para abrir el frontend |

No hace falta instalar Node.js si sirves el HTML/CSS/JS con el servidor estático de Python (ver más abajo).

---

## Entorno virtual de Python (obligatorio recomendado)

Así no mezclas las librerías de este proyecto con las del sistema u otros proyectos.

Desde la **carpeta raíz del repo** (`hackathon/`):

**Linux y macOS**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows (PowerShell o CMD)**

```bash
python -m venv .venv
.venv\Scripts\activate
```

Cuando el entorno está activo, el prompt suele mostrar `(.venv)`. Para salir más tarde: `deactivate`.

---

## Instalar las librerías de Python

Con el entorno virtual **activado**:

```bash
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### Qué instala `requirements.txt`

| Paquete | Uso en el proyecto |
|---------|-------------------|
| **fastapi** | Framework para la API REST |
| **uvicorn** | Servidor ASGI para ejecutar FastAPI (`uvicorn ...`) |
| **pydantic-settings** | Leer configuración desde variables de entorno (por ejemplo ruta del repo Git) |

---

## Configuración opcional

Puedes copiar el ejemplo de variables de entorno:

```bash
cp .env.example .env
```

Edita `.env` y, si quieres vigilar **otro** repositorio (no la carpeta del hackathon), descomenta y ajusta `GIT_REPO_PATH` con la ruta absoluta a ese repo.

---

## Cómo ejecutar (cuando el backend esté implementado)

Con el venv activo y desde la raíz del proyecto:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

El API quedará en `http://127.0.0.1:8000` (la documentación interactiva de FastAPI suele estar en `/docs`).

**Frontend estático** (otra terminal):

```bash
cd frontend
python3 -m http.server 5500
```

Abre `http://127.0.0.1:5500` en el navegador. Si el JavaScript llama al API, revisa que la URL del backend en el front coincida con el puerto donde corre `uvicorn`.

---

## Estructura del repo (resumen)

- `backend/` — código Python (API, lectura de Git, lógica del “humor”).
- `backend/requirements.txt` — lista de librerías para `pip install -r`.
- `frontend/` — HTML, CSS y JS de la interfaz tipo Tamagotchi.
- `.env.example` — plantilla de variables de entorno.
- `.gitignore` — archivos que no deben subirse al repo (por ejemplo `.venv/`, `.env`).

Si el archivo `backend/main.py` aún no tiene la app FastAPI, los comandos de `uvicorn` fallarán hasta que esté creado el punto de entrada de la API.
