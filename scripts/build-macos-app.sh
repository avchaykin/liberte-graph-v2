#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$APP_ROOT/dist-macos"
APP_NAME="Liberte Graph"
APP_PATH="$OUT_DIR/$APP_NAME.app"

mkdir -p "$OUT_DIR"
rm -rf "$APP_PATH"

APPLESCRIPT=$(mktemp)
cat > "$APPLESCRIPT" <<EOF
on run
  tell application "Terminal"
    activate
    do script "cd '$APP_ROOT' && npm install && npm run build && npm run preview -- --host 0.0.0.0 --port 4180 --strictPort"
  end tell
  delay 1
  try
    do shell script "open http://localhost:4180"
  end try
end run
EOF

osacompile -o "$APP_PATH" "$APPLESCRIPT"
rm -f "$APPLESCRIPT"

echo "Created: $APP_PATH"
