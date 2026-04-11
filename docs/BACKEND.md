# Guía del backend para el equipo

Este documento describe **qué debe implementar el backend** para que el frontend (Tamagotchi GitHub) funcione sin cambios de lógica: solo HTTP + JSON con un contrato fijo.

El front **siempre habla con el servidor por HTTP** (`fetch`). En desarrollo, un solo comando levanta API y archivos estáticos juntos (mismo origen, sin CORS).

---

## Cómo lo ejecuta todo el mundo (recomendado)

Desde la **raíz del repositorio**, con el entorno virtual activado y dependencias instaladas:

```bash
python main.py
```

Se abre el navegador en `http://127.0.0.1:8000/` con la UI. Las peticiones del JS van a **`GET /api/status`** en el mismo host y puerto.

Variables de entorno opcionales:

| Variable        | Valor por defecto | Uso                          |
|----------------|-------------------|------------------------------|
| `HOST`         | `127.0.0.1`       | Interfaz de escucha          |
| `PORT`         | `8000`            | Puerto                       |
| `UVICORN_RELOAD` | (vacío)         | `1` o `true` para hot-reload |

Alternativa equivalente:

```bash
python -m backend.main
```

Documentación interactiva de FastAPI: `http://127.0.0.1:8000/docs`.

---

## Contrato HTTP que debe cumplir el backend

### `GET /api/health` (opcional pero recomendada)

Respuesta JSON mínima para comprobar que el servicio vive:

```json
{ "ok": true }
```

### `GET /api/status` (obligatoria para el Tamagotchi)

**Content-Type:** `application/json`

**Cuerpo:** un objeto con dos claves de nivel superior: `activity` y `mood`.

```json
{
  "activity": {
    "contributions_last_24h": 4,
    "contributions_last_7d": 23,
    "interactions_last_7d": 12
  },
  "mood": {
    "mood": "happy",
    "message": "Texto corto para el usuario."
  }
}
```

#### `activity` (números enteros ≥ 0)

| Campo                      | Significado (acordado con el equipo) |
|----------------------------|--------------------------------------|
| `contributions_last_24h`   | Actividad tipo “contribuciones” en GitHub en ~24 h |
| `contributions_last_7d`    | Igual, ventana 7 días                |
| `interactions_last_7d`     | Interacciones agregadas (PRs, issues, comentarios, etc.) |

La definición exacta de cada métrica la decidís vosotros (llamadas a la API de GitHub, caché, reglas de negocio). El front solo muestra los números y el mensaje de humor.

#### `mood`

| Campo     | Tipo   | Valores permitidos              |
|-----------|--------|----------------------------------|
| `mood`    | string | `happy`, `neutral`, `angry`     |
| `message` | string | Cualquier texto (frase al usuario) |

Si enviáis otro valor en `mood`, el frontend lo tratará como `neutral`. Si preferis podemos poner que el front decida el valor y la api solo mande datos.

---

## Alias de campos (compatibilidad)

Si el backend ya devuelve otros nombres, el frontend puede mapearlos **sin tocar el resto de la app**: editad `normalizeStatusPayload` en `frontend/js/api.js`. Hoy acepta, entre otros:

- En lugar de `contributions_last_24h`: `github_contributions_last_24h`, `commits_last_24h`
- En lugar de `contributions_last_7d`: `github_contributions_last_7d`, `commits_last_7d`
- En lugar de `interactions_last_7d`: `github_interactions_last_7d`, `public_events_last_7d`, `push_events_last_7d`

Idealmente el backend nuevo usa ya los nombres canónicos de la tabla anterior.

---

## Dónde está el código de ejemplo

En `backend/main.py`:

- `api_health` y `api_status` son **plantilla**: sustituid la lógica de `api_status` por GitHub, base de datos, etc.
- Se monta la carpeta `frontend/` en `/` para servir HTML, CSS y JS.

No rompáis la ruta `/api/status` sin avisar al equipo de front, o actualizad `frontend/js/config.js` (`endpoints.status`).

---

## GitHub API (orientación)

- El **token** y las llamadas a GitHub deben vivir en el **servidor** (variables de entorno, nunca en el repo ni en el JS del navegador).
- Cabecera típica: `Authorization: Bearer <token>` o `token` según el tipo de token.
- Límites de rate: conviene caché en memoria o en disco para demos.

Podéis añadir en `.env` (y en `.env.example` sin secretos) variables como `GITHUB_TOKEN`, `GITHUB_LOGIN`, etc., y leerlas con `pydantic-settings` (ya está en `requirements.txt`).

---

## Si el front y el API van en orígenes distintos

Ejemplo: front en `http://localhost:5500` y API en `http://127.0.0.1:8000`.

1. Configurar **CORS** en FastAPI para permitir el origen del front (en `backend/main.py` ya hay `allow_origins=["*"]` para desarrollo; en producción restringid orígenes).
2. En `frontend/js/config.js`, poned `baseUrl: "http://127.0.0.1:8000"` (u origen real del API).

En el flujo **un solo comando** (`python main.py`) esto no hace falta: `baseUrl` vacío y mismas rutas relativas.

---

## Modo mock del frontend (solo UI)

Si alguien trabaja solo en diseño sin levantar Python, puede abrir la app con **`?mock=1`** en la URL. El JS no llama al API y usa datos ficticios definidos en `frontend/js/api.js`.

---

## Resumen para quien implementa el backend

1. Mantener **`GET /api/status`** con JSON `activity` + `mood` como arriba (o alias soportados en `normalizeStatusPayload`).
2. Implementar la lógica real dentro de `api_status` (o en módulos importados desde ahí).
3. Probar con `python main.py` y comprobar en red del navegador que `GET /api/status` devuelve 200 y el JSON esperado.

Si cambiáis el contrato, actualizad este archivo y avisad al equipo de front.
