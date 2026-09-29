#!/usr/bin/env bash
set -e

# Skill Nexus Hub CLI installer (Linux / macOS).
#
# Downloads a ZIP payload from the hub's /api/cli/download/<platform> endpoint
# (contains the binary plus a preconfigured snh.conf), extracts both into the
# install directory, and makes the binary executable. The CLI reads snh.conf
# from the directory next to its executable (see cli/snh/config.py).
#
# Environment variables:
#   SKILL_HUB_SERVER  Base URL of the hub to download from.
#                     Default: http://localhost:9527 (the port exposed by the
#                     Docker Compose quick start).

echo "========================================"
echo " Skill Nexus Hub CLI Installer"
echo "========================================"
echo

SERVER_URL="${SKILL_HUB_SERVER:-http://localhost:9527}"
INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
if [[ "$PLATFORM" == "darwin" ]]; then
    PLATFORM="darwin"
elif [[ "$PLATFORM" == "linux" ]]; then
    PLATFORM="linux"
fi

# Binary names inside the server's ZIP follow backend/app/api/cli_download.py.
BIN_NAME="snh-linux"
if [[ "$PLATFORM" == "darwin" ]]; then
    BIN_NAME="snh-macos"
fi

echo "Downloading snh from $SERVER_URL..."
ZIP_PATH="$INSTALL_DIR/snh-install.zip"
curl -fsSL "${SERVER_URL}/api/cli/download/${PLATFORM}" -o "$ZIP_PATH"

echo "Extracting into $INSTALL_DIR..."
if command -v unzip >/dev/null 2>&1; then
    unzip -o "$ZIP_PATH" -d "$INSTALL_DIR"
else
    # Fallback when unzip is not installed (Python 3 stdlib zipfile).
    python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$ZIP_PATH" "$INSTALL_DIR"
fi
rm -f "$ZIP_PATH"

mv -f "$INSTALL_DIR/$BIN_NAME" "$INSTALL_DIR/snh"
chmod +x "$INSTALL_DIR/snh"

echo
echo "========================================"
echo " Installed to $INSTALL_DIR/snh"
echo "========================================"
echo
echo "A preconfigured snh.conf was installed next to the binary."
echo "Ensure $INSTALL_DIR is in your PATH."
echo "Then run: snh init -s $SERVER_URL   # only if you need a different server"
