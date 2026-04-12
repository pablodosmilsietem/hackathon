# Tamagotchi flotante

**Esta es la app principal:** ventana con **pywebview** que carga el mismo backend que `python main.py`, con **`?float=1`** (poll **cada 5 s**, sin botón “Actualizar”) y **`on_top`**. El “frontend web” solo es el HTML que renderiza esta ventana; no hace falta abrir Chrome si no quieres.

Funciona en **Linux** (GTK) y en **Windows** (WebView2). **Login con GitHub (OAuth)** funciona aquí igual que en el navegador (misma URL y cookies).

## Requisitos

- Python 3.10+
- **Windows:** suele bastar con `pip install -r requirements.txt` en un venv normal. pywebview usa **Edge WebView2**; si falla, instala [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) o Microsoft Edge actualizado. **`on_top`** y el refuerzo cada segundo funcionan vía Win32.
- **Linux:** bibliotecas GTK + WebKit **del sistema** y el módulo **`gi`** (PyGObject). En un venv normal **no** se ve `gi` aunque lo tengas en el Python del sistema; por eso usamos **`--system-site-packages`**.

### Fedora (recomendado)

```bash
sudo dnf install python3-gobject gtk3 webkitgtk4.1
# Si webkitgtk4.1 no existe:
dnf search webkitgtk
```

Crear el venv **con** paquetes del sistema visibles:

```bash
cd tamagotchi-float
rm -rf .venv   # solo si ya creaste uno sin --system-site-packages
python3 -m venv .venv --system-site-packages
source .venv/bin/activate
pip install -r requirements.txt
```

### Si ves `No module named 'gi'` o `WebViewException: QT or GTK`

1. Instala `python3-gobject` y WebKit con `dnf` (arriba).
2. Recrea `.venv` con **`--system-site-packages`** y vuelve a `pip install -r requirements.txt`.

### Alternativa Qt (más pesada)

```bash
pip install 'pywebview[qt]'
```

(puede requerir paquetes Qt adicionales del sistema.)

## Uso

**Más simple:** desde la raíz del repo, con `pip install -r requirements-desktop.txt` en el **mismo** `.venv`, ejecuta **`launch-tamagotchi.sh`** o **`launch-tamagotchi.bat`** (ver README principal): arranca API + esta ventana.

### Solo la ventana (API ya en marcha)

1. Backend en la **raíz del hackathon**: `python main.py`
2. Otra terminal:

   **Linux / macOS**

   ```bash
   cd tamagotchi-float
   source .venv/bin/activate
   python run.py
   ```

   **Windows (PowerShell o cmd)**

   ```bat
   cd tamagotchi-float
   .venv\Scripts\activate
   python run.py
   ```

Opciones: `--url`, `--width`, `--height`, `--no-on-top`, variable `TAMAGOTCHI_FLOAT_URL` (si cambias la URL, mantén `?float=1` si quieres el intervalo de 5 s y sin botón).

**Nota:** “Siempre encima” lo pide el SO vía pywebview; el script **vuelve a aplicar** `on_top` cada segundo por si el escritorio lo quita. En **Linux Wayland** algunos entornos ignoran o limitan esta pista. En **Windows** suele respetarse bien. No es posible fijar *solo* por encima de VS Code y debajo del resto.

### Mascota en pantalla

La web usa **SVG locales** (`frontend/images/pet-*.svg`), no emojis: se ven igual en navegador, WebKit y ventana flotante.
