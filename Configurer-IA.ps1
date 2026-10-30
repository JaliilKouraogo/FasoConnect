$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  if (-not (Test-Path -LiteralPath 'local.settings.json')) {
    python scripts/configure.py --domain localhost
    if ($LASTEXITCODE -ne 0) { throw 'Configuration locale impossible.' }
  }
  python scripts/setup_ai.py
  if ($LASTEXITCODE -ne 0) { throw 'Installation du modèle local impossible.' }
  Write-Host 'Ouvrez FasoConnect, puis Assistant IA local.'
} finally { Pop-Location }
