#!/usr/bin/env bash
# Doble clic en el gestor de archivos (propiedades → ejecutar como programa) o: ./launch-tamagotchi.sh
set -e
cd "$(dirname "$0")"
if [[ -f .venv/bin/activate ]]; then
  # shellcheck source=/dev/null
  source .venv/bin/activate
fi
exec python launch_desktop.py
