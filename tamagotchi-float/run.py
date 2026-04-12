#!/usr/bin/env python3
"""
Ventana pequeña siempre encima que muestra el dashboard del Tamagotchi (mismo backend que la web).

  # Con el backend en marcha (raíz del hackathon: python main.py):
  python run.py

Requisitos: ver README.md (Fedora: python3-gobject + webkit; venv con --system-site-packages).
"""

from __future__ import annotations

import argparse
import os
import sys
import time


def _webview_storage_path() -> str:
    """
    Carpeta para cookies/datos del WebKit (pywebview).
    Por defecto pywebview usa private_mode=True y no persiste cookies: al cerrar la ventana
    se perdía la sesión de GitHub. Con private_mode=False y este path, la cookie del backend
    sobrevive entre ejecuciones (misma lógica que un navegador normal).
    """
    override = os.environ.get("TAMAGOTCHI_WEBVIEW_STORAGE", "").strip()
    if override:
        return os.path.expanduser(override)
    base = os.environ.get("XDG_STATE_HOME", "").strip()
    if not base:
        base = os.path.join(os.path.expanduser("~"), ".local", "state")
    return os.path.join(base, "tamagotchi-github", "webview")


def _pin_always_on_top_loop() -> None:
    """
    Refuerza periódicamente la ventana 'siempre encima'. Algunos escritorios u otras
    apps con on_top pueden quitárselo; este bucle lo vuelve a aplicar.
    """
    time.sleep(0.4)
    while True:
        time.sleep(1.0)
        try:
            import webview

            for w in webview.windows:
                w.on_top = True
        except Exception:
            pass


def main() -> int:
    # ?float=1 → front: poll cada 5 s, actualización automática; «Nuevo gato» si humor muerto + OAuth
    default_url = os.environ.get("TAMAGOTCHI_FLOAT_URL", "http://127.0.0.1:8000/?float=1")

    p = argparse.ArgumentParser(description="Mini ventana flotante (always on top) del Tamagotchi.")
    p.add_argument("--url", default=default_url, help="URL del frontend (por defecto env TAMAGOTCHI_FLOAT_URL o localhost:8000)")
    p.add_argument("--width", type=int, default=360, help="Ancho de la ventana")
    p.add_argument("--height", type=int, default=540, help="Alto de la ventana")
    p.add_argument("--no-on-top", action="store_true", help="Desactivar siempre encima")
    args = p.parse_args()

    try:
        import webview
    except ImportError:
        print(
            "Falta pywebview. Activa tu venv y ejecuta:\n  pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 1

    # on_top: ventana por encima del resto de apps (incl. VS Code / Cursor) en la mayoría de escritorios
    webview.create_window(
        "Tamagotchi GitHub",
        args.url,
        width=args.width,
        height=args.height,
        resizable=True,
        on_top=not args.no_on_top,
    )
    storage_path = _webview_storage_path()
    os.makedirs(storage_path, exist_ok=True)
    # private_mode=False → cookies persistentes (GTK: SQLite bajo storage_path).
    start_kw = dict(private_mode=False, storage_path=storage_path)
    try:
        if args.no_on_top:
            webview.start(**start_kw)
        else:
            webview.start(func=_pin_always_on_top_loop, **start_kw)
    except webview.errors.WebViewException:
        print(
            "\npywebview no encuentra GTK ni Qt en este Python.\n\n"
            "En Fedora (y muchas distros) hace falta:\n"
            "  1) Paquetes del sistema, por ejemplo:\n"
            "     sudo dnf install python3-gobject gtk3 webkitgtk4.1\n"
            "     (si no existe webkitgtk4.1: dnf search webkitgtk)\n"
            "  2) Que el venv vea PyGObject del sistema. Recrea el venv:\n"
            "     rm -rf .venv\n"
            "     python3 -m venv .venv --system-site-packages\n"
            "     source .venv/bin/activate && pip install -r requirements.txt\n\n"
            "Alternativa: dependencias Qt en el venv (más pesado):\n"
            "  pip install 'pywebview[qt]'\n",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
