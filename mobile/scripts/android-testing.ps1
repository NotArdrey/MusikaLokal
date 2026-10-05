param([switch]$CheckOnly, [string]$SdkPath = "")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$mobileRoot = Split-Path $PSScriptRoot -Parent
$repositoryRoot = Split-Path $mobileRoot -Parent
$androidRoot = Join-Path $mobileRoot "android"
$outputRoot = Join-Path $mobileRoot "build/testing"
$signingRoot = Join-Path $mobileRoot ".testing-signing"

function Assert-Success([string]$Action) {
  if ($LASTEXITCODE -ne 0) { throw "$Action failed (exit $LASTEXITCODE)." }
}

$sdkCandidates = if ($SdkPath) { @($SdkPath) } else {
  @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA "Android/Sdk")) | Where-Object { $_ }
}
$sdk = $sdkCandidates | Where-Object {
  (Test-Path (Join-Path $_ "platforms/android-36/android.jar")) -and
  (Test-Path (Join-Path $_ "build-tools/36.0.0/apksigner.bat")) -and
  (Test-Path (Join-Path $_ "ndk/27.1.12297006/source.properties")) -and
  (Test-Path (Join-Path $_ "licenses/android-sdk-license"))
} | Select-Object -First 1
if (-not $sdk) {
  throw "Install Android platform 36, Build Tools 36.0.0, NDK 27.1.12297006 and accept SDK licenses in Android Studio. Pass -SdkPath to select that SDK."
}
$sdk = (Resolve-Path -LiteralPath $sdk).Path
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:NODE_ENV = "production"
$java = Get-Command java -ErrorAction Stop
$javaStart = [System.Diagnostics.ProcessStartInfo]::new()
$javaStart.FileName = $java.Source
$javaStart.Arguments = "-version"
$javaStart.UseShellExecute = $false
$javaStart.RedirectStandardError = $true
$javaStart.RedirectStandardOutput = $true
$javaStart.CreateNoWindow = $true
$javaProcess = [System.Diagnostics.Process]::Start($javaStart)
$javaVersion = $javaProcess.StandardError.ReadToEnd() + $javaProcess.StandardOutput.ReadToEnd()
$javaProcess.WaitForExit()
if ($javaProcess.ExitCode -ne 0) { throw "Java version check failed." }
if ($javaVersion -notmatch 'version "(\d+)' -or [int]$Matches[1] -lt 17) {
  throw "Java 17 or newer is required."
}
Write-Host "Android SDK: $sdk"
Write-Host "Java, platform 36, Build Tools 36.0.0, NDK 27.1.12297006 and SDK license found."
if ($CheckOnly) { exit 0 }

Push-Location $mobileRoot
try {
  New-Item -ItemType Directory -Force -Path $signingRoot, $outputRoot | Out-Null
  $savedKeystore = Join-Path $signingRoot "debug.keystore"
  $nativeKeystore = Join-Path $androidRoot "app/debug.keystore"
  if (-not (Test-Path $savedKeystore) -and (Test-Path $nativeKeystore)) {
    Copy-Item -LiteralPath $nativeKeystore -Destination $savedKeystore
  }
  # Clean prebuild only regenerates the ignored native project within mobile/.
  $resolvedAndroid = [System.IO.Path]::GetFullPath($androidRoot)
  if ($resolvedAndroid -ne [System.IO.Path]::GetFullPath((Join-Path $mobileRoot "android"))) {
    throw "Unexpected native project path."
  }
  & node node_modules/expo/bin/cli prebuild --platform android --clean --no-install
  Assert-Success "Android prebuild"
  if (Test-Path $savedKeystore) {
    Copy-Item -LiteralPath $savedKeystore -Destination $nativeKeystore -Force
  } else {
    Copy-Item -LiteralPath $nativeKeystore -Destination $savedKeystore
  }
  Set-Content -LiteralPath (Join-Path $androidRoot "local.properties") -Value ("sdk.dir=" + $sdk.Replace('\', '/')) -Encoding ASCII
  $gradleSource = Get-Content (Join-Path $androidRoot "app/build.gradle") -Raw
  if ($gradleSource -notmatch '(?s)release\s*\{.*?signingConfig signingConfigs.debug') {
    throw "The testing release must use the preserved debug signing key."
  }
  Push-Location $androidRoot
  try {
    & .\gradlew.bat :app:assembleRelease --console=plain --no-daemon --max-workers=2 --no-parallel '-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m' '-PreactNativeArchitectures=arm64-v8a,x86_64'
    Assert-Success "Release APK build"
  } finally { Pop-Location }

  $apk = Join-Path $outputRoot "musikalokal-testing.apk"
  Copy-Item -LiteralPath (Join-Path $androidRoot "app/build/outputs/apk/release/app-release.apk") -Destination $apk -Force
  $signature = & (Join-Path $sdk "build-tools/36.0.0/apksigner.bat") verify --verbose --print-certs $apk
  Assert-Success "APK signature verification"
  $signature | Write-Host
  $fingerprintLine = $signature | Where-Object { $_ -match '^Signer #1 certificate SHA-256 digest:' } | Select-Object -First 1
  if (-not $fingerprintLine) { throw "APK signing certificate fingerprint missing." }
  $fingerprint = ($fingerprintLine -split ': ', 2)[1].Trim()
  $fingerprintFile = Join-Path $signingRoot "certificate.sha256"
  if ((Test-Path $fingerprintFile) -and (Get-Content $fingerprintFile -Raw).Trim() -ne $fingerprint) {
    throw "Testing signing identity changed. Restore the saved testing keystore."
  }
  Set-Content -LiteralPath $fingerprintFile -Value $fingerprint -Encoding ASCII

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($apk)
  try {
    $bundles = @($archive.Entries | Where-Object { $_.FullName -match '^assets/.*\.(bundle|hbc)$' })
    if ($bundles.Count -eq 0) { throw "APK does not contain a standalone JavaScript bundle." }
    $secretValues = @{}
    $localEnv = Join-Path $repositoryRoot ".env"
    if (Test-Path $localEnv) {
      foreach ($line in Get-Content -LiteralPath $localEnv) {
        if ($line -match '^\s*([A-Z0-9_]*(?:API_KEY|ACCESS_SECRET|SECRET_ACCESS_KEY|SERVICE_ROLE_KEY|ACCESS_KEY_ID))\s*=\s*(.+)\s*$') {
          $secretName = $Matches[1]
          $secretValue = $Matches[2].Trim().Trim('"').Trim("'")
          if ($secretValue.Length -gt 10) { $secretValues[$secretName] = $secretValue }
        }
      }
    }
    foreach ($entry in $archive.Entries | Where-Object { $_.FullName -match '^assets/.*\.(bundle|hbc|json)$' }) {
      $reader = [System.IO.StreamReader]::new($entry.Open())
      try { $contents = $reader.ReadToEnd() } finally { $reader.Dispose() }
      foreach ($secretName in $secretValues.Keys) {
        if ($contents.Contains($secretValues[$secretName])) { throw "Private credential $secretName found in APK. Do not publish it." }
      }
    }
  } finally { $archive.Dispose() }
  $badging = & (Join-Path $sdk "build-tools/36.0.0/aapt.exe") dump badging $apk
  Assert-Success "APK metadata inspection"
  $packageLine = $badging | Where-Object { $_ -match '^package:' } | Select-Object -First 1
  if ($packageLine -notmatch "name='com.anonymous.musikalokal' versionCode='1' versionName='1.0.0'") {
    throw "Unexpected package ID or testing version."
  }
  $sdkLine = $badging | Where-Object { $_ -match '^sdkVersion:' } | Select-Object -First 1
  if ($sdkLine -notmatch "sdkVersion:'(\d+)'") { throw "APK minimum SDK missing." }
  $minSdk = [int]$Matches[1]
  if ($badging -match '^application-debuggable') { throw "Release-mode APK unexpectedly enables debugging." }
  $sha256 = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$apk.sha256" -Value "$sha256  musikalokal-testing.apk" -Encoding ASCII
  $metadata = [ordered]@{
    packageId = "com.anonymous.musikalokal"; versionName = "1.0.0"; versionCode = 1
    sizeBytes = (Get-Item -LiteralPath $apk).Length; sha256 = $sha256; minSdk = $minSdk
    builtAt = [DateTime]::UtcNow.ToString("o"); certificateSha256 = $fingerprint; testing = $true
  }
  $metadata | ConvertTo-Json | Set-Content -LiteralPath "$apk.json" -Encoding UTF8
  Write-Host "Verified standalone testing APK: $apk"
  Write-Host "SHA-256: $sha256"
} finally { Pop-Location }
