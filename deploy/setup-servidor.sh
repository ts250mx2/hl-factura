#!/usr/bin/env bash
# Instalación única en el servidor Ubuntu (ejecutar como root o con sudo).
# Uso: sudo bash setup-servidor.sh
set -euo pipefail

echo "== 1. Node.js 22 LTS =="
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== 2. Usuario de servicio y carpeta =="
id -u hlfactura &>/dev/null || useradd --system --home /opt/hl-factura --shell /usr/sbin/nologin hlfactura
mkdir -p /opt/hl-factura/data
chown -R hlfactura:hlfactura /opt/hl-factura

echo "== 3. Desempaquetar la aplicación =="
# El deploy.ps1 sube /tmp/hl-factura.zip
apt-get install -y unzip
unzip -o /tmp/hl-factura.zip -d /opt/hl-factura >/dev/null
chown -R hlfactura:hlfactura /opt/hl-factura

echo "== 4. Configurar .env (BD por localhost) =="
if [[ ! -f /opt/hl-factura/.env ]]; then
  cat > /opt/hl-factura/.env <<'ENV'
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=kyk
DB_PASSWORD=merkurio
DB_NAME=HLPortalContable
ENV
  chown hlfactura:hlfactura /opt/hl-factura/.env
  chmod 600 /opt/hl-factura/.env
fi

echo "== 5. Dependencias y build =="
cd /opt/hl-factura
sudo -u hlfactura npm ci --no-audit --no-fund
sudo -u hlfactura npm run build

echo "== 6. Servicio systemd =="
cp /opt/hl-factura/deploy/hl-factura.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable hl-factura
systemctl restart hl-factura

echo "== 7. Caddy (HTTPS) =="
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi
if ! grep -q "reverse_proxy 127.0.0.1:3000" /etc/caddy/Caddyfile 2>/dev/null; then
  cp /opt/hl-factura/deploy/Caddyfile /etc/caddy/Caddyfile
  echo ">>> EDITA /etc/caddy/Caddyfile con tu dominio y corre: systemctl reload caddy"
fi
systemctl enable caddy
systemctl restart caddy || true

echo ""
echo "== LISTO =="
systemctl --no-pager status hl-factura | head -5
echo "App interna: http://127.0.0.1:3000 — pública vía Caddy (443)."
echo "Sugerencia de seguridad: cierra MySQL al exterior con:"
echo "  ufw allow 22,80,443/tcp && ufw deny 3306/tcp && ufw enable"
