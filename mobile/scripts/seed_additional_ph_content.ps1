$ErrorActionPreference = 'Stop'

$projectRef = 'aefldxegsvzecshlayza'
$base = "https://$projectRef.supabase.co/rest/v1"
$authBase = "https://$projectRef.supabase.co/auth/v1"
$pat = 'sbp_8e8439a1bdf2c0ea6de848d0572cbba5fdbe308e'

Set-Location 'c:\Users\Neila\MusikaLokal\mobile'
$env:SUPABASE_ACCESS_TOKEN = $pat
$keys = npx supabase projects api-keys --project-ref $projectRef -o json | ConvertFrom-Json
$serviceKey = ($keys | Where-Object { $_.id -eq 'service_role' -or $_.name -eq 'service_role' } | Select-Object -First 1).api_key

$restHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = 'resolution=merge-duplicates,return=representation' }
$deleteHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = 'return=minimal' }
$authHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }

function Invoke-JsonPost($uri, $body, $headers) {
  try {
    Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8 -Compress)
  } catch {
    Write-Output "POST_FAILED: $uri"
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $reader.BaseStream.Position = 0
      $reader.DiscardBufferedData()
      Write-Output ($reader.ReadToEnd())
    }
    throw
  }
}

function Invoke-JsonPatch($uri, $body, $headers) {
  Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8 -Compress)
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
    $usersResponse = Invoke-RestMethod -Method Get -Uri "$authBase/admin/users?page=1&per_page=200" -Headers $authHeaders
    $existingUser = $usersResponse.users | Where-Object { $_.email -eq $email } | Select-Object -First 1
    if ($existingUser) {
      return $existingUser.id
    }
    throw
  }
}

$existingProfileUpdates = @(
  [ordered]@{ id = '14d2e916-8d1c-4c04-9877-7ccd9bea6149'; avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Ben%26Ben_in_2018_2.png/330px-Ben%26Ben_in_2018_2.png'; bio = 'Filipino indie folk-pop band from Manila formed by twins Paolo and Miguel Guico and expanded into one of the defining modern OPM acts.'; location = 'Manila, Philippines' },
  [ordered]@{ id = '330fbdba-7c73-487a-8c6c-ea32aacba445'; avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/IV_of_Spades_logo.jpg/330px-IV_of_Spades_logo.jpg'; bio = 'Filipino pop rock band from Metro Manila best known for breakout tracks like Mundo and their stylish funk-rock revival sound.'; location = 'Metro Manila, Philippines' },
  [ordered]@{ id = '6ef09c0f-790e-4247-bdcf-8717591f966b'; avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Lola_Amour_February_17_2024.jpg/330px-Lola_Amour_February_17_2024.jpg'; bio = 'Filipino rock band formed in Muntinlupa blending modern rock, funk, and pop into one of the most recognizable live acts in the country.'; location = 'Muntinlupa, Metro Manila' },
  [ordered]@{ id = '00000000-0000-0000-0000-000000000003'; avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/The_Juans_at_San_Marcelino%2C_Zambales_%282023%29.jpg/330px-The_Juans_at_San_Marcelino%2C_Zambales_%282023%29.jpg'; bio = 'Filipino pop rock band based in Bulacan known for harmony-driven OPM songs and steady touring across the Philippines.'; location = 'Bulacan, Philippines' },
  [ordered]@{ id = '40ff133c-4274-47b2-8143-6f4019b265c4'; avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Clara_Benin_2025_001.jpg/330px-Clara_Benin_2025_001.jpg'; bio = 'Filipino indie singer-songwriter from Manila best known for Parallel Universe and a gentle acoustic-folk style.'; location = 'Manila, Philippines' },
  [ordered]@{ id = 'e77711fc-b2c7-4983-b38f-ac188909767f'; avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Moira_performing_in_2019.jpg/330px-Moira_performing_in_2019.jpg'; bio = "Filipino singer-songwriter from Olongapo whose emotional OPM ballads made her one of the country's most streamed solo artists."; location = 'Olongapo, Philippines' }
)

foreach ($profile in $existingProfileUpdates) {
  $id = $profile.id
  $body = @{}
  foreach ($key in $profile.Keys) {
    if ($key -ne 'id') {
      $body[$key] = $profile[$key]
    }
  }
  Invoke-JsonPatch "$base/profiles?id=eq.$id" $body $restHeaders | Out-Null
}

$newArtists = @(
  [ordered]@{ slug='unique-salonga'; full_name='Unique Salonga'; email='seed.unique.salonga@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Unique_Salonga_IVOS_2025.jpg/330px-Unique_Salonga_IVOS_2025.jpg'; bio='Unique Torralba Salonga is a Filipino singer-songwriter, musician and producer best known for IV of Spades and his solo records.'; location='Manila, Philippines'; genre='pinoy rock'; group_name='Cup of Joe'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Cup_of_Joe_at_Aurora_Music_Festival_in_2025.jpg/330px-Cup_of_Joe_at_Aurora_Music_Festival_in_2025.jpg'; group_description='Filipino pop rock band based in Baguio whose breakout songs pushed them onto the Billboard Philippines chart.'; group_location='Baguio, Philippines'; latitude=16.4023; longitude=120.5960; rate=65000 },
  [ordered]@{ slug='zild-benitez'; full_name='Zild Benitez'; email='seed.zild.benitez@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Zild_Benitez_IVOS_2025.jpg/330px-Zild_Benitez_IVOS_2025.jpg'; bio='Daniel Zildjian Garon Benitez is a Filipino singer-songwriter, producer, and IV of Spades member with a strong solo catalog.'; location='Quezon City, Philippines'; genre='alternative pop'; group_name='SB19'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/SB19_at_the_Billboard_K_Power_100%2C_August_27_2024.jpg/330px-SB19_at_the_Billboard_K_Power_100%2C_August_27_2024.jpg'; group_description='Filipino boy band formed in 2018 that became one of the biggest acts in contemporary P-pop.'; group_location='Metro Manila, Philippines'; latitude=14.5995; longitude=120.9842; rate=95000 },
  [ordered]@{ slug='zack-tabudlo'; full_name='Zack Tabudlo'; email='seed.zack.tabudlo@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Zack_Tabudlo.png/330px-Zack_Tabudlo.png'; bio='Zack Tabudlo is a Filipino singer-songwriter whose pop hits made him one of the most visible young solo artists in the country.'; location='Las Pinas, Philippines'; genre='pop'; group_name='Parokya ni Edgar'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Fusion_Parokya_ni_Edgar.jpg/330px-Fusion_Parokya_ni_Edgar.jpg'; group_description='Filipino rock band formed in 1993, known nationwide for witty songwriting and genre-spanning live sets.'; group_location='Quezon City, Philippines'; latitude=14.6760; longitude=121.0437; rate=78000 },
  [ordered]@{ slug='arthur-nery'; full_name='Arthur Nery'; email='seed.arthur.nery@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Arthur_Nery_25Apr2025_03.jpg/330px-Arthur_Nery_25Apr2025_03.jpg'; bio='Arthur Nery is a Filipino singer-songwriter best known for soulful R and B hits such as Pagsamo.'; location='Cagayan de Oro, Philippines'; genre="r&b"; group_name='Eraserheads'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Eraserheads-Credit-WEU-Event-Management-Service-HERO%402000x1270.jpg/330px-Eraserheads-Credit-WEU-Event-Management-Service-HERO%402000x1270.jpg'; group_description='Seminal Quezon City rock band widely regarded as one of the most influential acts in Philippine music history.'; group_location='Quezon City, Philippines'; latitude=14.6760; longitude=121.0437; rate=90000 },
  [ordered]@{ slug='reese-lansangan'; full_name='Reese Lansangan'; email='seed.reese.lansangan@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Reese_Lansangan_Makati_on_17_June_2016.jpg/330px-Reese_Lansangan_Makati_on_17_June_2016.jpg'; bio='Reese Lansangan is a Filipino singer-songwriter, visual artist, and indie-pop mainstay known for adventurous songwriting.'; location='Manila, Philippines'; genre='indie folk'; group_name='Rivermaya'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/RivermayaNew.jpg/330px-RivermayaNew.jpg'; group_description='Filipino alternative rock band formed in 1994 that helped define the modern OPM band era.'; group_location='Manila, Philippines'; latitude=14.5995; longitude=120.9842; rate=85000 },
  [ordered]@{ slug='bamboo-manalac'; full_name='Bamboo Manalac'; email='seed.bamboo.manalac@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Bamboo_Manalac.jpg/330px-Bamboo_Manalac.jpg'; bio='Bamboo Manalac is a Filipino musician and songwriter known for Rivermaya, Bamboo, and a long-running solo career.'; location='Manila, Philippines'; genre='rock'; group_name='The Itchyworms'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/The_Itchyworms_2021_Band_Photo.jpg/330px-The_Itchyworms_2021_Band_Photo.jpg'; group_description='Filipino rock band known for sharp songwriting, melodic hooks, and enduring OPM staples like Akin Ka Na Lang and Beer.'; group_location='Manila, Philippines'; latitude=14.5995; longitude=120.9842; rate=68000 },
  [ordered]@{ slug='sarah-geronimo'; full_name='Sarah Geronimo'; email='seed.sarah.geronimo@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Sarah_G_Dubai_2011.jpg/330px-Sarah_G_Dubai_2011.jpg'; bio='Sarah Geronimo is one of the defining Filipino pop stars of her generation, known for vocal range and commanding live performances.'; location='Manila, Philippines'; genre='pop'; group_name='Silent Sanctuary'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Silent_Sanctuary.jpg/330px-Silent_Sanctuary.jpg'; group_description='Metro Manila rock band formed in 2001 whose emotional string-led sound became a staple of mainstream OPM.'; group_location='Metro Manila, Philippines'; latitude=14.5995; longitude=120.9842; rate=62000 },
  [ordered]@{ slug='kz-tandingan'; full_name='KZ Tandingan'; email='seed.kz.tandingan@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/KZ_Tandingan_at_Pagibang_Damara_Festival_2025_%28cropped%29.jpg/330px-KZ_Tandingan_at_Pagibang_Damara_Festival_2025_%28cropped%29.jpg'; bio='KZ Tandingan is a Filipino singer and rapper who rose to prominence after winning The X Factor Philippines.'; location='Digos, Davao del Sur, Philippines'; genre="r&b"; group_name='Bini'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Bini_Billboard_K_POWER_100_%28cropped%29.jpg/330px-Bini_Billboard_K_POWER_100_%28cropped%29.jpg'; group_description='Filipino girl group formed through Star Hunt Academy and now one of the most visible acts in contemporary P-pop.'; group_location='Metro Manila, Philippines'; latitude=14.5995; longitude=120.9842; rate=92000 },
  [ordered]@{ slug='yeng-constantino'; full_name='Yeng Constantino'; email='seed.yeng.constantino@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Yeng_Constantino.png/330px-Yeng_Constantino.png'; bio='Yeng Constantino is a Filipino singer-songwriter and guitarist often referred to as Pop Rock Royalty in the Philippines.'; location='Rizal, Philippines'; genre='pop rock'; group_name='The Ransom Collective'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/TRCband2016.jpg/330px-TRCband2016.jpg'; group_description='Filipino indie folk band recognized for bright, energetic arrangements and adventure-ready live songs.'; group_location='Manila, Philippines'; latitude=14.5995; longitude=120.9842; rate=60000 },
  [ordered]@{ slug='rico-blanco'; full_name='Rico Blanco'; email='seed.rico.blanco@musikalokal.app'; avatar_url='https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Rico_Blanco_%282009%29_%28cropped%29.jpg/330px-Rico_Blanco_%282009%29_%28cropped%29.jpg'; bio='Rico Blanco is a Filipino singer-songwriter, producer, and founding Rivermaya member with a long-running solo career.'; location='Manila, Philippines'; genre='alternative rock'; group_name='Mayonnaise'; group_image='https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Mayo_latest.jpg/330px-Mayo_latest.jpg'; group_description='Filipino alternative rock band known for emotionally direct songwriting and a durable live following across the country.'; group_location='Manila, Philippines'; latitude=14.5995; longitude=120.9842; rate=64000 }
)

$userIdsBySlug = @{}
foreach ($artist in $newArtists) {
  $userId = Ensure-AdminUser $artist.email 'MusikaLokal!2026' $artist.full_name
  $userIdsBySlug[$artist.slug] = $userId
  Ensure-Profile ([ordered]@{ id = $userId; email = $artist.email; full_name = $artist.full_name; role = 'musician'; avatar_url = $artist.avatar_url; bio = $artist.bio; location = $artist.location })
}

$genreProfileIds = @(
  '14d2e916-8d1c-4c04-9877-7ccd9bea6149',
  '330fbdba-7c73-487a-8c6c-ea32aacba445',
  '6ef09c0f-790e-4247-bdcf-8717591f966b',
  '00000000-0000-0000-0000-000000000003',
  '40ff133c-4274-47b2-8143-6f4019b265c4',
  'e77711fc-b2c7-4983-b38f-ac188909767f'
) + @($userIdsBySlug.Values)

$profileGenres = @(
  [ordered]@{ profile_id='14d2e916-8d1c-4c04-9877-7ccd9bea6149'; genre='indie folk' },
  [ordered]@{ profile_id='330fbdba-7c73-487a-8c6c-ea32aacba445'; genre='pop rock' },
  [ordered]@{ profile_id='6ef09c0f-790e-4247-bdcf-8717591f966b'; genre='rock' },
  [ordered]@{ profile_id='00000000-0000-0000-0000-000000000003'; genre='pop rock' },
  [ordered]@{ profile_id='40ff133c-4274-47b2-8143-6f4019b265c4'; genre='indie folk' },
  [ordered]@{ profile_id='e77711fc-b2c7-4983-b38f-ac188909767f'; genre='pop ballad' }
)
foreach ($artist in $newArtists) {
  $profileGenres += [ordered]@{ profile_id = $userIdsBySlug[$artist.slug]; genre = $artist.genre }
}

$genreIdFilter = ($genreProfileIds | Where-Object { $_ } | ForEach-Object { '"' + $_ + '"' }) -join ','
Invoke-RestMethod -Method Delete -Uri "$base/profile_genres?profile_id=in.($genreIdFilter)" -Headers $deleteHeaders | Out-Null
Invoke-JsonPost "$base/profile_genres" $profileGenres $restHeaders | Out-Null

$existingGroups = @(Invoke-RestMethod -Method Get -Uri "$base/groups?select=id,name" -Headers $restHeaders)
$existingGroupsByName = @{}
foreach ($row in $existingGroups) {
  $existingGroupsByName[$row.name] = $row.id
}

$existingGroupImages = @(
  [ordered]@{ name="Ben&Ben"; image='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Ben%26Ben_in_2018_2.png/330px-Ben%26Ben_in_2018_2.png' },
  [ordered]@{ name='IV of Spades'; image='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/IV_of_Spades_logo.jpg/330px-IV_of_Spades_logo.jpg' },
  [ordered]@{ name='Lola Amour'; image='https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Lola_Amour_February_17_2024.jpg/330px-Lola_Amour_February_17_2024.jpg' },
  [ordered]@{ name='The Juans'; image='https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/The_Juans_at_San_Marcelino%2C_Zambales_%282023%29.jpg/330px-The_Juans_at_San_Marcelino%2C_Zambales_%282023%29.jpg' }
)

$existingGroupIds = @($existingGroupImages | ForEach-Object { $existingGroupsByName[$_.name] } | Where-Object { $_ })
if ($existingGroupIds.Count -gt 0) {
  $existingGroupIdFilter = ($existingGroupIds | ForEach-Object { '"' + $_ + '"' }) -join ','
  Invoke-RestMethod -Method Delete -Uri "$base/group_media?group_id=in.($existingGroupIdFilter)" -Headers $deleteHeaders | Out-Null
  $existingMediaPayload = @()
  foreach ($entry in $existingGroupImages) {
    $groupId = $existingGroupsByName[$entry.name]
    if ($groupId) {
      $existingMediaPayload += [ordered]@{ group_id = $groupId; media_url = $entry.image; media_type = 'image'; sort_order = 0 }
    }
  }
  if ($existingMediaPayload.Count -gt 0) {
    Invoke-JsonPost "$base/group_media" $existingMediaPayload $restHeaders | Out-Null
  }
}

$newGroupIds = @{}
foreach ($artist in $newArtists) {
  if ($existingGroupsByName.ContainsKey($artist.group_name)) {
    $newGroupIds[$artist.group_name] = $existingGroupsByName[$artist.group_name]
    continue
  }

  $groupBody = [ordered]@{
    owner_id = $userIdsBySlug[$artist.slug]
    name = $artist.group_name
    genre = $artist.genre
    description = $artist.group_description
    location = $artist.group_location
    latitude = $artist.latitude
    longitude = $artist.longitude
    rate = $artist.rate
    group_type = 'band'
    open_group_applications = $false
  }

  $inserted = Invoke-JsonPost "$base/groups" $groupBody $restHeaders
  $newGroupIds[$artist.group_name] = $inserted[0].id
}

$allNewGroupIds = @($newGroupIds.Values)
if ($allNewGroupIds.Count -gt 0) {
  $newGroupIdFilter = ($allNewGroupIds | ForEach-Object { '"' + $_ + '"' }) -join ','
  Invoke-RestMethod -Method Delete -Uri "$base/group_media?group_id=in.($newGroupIdFilter)" -Headers $deleteHeaders | Out-Null
}

$newGroupMedia = @()
foreach ($artist in $newArtists) {
  $groupId = $newGroupIds[$artist.group_name]
  if ($groupId) {
    $newGroupMedia += [ordered]@{ group_id = $groupId; media_url = $artist.group_image; media_type = 'image'; sort_order = 0 }
  }
}
if ($newGroupMedia.Count -gt 0) {
  Invoke-JsonPost "$base/group_media" $newGroupMedia $restHeaders | Out-Null
}

[ordered]@{
  musicianCount = @((Invoke-RestMethod -Method Get -Uri "$base/profiles?select=id&role=eq.musician" -Headers $restHeaders)).Count
  groupCount = @((Invoke-RestMethod -Method Get -Uri "$base/groups?select=id" -Headers $restHeaders)).Count
  sampleMusicians = @(Invoke-RestMethod -Method Get -Uri "$base/profiles?select=full_name,avatar_url&role=eq.musician&order=created_at.desc&limit=12" -Headers $restHeaders)
  sampleGroups = @(Invoke-RestMethod -Method Get -Uri "$base/groups_with_stats?select=name,images&order=created_at.desc&limit=12" -Headers $restHeaders)
} | ConvertTo-Json -Depth 6
