$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  if (-not (Test-Path -LiteralPath 'local.settings.json')) {
    python scripts/configure.py --domain localhost
    if ($LASTEXITCODE -ne 0) { throw 'La configuration a échoué.' }
  }
  $localSettings = Get-Content -LiteralPath 'local.settings.json' -Raw | ConvertFrom-Json
  $privateEnv = Join-Path $localSettings.privateDirectory '.env'
  $env:COMPOSE_ENV_FILES = $privateEnv
  docker compose --env-file $privateEnv up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'Le démarrage Docker a échoué.' }
  docker compose --env-file $privateEnv cp proxy:/data/caddy/pki/authorities/local/root.crt local-ca.crt
  Write-Host 'FasoConnect : https://localhost/service/'
  Write-Host 'Administration : https://localhost/admin/'
  Write-Host 'Le certificat doit être approuvé dans le profil de test ; les secrets restent dans le dossier privé.'
} finally { Pop-Location }
