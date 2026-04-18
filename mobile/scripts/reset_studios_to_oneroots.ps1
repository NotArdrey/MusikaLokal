$ErrorActionPreference = 'Stop'

$projectRef = 'aefldxegsvzecshlayza'
$base = "https://$projectRef.supabase.co/rest/v1"
$authBase = "https://$projectRef.supabase.co/auth/v1"
$pat = 'sbp_8e8439a1bdf2c0ea6de848d0572cbba5fdbe308e'

Set-Location 'c:\Users\Neila\MusikaLokal\mobile'
$env:SUPABASE_ACCESS_TOKEN = $pat
$keys = npx supabase projects api-keys --project-ref $projectRef -o json | ConvertFrom-Json
$serviceKey = ($keys | Where-Object { $_.id -eq 'service_role' -or $_.name -eq 'service_role' } | Select-Object -First 1).api_key

$restHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = 'return=representation,resolution=merge-duplicates' }
$deleteHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = 'return=minimal' }
$authHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }

function Invoke-JsonPost($uri, $body, $headers) {
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10 -Compress)
}

function Invoke-JsonPatch($uri, $body, $headers) {
  Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10 -Compress)
}

function Ensure-Profile($profile) {
  try {
    Invoke-JsonPost "$base/profiles" $profile $restHeaders | Out-Null
  } catch {
    $id = $profile.id
    $patchBody = @{}
    foreach ($key in $profile.Keys) {
      if ($key -ne 'id') {
        $patchBody[$key] = $profile[$key]
      }
    }

    if ([string]::IsNullOrWhiteSpace($id) -and -not [string]::IsNullOrWhiteSpace($profile.email)) {
      $encodedEmail = [uri]::EscapeDataString($profile.email)
      Invoke-JsonPatch "$base/profiles?email=eq.$encodedEmail" $patchBody $restHeaders | Out-Null
      return
    }

    if ([string]::IsNullOrWhiteSpace($id)) {
      throw
    }

    Invoke-JsonPatch "$base/profiles?id=eq.$id" $patchBody $restHeaders | Out-Null
  }
}

function Ensure-AdminUser($email, $password, $displayName) {
  $body = @{
    email = $email
    password = $password
    email_confirm = $true
    user_metadata = @{ full_name = $displayName }
  }

  try {
    $response = Invoke-JsonPost "$authBase/admin/users" $body $authHeaders
    if ($response.user) {
      return $response.user.id
    }
    return $response.id
  } catch {
    $usersResponse = Invoke-RestMethod -Method Get -Uri "$authBase/admin/users?page=1&per_page=300" -Headers $authHeaders
    $existingUser = $usersResponse.users | Where-Object { $_.email -eq $email } | Select-Object -First 1
    if ($existingUser) {
      return $existingUser.id
    }
    throw
  }
}

$oneRoots = [ordered]@{
  owner_email = 'seed.oneroots.records@musikalokal.app'
  owner_name = 'OneRoots Records'
  owner_avatar_url = 'https://onerootsrecords.weebly.com/uploads/1/2/6/0/126010163/published/oneroots-logo-ping.png?1559873743'
  owner_location = 'Guiguinto, Bulacan, Philippines'
  owner_bio = 'Independent recording and music production studio operating under the OneRoots Records banner in Bulacan.'
  studio_name = 'OneRoots Records'
  address = 'MacArthur Highway, Tabang, Ilang-ilang, Guiguinto, Bulacan, Philippines'
  description = 'Recording and music production studio in Guiguinto, Bulacan for solo artists, bands, and local releases.'
  image = 'https://onerootsrecords.weebly.com/uploads/1/2/6/0/126010163/published/oneroots-logo-ping.png?1559873743'
  studio_type = 'Recording Studio'
  amenities = @('Recording', 'Mixing', 'Music Production', 'Wi-Fi')
  hourly_rate = 1500
  rehearsal_rate = 1200
  recording_rate = 1500
  pax = 8
  latitude = 14.8336802
  longitude = 120.8656847
}

$existingStudiosResponse = Invoke-RestMethod -Method Get -Uri "$base/studios?select=id,name" -Headers $restHeaders
$existingStudios = @($existingStudiosResponse | Where-Object { $_ -ne $null })
$studiosToRemove = @($existingStudios | Where-Object { $_.name -ne $oneRoots.studio_name })

if ($studiosToRemove.Count -gt 0) {
  $studioIdsToRemove = @($studiosToRemove | ForEach-Object { $_.id })
  $studioIdFilter = ($studioIdsToRemove | ForEach-Object { '"' + $_ + '"' }) -join ','
  $activeBookingsResponse = Invoke-RestMethod -Method Get -Uri "$base/studio_bookings?select=id,studio_id,status&studio_id=in.($studioIdFilter)&status=in.(pending,confirmed,checked_in,pending_relocation)" -Headers $restHeaders
  $activeBookings = @($activeBookingsResponse | Where-Object { $_ -ne $null })

  if ($activeBookings.Count -gt 0) {
    throw "Cleanup blocked because one or more incorrect studios still have active bookings."
  }

  Invoke-RestMethod -Method Delete -Uri "$base/studios?id=in.($studioIdFilter)" -Headers $deleteHeaders | Out-Null
}

$ownerId = Ensure-AdminUser $oneRoots.owner_email 'MusikaLokal!2026' $oneRoots.owner_name
Ensure-Profile ([ordered]@{
  id = $ownerId
  email = $oneRoots.owner_email
  full_name = $oneRoots.owner_name
  role = 'studio-owner'
  avatar_url = $oneRoots.owner_avatar_url
  bio = $oneRoots.owner_bio
  location = $oneRoots.owner_location
})

$existingOneRootsResponse = Invoke-RestMethod -Method Get -Uri "$base/studios?select=id,name&name=eq.OneRoots%20Records" -Headers $restHeaders
$existingOneRoots = @($existingOneRootsResponse | Where-Object { $_ -ne $null })
$studioBody = [ordered]@{
  owner_id = $ownerId
  name = $oneRoots.studio_name
  address = $oneRoots.address
  hourly_rate = $oneRoots.hourly_rate
  description = $oneRoots.description
  latitude = $oneRoots.latitude
  longitude = $oneRoots.longitude
  rate = $oneRoots.hourly_rate
  rehearsal_rate = $oneRoots.rehearsal_rate
  recording_rate = $oneRoots.recording_rate
  pax = $oneRoots.pax
  permit_status = 'approved'
}

if ($existingOneRoots.Count -gt 0) {
  $oneRootsStudioId = $existingOneRoots[0].id
  Invoke-JsonPatch "$base/studios?id=eq.$oneRootsStudioId" $studioBody $restHeaders | Out-Null
} else {
  $insertedStudio = Invoke-JsonPost "$base/studios" $studioBody $restHeaders
  $oneRootsStudioId = $insertedStudio[0].id
}

Invoke-RestMethod -Method Delete -Uri "$base/studio_media?studio_id=eq.$oneRootsStudioId" -Headers $deleteHeaders | Out-Null
Invoke-RestMethod -Method Delete -Uri "$base/studio_types?studio_id=eq.$oneRootsStudioId" -Headers $deleteHeaders | Out-Null
Invoke-RestMethod -Method Delete -Uri "$base/studio_amenities?studio_id=eq.$oneRootsStudioId" -Headers $deleteHeaders | Out-Null
Invoke-RestMethod -Method Delete -Uri "$base/studio_operating_hours?studio_id=eq.$oneRootsStudioId" -Headers $deleteHeaders | Out-Null
Invoke-RestMethod -Method Delete -Uri "$base/studio_settings?studio_id=eq.$oneRootsStudioId" -Headers $deleteHeaders | Out-Null

Invoke-JsonPost "$base/studio_media" @([ordered]@{ studio_id = $oneRootsStudioId; media_type = 'image'; media_url = $oneRoots.image; sort_order = 0 }) $restHeaders | Out-Null
Invoke-JsonPost "$base/studio_types" @([ordered]@{ studio_id = $oneRootsStudioId; studio_type = $oneRoots.studio_type }) $restHeaders | Out-Null
Invoke-JsonPost "$base/studio_amenities" @($oneRoots.amenities | ForEach-Object { [ordered]@{ studio_id = $oneRootsStudioId; amenity = $_ } }) $restHeaders | Out-Null
Invoke-JsonPost "$base/studio_operating_hours" @(0..6 | ForEach-Object { [ordered]@{ studio_id = $oneRootsStudioId; day_of_week = $_; is_open = $true; open_time = '10:00'; close_time = '22:00'; slot_order = 0 } }) $restHeaders | Out-Null
Invoke-JsonPost "$base/studio_settings" @([ordered]@{ studio_id = $oneRootsStudioId; buffer_minutes = 30; lead_time_hours = 24; slot_increment_minutes = 60; min_booking_duration_hours = 1; max_booking_duration_hours = 8; booking_horizon_days = 90; weekend_multiplier = 1.0; peak_season_multiplier = 1.0; off_peak_multiplier = 1.0; holiday_multiplier = 1.0 }) $restHeaders | Out-Null

[ordered]@{
  removedStudios = @($studiosToRemove | ForEach-Object { $_.name })
  studioCount = @((Invoke-RestMethod -Method Get -Uri "$base/studios?select=id" -Headers $restHeaders)).Count
  remainingStudios = @(Invoke-RestMethod -Method Get -Uri "$base/studios_with_stats?select=name,location,images,permit_status&order=created_at.asc" -Headers $restHeaders)
} | ConvertTo-Json -Depth 6