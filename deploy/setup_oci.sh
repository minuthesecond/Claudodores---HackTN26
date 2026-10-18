#!/usr/bin/env bash
# One-shot setup for the OCI Hackathon Starter Kit's app server (Oracle Linux 9, user opc).
# Starter kit: https://github.com/ScottStroz/oci-hackathon-starterkit
# Give the instance at least 8 OCPUs and 32 GB (the kit defaults to 1 OCPU / 4 GB, too small).
#
# Copy this one file to the instance and run it there:
#   scp -i key.pem deploy/setup_oci.sh opc@<public-ip>:
#   ssh -i key.pem opc@<public-ip> bash setup_oci.sh
#
# It installs everything from the repo's main branch, builds the web app, and starts three
# services that survive reboots:
#   unspoken-lipread  lipread/server.py on 127.0.0.1:8000   (Clark + Joey)
#   unspoken-voice    voice/voice_server.py on 127.0.0.1:8001 (Justin)
#   caddy             https://<public-ip>.sslip.io: the web app, /api -> :8000, /voice -> :8001
# (Caddy replaces the kit's Apache on ports 80/443, because it gets the HTTPS certificate itself.)
# Re-running the script pulls the latest main and restarts everything.
set -euo pipefail

REPO=${REPO:-https://github.com/minuthesecond/Claudodores---HackTN26.git}
BRANCH=${BRANCH:-main}
FINAL_BEAM=${FINAL_BEAM:-10}  # lip-reader search width; server.py's default is 40 (slow on CPU)
APP=/opt/unspoken  # not under /home: SELinux stops systemd services running programs from there
WEB=/var/www/unspoken
export UV_PYTHON_INSTALL_DIR=$APP/.python  # keep uv's Python 3.11 out of /home too
export PATH=/usr/local/bin:$PATH

echo "== system packages"
sudo dnf install -y -q git curl unzip tar dnf-plugins-core
# FFmpeg (the voice server loads audio through it) comes from EPEL + RPM Fusion on Oracle Linux 9
if ! command -v ffmpeg >/dev/null; then
  sudo dnf install -y -q oracle-epel-release-el9
  sudo dnf config-manager --enable ol9_codeready_builder ol9_developer_EPEL
  sudo dnf install -y -q https://mirrors.rpmfusion.org/free/el/rpmfusion-free-release-9.noarch.rpm
  sudo dnf install -y -q ffmpeg
fi
# The web app's build tool (Vite 8) needs Node 20.19+ or 22.12+; the kit installs an older one
if [ "$(node -v 2>/dev/null | cut -c2- | cut -d. -f1)" != 22 ]; then
  sudo dnf module reset -y -q nodejs
  sudo dnf module install -y -q nodejs:22/common
fi
if ! command -v caddy >/dev/null; then
  sudo dnf copr enable -y -q @caddy/caddy epel-9-x86_64
  sudo dnf install -y -q caddy
fi
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sudo env UV_INSTALL_DIR=/usr/local/bin sh

echo "== code ($BRANCH)"
sudo mkdir -p "$APP" && sudo chown "$USER:" "$APP"
[ -d "$APP/.git" ] || git clone "$REPO" "$APP"
cd "$APP"
git fetch -q origin
git checkout -q --detach "origin/$BRANCH"

echo "== lip reader (models ~1.1 GB)"
./setup.sh

echo "== voice server (XTTS model ~1.8 GB downloads on first start)"
[ -d voice/.venv ] || uv venv -q --python 3.11 voice/.venv
uv pip install -q --python voice/.venv/bin/python -r voice/requirements.txt

echo "== web app"
(cd frontend && npm ci --no-audit --no-fund && npm run build)
sudo mkdir -p "$WEB" && sudo rm -rf "${WEB:?}"/* && sudo cp -r frontend/dist/. "$WEB/"
sudo restorecon -R "$WEB"

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
# The kit already opens 80/443 in the security list and firewalld; repeated here in case
sudo firewall-cmd -q --zone=public --permanent --add-port=80/tcp --add-port=443/tcp
sudo firewall-cmd -q --reload
sudo setsebool -P httpd_can_network_connect 1  # lets Caddy reach :8000 and :8001
sudo systemctl disable --now httpd 2>/dev/null || true  # free ports 80/443 for Caddy

IP=$(curl -s https://ifconfig.me)
DOMAIN=${DOMAIN:-${IP//./-}.sslip.io}
# One HTTPS address for everything, same paths the web app uses in development (vite.config.ts)
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
	encode gzip
	handle_path /api/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle_path /voice/* {
		reverse_proxy 127.0.0.1:8001 {
			flush_interval -1
		}
	}
	handle {
		root * $WEB
		try_files {path} /index.html
		file_server
	}
}
EOF
sudo systemctl enable -q caddy
sudo systemctl restart caddy

echo
echo "Done. Open https://$DOMAIN/app (first start downloads the voice model; give it a few minutes)."
echo "Logs:    journalctl -fu unspoken-lipread    journalctl -fu unspoken-voice    journalctl -fu caddy"
echo "Health:  curl localhost:8000/health; curl localhost:8001/health"
