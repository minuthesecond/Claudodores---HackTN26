#!/usr/bin/env bash
# Deploys Unspoken to an Ubuntu 22.04 server: the lip reader, voice and voicebank (accounts)
# servers as systemd services,
# the built site, and Caddy with HTTPS. Run from the repo root on your machine:
#
#   deploy/deploy.sh ubuntu@147.224.207.225 [hostname]
#
# To run lip reading or the voice on another machine (the site, accounts and voicebank stay
# here), set its base URL; it must serve the lip reader under /api or the voice under /voice:
#   API_REMOTE=https://name.trycloudflare.com deploy/deploy.sh ubuntu@147.224.207.225
#   VOICE_REMOTE=https://name.trycloudflare.com ...   (both can be set)
#
# hostname defaults to <ip-with-dashes>.sslip.io, which needs no DNS setup. The server's
# cloud firewall must allow TCP 22, 80 and 443. Safe to run again to update.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=${1:?usage: deploy/deploy.sh user@ip [hostname]}
IP=${HOST#*@}
SITE=${2:-${IP//./-}.sslip.io}

echo "==> code and models"
ssh "$HOST" 'mkdir -p ~/unspoken ~/.local/share/tts'
rsync -az --delete --exclude .venv --exclude __pycache__ --exclude voice_cache --exclude captions.json \
  --exclude data --exclude .pytest_cache \
  lipread voice voicebank talking.MOV "$HOST":unspoken/
rsync -az third_party "$HOST":unspoken/
# XTTS-v2 weights (1.8 GB): copy ours if we have them, otherwise the server downloads them
XTTS="$HOME/Library/Application Support/tts"
[ -d "$XTTS" ] && rsync -az "$XTTS/" "$HOST":.local/share/tts/

echo "==> system packages, Python environments"
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive PATH=$HOME/.local/bin:$PATH
sudo apt-get update -qq
sudo apt-get install -y -qq ffmpeg libgl1 libglib2.0-0 rsync debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null
cd ~/unspoken
CPU="--index-strategy unsafe-best-match --extra-index-url https://download.pytorch.org/whl/cpu"
[ -x .venv/bin/python ] || uv venv -q --python 3.11 .venv
uv pip install -q --python .venv/bin/python $CPU -r lipread/requirements.txt
[ -x voice/.venv/bin/python ] || uv venv -q --python 3.11 voice/.venv
uv pip install -q --python voice/.venv/bin/python $CPU -r voice/requirements.txt
[ -x voicebank/.venv/bin/python ] || uv venv -q --python 3.11 voicebank/.venv
uv pip install -q --python voicebank/.venv/bin/python $CPU -r voicebank/requirements.txt
mkdir -p ~/unspoken-data/voicebank

# Caddy
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -qq && sudo apt-get install -y -qq caddy >/dev/null
fi

# Oracle's Ubuntu images reject everything but SSH in iptables; open 80 and 443 too
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null ||
    sudo iptables -I INPUT 5 -p tcp -m state --state NEW --dport $port -j ACCEPT
done
sudo netfilter-persistent save >/dev/null 2>&1 || true
REMOTE

echo "==> site"
(cd frontend && npm run build)
ssh "$HOST" 'sudo mkdir -p /var/www/unspoken && sudo chown ubuntu /var/www/unspoken'
rsync -az --delete frontend/dist/ "$HOST":/var/www/unspoken/

echo "==> services"
scp -q deploy/unspoken-lip.service deploy/unspoken-voice.service deploy/unspoken-voicebank.service \
  deploy/Caddyfile "$HOST":/tmp/
ssh "$HOST" SITE="$SITE" API_REMOTE="${API_REMOTE:-}" VOICE_REMOTE="${VOICE_REMOTE:-}" bash -s <<'REMOTE'
set -euo pipefail
sudo mv /tmp/unspoken-lip.service /tmp/unspoken-voice.service /tmp/unspoken-voicebank.service /etc/systemd/system/
sudo mv /tmp/Caddyfile /etc/caddy/Caddyfile
{
  echo "SITE=$SITE"
  [ -n "$API_REMOTE" ] && { echo "API_UPSTREAM=$API_REMOTE"; echo "API_PATH=/api"; }
  [ -n "$VOICE_REMOTE" ] && { echo "VOICE_UPSTREAM=$VOICE_REMOTE"; echo "VOICE_PATH=/voice"; }
  true
} | sudo tee /etc/default/caddy >/dev/null
sudo mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/default/caddy\n' | sudo tee /etc/systemd/system/caddy.service.d/site.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable -q unspoken-lip unspoken-voice unspoken-voicebank caddy
sudo systemctl restart unspoken-lip unspoken-voice unspoken-voicebank caddy
REMOTE

echo "==> waiting for the servers (the voice pre-speaks its phrases first, ~1 min on CPU)"
for i in $(seq 1 120); do
  ssh "$HOST" 'curl -sf localhost:8000/health >/dev/null && curl -sf localhost:8001/health >/dev/null &&
    curl -sf localhost:8003/health >/dev/null' && break
  sleep 3
done
curl -sf "https://$SITE/api/health" && echo && curl -sf "https://$SITE/voice/health" && echo &&
  curl -sf "https://$SITE/voicebank/health" && echo
echo "Live at https://$SITE  (demo: https://$SITE/app)"
