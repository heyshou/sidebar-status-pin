#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME}/.gemini/config/plugins/sidebar-status-pin"

mkdir -p "${TARGET_DIR}/sidecars/sidebar_status"
cp -f "${SCRIPT_DIR}/plugin.json" "${TARGET_DIR}/plugin.json"
cp -f "${SCRIPT_DIR}/sidecars/sidebar_status/sidecar.json" "${TARGET_DIR}/sidecars/sidebar_status/sidecar.json"
cp -f "${SCRIPT_DIR}/sidecars/sidebar_status/main.mjs" "${TARGET_DIR}/sidecars/sidebar_status/main.mjs"

echo "[OK] Installed sidebar-status-pin to: ${TARGET_DIR}"
echo "Make sure Antigravity is launched with --remote-debugging-port=0, then restart Antigravity and enable 'Sidebar Status Pin' in Plugins."
