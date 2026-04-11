"""
API REST bajo /api/* y frontend estático en /. Un solo proceso para desarrollo.

El equipo puede sustituir la lógica de `api_status` por llamadas a la API de GitHub,
manteniendo la misma forma JSON (ver docs/BACKEND.md).
"""

from __future__ import annotations

import os
import threading
import time
import webbrowser
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"

app = FastAPI(
    title="Tamagotchi GitHub API",
    description="Backend del hackathon. Contrato del front: ver docs/BACKEND.md",
    version="0.1.0",
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
    return {"ok": True}


@app.get("/api/status")
def api_status():
    """
    Respuesta de ejemplo. Sustituir por métricas reales (GitHub API, BD, etc.).
    """
    return {
        "activity": {
            "contributions_last_24h": 0,
            "contributions_last_7d": 0,
            "interactions_last_7d": 0,
        },
        "mood": {
            "mood": "neutral",
            "message": "Backend de ejemplo: implementad aquí la lógica con GitHub.",
        },
    }


def _mount_frontend() -> None:
    if not FRONTEND_DIR.is_dir():
        return
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


_mount_frontend()


def run_dev() -> None:
    """Arranca uvicorn y abre el navegador (desde la raíz del repo: python main.py)."""
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    url = f"http://{host}:{port}/"

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
