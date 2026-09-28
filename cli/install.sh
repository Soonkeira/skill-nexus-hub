#!/usr/bin/env bash
set -e

echo "========================================"
echo " Skill Nexus Hub CLI Installer"
echo "========================================"
echo

SERVER_URL="${SKILL_HUB_SERVER:-http://localhost:8000}"
INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
if [[ "$PLATFORM" == "darwin" ]]; then
    PLATFORM="darwin"
elif [[ "$PLATFORM" == "linux" ]]; then
    PLATFORM="linux"
fi

echo "Downloading snh from $SERVER_URL..."
curl -fsSL "${SERVER_URL}/api/cli/download/${PLATFORM}" -o "$INSTALL_DIR/snh"
chmod +x "$INSTALL_DIR/snh"

echo
echo "========================================"
echo " Installed to $INSTALL_DIR/snh"
echo "========================================"
echo
echo "Ensure $INSTALL_DIR is in your PATH."
echo "Then run: snh init -s $SERVER_URL"
