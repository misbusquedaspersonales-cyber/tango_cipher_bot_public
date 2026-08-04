#!/usr/bin/env bash
# purge-sandbox-keystore.sh
#
# Removes all artifacts produced by _runall_sandbox.sh that must NEVER be
# shipped or used to sign a production APK:
#   - android.keystore (signed with the public hardcoded password)
#   - keystore-password.txt (contains the public password)
#   - assetlinks.generated.json (fingerprint of the compromised keystore)
#   - SANDBOX_KEYSTORE_DO_NOT_SHIP.txt (sentinel file)
#
# After running this, generate a real keystore interactively:
#   cd tango-cifrado-apk
#   ../scripts/apk/generate-keystore.sh   # type a real password, no env var
#   ../scripts/apk/generate-assetlinks.sh
#   git add .well-known/assetlinks.json pwa/.well-known/assetlinks.json
#   git commit -m "deploy(assetlinks): real keystore fingerprint"
#   git push
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APK_DIR="$REPO_ROOT/tango-cifrado-apk"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "============================================================"
echo -e "  ${YELLOW}Purgando artefactos de keystore sandbox${NC}"
echo "============================================================"

purge() {
    local f="$1"
    if [ -f "$f" ]; then
        rm -f "$f"
        echo -e "  ${GREEN}✅ eliminado:${NC} $f"
    else
        echo -e "  (ya no existe: $f)"
    fi
}

purge "$APK_DIR/android.keystore"
purge "$APK_DIR/keystore-password.txt"
purge "$APK_DIR/assetlinks.generated.json"
purge "$APK_DIR/SANDBOX_KEYSTORE_DO_NOT_SHIP.txt"

echo
echo "============================================================"
echo -e "  ${GREEN}Purga completa.${NC}"
echo "============================================================"
echo
echo "  Siguiente paso — generá una keystore real:"
echo "    cd tango-cifrado-apk"
echo "    ../scripts/apk/generate-keystore.sh"
echo "    ../scripts/apk/generate-assetlinks.sh"
echo "    git add .well-known/assetlinks.json pwa/.well-known/assetlinks.json"
echo "    git commit -m 'deploy(assetlinks): real keystore fingerprint'"
echo "    git push"
