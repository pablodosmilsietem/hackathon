#!/usr/bin/env bash
# Crea un acceso en el menú de aplicaciones (Linux). Ejecuta una vez desde el repo.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$DESKTOP_DIR"
sed "s|REPO_ROOT|$ROOT|g" "$ROOT/desktop/tamagotchi-github.desktop.in" > "$DESKTOP_DIR/tamagotchi-github.desktop"
chmod +x "$ROOT/launch-tamagotchi.sh"
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
echo "Instalado: $DESKTOP_DIR/tamagotchi-github.desktop"
