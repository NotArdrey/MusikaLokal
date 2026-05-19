param(
  [switch]$SkipInstall,
  [switch]$Combined
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path $PSScriptRoot).ProviderPath
$MobileDir = Join-Path $ProjectRoot "mobile"
$WebDir = Join-Path $ProjectRoot "web"

Write-Host "Starting MusikaLokal dev environment..."

function Assert-PackageExists {
  param(
    [string]$PackageDir,
    [string]$Label
  )

  if (-not (Test-Path (Join-Path $PackageDir "package.json"))) {
    throw "$Label package not found at `"$PackageDir`"."
  }
}

function Install-MissingDependencies {
  if ($SkipInstall) {
    return
  }

  if (-not (Test-Path (Join-Path $MobileDir "node_modules"))) {
    Write-Host "Installing mobile dependencies..."
    npm --prefix $MobileDir install
  }

  if (-not (Test-Path (Join-Path $WebDir "node_modules"))) {
    Write-Host "Installing web dependencies..."
    npm --prefix $WebDir install
  }
}

function Request-SeparateVSCodeTerminals {
  $CodeCommand = Get-Command code.cmd -ErrorAction SilentlyContinue

  if (-not $CodeCommand) {
    return $false
  }

  $RequestDir = Join-Path $ProjectRoot ".vscode"
  $RequestPath = Join-Path $RequestDir "start-dev.request"
  $Request = @{
    createdAt = (Get-Date).ToString("o")
    skipInstall = [bool]$SkipInstall
  } | ConvertTo-Json -Compress

  New-Item -ItemType Directory -Force -Path $RequestDir | Out-Null
  Set-Content -LiteralPath $RequestPath -Value $Request -Encoding ASCII

  Write-Host "Opening Expo and Vite in separate VS Code terminal tabs..."
  & $CodeCommand.Source -r "$ProjectRoot\."
  return $true
}

function Start-CombinedTerminal {
  Install-MissingDependencies

  npx --yes concurrently `
    --kill-others-on-fail `
    --names "mobile,web" `
    --prefix "[{name}]" `
    --prefix-colors "cyan,magenta" `
    "npm --prefix `"$MobileDir`" start" `
    "npm --prefix `"$WebDir`" run dev"
}

Assert-PackageExists -PackageDir $MobileDir -Label "Mobile"
Assert-PackageExists -PackageDir $WebDir -Label "Web"

if (-not $Combined) {
  if (Request-SeparateVSCodeTerminals) {
    Write-Host "Mobile terminal: npm run start"
    Write-Host "Web terminal: npm run dev"
    return
  }

  Write-Host "VS Code command line launcher code.cmd was not found; running both servers in this terminal."
}

Start-CombinedTerminal
