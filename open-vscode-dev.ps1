param(
  [switch]$ReuseWindow
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path $PSScriptRoot).ProviderPath
$LauncherExtensionSource = Join-Path $ProjectRoot ".vscode\musika-dev-launcher"
$ExtensionsRoot = Join-Path $env:USERPROFILE ".vscode\extensions"
$LauncherExtensionTarget = Join-Path $ExtensionsRoot "local.musika-lokal-dev-launcher-0.0.1"
$CodeCommand = Get-Command code.cmd -ErrorAction SilentlyContinue

if (-not $CodeCommand) {
  throw "Visual Studio Code command line launcher code.cmd was not found."
}

if (-not (Test-Path (Join-Path $LauncherExtensionSource "package.json"))) {
  throw "VS Code launcher extension source was not found at $LauncherExtensionSource."
}

New-Item -ItemType Directory -Force -Path $ExtensionsRoot | Out-Null

if (Test-Path $LauncherExtensionTarget) {
  $resolvedTarget = (Resolve-Path $LauncherExtensionTarget).ProviderPath
  $resolvedExtensionsRoot = (Resolve-Path $ExtensionsRoot).ProviderPath

  if (-not $resolvedTarget.StartsWith($resolvedExtensionsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace unexpected extension path: $resolvedTarget"
  }

  Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}

Copy-Item -Path $LauncherExtensionSource -Destination $LauncherExtensionTarget -Recurse -Force

$startRequest = Join-Path $ProjectRoot ".vscode\start-dev.request"
Set-Content -LiteralPath $startRequest -Value (Get-Date).ToString("o") -Encoding ASCII

Write-Host "Opening MusikaLokal in VS Code..."
Write-Host "VS Code will start Expo and Vite in separate integrated terminal tabs."

$WindowArg = if ($ReuseWindow) { "-r" } else { "-n" }
& $CodeCommand.Source $WindowArg "$ProjectRoot\."
