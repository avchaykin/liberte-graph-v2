# Liberte Graph v2

Visual home schematic editor (React + React Flow).

![Liberte Graph v2 screenshot](docs/screenshot-editor.jpg)

## Requirements

- macOS/Linux
- Node.js 20+ and npm

---

## 1) Run locally (dev)

```bash
git clone https://github.com/avchaykin/liberte-graph-v2.git
cd liberte-graph-v2
npm install
npm run dev -- --host 0.0.0.0 --port 4180
```

Open: `http://localhost:4180`

---

## 2) Run in terminal (production preview)

```bash
git clone https://github.com/avchaykin/liberte-graph-v2.git
cd liberte-graph-v2
npm install
npm run build
npm run preview -- --host 0.0.0.0 --port 4180 --strictPort
```

Open: `http://localhost:4180`

---

## 3) Auto-start service for current user (launchd LaunchAgent)

Use this if you want it to start automatically when your user logs in.

```bash
APP_DIR="$HOME/projects/liberte-graph-v2"
mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents" "$APP_DIR/logs"

# clone/update project
if [ ! -d "$APP_DIR/.git" ]; then
  git clone https://github.com/avchaykin/liberte-graph-v2.git "$APP_DIR"
else
  git -C "$APP_DIR" pull
fi

# install launch agent
cp "$APP_DIR/deploy/com.avchaykin.liberte-graph-v2.plist" "$HOME/Library/LaunchAgents/com.avchaykin.liberte-graph-v2.plist"

launchctl bootout gui/$(id -u)/com.avchaykin.liberte-graph-v2 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/com.avchaykin.liberte-graph-v2.plist"
launchctl enable gui/$(id -u)/com.avchaykin.liberte-graph-v2
launchctl kickstart -k gui/$(id -u)/com.avchaykin.liberte-graph-v2
```

Check:

```bash
launchctl print gui/$(id -u)/com.avchaykin.liberte-graph-v2 | head -40
curl -I http://127.0.0.1:4180
```

---

## 4) System-wide service (LaunchDaemon, survives logout)

Use this if it should run regardless of which user is logged in.

```bash
APP_DIR="/Users/chay/.openclaw/workspace/home-schematic" # change path to your clone

sudo cp "$APP_DIR/deploy/com.avchaykin.liberte-graph-v2.daemon.plist" /Library/LaunchDaemons/com.avchaykin.liberte-graph-v2.plist
sudo chown root:wheel /Library/LaunchDaemons/com.avchaykin.liberte-graph-v2.plist
sudo chmod 644 /Library/LaunchDaemons/com.avchaykin.liberte-graph-v2.plist

sudo launchctl bootout system/com.avchaykin.liberte-graph-v2 2>/dev/null || true
sudo launchctl bootstrap system /Library/LaunchDaemons/com.avchaykin.liberte-graph-v2.plist
sudo launchctl enable system/com.avchaykin.liberte-graph-v2
sudo launchctl kickstart -k system/com.avchaykin.liberte-graph-v2
```

Check:

```bash
sudo launchctl print system/com.avchaykin.liberte-graph-v2 | head -40
curl -I http://127.0.0.1:4180
```

---

## 5) Homebrew install + service

> Формула публикуется через tap `avchaykin/liberte-graph-v2`.

Install (one-liner):

```bash
brew install --HEAD avchaykin/liberte-graph-v2/liberte-graph-v2
brew services start liberte-graph-v2
```

Update to latest HEAD:

```bash
brew update
brew upgrade --fetch-HEAD avchaykin/liberte-graph-v2/liberte-graph-v2 || \
brew reinstall --HEAD avchaykin/liberte-graph-v2/liberte-graph-v2
brew services restart liberte-graph-v2
```

Manage:

```bash
brew services restart liberte-graph-v2
brew services stop liberte-graph-v2
brew services list | grep liberte-graph-v2
```

---

## 6) macOS app bundle

Build one-click app:

```bash
cd liberte-graph-v2
./scripts/build-macos-app.sh
```

Output:

- `dist-macos/Liberte Graph.app`

---

## Logs

- LaunchAgent/Daemon logs:
  - `logs/service.out.log`
  - `logs/service.err.log`

---

## Notes

- App data (saved schemas/autosave) is stored in browser `localStorage`.
- Export/Import from UI uses JSON files.
