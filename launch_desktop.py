#!/usr/bin/env python3
"""
Arranca el backend (uvicorn) y la ventana flotante en un solo paso.

- Desarrollo: `python launch_desktop.py` (venv con backend + pywebview).
- Binario (PyInstaller): ROOT = sys._MEIPASS; uvicorn va en un hilo daemon.
"""

from __future__ import annotations

import atexit
import importlib.util
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

_FROZEN = getattr(sys, "frozen", False)


def _project_root() -> Path:
    if _FROZEN:
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


ROOT = _project_root()
FLOAT_SCRIPT = ROOT / "tamagotchi-float" / "run.py"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = os.environ.get("PORT", "8000")
HEALTH_URL = f"http://{HOST}:{PORT}/api/health"


def _port_in_use(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.4):
            return True
    except OSError:
        return False


def _load_dotenv() -> None:
    paths: list[Path] = [Path.cwd() / ".env", ROOT / ".env"]
    if _FROZEN:
        paths.insert(0, Path(sys.executable).resolve().parent / ".env")
    seen: set[Path] = set()
    for path in paths:
        try:
            path = path.resolve()
        except OSError:
            continue
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def _wait_for_backend_running(is_alive, timeout_s: float = 45.0) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if not is_alive():
            raise RuntimeError("El backend se cerró antes de quedar listo (revisa el puerto).")
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=1) as r:
                body = r.read().decode("utf-8", errors="replace")
            data = json.loads(body)
            if data.get("ok") is True and data.get("app") == "tamagotchi-github":
                return
        except (urllib.error.URLError, OSError, json.JSONDecodeError, TypeError, ValueError):
            pass
        time.sleep(0.25)
    raise TimeoutError(f"No responde {HEALTH_URL} a tiempo.")


def _start_uvicorn_subprocess() -> subprocess.Popen:
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host",
        HOST,
        "--port",
        str(PORT),
        "--log-level",
        "info",
    ]
    return subprocess.Popen(cmd, cwd=ROOT)


def _start_uvicorn_thread() -> threading.Thread:
    """En binario PyInstaller no se puede usar `sys.executable -m uvicorn` (re-ejecutaría el .exe)."""

    def runner() -> None:
        import uvicorn

        os.chdir(ROOT)
        uvicorn.run(
            "backend.main:app",
            host=HOST,
            port=int(PORT),
            log_level="info",
            reload=False,
        )

    t = threading.Thread(target=runner, daemon=True)
    t.start()
    return t


def _terminate_backend(proc: subprocess.Popen | None, thread: threading.Thread | None) -> None:
    if proc is not None:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()
    # hilo uvicorn: daemon; al salir del proceso muere con el main


def _run_float_window() -> int:
    spec = importlib.util.spec_from_file_location("_tamagotchi_float_run", FLOAT_SCRIPT)
    if spec is None or spec.loader is None:
        print("No se pudo cargar tamagotchi-float/run.py", file=sys.stderr)
        return 1
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return int(mod.main())


def main() -> int:
    os.chdir(ROOT)
    _load_dotenv()
    os.environ.setdefault("SKIP_OPEN_BROWSER", "1")

    if _port_in_use(HOST, int(PORT)):
        print(
            f"El puerto {PORT} ya está en uso en {HOST}. Cierra el otro proceso o usa otro puerto, por ejemplo:\n"
            f"  fuser -k {PORT}/tcp\n"
            f"  # o: PORT=8001 python launch_desktop.py\n"
            f"Si el backend ya corre (p. ej. python main.py), solo abre la ventana:\n"
            f"  cd tamagotchi-float && source .venv/bin/activate && python run.py",
            file=sys.stderr,
        )
        return 1

    if not FLOAT_SCRIPT.is_file():
        print("No encuentro tamagotchi-float/run.py", file=sys.stderr)
        return 1

    proc: subprocess.Popen | None = None
    thread: threading.Thread | None = None

    if _FROZEN:
        thread = _start_uvicorn_thread()

        def alive() -> bool:
            return thread is not None and thread.is_alive()

        atexit.register(lambda: _terminate_backend(None, thread))
    else:
        proc = _start_uvicorn_subprocess()
        atexit.register(lambda: _terminate_backend(proc, None))

        def alive() -> bool:
            return proc is not None and proc.poll() is None

    try:
        _wait_for_backend_running(alive)
    except (RuntimeError, TimeoutError) as e:
        print(e, file=sys.stderr)
        _terminate_backend(proc, thread)
        return 1

# test

    code = _run_float_window()
    _terminate_backend(proc, thread)
    return int(code)


if __name__ == "__main__":
    raise SystemExit(main())
