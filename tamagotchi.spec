# -*- mode: python ; coding: utf-8 -*-
# Genera UN ejecutable para el SO donde compiles (no es universal Linux+Windows+macOS).
# Recomendado: ./packaging/build-binary.sh (exporta TAMAGOTCHI_REPO_ROOT).
# O: cd hackathon && export TAMAGOTCHI_REPO_ROOT="$PWD" && pyinstaller tamagotchi.spec
import os
from pathlib import Path


def _project_root() -> Path:
    env = os.environ.get("TAMAGOTCHI_REPO_ROOT", "").strip()
    if env:
        p = Path(env).expanduser().resolve()
        if (p / "launch_desktop.py").is_file():
            return p
    g = globals()
    for key in ("SPECPATH", "specpath", "SPEC"):
        val = g.get(key)
        if not val:
            continue
        p = Path(str(val)).resolve()
        if p.is_file() and p.suffix == ".spec":
            return p.parent
    try:
        here = Path(__file__).resolve().parent
        if (here / "launch_desktop.py").is_file():
            return here
    except NameError:
        pass
    here = Path.cwd().resolve()
    for p in [here, *here.parents]:
        if (p / "launch_desktop.py").is_file() and (p / "backend" / "main.py").is_file():
            return p
    raise SystemExit(
        "No encuentro la raíz del repo (launch_desktop.py). "
        "Ejecuta desde la carpeta hackathon o: export TAMAGOTCHI_REPO_ROOT=/ruta/al/hackathon"
    )


ROOT = _project_root()

from PyInstaller.utils.hooks import collect_all

block_cipher = None

datas = [
    (str(ROOT / "frontend"), "frontend"),
    (str(ROOT / "backend"), "backend"),
    (str(ROOT / "tamagotchi-float" / "run.py"), "tamagotchi-float"),
]
binaries: list = []
hiddenimports = [
    "backend.github_oauth",
    "backend.github_fetcher",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]

for pkg in (
    "uvicorn",
    "fastapi",
    "starlette",
    "pydantic",
    "pydantic_settings",
    "anyio",
    "httpx",
    "httpcore",
    "h11",
    "certifi",
    "idna",
    "sniffio",
    "webview",
    "bottle",
    "proxy_tools",
):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

a = Analysis(
    [str(ROOT / "launch_desktop.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="TamagotchiGitHub",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
