# Guía completa — Tamagotchi GitHub

Documentación detallada del proyecto: qué hace cada pieza, cómo fluyen los datos y cómo se comporta el juego del gato. Pensada para quien graba un vídeo, hace la defensa del hackathon o mantiene el código sin haberlo escrito.

---

## Tabla de contenidos

1. [Visión general](#1-visión-general)
2. [Estructura de carpetas](#2-estructura-de-carpetas)
3. [Tres formas de ejecutar la aplicación](#3-tres-formas-de-ejecutar-la-aplicación)
4. [Variables de entorno (`.env`)](#4-variables-de-entorno-env)
5. [Backend: FastAPI y montaje del frontend](#5-backend-fastapi-y-montaje-del-frontend)
6. [Autenticación con GitHub (OAuth)](#6-autenticación-con-github-oauth)
7. [Cómo se obtienen los datos de GitHub](#7-cómo-se-obtienen-los-datos-de-github)
8. [API HTTP: lista de rutas y contratos](#8-api-http-lista-de-rutas-y-contratos)
9. [El juego del gato (solo sesión OAuth)](#9-el-juego-del-gato-solo-sesión-oauth)
10. [Humor (`mood`): reglas en el servidor](#10-humor-mood-reglas-en-el-servidor)
11. [Frontend: archivos y flujo](#11-frontend-archivos-y-flujo)
12. [Ventana flotante (pywebview)](#12-ventana-flotante-pywebview)
13. [Empaquetado con PyInstaller](#13-empaquetado-con-pyinstaller)
14. [Buenas prácticas con Git](#14-buenas-prácticas-con-git)

---

## 1. Visión general

**Tamagotchi GitHub** es una aplicación que:

1. **Consulta la API de GitHub** para estimar actividad (commits, contribuciones, interacciones).
2. **Muestra una mascota** con estados visuales (`happy`, `neutral`, `angry`, `dead`) y un mensaje.
3. **Con sesión OAuth**, añade un **reloj de vida**: el gato “muere” si se agota el tiempo; **cada commit nuevo contado en el día UTC actual** puede **sumar segundos** (configurable).
4. Sirve la **interfaz web** desde el **mismo proceso** que la API (mismo origen → sin CORS en uso normal).

No hay base de datos: el estado del “gato” vive en la **sesión del servidor** (cookie firmada) y en **memoria** por proceso.

---

## 2. Estructura de carpetas

| Ruta | Contenido |
|------|-----------|
| `backend/main.py` | Aplicación FastAPI: rutas `/api/*`, `/auth/*`, montaje de `frontend/`. |
| `backend/github_fetcher.py` | Cliente HTTP a GitHub: eventos + GraphQL del calendario de contribuciones. |
| `backend/github_oauth.py` | URLs y intercambio de códigos/tokens OAuth (web y device flow). |
| `frontend/` | HTML, CSS, JS modular (`js/app.js`, `js/ui.js`, `js/api.js`, `shared/status.js`). |
| `frontend/shared/status.js` | Normalización del JSON de `/api/status` (contrato único para web u otras UIs). |
| `tamagotchi-float/run.py` | Ventana de escritorio con **pywebview** apuntando a `http://127.0.0.1:8000/?float=1`. |
| `launch_desktop.py` | Arranca **uvicorn** + **ventana flotante** en un solo comando; compatible con PyInstaller. |
| `main.py` (raíz) | Punto de entrada para **solo** servidor + opcional abrir navegador (importa `backend.main`). |
| `tamagotchi.spec` | Definición **PyInstaller** (qué empaquetar). |
| `packaging/build-binary.sh` | Script que instala deps de build y ejecuta PyInstaller. |
| `docs/BACKEND.md` | Contrato API y detalle del fetcher (puede estar parcialmente desactualizado frente a esta guía). |
| `.env.example` | Plantilla de variables (sin secretos reales). |

---

## 3. Tres formas de ejecutar la aplicación

### 3.1 `python main.py` (desde la raíz del repo)

- Arranca **uvicorn** con `backend.main:app`.
- Sirve API bajo `/api/*` y archivos estáticos bajo `/` (incluido `index.html`).
- Puede abrir el navegador (configurable con variables de entorno; ver `backend/main.py`).

**Uso típico:** desarrollo web o depuración con DevTools del navegador.

### 3.2 `python launch_desktop.py`

1. Carga `.env` (ver §4).
2. Comprueba que el puerto (por defecto **8000**) esté libre.
3. **Modo desarrollo:** lanza `python -m uvicorn backend.main:app` como **subproceso**.
4. **Modo ejecutable PyInstaller (`sys.frozen`):** lanza uvicorn en un **hilo daemon** dentro del mismo proceso (no puede re-ejecutar el `.exe` como intérprete).
5. Espera a que `GET /api/health` responda `ok` y `app: tamagotchi-github`.
6. Ejecuta `tamagotchi-float/run.py` → ventana pywebview.

**Uso típico:** demo “como producto” en escritorio.

### 3.3 Solo ventana (backend ya corriendo)

```bash
cd tamagotchi-float && python run.py
```

El backend debe estar activo en la URL configurada (`TAMAGOTCHI_FLOAT_URL` o por defecto `http://127.0.0.1:8000/?float=1`).

---

## 4. Variables de entorno (`.env`)

El archivo **`.env`** no debe subirse al repositorio público con secretos reales.

**Carga:**

- `launch_desktop.py` lee `.env` en: carpeta del ejecutable (si está congelado), `cwd`, y raíz del proyecto.
- `backend/main.py` no implementa dotenv propio para todo; en la práctica **launch** y muchos despliegues cargan antes el entorno.

**Variables relevantes (resumen):**

| Variable | Rol |
|----------|-----|
| `GITHUB_CLIENT_ID` | OAuth App de GitHub (device flow o web). |
| `SECRET_KEY` | Firma de cookies de sesión (Starlette `SessionMiddleware`). |
| `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT_URI` | OAuth “web” con callback. |
| `GITHUB_TOKEN`, `GITHUB_LOGIN` | Modo sin login del usuario: el **servidor** consulta GitHub como un solo usuario. |
| `TAMAGOTCHI_PET_INITIAL_SEC` | Segundos de vida al iniciar / reset (por defecto 300). |
| `TAMAGOTCHI_COMMIT_BONUS_SEC` | Segundos que suma **cada commit nuevo** contado hoy (por defecto 60). |
| `TAMAGOTCHI_COMMIT_WINDOW_SEC` | Ventana en segundos para la métrica `commits_last_5m` en el fetcher (por defecto 300). |
| `HOST`, `PORT` | Bind del servidor (por defecto `127.0.0.1:8000`). |
| `SKIP_OPEN_BROWSER`, `OPEN_BROWSER`, `UVICORN_RELOAD` | Comportamiento de `main.py`. |

---

## 5. Backend: FastAPI y montaje del frontend

- **Framework:** FastAPI.
- **Sesiones:** `SessionMiddleware` con `SECRET_KEY` para guardar token GitHub y datos del gato.
- **CORS:** abierto con `credentials` para desarrollo; en producción habría que restringir orígenes.
- **Estáticos:** si existe el directorio `frontend/`, se monta en `/` con `html=True` (sirve `index.html` en la raíz).

**Orden lógico de una petición `GET /api/status` con OAuth:**

1. Comprobar si OAuth web está configurado y si falta cookie → **401** `github_login_required`.
2. Instanciar `GithubFetcher` con el token de sesión o con `.env`.
3. Llamar `activity_metrics(max_event_pages=15)`.
4. Si hay `session_token`, ejecutar `_ensure_pet_lifecycle` (actualiza `pet_expires_at` y snapshot de commits del día).
5. Quitar `last_push_at` del dict público (`_activity_for_client`).
6. Construir `pet_timer` con `_build_pet_timer`.
7. Calcular `mood` con `_mood_from_activity`.
8. Devolver JSON `activity`, `mood`, y opcionalmente `pet_timer`.

---

## 6. Autenticación con GitHub (OAuth)

Hay **dos familias** de flujo (ver `backend/github_oauth.py` y rutas en `main.py`):

### 6.1 Device flow (recomendado en clase / sin pegar token)

1. El front llama `POST /api/auth/device/start`.
2. GitHub devuelve `user_code` y `verification_uri`.
3. El usuario autoriza en GitHub.
4. El front hace polling a `GET /api/auth/device/status` hasta `status: ok`.
5. El servidor guarda `github_access_token`, `github_login`, `pet_birth` y en el primer `/api/status` se crea `pet_expires_at` si no existía.

### 6.2 OAuth web (redirección)

1. `GET /auth/github` redirige a GitHub.
2. `GET /auth/github/callback` intercambia `code` por token, guarda sesión y redirige a la app.

### 6.3 Logout

`GET /auth/logout` borra la sesión (`session.clear()`).

### 6.4 Estado para el front

`GET /api/auth/status` indica si OAuth está configurado, si device flow está disponible, si hay sesión (`connected`), login, etc.

---

## 7. Cómo se obtienen los datos de GitHub

Implementación principal: **`GithubFetcher`** en `backend/github_fetcher.py`.

### 7.1 Identidad del usuario

- Con **token:** `GET https://api.github.com/user` → `login`.
- Sin token pero con `GITHUB_LOGIN` en env: se usa ese login para eventos **públicos**.

### 7.2 Feed de eventos

- Con token: `GET /users/{login}/events`.
- Sin token: `GET /users/{login}/events/public`.

Se **pagina** (`page`, `per_page` máx. 100). GitHub limita el historial visible (~300 eventos); si se pide una página que no existe, a veces responde **422**: el código **deja de paginar** y usa lo ya leído (no falla toda la petición).

### 7.3 Qué se cuenta en `activity_metrics`

- **PushEvent:** número de commits del push vía `distinct_size` / `size` del payload (o longitud de `commits` si hace falta).
- **Ventana `commits_last_5m`:** suma commits de pushes cuya fecha cae dentro de `TAMAGOTCHI_COMMIT_WINDOW_SEC` (alineado con el juego).
- **Interacciones 7d:** tipos definidos en `_INTERACTION_TYPES` (issues, PRs, comentarios, etc.).
- **GraphQL** del **calendario de contribuciones** (solo con token): similar al gráfico verde del perfil. El backend hace **`max`** entre cifras del feed y del calendario para varios campos, para no mostrar todo a cero si el feed va vacío.

### 7.4 Campos típicos del objeto `activity`

Incluyen entre otros: `contributions_last_24h`, `contributions_last_7d`, `commits_last_5m`, `interactions_last_7d`, `commits_today_utc`, `commits_this_week_utc`, `commits_in_events_feed`.

**`commits_today_utc`** es clave para el juego: refleja commits en el **día civil UTC** según la lógica del fetcher (eventos + refuerzo con calendario cuando aplica).

---

## 8. API HTTP: lista de rutas y contratos

### 8.1 Núcleo del producto

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Salud; debe incluir `"app": "tamagotchi-github"`. |
| GET | `/api/auth/status` | Configuración OAuth y si el usuario está conectado. |
| GET | `/api/status` | Actividad + humor; opcional `pet_timer`; cookie si OAuth. |

### 8.2 Mascota y configuración (OAuth)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/reset_pet` | Reinicia `pet_expires_at` y snapshot de commits. Requiere sesión. |
| GET | `/api/pet_config` | Devuelve `commit_bonus_sec` e `initial_sec` efectivos. |
| POST | `/api/pet_config` | JSON con uno o ambos campos; guarda en sesión (límites acotados en servidor). |

### 8.3 OAuth auxiliar

| Método | Ruta |
|--------|------|
| POST | `/api/auth/device/start` |
| GET | `/api/auth/device/status` |
| GET | `/auth/github` |
| GET | `/auth/github/callback` |
| GET | `/auth/logout` |

### 8.4 Ejemplo de `GET /api/status` (simplificado)

```json
{
  "activity": {
    "contributions_last_24h": 0,
    "contributions_last_7d": 0,
    "commits_last_5m": 0,
    "interactions_last_7d": 0,
    "commits_today_utc": 3,
    "commits_this_week_utc": 0,
    "commits_in_events_feed": 0
  },
  "mood": {
    "mood": "happy",
    "message": "…"
  },
  "pet_timer": {
    "seconds_remaining": 240,
    "initial_sec": 300,
    "commit_bonus_sec": 60,
    "window_sec": 300,
    "grace_remaining_sec": 0,
    "stale_in_sec": 240,
    "commits_last_5m": 0,
    "bar_denominator_sec": 300
  }
}
```

`pet_timer` **solo** aparece cuando hay sesión OAuth y existe `pet_expires_at` en sesión.

---

## 9. El juego del gato (solo sesión OAuth)

### 9.1 Variables en sesión (concepto)

- **`pet_expires_at`:** timestamp Unix; cuando `time.time() >= pet_expires_at`, el humor pasa a **`dead`**.
- **`pet_snap_day`:** fecha UTC `YYYY-MM-DD` del snapshot de commits.
- **`pet_snap_commits_today`:** último valor de `commits_today_utc` visto para ese día, o `-1` tras reset hasta la siguiente lectura.
- **`pet_commit_bonus_sec`**, **`pet_initial_sec`:** overrides guardados vía `POST /api/pet_config` (si no, defaults de env).

### 9.2 Inicialización (`_ensure_pet_lifecycle`)

- Si no hay `pet_expires_at`, se crea: `now + initial_sec`.
- Si el día UTC cambia respecto a `pet_snap_day`, se actualiza el snapshot sin dar “bonus fantasma” por cambio de día.
- Si `commits_today_utc` **sube** respecto al snapshot **el mismo día** y el gato **sigue vivo** (`exp > now`), se hace:  
  `pet_expires_at += (delta_commits) * commit_bonus_sec`.
- Siempre se actualiza `pet_snap_commits_today` al valor actual de `commits_today_utc`.

### 9.3 Reset (`POST /api/reset_pet`)

- Nuevo `pet_expires_at = now + initial_sec`.
- `pet_snap_commits_today = -1` para que en la siguiente lectura se re-baselinee sin contar commits viejos como nuevos.

### 9.4 `pet_timer` (`_build_pet_timer`)

Calcula `seconds_remaining = max(0, floor(pet_expires_at - now))` y metadatos para la UI (bonus, denominador de barra, etc.).

---

## 10. Humor (`mood`): reglas en el servidor

Función: **`_mood_from_activity`** en `backend/main.py`. Orden relevante:

1. **Con `pet_expires_at` (OAuth):** si el tiempo se agotó → **`dead`**.
2. **Sin `pet_expires_at` (modo env):** si no hay commits ni interacciones en la ventana usada → **`dead`**.
3. **Urgencia por poco tiempo** (OAuth, aún vivo): si quedan pocos segundos → **`angry`** con mensaje de apuro.
4. **Poca actividad semanal** (OAuth, con commits recientes en ventana): otro **`angry`** “triste”.
5. **Mucha actividad:** **`happy`**.
6. **Casi nada en la semana:** **`angry`** genérico.
7. **Por defecto:** **`neutral`**.

Los valores exactos de umbrales están en el código fuente (líneas de `_mood_from_activity`).

---

## 11. Frontend: archivos y flujo

### 11.1 Entrada

- `index.html` carga `js/app.js` como módulo ES.

### 11.2 `frontend/js/config.js`

- `API_CONFIG.baseUrl` vacío = **mismo origen** que la página.
- `?mock=1` → datos ficticios sin llamar al backend.
- `?float=1` → **poll cada 5 s** (ventana flotante); sin `float`, **60 s** entre refrescos automáticos.

### 11.3 `frontend/js/app.js`

- Pregunta **`/api/auth/status`** al cargar.
- Si hace falta login, muestra la **puerta** (`auth-gate`) y gestiona **device flow** (start, polling, UI).
- Si hay sesión o modo env con token en servidor, llama **`startApp`**: refresco periódico, botón **Nuevo gato**, formulario **Configuración** (`fetchPetConfig` / `savePetConfig`).
- **`startPetLiveTicker`:** cada **1 s** repinta contador y barra usando el último `seconds_remaining` del servidor como ancla en el tiempo (bajada fluida).

### 11.4 `frontend/js/api.js`

- `fetchStatus`, `fetchAuthStatus`, `resetPet`, `fetchPetConfig`, `savePetConfig`.
- Construcción de URLs con `apiUrl()` para mismo origen o base configurable.

### 11.5 `frontend/js/ui.js`

- **`renderStatus`:** mascota según `mood`, badge, texto, commits hoy, visibilidad del timer.
- **`syncPetLiveClock` / `paintPetLiveFrame`:** reloj local + colores de vida (verde → amarillo → rojo → crítico).
- **`data-pet-local-dead`:** si el contador local llega a 0 antes del siguiente fetch, fuerza UI **muerta** y muestra **Nuevo gato**.
- **`renderError`:** estado de error; limpia reloj en vivo.

### 11.6 `frontend/shared/status.js`

- **`normalizeStatusPayload`:** parsea `activity`, `mood`, `auth_hint`, `pet_timer` con defaults seguros.

---

## 12. Ventana flotante (pywebview)

- **`tamagotchi-float/run.py`** crea ventana con URL por defecto `http://127.0.0.1:8000/?float=1`.
- **`private_mode=False`** y **`storage_path`** persistente para que la **cookie de sesión** sobreviva entre ejecuciones (similar a un navegador).
- Bucle opcional que refuerza **`on_top`** cada segundo.

**Linux:** suelen hacer falta paquetes GTK/WebKit del sistema y a veces venv con `--system-site-packages` para PyGObject (ver `tamagotchi-float/README.md`).

**Windows:** suele usarse el motor WebView2 (Edge).

---

## 13. Empaquetado con PyInstaller

- Especificación: **`tamagotchi.spec`** (incluye `frontend/`, `backend/`, `tamagotchi-float/run.py` y dependencias recogidas con `collect_all`).
- Script: **`packaging/build-binary.sh`** (Linux/macOS; en Windows se puede invocar `pyinstaller` directamente).
- **Importante:** se genera el binario **solo para el SO donde compilas** (no un .exe desde Linux sin cross-compile).
- **`launch_desktop.py`** detecta `sys.frozen` y usa **`sys._MEIPASS`** como raíz del proyecto empaquetado.
- **No subir** `build/`, `dist/`, ni carpetas grandes de PyInstaller a GitHub (límite 100 MB por archivo; además ensucian el repo).

---

## 14. Buenas prácticas con Git

- Mantener **`build/`**, **`dist/`**, `buildpyinstaller/`, etc. en **`.gitignore`**.
- Los **secretos** van en `.env` local o en un canal seguro del equipo, no en commits públicos.
- Si se filtró un secreto, **rotarlo** en GitHub OAuth App y en `.env`.

---

## Referencias cruzadas

- Contrato técnico del fetcher y extensiones: **`docs/BACKEND.md`**.
- Plantilla de variables: **`.env.example`**.
- API interactiva en marcha: **`http://127.0.0.1:8000/docs`**.

---

*Última revisión alineada con el código del repositorio (FastAPI, relógio `pet_expires_at`, `pet_timer`, front con ticker 1 s y muerte local).*
