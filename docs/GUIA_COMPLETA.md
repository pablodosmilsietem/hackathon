# Guía completa — Tamagotchi GitHub

Esta guía explica el proyecto **desde cero**: qué problema resuelve, qué vería una persona que solo abre el programa, y cómo encajan el código del servidor, la página web y la ventana de escritorio. Está pensada para **defensa de hackathon**, **vídeo demo** o **alguien nuevo en el repo** que no ha tocado FastAPI ni OAuth.

Si ya dominas backend/web, puedes ir directo a la [tabla de contenidos](#tabla-de-contenidos) y saltar la sección “Empieza aquí”.

---

## Empieza aquí si no sabes nada del proyecto

### ¿Qué es esto, en una frase?

Es una **aplicación que mira tu actividad en GitHub** (commits, contribuciones, algo de interacciones) y **muestra un gato** que cambia de estado según esa actividad. Si **inicias sesión con GitHub**, además el gato tiene un **temporizador de vida**: si el tiempo llega a cero, el gato “muere”; **cada commit nuevo que cuente como “de hoy”** (según reglas del programa) puede **alargar** ese tiempo.

No es un juego con niveles ni puntuación global: es un **recordatorio gamificado** de mantener ritmo en el repositorio.

### Analogía rápida: Tamagotchi + GitHub

Un **Tamagotchi** clásico pide que lo alimentes o juegues con él. Aquí, en lugar de pulsar “comida”, la “comida” es **hacer cosas en GitHub** (sobre todo **commits**). El servidor **no mira tu teclado**: solo lo que **GitHub expone por su API** sobre tu cuenta.

### Tres piezas que tienes que tener claras

1. **El servidor (backend)**  
   Un programa en **Python** que:
   - Escucha en un **puerto** de tu máquina (por defecto `8000`).
   - Habla con **api.github.com** usando un **token** (tuyo, tras OAuth, o uno fijo del `.env` en modo demo).
   - Devuelve **JSON** (datos estructurados) en rutas como `/api/status`.
   - También **sirve los archivos** de la carpeta `frontend/` (HTML, CSS, JS) para que el navegador muestre la interfaz.

2. **La interfaz (frontend)**  
   Página web (`index.html` + JavaScript) que:
   - Pide datos al servidor (por ejemplo “¿cómo está el gato?”).
   - Dibuja el gato, el texto, la barra de tiempo, los botones.
   - Puede estar en el **navegador** o dentro de una **ventana de escritorio** que por dentro es casi un mini-navegador (**pywebview**).

3. **GitHub**  
   La fuente de verdad de “¿qué ha hecho este usuario?”. No guardamos una copia de tus repos en disco: **cada vez** (o cada X segundos) el servidor **vuelve a preguntar** a GitHub.

### ¿Qué significa “conectar con GitHub”?

GitHub no deja que cualquier página web lea tu actividad privada sin permiso. Por eso usamos **OAuth**: tú autorizas a **nuestra aplicación** (registrada en GitHub como “OAuth App”) y GitHub nos da un **token de acceso** temporal. Ese token se guarda en una **sesión del servidor** (normalmente en una **cookie** cifrada/firmada en tu navegador). Con ese token, nuestro backend puede llamar a la API en tu nombre.

**Sin conectar:** si el proyecto está configurado con `GITHUB_TOKEN` y `GITHUB_LOGIN` en `.env`, el servidor puede mostrar datos de **un único usuario fijo** (útil para demos sin que cada persona configure OAuth).

### Mini glosario (términos que salen en el código y en esta guía)

| Término | Significado sencillo |
|--------|------------------------|
| **API** | Interfaz por la que un programa pide datos a otro por red. Aquí, la **REST API** y algo de **GraphQL** de GitHub. |
| **JSON** | Formato de texto para enviar datos (objetos con campos como `"mood": "happy"`). |
| **FastAPI** | Framework en Python para definir rutas HTTP (`GET /api/status`) y validar respuestas. |
| **Uvicorn** | Servidor que **ejecuta** la app FastAPI y atiende peticiones HTTP. |
| **Cookie de sesión** | Pequeño dato que el navegador guarda y reenvía al servidor; aquí lleva un ID de sesión o datos firmados para saber “quién eres” tras el login. |
| **OAuth** | Protocolo para “iniciar sesión con GitHub” sin que escribas tu contraseña en nuestra página (vas a GitHub y vuelves). |
| **Device flow** | Variante de OAuth para dispositivos: GitHub te da un **código** que introduces en el navegador; la app hace **polling** hasta que apruebas. |
| **Polling** | Volver a preguntar al servidor cada pocos segundos (“¿ya está listo?” / “¿hay datos nuevos?”). |
| **UTC** | Hora universal. “Commits hoy” en el juego usa el **día en UTC**, no la medianoche de tu zona horaria (importante si explicas el hackathon en España y el servidor cuenta otro día). |
| **CORS** | Reglas del navegador sobre si una página en un dominio puede llamar a un API en otro. Aquí, al servir front y API en el **mismo origen** (`127.0.0.1:8000`), casi no te afecta en desarrollo. |
| **PyInstaller** | Herramienta que empaqueta Python + dependencias en un **ejecutable** para Windows/Linux. |

---

## Tabla de contenidos

1. [Visión general](#1-visión-general)
2. [Historia de un uso: qué pasa al abrir la app](#2-historia-de-un-uso-qué-pasa-al-abrir-la-app)
3. [Estructura de carpetas](#3-estructura-de-carpetas)
4. [Tres formas de ejecutar la aplicación](#4-tres-formas-de-ejecutar-la-aplicación)
5. [Variables de entorno (`.env`)](#5-variables-de-entorno-env)
6. [Backend: FastAPI y montaje del frontend](#6-backend-fastapi-y-montaje-del-frontend)
7. [Autenticación con GitHub (OAuth)](#7-autenticación-con-github-oauth)
8. [Cómo se obtienen los datos de GitHub](#8-cómo-se-obtienen-los-datos-de-github)
9. [API HTTP: rutas y qué devuelven](#9-api-http-rutas-y-qué-devuelven)
10. [El juego del gato (solo con sesión OAuth)](#10-el-juego-del-gato-solo-con-sesión-oauth)
11. [Humor del gato (`mood`): reglas exactas del código](#11-humor-del-gato-mood-reglas-exactas-del-código)
12. [Frontend: archivos y flujo detallado](#12-frontend-archivos-y-flujo-detallado)
13. [Ventana flotante (pywebview)](#13-ventana-flotante-pywebview)
14. [Empaquetado con PyInstaller](#14-empaquetado-con-pyinstaller)
15. [Buenas prácticas con Git](#15-buenas-prácticas-con-git)
16. [Referencias](#16-referencias)

---

## 1. Visión general

**Tamagotchi GitHub** hace cuatro cosas encadenadas:

1. **Obtiene métricas de actividad** desde GitHub (commits en ventanas de tiempo, contribuciones tipo calendario del perfil, interacciones en issues/PRs, etc.). La lógica está en `backend/github_fetcher.py`.

2. **Decide el “humor” del gato** (`happy`, `neutral`, `angry`, `dead`) y un **mensaje** legible. Eso está en `backend/main.py` en `_mood_from_activity`.

3. **Si el usuario ha hecho OAuth** (sesión con token en cookie), activa un **reloj de vida**:
   - Al empezar (o al pulsar “Nuevo gato”) el gato tiene **X segundos** (por defecto 300 = 5 minutos, configurable).
   - Cuando GitHub reporta **más commits hoy (UTC)** que la última vez que miramos, el servidor **suma** `bonus × número de commits nuevos` al tiempo que queda (por defecto 60 s por commit).
   - Si el reloj llega a **0**, el estado pasa a **muerto** hasta que resetees o vuelvas a ganar tiempo con commits antes de que muera de nuevo (el mensaje lo explica en la UI).

4. **Sirve la interfaz web** desde el **mismo servidor** que el API. Así la URL es algo como `http://127.0.0.1:8000/` y las peticiones a `/api/...` van al mismo sitio: no hace falta configurar CORS para un origen distinto en el caso típico.

**Importante:** no usamos base de datos. El estado del gato (cuándo expira, cuántos commits “vimos” el último día, overrides de configuración) vive en la **sesión en memoria del proceso** + **cookie** que identifica esa sesión. Si reinicias el servidor sin persistencia externa, las sesiones pueden perderse (depende de cómo esté montado el middleware de sesiones).

---

## 2. Historia de un uso: qué pasa al abrir la app

Imagina que ejecutas `python launch_desktop.py` en la raíz del proyecto.

1. **Arranca el servidor** en segundo plano (o en un hilo si es el ejecutable empaquetado). Empieza a escuchar en `127.0.0.1:8000`.

2. **Se abre una ventana pequeña** (pywebview) que carga una URL con `?float=1`. Eso le dice al JavaScript que está en **modo flotante**: refresca datos **cada 5 segundos** en lugar de cada 60.

3. La página carga `index.html` → `js/app.js`. Lo **primero** que hace el JS es llamar a **`GET /api/auth/status`**.

4. **Si OAuth está configurado** y **no** tienes sesión:
   - Verás la **pantalla de “conectar”** (código de dispositivo o enlace a GitHub, según el flujo).
   - Hasta que no haya token en sesión, **`GET /api/status`** puede responder **401** con `github_login_required`: el front sabe que debe mostrar la puerta de login, no el gato con datos reales.

5. **Cuando ya hay sesión** (o en modo `.env` con token del servidor):
   - El front llama **`GET /api/status`** de forma periódica.
   - El servidor contacta con GitHub, calcula actividad, actualiza el **ciclo de vida del gato** si aplica, calcula `mood` y opcionalmente `pet_timer`.
   - El front **pinta** el sprite, el texto, “commits hoy”, la barra de tiempo.
   - Además corre un **ticker local cada 1 segundo** para que el número y la barra **bajen suavemente** entre una respuesta del servidor y la siguiente; si localmente llega a 0, la UI puede mostrar **muerte al instante** sin esperar al siguiente fetch.

6. Si pulsas **“Nuevo gato”**, el front hace **`POST /api/reset_pet`**: el servidor reinicia el temporizador y el snapshot de commits para no “regalar” tiempo por commits viejos.

Esa secuencia es la que puedes **narrar en un vídeo** casi literalmente.

---

## 3. Estructura de carpetas

Aquí qué es **cada carpeta/archivo importante** y **por qué existe**.

| Ruta | Qué es y para qué sirve |
|------|-------------------------|
| `backend/main.py` | **Cerebro HTTP**: define rutas `/api/*`, `/auth/*`, monta sesiones, llama al fetcher, aplica reglas del gato y del humor, sirve estáticos. |
| `backend/github_fetcher.py` | **Cliente GitHub**: descarga eventos (pushes, etc.), interpreta payloads, opcionalmente GraphQL del calendario de contribuciones, y devuelve un diccionario `activity_metrics`. |
| `backend/github_oauth.py` | **Detalles OAuth**: URLs de autorización, device flow, intercambio de código por token. |
| `frontend/` | **Interfaz**: HTML, CSS, JS. No contiene secretos; solo lógica de UI y llamadas al API. |
| `frontend/js/app.js` | Arranque: auth, polling, ticker del reloj, botones reset/config. |
| `frontend/js/ui.js` | Cómo se ve el gato, mensajes, barra, estados visuales (incl. muerte local). |
| `frontend/js/api.js` | Funciones `fetch` a las rutas del backend. |
| `frontend/js/config.js` | `baseUrl`, detección `?mock=1` y `?float=1`. |
| `frontend/shared/status.js` | Normaliza el JSON de `/api/status` para que el resto del código no asuma campos siempre presentes. |
| `tamagotchi-float/run.py` | **Solo la ventana**: abre pywebview apuntando al servidor. |
| `launch_desktop.py` | **Un solo comando**: sube el API y luego la ventana; adaptado a desarrollo y a ejecutable PyInstaller. |
| `main.py` (raíz) | Entrada alternativa: **solo servidor** (y opcional abrir navegador), sin pywebview. |
| `tamagotchi.spec` | Receta de PyInstaller: qué archivos incluir en el binario. |
| `packaging/build-binary.sh` | Automatiza instalación de herramientas de build y ejecución de PyInstaller. |
| `docs/BACKEND.md` | Documentación más técnica del contrato del fetcher (complementa esta guía). |
| `.env.example` | Lista de variables **sin valores secretos** para que el equipo copie y rellene. |

---

## 4. Tres formas de ejecutar la aplicación

### 4.1 `python main.py` (raíz del repo)

- Levanta **Uvicorn** con la aplicación `backend.main:app`.
- En `http://127.0.0.1:8000/` tienes la **misma web** que en la ventana flotante.
- Útil para **inspeccionar con DevTools** (F12), ver la consola de red, depurar CSS/JS.

**Cuándo usarlo:** desarrollo web o cuando pywebview te da problemas en Linux y quieres validar solo el API + navegador.

### 4.2 `python launch_desktop.py` (recomendado para demo)

Pasos internos (resumidos pero completos):

1. Busca y carga **`.env`** desde ubicaciones razonables (incluida la carpeta del `.exe` si está empaquetado).
2. Comprueba que el **puerto** (por defecto 8000) esté libre; si no, avisa y sale.
3. **Si no estás en un binario PyInstaller:** lanza `python -m uvicorn backend.main:app` como **subproceso** (proceso hijo separado).
4. **Si estás en PyInstaller (`sys.frozen`):** no puede volver a invocar `python`; en su lugar arranca Uvicorn en un **hilo** dentro del mismo proceso.
5. Hace **polling** a `GET /api/health` hasta ver respuesta correcta (app `tamagotchi-github`).
6. Ejecuta `tamagotchi-float/run.py` para abrir la ventana con `?float=1`.

### 4.3 Solo la ventana (API ya en marcha)

En una terminal: `SKIP_OPEN_BROWSER=1 python main.py` (o similar). En otra:

```bash
cd tamagotchi-float && python run.py
```

La URL por defecto apunta a `http://127.0.0.1:8000/?float=1`; puedes cambiarla con **`TAMAGOTCHI_FLOAT_URL`** si el servidor está en otro sitio.

---

## 5. Variables de entorno (`.env`)

El archivo **`.env`** es texto con líneas `NOMBRE=valor`. Sirve para **no meter secretos en el código** ni en git.

**Quién lo lee:** sobre todo `launch_desktop.py` al arrancar el escritorio. Si solo ejecutas `uvicorn` a mano sin cargar dotenv, tendrás que **exportar** las variables en la shell tú mismo.

### Tabla explicada (no solo nombres)

| Variable | Para qué la necesitas |
|----------|------------------------|
| `GITHUB_CLIENT_ID` | Identificador público de tu OAuth App en GitHub. Sin esto, el login con GitHub no arranca. |
| `SECRET_KEY` | Cadena larga y aleatoria para **firmar cookies** de sesión. Si la filtras, alguien podría falsificar sesiones: cámbiala en producción. |
| `GITHUB_CLIENT_SECRET` | Secreto del OAuth App; solo para flujo **web** con callback (`/auth/github/callback`). |
| `GITHUB_OAUTH_REDIRECT_URI` | URL exacta registrada en GitHub que coincide con tu callback. |
| `GITHUB_TOKEN` | Token personal u OAuth de **un** usuario; el servidor consulta GitHub **sin** que cada visitante inicie sesión. |
| `GITHUB_LOGIN` | Nombre de usuario de GitHub a consultar cuando no hay token (solo eventos **públicos**). |
| `TAMAGOTCHI_PET_INITIAL_SEC` | Segundos de vida al crear/resetear el gato (default 300). |
| `TAMAGOTCHI_COMMIT_BONUS_SEC` | Segundos que se **añaden por cada commit nuevo** detectado hoy (default 60). |
| `TAMAGOTCHI_COMMIT_WINDOW_SEC` | Ventana en segundos usada para contar “commits recientes” en métricas tipo `commits_last_5m` (default 300). |
| `HOST`, `PORT` | Dónde escucha el servidor (default `127.0.0.1` y `8000`). |
| `SKIP_OPEN_BROWSER`, `OPEN_BROWSER`, `UVICORN_RELOAD` | Comportamiento de `main.py` (abrir navegador, recarga automática al editar código). |

---

## 6. Backend: FastAPI y montaje del frontend

### ¿Qué es “montar el frontend”?

Significa que FastAPI **también** responde con archivos estáticos: si pides `/`, te devuelve `frontend/index.html`; si pides `/css/style.css`, sirve ese archivo. No necesitas un segundo servidor solo para la web.

### Piezas técnicas

- **FastAPI:** defines funciones Python decoradas con `@app.get("/ruta")` que devuelven dicts (se serializan a JSON) o `JSONResponse`.
- **SessionMiddleware:** antes de llegar a tu ruta, Starlette rellena `request.session` (un diccionario persistente por cookie).
- **CORS:** en desarrollo suele estar permisivo; en producción real deberías limitar orígenes.

### Qué hace el servidor en `GET /api/status` (orden real)

Cuando llega una petición con usuario ya autenticado por OAuth (cookie con sesión):

1. Si OAuth está “obligatorio” en configuración y **no** hay `github_access_token` en sesión → responde **401** y un cuerpo que el front interpreta como “hay que iniciar sesión”.
2. Crea un **`GithubFetcher`** con el token de sesión (o sin token si el modo es `.env`).
3. Ejecuta **`activity_metrics(max_event_pages=15)`**: esto puede tardar un poco porque pide varias páginas de eventos y a veces GraphQL.
4. Si hay sesión OAuth, llama **`_ensure_pet_lifecycle`**: aquí se comparan commits de hoy con el snapshot guardado y se alarga `pet_expires_at` si toca.
5. **`_activity_for_client`**: limpia campos que no quieres exponer tal cual (por ejemplo detalles internos).
6. **`_build_pet_timer`**: calcula `seconds_remaining` y números para la barra.
7. **`_mood_from_activity`**: elige `happy` / `neutral` / `angry` / `dead` y el mensaje.
8. Devuelve JSON con `activity`, `mood` y, si aplica, `pet_timer`.

Si GitHub falla o falta configuración, el código intenta devolver un JSON **útil** (ceros y mensaje de error) en lugar de tumbar toda la página sin explicación.

---

## 7. Autenticación con GitHub (OAuth)

### Por qué no pedimos tu contraseña

La forma correcta es que **GitHub** te autentique y nos devuelva un **token** con permisos acotados. Así nunca almacenamos tu contraseña.

### Device flow (muy usado en hackathon)

Ideal cuando la app es local y no quieres pelearte con redirects:

1. El navegador (o pywebview) llama **`POST /api/auth/device/start`**.
2. El backend pide a GitHub un flujo de dispositivo y recibe `user_code`, `verification_uri`, etc.
3. Tú abres GitHub en el navegador, introduces el código y aceptas.
4. El front pregunta cada pocos segundos **`GET /api/auth/device/status`** hasta que el backend ha podido intercambiar el código por token.
5. El servidor guarda en sesión `github_access_token`, `github_login`, etc. A partir de ahí `/api/status` ya usa **tu** cuenta.

### OAuth web (redirección)

1. **`GET /auth/github`** → redirección a GitHub.
2. Usuario acepta → GitHub llama a tu **`/auth/github/callback?code=...`**.
3. El backend intercambia `code` por token y guarda sesión.

### Logout

**`GET /auth/logout`** vacía la sesión. El gato asociado a esa sesión deja de existir para ese navegador (hasta que vuelvas a iniciar sesión y se cree de nuevo).

### `GET /api/auth/status`

El front usa esto para saber: ¿está configurado OAuth?, ¿puedo usar device flow?, ¿ya hay `connected`?, ¿cuál es mi `login`?

---

## 8. Cómo se obtienen los datos de GitHub

Todo gira en torno a **`GithubFetcher`** (`backend/github_fetcher.py`).

### Identidad

- **Con token:** `GET /user` → campo `login`.
- **Sin token:** necesitas `GITHUB_LOGIN` en `.env` para saber de qué usuario pedir eventos públicos.

### Feed de eventos

GitHub devuelve una lista de **eventos** (PushEvent, IssuesEvent, etc.). Nosotros nos quedamos sobre todo con **PushEvent** para contar commits asociados a cada push.

La API pagina resultados. Hay un detalle incómodo: más allá de ~300 eventos, pedir otra página puede devolver **HTTP 422**. Eso **no** es un bug nuestro: significa “no hay más páginas”. El código **rompe el bucle** y se queda con lo ya descargado, en lugar de marcar error fatal.

### `activity_metrics`: qué agrega

- Commits por push (usando `distinct_size` / `size` del JSON del push, o la lista de commits si hace falta).
- **Ventana reciente** (`commits_last_5m` en el JSON del cliente): en realidad usa `TAMAGOTCHI_COMMIT_WINDOW_SEC` segundos hacia atrás desde “ahora” (el nombre histórico dice “5m” pero es configurable).
- **Interacciones en 7 días:** issues, PRs, comentarios, etc., según tipos definidos en el fetcher.
- **Calendario de contribuciones (GraphQL)** si hay token: parecido al gráfico verde del perfil. El backend combina con **`max`** frente a cifras del feed para no mostrar todo a cero si una fuente falla o va vacía.

### Campo estrella para el juego: `commits_today_utc`

Es el número de commits que el fetcher considera pertenecientes al **día actual en UTC**. El servidor compara este número entre refrescos para decidir cuántos “commits nuevos” suman tiempo al gato.

---

## 9. API HTTP: rutas y qué devuelven

### Rutas principales

| Método | Ruta | Qué hace en lenguaje humano |
|--------|------|------------------------------|
| GET | `/api/health` | “¿El servidor está vivo y es esta app?” |
| GET | `/api/auth/status` | “¿Puedo loguearme? ¿Ya estoy logueado?” |
| GET | `/api/status` | “Dame actividad + humor + (si OAuth) datos del temporizador.” |

### Mascota (requiere sesión OAuth)

| Método | Ruta | Qué hace |
|--------|------|----------|
| POST | `/api/reset_pet` | Reinicia vida y snapshot de commits. |
| GET | `/api/pet_config` | Lee bonus e initial efectivos (sesión o defaults). |
| POST | `/api/pet_config` | Guarda en sesión nuevos valores (con límites en servidor). |

### OAuth

| POST | `/api/auth/device/start` |
| GET | `/api/auth/device/status` |
| GET | `/auth/github` |
| GET | `/auth/github/callback` |
| GET | `/auth/logout` |

### Ejemplo de respuesta de `/api/status`

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

**`pet_timer`** solo aparece si hay sesión OAuth y ya existe `pet_expires_at` en sesión.

---

## 10. El juego del gato (solo con sesión OAuth)

### Idea intuitiva

- Piensa en **`pet_expires_at`** como la **hora límite** (en segundos desde epoch Unix) en la que el gato muere si no has ganado más tiempo.
- Cada vez que el servidor ve que **`commits_today_utc` ha aumentado** respecto al valor guardado **en el mismo día UTC**, interpreta que has hecho **N commits nuevos** y hace:  
  **nuevo límite = límite anterior + N × bonus**  
  (solo si el gato **aún no** había expirado en ese momento).

### Variables en sesión (qué significan)

- **`pet_expires_at`:** momento exacto (timestamp) en el que el tiempo se agota.
- **`pet_snap_day`:** qué día UTC estamos usando para el snapshot (string `YYYY-MM-DD`).
- **`pet_snap_commits_today`:** último `commits_today_utc` que ya “contamos” para no volver a bonificar los mismos commits.
- **`pet_commit_bonus_sec` / `pet_initial_sec`:** si el usuario los cambió en el formulario, aquí están los overrides.

### `_ensure_pet_lifecycle` (lógica de negocio)

- Si no existía `pet_expires_at`, se crea como **ahora + initial_sec**.
- Si cambia el día UTC, se actualiza el día del snapshot sin aplicar trucos raros entre días.
- Si suben los commits hoy y el gato sigue vivo, se extiende la expiración.
- Siempre se actualiza el snapshot al último `commits_today_utc` visto.

### Reset

**`POST /api/reset_pet`:** nueva expiración = ahora + initial; snapshot de commits a **-1** para que en el **siguiente** `/api/status` se re-base el contador y no cuentes commits antiguos como si fueran recién hechos.

### `pet_timer`

Es la “foto” para la UI: cuántos segundos quedan **ahora**, con qué bonus, con qué denominador pintar la barra, etc. El servidor manda un valor; el cliente lo usa como **ancla** y entre peticiones **interpola** hacia abajo cada segundo para suavidad.

---

## 11. Humor del gato (`mood`): reglas exactas del código

La función es **`_mood_from_activity`** en `backend/main.py`. Se evalúa **en este orden** (lo primero que coincida gana):

1. **OAuth con `pet_expires_at`:** si `ahora >= pet_expires_at` → **`dead`**, mensaje de tiempo agotado y pista de “Nuevo gato” o commits.

2. **Sin `pet_expires_at` (modo `.env` sin reloj de mascota):** si `contributions_last_7d == 0` **y** `interactions_last_7d == 0` → **`dead`**, mensaje “Has matado al gato :(”.

3. **Poco tiempo restante (OAuth, aún vivo):** si `seconds_remaining > 0` y además `seconds_remaining <= max(30, initial_sec // 5)` → **`angry`**, mensaje de urgencia con los segundos aproximados.

4. **Tristeza por ritmo (OAuth, aún vivo):** si quedan segundos, `commits_last_7d <= 2`, `contributions_last_24h == 0` y `commits_last_5m > 0` → **`angry`**, mensaje de poca actividad semanal.

5. **Muy activo:** si `contributions_last_7d >= 20` **o** `contributions_last_24h >= 8` → **`happy`**.

6. **Casi inactivo:** si `commits_last_7d == 0` y `contributions_last_24h == 0` y `interactions_last_7d <= 1` → **`angry`**.

7. **Por defecto:** **`neutral`** con un resumen numérico de la semana.

Así puedes explicar en la defensa **por qué** un usuario ve `angry` aunque el temporizador no haya llegado a cero: el humor mezcla **tiempo** y **métricas de actividad**.

---

## 12. Frontend: archivos y flujo detallado

### Punto de entrada

`index.html` carga **`js/app.js`** como **módulo ES** (`type="module"`). Eso permite `import` entre archivos JS.

### `config.js`

- **`API_CONFIG.baseUrl`:** cadena vacía = las peticiones van al **mismo host** que la página (típico).
- **`?mock=1`:** no llama al backend; genera datos falsos para diseñar la UI sin GitHub.
- **`?float=1`:** modo ventana flotante → intervalo de refresco **5 s**; sin eso, **60 s**.

### `app.js` (orquestación)

1. Al cargar: **`fetchAuthStatus`**.
2. Si toca login: muestra **`auth-gate`**, inicia device flow o enlaces según respuesta del servidor.
3. Si ya hay datos: **`startApp`** registra el intervalo de **`fetchStatus`**, enseña botón **Nuevo gato** y formulario de **configuración** del gato.
4. **`startPetLiveTicker`:** cada **1000 ms** llama a la lógica que **decrementa visualmente** el tiempo usando la última respuesta del servidor como referencia temporal.

### `api.js`

Centraliza URLs (`apiUrl`), `fetch` con `credentials: 'include'` donde hace falta (para mandar la **cookie de sesión**), y funciones nombradas (`fetchStatus`, `resetPet`, …).

### `ui.js` (presentación)

- **`renderStatus`:** traduce el último JSON a DOM: imagen del gato, clases CSS, texto, visibilidad del bloque del timer.
- **`syncPetLiveClock` / `paintPetLiveFrame`:** colores de la barra (verde → amarillo → rojo → crítico) según fracción de tiempo restante.
- **Atributo `data-pet-local-dead`:** si el reloj local llega a 0 antes del próximo fetch, la UI muestra **muerto** de inmediato y deja listo el flujo de **Nuevo gato**.
- **`renderError`:** estado roto/red/GitHub; para el ticker para no mostrar números mentirosos.

### `shared/status.js`

**`normalizeStatusPayload`** asegura que aunque falte algún campo en el JSON, el resto del código recibe números por defecto (0) y objetos vacíos razonables. Así hay **un solo contrato** de datos para la UI.

---

## 13. Ventana flotante (pywebview)

**`tamagotchi-float/run.py`** crea una ventana nativa que por dentro renderiza HTML con el motor web del sistema.

- URL por defecto con **`?float=1`** para el polling rápido.
- **`private_mode=False`** y **`storage_path`** persistente: las **cookies** (sesión OAuth) pueden **sobrevivir** entre ejecuciones, como en un navegador normal.
- Opcionalmente mantiene la ventana **siempre encima** (`on_top`).

**Linux:** a menudo necesitas librerías GTK/WebKit del sistema; a veces un venv con acceso a paquetes del sistema para PyGObject. Detalles en `tamagotchi-float/README.md`.

**Windows:** suele usarse **WebView2** (componente de Edge).

---

## 14. Empaquetado con PyInstaller

- **`tamagotchi.spec`** lista qué carpetas copiar (`frontend`, `backend`, etc.) y qué dependencias empaquetar.
- **`packaging/build-binary.sh`** automatiza el build en Unix.
- El binario resultante es **específico del sistema operativo** donde compilas.
- En runtime, **`sys.frozen`** y **`sys._MEIPASS`** indican “estoy dentro del exe” y dónde están los archivos extraídos.
- **No subas** `build/`, `dist/`, ni artefactos enormes a GitHub: superan límites y ensucian el historial.

---

## 15. Buenas prácticas con Git

- Ignora en **`.gitignore`** carpetas de build (`build/`, `dist/`, `buildpyinstaller/`, etc.).
- Nunca commitees **`.env`** con secretos reales en un repo público.
- Si un token se filtró, **revócalo** en GitHub y genera otro.

---

## 16. Referencias

- Contrato y detalle del fetcher: **`docs/BACKEND.md`**
- Plantilla de entorno: **`.env.example`**
- API interactiva con el servidor en marcha: **`http://127.0.0.1:8000/docs`**

---

*Guía ampliada para lectores sin contexto previo del proyecto; alineada con el reloj `pet_expires_at`, `pet_timer`, ticker de 1 s en el front y reglas de `_mood_from_activity` en `backend/main.py`.*
