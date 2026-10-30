$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$desktopProject = [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('Desktop')) 'FasoConnect'))
$settingsFile = Join-Path $sourceRoot 'local.settings.json'
if (-not (Test-Path -LiteralPath $settingsFile)) { throw 'Exécuter en premier scripts/configure.py.' }
$settings = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
$privateRoot = [IO.Path]::GetFullPath($settings.privateDirectory)
$privateEnv = Join-Path $privateRoot '.env'
if (-not (Test-Path -LiteralPath $privateEnv)) { throw 'Configuration privée introuvable.' }
if ($privateRoot -match '(?i)onedrive') { throw 'Les secrets doivent rester hors OneDrive.' }

function Copy-ProjectTree([string]$From, [string]$To, [bool]$GitOnly = $false) {
  if ($GitOnly) {
    & robocopy $From $To /E /NFL /NDL /NJH /NJS /NP | Out-Null
  } else {
    & robocopy $From $To /E /XD .git node_modules __pycache__ dist work /XF .env .demo-activation.json .test-*.json *.gpg /NFL /NDL /NJH /NJS /NP | Out-Null
  }
  if ($LASTEXITCODE -ge 8) { throw 'Échec de synchronisation des fichiers.' }
}

if ($sourceRoot -ne $desktopProject) {
  $baseline = @{}
  $gitAvailable = [bool](Get-Command git -ErrorAction SilentlyContinue)
  if ($gitAvailable -and (Test-Path -LiteralPath (Join-Path $sourceRoot '.git'))) {
    & git -C $sourceRoot ls-tree -r --format='%(objectname) %(path)' 0427155 2>$null | ForEach-Object {
      $parts = $_ -split ' ',2
      if ($parts.Length -eq 2) { $baseline[$parts[1]] = $parts[0] }
    }
    $trackedPaths = @(& git -C $sourceRoot ls-files)
  } else {
    $trackedPaths = @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git|dist|work|__pycache__)[\\/]' } | ForEach-Object { $_.FullName.Substring($sourceRoot.Length+1) })
  }
  $preservedRoot = Join-Path $privateRoot ('edits-bureau-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))
  $preservedCount = 0
  foreach ($relative in $trackedPaths) {
    $relative = $relative.Replace('\','/')
    $targetFile = [IO.Path]::GetFullPath((Join-Path $desktopProject $relative))
    $sourceFile = [IO.Path]::GetFullPath((Join-Path $sourceRoot $relative))
    if (-not $targetFile.StartsWith($desktopProject + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Chemin cible invalide.' }
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { continue }
    if (-not (Test-Path -LiteralPath $targetFile -PathType Leaf)) { continue }
    if ($gitAvailable) {
      $targetHash = & git -C $sourceRoot hash-object "--path=$relative" -- $targetFile
      $sourceHash = & git -C $sourceRoot hash-object "--path=$relative" -- $sourceFile
    } else {
      $targetHash = (Get-FileHash -LiteralPath $targetFile).Hash
      $sourceHash = (Get-FileHash -LiteralPath $sourceFile).Hash
    }
    if ($targetHash -ne $sourceHash -and (-not $baseline.ContainsKey($relative) -or $targetHash -ne $baseline[$relative])) {
      $preservedFile = [IO.Path]::GetFullPath((Join-Path $preservedRoot $relative))
      if (-not $preservedFile.StartsWith($preservedRoot + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Chemin de préservation invalide.' }
      New-Item -ItemType Directory -Force -Path (Split-Path $preservedFile -Parent) | Out-Null
      Copy-Item -LiteralPath $targetFile -Destination $preservedFile
      $preservedCount++
    }
  }
  Copy-ProjectTree $sourceRoot $desktopProject
  if ((Test-Path -LiteralPath (Join-Path $sourceRoot '.git')) -and -not (Test-Path -LiteralPath (Join-Path $desktopProject '.git'))) {
    Copy-ProjectTree (Join-Path $sourceRoot '.git') (Join-Path $desktopProject '.git') $true
  }
  Write-Host "Projet copié sur le Bureau. Modifications préservées en privé : $preservedCount."
}

Push-Location $desktopProject
try {
  $env:COMPOSE_ENV_FILES = $privateEnv
  & docker compose --env-file $privateEnv config --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Configuration Docker invalide.' }
  & docker compose --env-file $privateEnv up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'La construction ou le démarrage a échoué.' }
  & docker compose --env-file $privateEnv exec -T proxy caddy reload --config /etc/caddy/Caddyfile --address 127.0.0.1:2019
  if ($LASTEXITCODE -ne 0) { throw 'Le rechargement HTTPS a échoué.' }
  $required = @('db','identity-db','identity','synapse','admin','proxy','service-client','ai')
  $ready = $false
  for ($attempt=0; $attempt -lt 90; $attempt++) {
    $ready = $true
    foreach ($service in $required) {
      $containerId = & docker compose --env-file $privateEnv ps -q $service
      if (-not $containerId) { $ready = $false; break }
      $health = & docker inspect --format '{{.State.Health.Status}}' $containerId
      if ($health -ne 'healthy') { $ready = $false; break }
    }
    if ($ready) { break }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { throw 'Un service reste non prêt. Consulter docker compose ps et les journaux locaux.' }
  $serviceResponse = Invoke-WebRequest 'https://localhost/service/' -UseBasicParsing
  if ($serviceResponse.StatusCode -ne 200) { throw 'Le client HTTPS ne répond pas correctement.' }
  $login = Invoke-RestMethod 'https://localhost/_matrix/client/v3/login'
  if ($login.flows.type -contains 'm.login.password') { throw 'La connexion Matrix par mot de passe doit rester désactivée.' }
  $blocked = $null
  try { $blocked = (Invoke-WebRequest 'https://localhost/_matrix/federation/v1/version' -UseBasicParsing).StatusCode }
  catch { if ($_.Exception.Response) { $blocked = [int]$_.Exception.Response.StatusCode } else { throw } }
  if ($blocked -ne 403) { throw 'Le refus de fédération doit répondre 403.' }
  $result = [ordered]@{
    dateUtc = [DateTime]::UtcNow.ToString('o')
    project = $desktopProject
    requiredServicesHealthy = $true
    httpsClient = 200
    matrixPasswordLoginDisabled = $true
    federationBlocked = 403
    secretsOutsideOneDrive = $true
  }
  $result | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $desktopProject 'etat-final-local.json')
  Write-Host 'Finalisation locale vérifiée : https://localhost/service/ et https://localhost/admin/'
  Write-Host 'Les secrets restent dans le dossier privé ; aucune donnée sensible copiée sur le Bureau.'
} finally { Pop-Location }

