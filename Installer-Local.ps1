$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath 'local.settings.json')) {
        $localPrivateDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'FasoConnect-prive'
        & python scripts/configure.py --domain localhost --private-dir $localPrivateDirectory
        if ($LASTEXITCODE -ne 0) { throw 'La configuration a echoue.' }
    }
    $localSettings = Get-Content -LiteralPath 'local.settings.json' -Raw | ConvertFrom-Json
    $localEnvFile = Join-Path $localSettings.privateDirectory '.env'
    & docker compose --env-file $localEnvFile up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'Le demarrage Docker a echoue. Consulter les journaux des services.' }
    & python scripts/demo.py
    if ($LASTEXITCODE -ne 0) { throw 'La creation des comptes fictifs a echoue.' }
    & docker compose --env-file $localEnvFile cp proxy:/data/caddy/pki/authorities/local/root.crt local-ca.crt
    if ($LASTEXITCODE -ne 0) { throw 'Le certificat local est indisponible.' }
    $localAuthority = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2((Join-Path $PSScriptRoot 'local-ca.crt'))
    if (-not (Test-Path -LiteralPath ('Cert:\CurrentUser\Root\' + $localAuthority.Thumbprint))) {
        Import-Certificate -FilePath './local-ca.crt' -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    }
    Write-Host 'Messagerie : https://localhost/service/'
    Write-Host 'Administration : https://localhost/admin/'
    Write-Host 'Identifiants fictifs : .demo-activation.json dans le dossier prive indique par local.settings.json.'
    Write-Host 'La premiere connexion demande un nouveau mot de passe et un TOTP.'
} finally { Pop-Location }
