param(
    [string]$EnvFile = ".env",
    [string]$ProjectRef = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvFile)) {
    throw "Env file not found: $EnvFile"
}

$lines = Get-Content $EnvFile

function Get-EnvValue {
    param([string]$Name)

    $line = $lines | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
    if (-not $line) {
        return ""
    }

    $parts = $line -split '=', 2
    if ($parts.Count -lt 2) {
        return ""
    }

    return $parts[1].Trim()
}

if (-not $ProjectRef) {
    $url = Get-EnvValue -Name 'EXPO_PUBLIC_SUPABASE_URL'
    if ($url) {
        $ProjectRef = ($url -replace '^https://', '' -replace '\.supabase\.co/?$', '')
    }
}

if (-not $ProjectRef) {
    throw "Unable to determine project ref. Pass -ProjectRef or set EXPO_PUBLIC_SUPABASE_URL in $EnvFile"
}

$secretNames = @(
    'GROQ_API_KEY',
    'GROQ_FALLBACK_API_KEY',
    'FACE_RECOGNITION_URL',
    'FACE_RECOGNITION_API_KEY',
    'FACE_RECOGNITION_TIMEOUT_MS',
    'FACE_GROUP_MAX_MEMBERS',
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
    'ACRCLOUD_HOST',
    'ACRCLOUD_ACCESS_KEY',
    'ACRCLOUD_ACCESS_SECRET',
    'ACRCLOUD_MIN_SCORE',
    'ACRCLOUD_CONSOLE_TOKEN',
    'ACRCLOUD_CUSTOM_BUCKET_ID',
    'ACRCLOUD_CUSTOM_HOST',
    'ACRCLOUD_CUSTOM_ACCESS_KEY',
    'ACRCLOUD_CUSTOM_ACCESS_SECRET'
)
$secretPairs = @()
$configuredKeys = @()

foreach ($name in $secretNames) {
    $value = Get-EnvValue -Name $name
    if (-not $value) {
        continue
    }

    if ($value -match '^(YOUR_|CHANGE_ME|<)') {
        continue
    }

    $secretPairs += "$name=$value"
    $configuredKeys += $name
}

if ($secretPairs.Count -eq 0) {
    throw "No Edge Function secrets found in $EnvFile. Add GROQ_API_KEY, FACE_RECOGNITION_URL, OPENAI_API_KEY, or ACRCLOUD_* values and rerun."
}

Write-Host "Setting $($secretPairs.Count) Edge Function secret(s) on project $ProjectRef ..."
& npx supabase secrets set --project-ref $ProjectRef @secretPairs

if ($LASTEXITCODE -ne 0) {
    throw "Failed to set Supabase secrets. Ensure you are logged in: npx supabase login"
}

Write-Host ("Configured keys: " + ($configuredKeys -join ', '))
Write-Host "Done. Deploy the functions next:"
Write-Host "  npx supabase functions deploy upload-safety-screen --project-ref $ProjectRef --no-verify-jwt"
Write-Host "  npx supabase functions deploy gig-applications --project-ref $ProjectRef --no-verify-jwt"
