# Backend — API, datos de GitHub y tareas pendientes

Todo el front habla con el servidor por HTTP (mismo origen si usáis `python main.py` o `launch_desktop.py`).

---

## 1. Los 3 endpoints “núcleo” (lo que usa la lógica del producto)

Estos son los que debéis asumir como **contrato estable** para humor, reglas del juego, otra UI, etc.:

| Método | Ruta | Para qué |
|--------|------|----------|
| `GET` | **`/api/health`** | Comprobar que el proceso correcto está vivo (`ok`, `app: tamagotchi-github`). |
| `GET` | **`/api/auth/status`** | Saber si hay sesión GitHub, modo device vs web OAuth, si hace falta login. Cookies: `credentials: "include"`. |
| `GET` | **`/api/status`** | **Datos de actividad + humor** en un solo JSON (ver §3). Cookies si usáis OAuth. |

**Errores habituales**

- `401` en `/api/status` con `{"detail":"github_login_required"}` si OAuth web está activo y no hay cookie de sesión.

**Opcional en el JSON de `/api/status`:** `auth_hint: "needs_github_connect"` (HTTP 200) si el servidor no tiene token ni OAuth usable.

---

## 2. Endpoints auxiliares (login; no los necesitáis si solo consumís datos ya logueados)

| Ruta | Uso |
|------|-----|
| `POST /api/auth/device/start`, `GET /api/auth/device/status` | Device flow OAuth. |
| `GET /auth/github`, `GET /auth/github/callback`, `GET /auth/logout` | OAuth web con callback. |

Detalle de flujos: `backend/main.py`, `backend/github_oauth.py`.

---

## 3. `GET /api/status` — estructura del JSON

```json
{
  "activity": {
    "contributions_last_24h": 0,
    "contributions_last_7d": 0,
    "interactions_last_7d": 0,
    "commits_today_utc": 0,
    "commits_this_week_utc": 0,
    "commits_in_events_feed": 0
  },
  "mood": {
    "mood": "happy",
    "message": "Texto para el usuario."
  }
}
```

### 3.1 De dónde salen los números (importante para vuestra lógica)

Hay **dos fuentes** en el backend (`backend/github_fetcher.py`):

1. **REST `GET /users/{login}/events` (y variante pública sin token)**  
   - Cuenta **`PushEvent`**: commits vía `size` / `distinct_size` del payload.  
   - Cuenta **interacciones** (`interactions_last_7d`): tipos como `IssuesEvent`, `PullRequestEvent`, comentarios, etc., en ventana ~7 días.  
   - **`commits_in_events_feed`**: suma commits de todos los `PushEvent` en las páginas leídas del feed.  
   - **Problema:** ese timeline a menudo trae **pocos eventos** o solo cosas como `MemberEvent` → sin pushes visibles, aquí sale **0** aunque en el perfil sí tengas actividad.

2. **GraphQL `viewer.contributionsCollection.contributionCalendar`** (solo si hay **token**: OAuth o `GITHUB_TOKEN`)  
   - Misma idea que el **gráfico verde del perfil** de GitHub (contribuciones diarias: commits en rama por defecto, PRs, issues que GitHub agrega al gráfico, etc.).  
   - El backend hace **`max(eventos, calendario)`** para rellenar sobre todo:  
     `contributions_last_24h`, `contributions_last_7d`, `commits_today_utc`, `commits_this_week_utc`  
     cuando el calendario aporta más que el feed REST.

**Resumen para diseñar reglas**

- **“¿Cuánto ha trabajado esta semana?”** → usad sobre todo **`contributions_last_7d`** (y/o `commits_this_week_utc`).  
- **“¿Actividad reciente?”** → **`contributions_last_24h`** + **`commits_today_utc`**.  
- **“¿Interacción social en GitHub?”** → **`interactions_last_7d`** (solo desde eventos REST; si no hay eventos, puede ser 0).  
- **“¿Cuántos commits en el feed crudo?”** (depuración / alcance API) → **`commits_in_events_feed`**.

### 3.2 `mood`

| Campo | Valores |
|-------|---------|
| `mood` | `happy` \| `neutral` \| `angry` |
| `message` | string libre |

La regla actual del servidor está en `backend/main.py` → `_mood_from_activity` (podéis cambiarla o ignorar `mood` y calcular el vuestro solo con `activity`).

### 3.3 Python: qué función saca los commits y cómo podéis filtrarlos

Todo vive en **`backend/github_fetcher.py`** (clase **`GithubFetcher`**). La ruta HTTP solo delega:

| Paso | Archivo / función | Qué hace |
|------|-------------------|----------|
| 1 | `backend/main.py` → **`api_status()`** | Crea `GithubFetcher(token=sesión)` o `GithubFetcher()` (`.env`) y llama **`activity_metrics(max_event_pages=15)`**. El humor sale de **`_mood_from_activity(activity)`** con ese dict. |
| 2 | **`GithubFetcher.activity_metrics()`** | Es el **agregador** que devuelve el JSON `activity`. Recorre eventos con **`iter_events`**, suma números por fechas, luego mezcla con **`_graphql_contribution_totals(now)`** (`max` por campo si el calendario aporta más). |
| 3 | **`resolve_login()`** | Con token: `GET /user` y guarda `login`. Sin token pero con `GITHUB_LOGIN` en env: usa ese login. |
| 4 | **`_events_path(login)`** | Con token → `GET /users/{login}/events`. Sin token → `.../events/public`. |
| 5 | **`iter_events(max_pages, per_page)`** | Pagina la API de eventos (`page` 1…`max_pages`) y hace **yield** de cada evento (dict JSON de GitHub). |
| 6 | **`_push_commit_count(payload)`** | Dado el `payload` de un **`PushEvent`**, obtiene el número de commits: primero **`distinct_size`** o **`size`**, si no hay, **`len(payload["commits"])`** (GitHub puede truncar la lista a 20; por eso prioriza `size`). |
| 7 | **`_graphql_contribution_totals(now)`** | `POST /graphql` con la query del calendario; devuelve totales por día y calcula hoy / 7 días calendario / semana ISO. |
| 8 | **`_INTERACTION_TYPES`** | `frozenset` al inicio del módulo: tipos de evento que cuentan para **`interactions_last_7d`** (no incluye `PushEvent` ni `MemberEvent`). |

**Commits uno a uno (para filtrar por repo, mensaje, autor, etc.)**

- **`iter_commits_from_push_events(max_pages)`** recorre solo **`PushEvent`**, abre `payload["commits"]` y emite objetos **`CommitInfo`** (`sha`, `message` primera línea, `repository_full_name`, `pushed_at`, `author_name`).
- Hoy **`activity_metrics`** no usa esta iteración para las cifras agregadas (usa `_push_commit_count` por push); si queréis reglas finas, podéis **importar y llamar** a `iter_commits_from_push_events` desde otro módulo o **extender** `activity_metrics`.

**Ejemplos de extensión / filtrado**

1. **Solo ciertos repos** — Dentro del `for ev in self.iter_events(...)` de `activity_metrics`, tras comprobar `PushEvent`, leed `ev.get("repo", {}).get("name")` y haced `continue` si no cumple el prefijo (p. ej. solo `mi-org/`).
2. **Cambiar qué cuenta como “interacción”** — Editad **`_INTERACTION_TYPES`** (añadir o quitar strings de `type` de la API de GitHub).
3. **Métrica nueva basada en commits reales** — Iterad `iter_commits_from_push_events`, filtrad por `CommitInfo.repository_full_name` o `message`, y sumad; podéis añadir claves al `dict` que devuelve `activity_metrics` (y actualizar `frontend/shared/status.js` + UI si hace falta exponerlo).
4. **Ignorar GraphQL** — Comentad o condicionad la llamada a **`_graphql_contribution_totals`** en `activity_metrics` si solo queréis números del feed REST.

**Dataclass de referencia**

```text
CommitInfo(sha, message, repository_full_name, pushed_at, author_name?)
```

---

## 4. Cómo usar esto en vuestro código (ejemplos mínimos)

**JavaScript (misma web / otro front con CORS resuelto)**

```js
const r = await fetch("/api/status", { credentials: "include" });
const data = await r.json();
const { activity, mood } = data;
if (activity.contributions_last_7d > 10) {
  /* vuestra lógica */
}
```

**Python (otro servicio)**

```python
import urllib.request
req = urllib.request.Request("http://127.0.0.1:8000/api/status")
with urllib.request.urlopen(req) as r:
    data = json.load(r)
```

Si dependéis de **sesión OAuth**, el cliente debe guardar/enviar la **cookie** de sesión (`credentials: "include"` en el navegador).

**Normalización de nombres** (por si el backend devuelve alias): `frontend/shared/status.js` → `normalizeStatusPayload`.

---

## 5. Tareas / mejoras que quedan (backend)

Prioridad libre; lista orientativa:

- [ ] **Caché** de respuestas GitHub (menos riesgo de rate limit; TTL configurable).  
- [ ] **Tests** (pytest) de `activity_metrics` / parsing GraphQL con fixtures JSON.  
- [ ] Afinar semántica de **`contributions_last_24h`** (hoy es mezcla “rolling desde eventos” + “hoy UTC” del calendario).  
- [ ] **Reglas de humor** configurables (env o JSON) en lugar de solo `_mood_from_activity`.  
- [ ] **CORS** restrictivo si el front vive en otro origen (ahora `*` en desarrollo).  
- [ ] Documentar / exponer **rate limits** restantes en cabeceras o log.  
- [ ] Opcional: endpoint extra solo lectura (`GET /api/activity/raw`) para depuración sin tocar el contrato del Tamagotchi.

---

## 6. Variables de entorno (recordatorio)

Plantilla: **`.env.example`**. Relevantes: `GITHUB_CLIENT_ID`, `SECRET_KEY`, OAuth web opcional, `GITHUB_TOKEN` / `GITHUB_LOGIN`, `GITHUB_OAUTH_SCOPES`, `TAMAGOTCHI_GITHUB_LOG`, `HOST`, `PORT`.

---

## 7. Modo mock (solo UI)

URL con **`?mock=1`**: el JS no llama al API real; datos ficticios en `frontend/js/api.js`.
