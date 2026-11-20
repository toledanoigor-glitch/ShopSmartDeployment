#!/usr/bin/env bash
# ShopSmart single-EC2 setup for Ubuntu 24.04.
# Installs Node 22, PostgreSQL, Caddy (automatic HTTPS) and runs ShopSmart as a systemd service.
# Usage on the EC2 instance:  sudo bash deploy/ec2-setup.sh
# Safe to run again: it keeps the database, its password and the session secret.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/toledanoigor-glitch/ShopSmartDeployment.git}"
APP_DIR=/opt/shopsmart
APP_USER=shopsmart
SECRETS_DIR=/root/.shopsmart

if [ "$(id -u)" -ne 0 ]; then echo "Please run with sudo: sudo bash deploy/ec2-setup.sh"; exit 1; fi

echo "==> Finding this instance's public address"
IMDS_TOKEN=$(curl -sfX PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 300')
PUBLIC_IP=$(curl -sf -H "X-aws-ec2-metadata-token: ${IMDS_TOKEN}" http://169.254.169.254/latest/meta-data/public-ipv4)
SITE_HOST="${PUBLIC_IP//./-}.sslip.io"
echo "    Site address will be: https://${SITE_HOST}"

read -rsp "Paste your Gemini API key and press Enter (or just press Enter to use the catalog fallback): " GEMINI_KEY
echo

echo "==> Adding 1 GB swap so the build fits in memory"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Installing packages (Node 22, PostgreSQL, Caddy)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg openssl postgresql debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> Creating secrets (kept only on this server)"
mkdir -p "${SECRETS_DIR}" && chmod 700 "${SECRETS_DIR}"
[ -s "${SECRETS_DIR}/db-password" ] || openssl rand -hex 16 > "${SECRETS_DIR}/db-password"
[ -s "${SECRETS_DIR}/session-secret" ] || openssl rand -hex 32 > "${SECRETS_DIR}/session-secret"
chmod 600 "${SECRETS_DIR}"/*
DB_PASSWORD=$(cat "${SECRETS_DIR}/db-password")
SESSION_SECRET=$(cat "${SECRETS_DIR}/session-secret")

echo "==> Preparing PostgreSQL (local only, not reachable from the internet)"
systemctl enable --now postgresql
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='shopsmart_user'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE shopsmart_user LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='shopsmart'" | grep -q 1; then
  sudo -u postgres createdb -O shopsmart_user shopsmart
fi

echo "==> Getting the code"
id -u "${APP_USER}" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "${APP_USER}"
if [ -d "${APP_DIR}/.git" ]; then
  sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --ff-only
else
  git clone "${REPO_URL}" "${APP_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
fi

echo "==> Writing server-only configuration"
if [ -z "${GEMINI_KEY}" ] && [ -f "${APP_DIR}/backend/.env" ]; then
  GEMINI_KEY=$(grep '^GEMINI_API_KEY=' "${APP_DIR}/backend/.env" | cut -d= -f2- || true)
fi
umask 077
cat > "${APP_DIR}/backend/.env" <<ENVFILE
DATABASE_URL=postgresql://shopsmart_user:${DB_PASSWORD}@localhost:5432/shopsmart?schema=public
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://${SITE_HOST}
SESSION_SECRET=${SESSION_SECRET}
TRUST_PROXY=1
SERVE_FRONTEND=true
GEMINI_API_KEY=${GEMINI_KEY}
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_MS=8000
ENVFILE
printf 'VITE_API_URL=/api\n' > "${APP_DIR}/frontend/.env"
umask 022
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/backend/.env" "${APP_DIR}/frontend/.env"

echo "==> Installing dependencies, applying migrations, building the frontend"
cd "${APP_DIR}"
sudo -u "${APP_USER}" npm ci --no-audit --no-fund
sudo -u "${APP_USER}" npm run db:generate
sudo -u "${APP_USER}" npm run db:deploy
PRODUCT_COUNT=$(sudo -u postgres psql -d shopsmart -tAc 'SELECT COUNT(*) FROM "Product"')
if [ "${PRODUCT_COUNT}" = "0" ]; then
  echo "    Empty database: inserting the fictional sample products once"
  sudo -u "${APP_USER}" npm run db:seed
else
  echo "    Database already has ${PRODUCT_COUNT} products: keeping existing products and orders"
fi
sudo -u "${APP_USER}" npm run build

echo "==> Running the API as a service (starts on boot, restarts on crash)"
cat > /etc/systemd/system/shopsmart.service <<UNIT
[Unit]
Description=ShopSmart Express API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable shopsmart >/dev/null
systemctl restart shopsmart

echo "==> Configuring HTTPS with Caddy"
cat > /etc/caddy/Caddyfile <<CADDY
${SITE_HOST} {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl enable caddy >/dev/null
systemctl restart caddy

echo "==> Checking the API"
sleep 5
curl -s http://127.0.0.1:3000/api/health || true
echo
echo "Done. Open: https://${SITE_HOST}"
echo "Health:    https://${SITE_HOST}/api/health"
echo "Logs:      sudo journalctl -u shopsmart -n 50 --no-pager"
