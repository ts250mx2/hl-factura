# Despliegue desde Windows al servidor Ubuntu.
# Uso:  .\deploy\deploy.ps1 -Servidor usuario@74.208.192.90 [-Puerto 22]
# Requiere el cliente OpenSSH de Windows (ssh/scp, incluido en Windows 10/11).
param(
  [Parameter(Mandatory = $true)][string]$Servidor,
  [int]$Puerto = 22
)
$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
$zip = Join-Path $env:TEMP "hl-factura.zip"

Write-Host "== Empaquetando (sin node_modules/.next/data) ==" -ForegroundColor Cyan
if (Test-Path $zip) { Remove-Item $zip -Force }
$incluir = Get-ChildItem $raiz -Force | Where-Object {
  $_.Name -notin @("node_modules", ".next", "data", ".git")
}
Compress-Archive -Path ($incluir | ForEach-Object { $_.FullName }) -DestinationPath $zip
Write-Host ("Paquete: {0:N1} MB" -f ((Get-Item $zip).Length / 1MB))

Write-Host "== Subiendo al servidor ==" -ForegroundColor Cyan
scp -P $Puerto $zip "${Servidor}:/tmp/hl-factura.zip"

Write-Host "== Instalando/actualizando en el servidor ==" -ForegroundColor Cyan
ssh -p $Puerto $Servidor "sudo bash -c 'unzip -o /tmp/hl-factura.zip -d /opt/hl-factura >/dev/null 2>&1 || true; if [ ! -f /etc/systemd/system/hl-factura.service ]; then bash /opt/hl-factura/deploy/setup-servidor.sh; else chown -R hlfactura:hlfactura /opt/hl-factura && cd /opt/hl-factura && sudo -u hlfactura npm ci --no-audit --no-fund && sudo -u hlfactura npm run build && systemctl restart hl-factura && echo ACTUALIZADO; fi'"

Write-Host "== Listo ==" -ForegroundColor Green
Write-Host "Revisa: ssh -p $Puerto $Servidor 'systemctl status hl-factura'"
