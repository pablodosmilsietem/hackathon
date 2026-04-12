#!/usr/bin/env bash
# Construye dist/TamagotchiGitHub (Linux) o .exe (Windows) en ESTE sistema.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f .venv/bin/activate ]]; then
  # shellcheck source=/dev/null
  source .venv/bin/activate
fi
pip install -q -r requirements-desktop.txt -r requirements-build.txt
export TAMAGOTCHI_REPO_ROOT="$ROOT"
pyinstaller "$ROOT/tamagotchi.spec" --noconfirm --workpath "$ROOT/build/pyinstaller" --distpath "$ROOT/dist"
echo "Listo: $ROOT/dist/TamagotchiGitHub (o .exe en Windows)"
