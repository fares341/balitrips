#!/usr/bin/env bash
# =============================================================================
# Bali Trips — turn on automatic updates on this server (run once, with sudo).
#
#   sudo ./deploy/install-autodeploy.sh            check GitHub every 2 minutes
#   sudo ./deploy/install-autodeploy.sh 5          …every 5 minutes
#   sudo ./deploy/install-autodeploy.sh --remove   turn it off
#
# Installs a systemd timer that runs deploy/update.sh. update.sh does nothing
# when there is no new commit, so frequent checks cost one `git fetch`.
# Watch it:  journalctl -u balitrips-update -f     (or deploy/logs/)
# =============================================================================
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run with sudo."; exit 1; }
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OWNER="$(stat -c %U "$ROOT")"
UNIT=balitrips-update

if [[ "${1:-}" == "--remove" ]]; then
  systemctl disable --now "$UNIT.timer" 2>/dev/null || true
  rm -f "/etc/systemd/system/$UNIT.service" "/etc/systemd/system/$UNIT.timer"
  systemctl daemon-reload
  echo "Automatic updates turned off."
  exit 0
fi
EVERY="${1:-2}"
[[ "$EVERY" =~ ^[0-9]+$ ]] || { echo "Minutes must be a number."; exit 1; }

# The repo owner must be able to run docker and reach GitHub without a prompt.
if [[ "$OWNER" != root ]] && ! id -nG "$OWNER" | grep -qw docker; then
  echo "User $OWNER is not in the docker group:  sudo usermod -aG docker $OWNER  (then log out/in)"
  exit 1
fi
if ! sudo -u "$OWNER" git -C "$ROOT" fetch --quiet origin 2>/dev/null; then
  echo "git fetch failed as $OWNER. Set up a read-only deploy key for the repo first (see docs/production-run.md)."
  exit 1
fi

cat >"/etc/systemd/system/$UNIT.service" <<UNITEOF
[Unit]
Description=Bali Trips: pull the latest commit and redeploy if it changed
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=$OWNER
WorkingDirectory=$ROOT
ExecStart=$ROOT/deploy/update.sh
TimeoutStartSec=45min
UNITEOF

cat >"/etc/systemd/system/$UNIT.timer" <<UNITEOF
[Unit]
Description=Check GitHub for Bali Trips updates every $EVERY minutes

[Timer]
OnBootSec=3min
OnUnitInactiveSec=${EVERY}min
Persistent=true

[Install]
WantedBy=timers.target
UNITEOF

systemctl daemon-reload
systemctl enable --now "$UNIT.timer"
echo "Automatic updates on: every $EVERY minutes. Logs: journalctl -u $UNIT -f"
