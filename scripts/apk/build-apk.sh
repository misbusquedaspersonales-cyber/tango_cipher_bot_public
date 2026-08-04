#!/usr/bin/env bash
# scripts/apk/build-apk.sh
#
# Wrapper idempotente sobre bubblewrap build. Se asegura de:
#   • Estar en el directorio correcto (tango-cifrado-apk/)
#   • Tener bubblewrap + jdk disponibles
#   • Leer la pass de keystore-password.txt (si existe) sin re-preguntar
#   • Copiar los artefactos a dist/apk/ para que sea fácil encontrarlos
#
# Uso:
#   cd tango-cifrado-apk && ../scripts/apk/build-apk.sh
#   ./scripts/apk/build-apk.sh      (desde la raíz)
#
# Variables de entorno opcionales:
#   KEYSTORE_PASS    si no está, lee de tango-cifrado-apk/keystore-password.txt
#   BUILD_OUTPUT_DIR donde copiar .apk + .aab (default: dist/apk/ en el repo)
#   SKIP_BUBBLEWRAP_CHECK=1  salta la validación de que twa-manifest.json exista

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -f "$PWD/twa-manifest.json" ] && [ -d "$PWD/app" -o -f "$PWD/twa-config.json" ]; then
  APK_DIR="$PWD"
else
  APK_DIR="$REPO_ROOT/tango-cifrado-apk"
fi

PASS_FILE="$APK_DIR/keystore-password.txt"
OUT_DIR="${BUILD_OUTPUT_DIR:-$REPO_ROOT/dist/apk}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo -e "${RED}❌ '$1' no está en \$PATH.${NC} Corré: ${YELLOW}../scripts/apk/install-deps.sh${NC}"
    exit 1
  fi
}
need keytool
need bubblewrap
need java

cd "$APK_DIR"

if [ "${SKIP_BUBBLEWRAP_CHECK:-0}" != "1" ] && [ ! -f "$APK_DIR/twa-manifest.json" ]; then
  echo -e "${YELLOW}⚠️  No existe twa-manifest.json en $APK_DIR.${NC}"
  echo "   Esto significa que nunca corriste bubblewrap init. Intentando correrlo..."
  echo "   Si el wizard falla, corré a mano:"
  echo "     bubblewrap init --manifest=https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/manifest.json"
  echo
  bubblewrap init --manifest="https://misbusquedaspersonales-cyber.github.io/tango_cipher_bot_public/pwa/manifest.json"
fi

if [ ! -f "$APK_DIR/android.keystore" ]; then
  echo -e "${RED}❌ Falta $APK_DIR/android.keystore. Corré primero: ../scripts/apk/generate-keystore.sh${NC}"
  exit 1
fi

if [ -z "${KEYSTORE_PASS:-}" ]; then
  if [ -f "$PASS_FILE" ]; then
    export KEYSTORE_PASS="$(cat "$PASS_FILE")"
  else
    read -r -s -p "Contraseña de la keystore: " KEYSTORE_PASS
    export KEYSTORE_PASS
    echo
  fi
fi

echo "============================================================"
echo -e "  ${GREEN}Compilando APK (bubblewrap build)${NC}"
echo "============================================================"
echo "  Directorio : $APK_DIR"
echo "  Keystore   : $APK_DIR/android.keystore"
echo

# Bubblewrap is interactive by default: on first run it prompts "Do you want
# Bubblewrap to install the JDK (recommended)? (Y/n)". We already have JDK
# installed so auto-answer "n". We also set CI=true so any future interactive
# prompts get sensible defaults instead of hanging.
export CI="${CI:-true}"
{
  # Two "n"s just in case: first prompt = JDK install, second = any future one.
  printf 'n\nn\n'
  # After stdin closes, bubblewrap should continue non-interactive with CI=true
} | bubblewrap build

echo
echo -e "${GREEN}✅ bubblewrap build finalizado.${NC}"

mkdir -p "$OUT_DIR"
copiado=0
for f in "$APK_DIR"/*release*signed.apk "$APK_DIR"/*release*.aab "$APK_DIR"/app/release/*.apk "$APK_DIR"/app/release/*.aab; do
  if [ -f "$f" ]; then
    cp -v "$f" "$OUT_DIR/"
    copiado=1
  fi
done

if [ "$copiado" = "0" ]; then
  echo -e "${YELLOW}⚠️  No se encontraron archivos .apk/.aab en $APK_DIR.${NC}"
  echo "   Buscando artefactos..."
  find "$APK_DIR" -maxdepth 5 \( -name "*.apk" -o -name "*.aab" \) -not -path "*/build/*" | head -n 20 || true
fi

echo
echo "============================================================"
echo -e "  ${GREEN}Listo. Siguientes pasos:${NC}"
echo "============================================================"
if [ "$copiado" = "1" ]; then
  echo "   • Artefactos copiados a: $OUT_DIR"
  ls -lah "$OUT_DIR" | tail -n +2
fi
echo
echo "   • Sideload: pasá $OUT_DIR/app-release-signed.apk a tu Android (Telegram, USB, etc.),"
echo "     habilitá 'Fuentes desconocidas' e instalalo."
echo "   • ✅ CHEQUEO CLAVE: abrí la app — NO debe verse la barra de URL de Chrome."
echo "     Si se ve, el assetlinks.json no validó → revisá generate-assetlinks.sh."
echo "   • Updates de la PWA (app.js, etc.) se reciben automáticamente — NO requieren nuevo APK."
echo "     Solo re-corré build-apk.sh si cambia el wrapper (ícono, nombre, versión, permisos)."
