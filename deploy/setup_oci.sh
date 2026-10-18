#!/usr/bin/env bash
# One-shot setup for an OCI Ubuntu instance (CPU or GPU). Run it on the instance:
#
#   curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/voice/deploy/setup_oci.sh -o setup_oci.sh
#   REPO=https://github.com/<org>/<repo>.git bash setup_oci.sh
#
# It installs everything, builds the web app, and starts three things that survive reboots:
#   lipread  lipread/server.py on 127.0.0.1:8000   (Clark + Joey)
#   voice    voice/voice_server.py on 127.0.0.1:8001 (Justin)
#   caddy    https://<public-ip>.sslip.io: the web app, /api -> :8000, /voice -> :8001
#
# Until the branches are merged, the app comes from APP_BRANCH (frontend + lipread server)
# and voice/ is taken from VOICE_BRANCH. Re-running the script updates and restarts everything.
set -euo pipefail

REPO=${REPO:?set REPO to the GitHub clone URL}
APP_BRANCH=${APP_BRANCH:-clark}
VOICE_BRANCH=${VOICE_BRANCH:-voice}
FINAL_BEAM=${FINAL_BEAM:-10}  # lip-reader search width; server.py's default is 40 (slower on CPU)
APP=$HOME/unspoken
WEB=/var/www/unspoken

echo "== system packages"
sudo apt-get update -q
sudo apt-get install -yq git curl unzip ffmpeg debian-keyring debian-archive-keyring apt-transport-https gpg
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -yq nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -q && sudo apt-get install -yq caddy
fi
command -v uv >/dev/null || { curl -LsSf https://astral.sh/uv/install.sh | sh; }
export PATH=$HOME/.local/bin:$PATH

echo "== code"
[ -d "$APP/.git" ] || git clone "$REPO" "$APP"
cd "$APP"
git fetch -q origin
git checkout -q --detach "origin/$APP_BRANCH"
git checkout "origin/$VOICE_BRANCH" -- voice deploy

echo "== lip reader (models ~1.1 GB)"
./setup.sh

echo "== voice server (XTTS model ~1.8 GB downloads on first start)"
[ -d voice/.venv ] || uv venv -q --python 3.11 voice/.venv
uv pip install -q --python voice/.venv/bin/python -r voice/requirements.txt

echo "== web app"
(cd frontend && npm ci --no-audit --no-fund && npm run build)
sudo mkdir -p "$WEB" && sudo rm -rf "${WEB:?}"/* && sudo cp -r frontend/dist/. "$WEB/"

echo "== services"
unit() {  # name, working dir, command, extra Environment= line
  sudo tee /etc/systemd/system/unspoken-$1.service >/dev/null <<EOF
[Unit]
Description=UNSPOKEN $1
After=network-online.target

[Service]
User=$USER
WorkingDirectory=$2
ExecStart=$3
Environment=$4
Restart=always

[Install]
WantedBy=multi-user.target
EOF
}
unit lipread "$APP" "$APP/.venv/bin/python lipread/server.py" "FINAL_BEAM=$FINAL_BEAM"
unit voice "$APP/voice" "$APP/voice/.venv/bin/python voice_server.py" "COQUI_TOS_AGREED=1"
sudo systemctl daemon-reload
sudo systemctl enable -q unspoken-lipread unspoken-voice
sudo systemctl restart unspoken-lipread unspoken-voice

echo "== HTTPS (the browser only allows the camera over HTTPS)"
# OCI's Ubuntu images block everything but SSH in the instance firewall, on top of the VCN rules
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT -p tcp --dport $port -j ACCEPT
done
sudo netfilter-persistent save >/dev/null 2>&1 || true

IP=$(curl -s https://ifconfig.me)
DOMAIN=${DOMAIN:-${IP//./-}.sslip.io}
sed "s|{\$DOMAIN}|$DOMAIN|; s|{\$WEB}|$WEB|" deploy/Caddyfile | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl reload-or-restart caddy

echo
echo "Done. Open https://$DOMAIN/app (first start downloads the voice model; give it a few minutes)."
echo "Logs:    journalctl -fu unspoken-lipread    journalctl -fu unspoken-voice"
echo "Health:  curl localhost:8000/health; curl localhost:8001/health"
