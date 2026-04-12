"""
API REST bajo /api/* y frontend estático en /. Un solo proceso para desarrollo.

OAuth GitHub (opcional):
- Device flow: solo GITHUB_CLIENT_ID (+ SECRET_KEY para cookies); el usuario autoriza en github.com sin pegar tokens.
- OAuth web: CLIENT_ID + SECRET + REDIRECT_URI; redirección clásica.
Sin eso, GITHUB_TOKEN / GITHUB_LOGIN en .env como antes.
"""

from __future__ import annotations

import logging
import os
import secrets
import threading
import time
import webbrowser
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from backend.github_fetcher import GithubFetcher
from backend.github_oauth import (
    authorization_url,
    device_oauth_available,
    exchange_code_for_token,
    fetch_github_login,
    oauth_configured,
    poll_device_access_token,
    request_device_authorization,
)

logger = logging.getLogger(__name__)


def _configure_backend_logging() -> None:
    """
    Uvicorn deja el logger raíz en WARNING: los `logger.info` de `backend.*` no se imprimen.
    Enganchamos un StreamHandler en el logger padre `backend` (recibe la propagación desde
    backend.main, backend.github_fetcher, etc.).
    """
    pkg = logging.getLogger("backend")
    pkg.setLevel(logging.INFO)
    if not pkg.handlers:
        h = logging.StreamHandler()
        h.setLevel(logging.INFO)
        h.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
        pkg.addHandler(h)
    pkg.propagate = False


_configure_backend_logging()

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"

_SESSION_SECRET = os.environ.get("SECRET_KEY", "dev-insecure-cambia-SECRET_KEY-en-produccion")


def _sanitize_return_to(raw: str | None) -> str:
    """Solo rutas relativas (evita redirecciones abiertas)."""
    if raw is None or not str(raw).strip():
        return "/"
    s = str(raw).strip()
    if "\n" in s or "\r" in s or len(s) > 2048:
        return "/"
    if "://" in s or not s.startswith("/") or s.startswith("//"):
        return "/"
    return s


def _env_github_configured() -> bool:
    return bool(
        os.environ.get("GITHUB_TOKEN", "").strip()
        or os.environ.get("GITHUB_LOGIN", "").strip()
    )


def _append_query(dest: str, key: str, value: str) -> str:
    sep = "&" if "?" in dest else "?"
    return f"{dest}{sep}{key}={value}"


app = FastAPI(
    title="Tamagotchi GitHub API",
    description="Backend del hackathon. Contrato del front: ver docs/BACKEND.md",
    version="0.1.0",
)

app.add_middleware(
    SessionMiddleware,
    secret_key=_SESSION_SECRET,
    same_site="lax",
    https_only=False,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def api_health():
    # Incluido para que launch_desktop compruebe que el proceso en PORT es ESTE backend
    # (si 8000 está ocupado por otra app, no confundir /api/health genérico con la nuestra).
    return {"ok": True, "app": "tamagotchi-github"}


@app.get("/api/auth/status")
def api_auth_status(request: Request):
    """Si OAuth está configurado, el front debe comprobar `connected` antes de pedir /api/status."""
    token = request.session.get("github_access_token")
    login = request.session.get("github_login")
    return {
        "oauth_configured": oauth_configured(),
        "device_oauth_available": device_oauth_available(),
        "connected": bool(token),
        "login": login if isinstance(login, str) else None,
        "env_token_configured": _env_github_configured(),
    }


@app.post("/api/auth/device/start")
def api_auth_device_start(request: Request):
    """Device flow: solo GITHUB_CLIENT_ID; el usuario autoriza en github.com (sin pegar tokens)."""
    if oauth_configured():
        return JSONResponse(status_code=400, content={"detail": "web_oauth_active"})
    if not device_oauth_available():
        logger.warning("device/start rechazado: no hay GITHUB_CLIENT_ID en entorno")
        return JSONResponse(status_code=400, content={"detail": "device_flow_unavailable"})

    cid = os.environ.get("GITHUB_CLIENT_ID", "").strip()
    logger.info(
        "device/start: POST a GitHub /login/device/code | client_id longitud=%s primeros_chars=%r",
        len(cid),
        cid[:10] if cid else "",
    )

    try:
        raw = request_device_authorization()
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        raw_text = (e.response.text or "")[:800]
        logger.error(
            "device/start GitHub HTTP %s | URL pedida: %s | cuerpo (recorte): %r",
            status,
            str(e.request.url),
            raw_text,
        )
        msg = "github_error"
        try:
            body = e.response.json()
            if isinstance(body.get("error_description"), str):
                msg = body["error_description"]
            elif isinstance(body.get("error"), str):
                msg = body["error"]
        except Exception:
            msg = (e.response.text or str(e))[:500]
        low = str(msg).strip().lower()
        if status == 404 or low == "not found":
            msg = (
                "GitHub respondió 404: el Client ID no es válido o la app no acepta device flow. "
                "Copia GITHUB_CLIENT_ID otra vez desde la OAuth App (letra O al inicio, no el número 0; "
                "revisa l minúscula vs 1 vs I). En GitHub → tu OAuth App → activa «Device flow». "
                "Guarda .env y reinicia el servidor."
            )
        return JSONResponse(status_code=502, content={"detail": msg})
    except httpx.RequestError as e:
        logger.exception("device/start error de red hacia GitHub: %s", e)
        return JSONResponse(status_code=502, content={"detail": str(e)[:200]})

    device_code = raw.get("device_code")
    if not isinstance(device_code, str) or not device_code:
        logger.error("device/start respuesta GitHub sin device_code: claves=%s", list(raw.keys()))
        return JSONResponse(status_code=502, content={"detail": "invalid_device_response"})
    user_code = raw.get("user_code")
    verification_uri = raw.get("verification_uri")
    if not isinstance(user_code, str) or not isinstance(verification_uri, str):
        logger.error(
            "device/start respuesta incompleta: user_code_ok=%s verification_uri_ok=%s",
            isinstance(user_code, str),
            isinstance(verification_uri, str),
        )
        return JSONResponse(status_code=502, content={"detail": "invalid_device_response"})

    interval = max(5, int(raw.get("interval", 5)))
    expires_in = int(raw.get("expires_in", 900))
    request.session["github_device_code"] = device_code
    request.session["github_device_interval"] = interval
    request.session["github_device_expires_at"] = time.time() + expires_in

    logger.info("device/start OK | user_code=%s | verification_uri=%s", user_code, verification_uri)

    return {
        "user_code": user_code,
        "verification_uri": verification_uri,
        "interval": interval,
    }


@app.get("/api/auth/device/status")
def api_auth_device_status(request: Request):
    code = request.session.get("github_device_code")
    if not isinstance(code, str) or not code:
        return {"status": "idle"}

    exp = request.session.get("github_device_expires_at")
    if isinstance(exp, (int, float)) and time.time() > exp:
        request.session.pop("github_device_code", None)
        request.session.pop("github_device_interval", None)
        request.session.pop("github_device_expires_at", None)
        return {"status": "expired"}

    interval = request.session.get("github_device_interval", 5)
    if not isinstance(interval, int):
        interval = 5

    try:
        data = poll_device_access_token(code)
    except Exception:
        return {"status": "pending", "interval": interval}

    if not isinstance(data, dict):
        return {"status": "pending", "interval": interval}

    tok = data.get("access_token")
    if isinstance(tok, str) and tok:
        try:
            login = fetch_github_login(tok)
        except Exception:
            request.session.pop("github_device_code", None)
            return {"status": "error", "message": "user_lookup_failed"}
        request.session["github_access_token"] = tok
        request.session["github_login"] = login
        request.session.pop("github_device_code", None)
        request.session.pop("github_device_interval", None)
        request.session.pop("github_device_expires_at", None)
        return {"status": "ok"}

    err = data.get("error")
    if err == "authorization_pending":
        return {"status": "pending", "interval": interval}
    if err == "slow_down":
        interval = min(60, interval + 5)
        request.session["github_device_interval"] = interval
        return {"status": "pending", "interval": interval}
    if err in ("expired_token", "access_denied"):
        request.session.pop("github_device_code", None)
        request.session.pop("github_device_interval", None)
        request.session.pop("github_device_expires_at", None)
        return {"status": "error", "message": str(err)}
    if err:
        request.session.pop("github_device_code", None)
        request.session.pop("github_device_interval", None)
        request.session.pop("github_device_expires_at", None)
        return {"status": "error", "message": str(err)}
    return {"status": "pending", "interval": interval}


@app.get("/auth/github")
def auth_github_start(
    request: Request,
    return_to: str | None = Query(default=None, max_length=2048),
):
    dest = _sanitize_return_to(return_to)
    request.session["oauth_return_to"] = dest
    if not oauth_configured():
        if device_oauth_available():
            # Solo CLIENT_ID (device flow): el enlace /auth/github no puede ir a GitHub sin secret;
            # devolvemos a la app con señal para abrir el flujo por dispositivo.
            ok_url = _append_query(dest, "github_device", "1")
            return RedirectResponse(url=ok_url, status_code=302)
        err_url = _append_query(dest, "error", "oauth_not_configured")
        return RedirectResponse(url=err_url, status_code=302)
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state
    return RedirectResponse(url=authorization_url(state), status_code=302)


@app.get("/auth/github/callback")
def auth_github_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    ret = _sanitize_return_to(request.session.get("oauth_return_to"))
    if error:
        q = f"error={quote(error)}"
        if error_description:
            q += f"&msg={quote(error_description)}"
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_return_to", None)
        sep = "&" if "?" in ret else "?"
        return RedirectResponse(url=f"{ret}{sep}{q}", status_code=302)
    if not code or not state:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_return_to", None)
        return RedirectResponse(url=_append_query(ret, "error", "missing_oauth_params"), status_code=302)
    saved = request.session.get("oauth_state")
    if not saved or saved != state:
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_return_to", None)
        return RedirectResponse(url=_append_query(ret, "error", "invalid_state"), status_code=302)
    request.session.pop("oauth_state", None)
    try:
        access_token = exchange_code_for_token(code)
        login = fetch_github_login(access_token)
        request.session["github_access_token"] = access_token
        request.session["github_login"] = login
    except Exception:
        request.session.pop("oauth_return_to", None)
        return RedirectResponse(url=_append_query(ret, "error", "token_exchange_failed"), status_code=302)
    request.session.pop("oauth_return_to", None)
    return RedirectResponse(url=ret, status_code=302)


@app.get("/auth/logout")
def auth_logout(request: Request, return_to: str | None = Query(default=None, max_length=2048)):
    request.session.clear()
    dest = _sanitize_return_to(return_to)
    return RedirectResponse(url=dest, status_code=302)


def _mood_from_activity(activity: dict[str, int]) -> dict[str, str]:
    c24 = activity["contributions_last_24h"]
    c7 = activity["contributions_last_7d"]
    i7 = activity["interactions_last_7d"]
    if c7 >= 20 or c24 >= 8:
        return {
            "mood": "happy",
            "message": "¡Buen ritmo en GitHub! Sigue con esos commits.",
        }
    if c7 == 0 and c24 == 0 and i7 <= 1:
        return {
            "mood": "angry",
            "message": "Casi nada esta semana… un commit y el gato mejora el humor.",
        }
    return {
        "mood": "neutral",
        "message": f"Últimos 7 d: {c7} commits, {i7} interacciones. Tú puedes.",
    }


@app.get("/api/status")
def api_status(request: Request):
    """Con OAuth activo hace falta sesión; si no, se usan variables de entorno del servidor."""
    session_token = request.session.get("github_access_token")
    if oauth_configured() and not session_token:
        return JSONResponse(
            status_code=401,
            content={"detail": "github_login_required"},
        )

    try:
        src = "sesión OAuth" if session_token else "GITHUB_TOKEN / GITHUB_LOGIN en .env"
        logger.info("GET /api/status → fuente GitHub: %s", src)
        if session_token:
            fetcher = GithubFetcher(token=str(session_token))
        else:
            fetcher = GithubFetcher()
        activity = fetcher.activity_metrics(max_event_pages=15)
        mood = _mood_from_activity(activity)
        logger.info(
            "GET /api/status → mood=%s c7d=%s (ver líneas «GitHub» si hay ceros)",
            mood.get("mood"),
            activity.get("contributions_last_7d"),
        )
    except ValueError as e:
        err = str(e)
        auth_hint = (
            "needs_github_connect"
            if "GITHUB_LOGIN" in err or "GITHUB_TOKEN" in err
            else None
        )
        body: dict[str, object] = {
            "activity": {
                "contributions_last_24h": 0,
                "contributions_last_7d": 0,
                "interactions_last_7d": 0,
                "commits_today_utc": 0,
                "commits_this_week_utc": 0,
                "commits_in_events_feed": 0,
            },
            "mood": {
                "mood": "neutral",
                "message": f"GitHub no disponible: {e}. Revisa token o conexión.",
            },
        }
        if auth_hint:
            body["auth_hint"] = auth_hint
        return body
    except Exception as e:
        logger.exception("GET /api/status → error al hablar con GitHub: %s", e)
        return {
            "activity": {
                "contributions_last_24h": 0,
                "contributions_last_7d": 0,
                "interactions_last_7d": 0,
                "commits_today_utc": 0,
                "commits_this_week_utc": 0,
                "commits_in_events_feed": 0,
            },
            "mood": {
                "mood": "neutral",
                "message": f"GitHub no disponible: {e}. Revisa token o conexión.",
            },
        }
    return {"activity": activity, "mood": mood}


def _mount_frontend() -> None:
    if not FRONTEND_DIR.is_dir():
        return
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


_mount_frontend()


def _should_open_browser() -> bool:
    if os.environ.get("SKIP_OPEN_BROWSER", "").lower() in ("1", "true", "yes"):
        return False
    if os.environ.get("OPEN_BROWSER", "").lower() in ("0", "false", "no"):
        return False
    return True


def run_dev() -> None:
    """Arranca uvicorn; opcionalmente abre el navegador (desde la raíz del repo: python main.py)."""
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    url = f"http://{host}:{port}/"

    if _should_open_browser():

        def open_browser() -> None:
            time.sleep(0.8)
            webbrowser.open(url)

        threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=os.environ.get("UVICORN_RELOAD", "").lower() in ("1", "true", "yes"),
    )


if __name__ == "__main__":
    run_dev()
