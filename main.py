"""
Punto de entrada desde la raíz del repo: sirve API + frontend y abre el navegador.

  python main.py

Requiere: venv activado, dependencias instaladas, ejecutar desde la carpeta del proyecto.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if __name__ == "__main__":
    from backend.main import run_dev

    run_dev()
