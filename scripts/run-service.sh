#!/bin/zsh
set -euo pipefail

cd /Users/chay/.openclaw/workspace/home-schematic
npm run build
exec npm run preview -- --host 0.0.0.0 --port 4180 --strictPort
