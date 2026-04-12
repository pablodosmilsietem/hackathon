"""OAuth App de GitHub: autorización y canje de código por access_token (solo servidor)."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlencode

import httpx

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"
DEVICE_CODE_URL = "https://github.com/login/device/code"
DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
API_USER = "https://api.github.com/user"

# La API de eventos (/users/…/events) no incluye pushes a repos privados sin permiso de repo.
# Por defecto pedimos read:user + repo; si solo quieres actividad pública, en .env:
# GITHUB_OAUTH_SCOPES=read:user
def _oauth_scopes() -> str:
    raw = os.environ.get("GITHUB_OAUTH_SCOPES", "").strip()
    if raw:
        return raw
    return "read:user repo"


def oauth_configured() -> bool:
    return bool(
        os.environ.get("GITHUB_CLIENT_ID", "").strip()
        and os.environ.get("GITHUB_CLIENT_SECRET", "").strip()
        and os.environ.get("GITHUB_OAUTH_REDIRECT_URI", "").strip()
    )


def device_oauth_available() -> bool:
    """
    OAuth por «device flow»: solo hace falta GITHUB_CLIENT_ID en .env (sin secret ni callback).
    En GitHub: OAuth App → activar «Device flow».
    """
    if oauth_configured():
        return False
    return bool(os.environ.get("GITHUB_CLIENT_ID", "").strip())


def authorization_url(state: str) -> str:
    params = {
        "client_id": os.environ["GITHUB_CLIENT_ID"].strip(),
        "redirect_uri": os.environ["GITHUB_OAUTH_REDIRECT_URI"].strip(),
        "scope": _oauth_scopes(),
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def exchange_code_for_token(code: str) -> str:
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            TOKEN_URL,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "client_id": os.environ["GITHUB_CLIENT_ID"].strip(),
                "client_secret": os.environ["GITHUB_CLIENT_SECRET"].strip(),
                "code": code,
                "redirect_uri": os.environ["GITHUB_OAUTH_REDIRECT_URI"].strip(),
            },
        )
        r.raise_for_status()
        data = r.json()
    token = data.get("access_token")
    if not isinstance(token, str) or not token:
        raise RuntimeError(f"Respuesta OAuth sin access_token: {data!r}")
    return token


def request_device_authorization() -> dict[str, Any]:
    """Paso 1 del device flow: códigos para que el usuario autorice en el navegador."""
    client_id = os.environ["GITHUB_CLIENT_ID"].strip()
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            DEVICE_CODE_URL,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "client_id": client_id,
                "scope": _oauth_scopes(),
            },
        )
        r.raise_for_status()
        return r.json()


def poll_device_access_token(device_code: str) -> dict[str, Any]:
    """
    Paso 2: canjear device_code. Respuesta JSON con access_token o error
    (p. ej. authorization_pending mientras el usuario no ha autorizado).
    """
    client_id = os.environ["GITHUB_CLIENT_ID"].strip()
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            TOKEN_URL,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "client_id": client_id,
                "device_code": device_code,
                "grant_type": DEVICE_GRANT,
            },
        )
    try:
        data = r.json()
    except Exception:
        return {"error": "invalid_response", "error_description": r.text[:300]}
    if not isinstance(data, dict):
        return {"error": "invalid_response"}
    return data


def fetch_github_login(access_token: str) -> str:
    with httpx.Client(timeout=30.0) as client:
        r = client.get(
            API_USER,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {access_token}",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        r.raise_for_status()
        login = r.json().get("login")
    if not isinstance(login, str) or not login:
        raise RuntimeError("No se pudo leer el login de GitHub")
    return login
