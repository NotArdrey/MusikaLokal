$ErrorActionPreference = 'Stop'

$projectRef = 'aefldxegsvzecshlayza'
$base = "https://$projectRef.supabase.co/rest/v1"
$authBase = "https://$projectRef.supabase.co/auth/v1"
$pat = 'sbp_8e8439a1bdf2c0ea6de848d0572cbba5fdbe308e'

Set-Location 'c:\Users\Neila\MusikaLokal\mobile'
$env:SUPABASE_ACCESS_TOKEN = $pat
$keys = npx supabase projects api-keys --project-ref $projectRef -o json | ConvertFrom-Json
$serviceKey = ($keys | Where-Object { $_.id -eq 'service_role' -or $_.name -eq 'service_role' } | Select-Object -First 1).api_key

$restHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = 'return=representation' }
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

$venues = @(
  [ordered]@{
    slug = 'araneta-coliseum'
    existing_profile_id = '00000000-0000-0000-0000-000000000001'
    full_name = 'Araneta Coliseum'
    email = 'manager@test.com'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Araneta_Coliseum_%28Araneta_Center%2C_Cubao%2C_Quezon_City%29%282017-08-13%29.jpg'
    bio = 'Historic indoor arena in Quezon City and one of the most recognizable large-scale concert venues in the Philippines.'
    location = 'Cubao, Quezon City, Metro Manila, Philippines'
    studio_name = 'Araneta Coliseum'
    address = 'General Roxas Avenue, Araneta City, Cubao, Quezon City, Metro Manila, Philippines'
    description = 'Large-capacity indoor concert and event venue in Quezon City suitable for major live shows, productions, and touring acts.'
    image = 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Araneta_Coliseum_%28Araneta_Center%2C_Cubao%2C_Quezon_City%29%282017-08-13%29.jpg'
    studio_type = 'Arena'
    amenities = @('Parking', 'Backstage Rooms', 'Lighting Rig', 'Security', 'Air Conditioning')
    hourly_rate = 25000
    rehearsal_rate = 18000
    recording_rate = 22000
    pax = 16000
    latitude = 14.6207
    longitude = 121.0530
  },
  [ordered]@{
    slug = 'sm-moa-arena'
    existing_profile_id = 'cdb91a6c-1bd3-4fcf-ba86-8d12dfa6ef08'
    full_name = 'SM Mall of Asia Arena'
    email = 'venue2@test.com'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/d/d6/MOA_Arena%2C_Pasay%2C_Sep_2025.jpg'
    bio = 'Premier indoor arena in Pasay hosting large concerts, sports events, and entertainment productions in Metro Manila.'
    location = 'Pasay, Metro Manila, Philippines'
    studio_name = 'SM Mall of Asia Arena'
    address = 'J.W. Diokno Boulevard, Mall of Asia Complex, Pasay, Metro Manila, Philippines'
    description = 'Modern arena venue in the Bay Area built for headline concerts, touring productions, and major live entertainment events.'
    image = 'https://upload.wikimedia.org/wikipedia/commons/d/d6/MOA_Arena%2C_Pasay%2C_Sep_2025.jpg'
    studio_type = 'Arena'
    amenities = @('Loading Bay', 'LED Walls', 'VIP Suites', 'Security', 'Air Conditioning')
    hourly_rate = 28000
    rehearsal_rate = 20000
    recording_rate = 24000
    pax = 15000
    latitude = 14.5310
    longitude = 120.9817
  },
  [ordered]@{
    slug = 'jess-and-pats'
    existing_profile_id = 'b7e576ec-da16-4976-a35e-9c8af186d485'
    full_name = 'Jess & Pat''s'
    email = 'venue3@test.com'
    avatar_url = 'https://cdn.shopify.com/s/files/1/0261/3706/7619/files/Jess_and_Pats_Logo_-_Black.png?height=628&pad_color=ffffff&v=1613784202&width=1200'
    bio = 'Independent Quezon City event space and cafe known for intimate gigs, community art events, and singer-songwriter showcases.'
    location = 'Maginhawa, Quezon City, Metro Manila, Philippines'
    studio_name = 'Jess & Pat''s'
    address = '63 Scout Rallos Extension, Quezon City, Metro Manila, Philippines'
    description = 'Intimate live music and creative event venue in Quezon City suited for acoustic nights, showcases, and small ensemble performances.'
    image = 'https://cdn.shopify.com/s/files/1/0261/3706/7619/files/Jess_and_Pats_Logo_-_Black.png?height=628&pad_color=ffffff&v=1613784202&width=1200'
    studio_type = 'Live House'
    amenities = @('Cafe', 'PA System', 'Stage Lighting', 'Wi-Fi', 'Air Conditioning')
    hourly_rate = 4500
    rehearsal_rate = 3200
    recording_rate = 3800
    pax = 120
    latitude = 14.6475
    longitude = 121.0728
  },
  [ordered]@{
    slug = 'picc'
    full_name = 'Philippine International Convention Center'
    email = 'seed.picc@musikalokal.app'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/en/thumb/b/bc/PICC_%28CCP_Complex%2C_Pasay%29%282019-03-14%29.jpg/330px-PICC_%28CCP_Complex%2C_Pasay%29%282019-03-14%29.jpg'
    bio = 'Landmark convention and performance venue in Pasay hosting major concerts, conferences, and national events.'
    location = 'Pasay, Metro Manila, Philippines'
    studio_name = 'Philippine International Convention Center'
    address = 'CCP Complex, Vicente Sotto Street, Pasay, Metro Manila, Philippines'
    description = 'National convention and event complex in Pasay for concerts, galas, conferences, and large cultural productions.'
    image = 'https://upload.wikimedia.org/wikipedia/en/thumb/b/bc/PICC_%28CCP_Complex%2C_Pasay%29%282019-03-14%29.jpg/330px-PICC_%28CCP_Complex%2C_Pasay%29%282019-03-14%29.jpg'
    studio_type = 'Convention Center'
    amenities = @('Parking', 'Backstage Rooms', 'LED Walls', 'Security', 'Air Conditioning')
    hourly_rate = 18000
    rehearsal_rate = 13000
    recording_rate = 15000
    pax = 4000
    latitude = 14.5545
    longitude = 120.9821
  },
  [ordered]@{
    slug = 'cuneta-astrodome'
    full_name = 'Cuneta Astrodome'
    email = 'seed.cuneta.astrodome@musikalokal.app'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/en/thumb/e/ec/Cuneta_Astrodome_%28Roxas_Boulevard_Cor._Arnaiz_Road%2C_Pasay%3B_2012-11-19%29.jpg/330px-Cuneta_Astrodome_%28Roxas_Boulevard_Cor._Arnaiz_Road%2C_Pasay%3B_2012-11-19%29.jpg'
    bio = 'Pasay indoor arena used for concerts, assemblies, exhibitions, and city-scale live events.'
    location = 'Pasay, Metro Manila, Philippines'
    studio_name = 'Cuneta Astrodome'
    address = 'Roxas Boulevard corner Arnaiz Avenue, Pasay, Metro Manila, Philippines'
    description = 'Multi-purpose indoor arena in Pasay suitable for concerts, showcases, city events, and touring stage productions.'
    image = 'https://upload.wikimedia.org/wikipedia/en/thumb/e/ec/Cuneta_Astrodome_%28Roxas_Boulevard_Cor._Arnaiz_Road%2C_Pasay%3B_2012-11-19%29.jpg/330px-Cuneta_Astrodome_%28Roxas_Boulevard_Cor._Arnaiz_Road%2C_Pasay%3B_2012-11-19%29.jpg'
    studio_type = 'Arena'
    amenities = @('Backstage Rooms', 'Parking', 'Security', 'Lighting Rig', 'Air Conditioning')
    hourly_rate = 12000
    rehearsal_rate = 8500
    recording_rate = 9800
    pax = 12000
    latitude = 14.5473
    longitude = 120.9924
  },
  [ordered]@{
    slug = 'baguio-convention-center'
    full_name = 'Baguio Convention and Cultural Center'
    email = 'seed.baguio.ccc@musikalokal.app'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8f/Baguio_Convention_Center_%28Baguio%2C_Benguet%29%282018-11-26%29.jpg/330px-Baguio_Convention_Center_%28Baguio%2C_Benguet%29%282018-11-26%29.jpg'
    bio = 'Major Baguio venue for conventions, festivals, concerts, and city cultural programming.'
    location = 'Baguio, Benguet, Philippines'
    studio_name = 'Baguio Convention and Cultural Center'
    address = 'Governor Pack Road, Baguio, Benguet, Philippines'
    description = 'Convention and cultural venue in Baguio suited for festivals, concerts, conferences, and regional creative events.'
    image = 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8f/Baguio_Convention_Center_%28Baguio%2C_Benguet%29%282018-11-26%29.jpg/330px-Baguio_Convention_Center_%28Baguio%2C_Benguet%29%282018-11-26%29.jpg'
    studio_type = 'Convention Center'
    amenities = @('Parking', 'Stage Lighting', 'Security', 'Air Conditioning', 'Loading Bay')
    hourly_rate = 9000
    rehearsal_rate = 6500
    recording_rate = 7200
    pax = 3500
    latitude = 16.4088
    longitude = 120.5979
  },
  [ordered]@{
    slug = 'cebu-coliseum'
    full_name = 'Cebu Coliseum'
    email = 'seed.cebu.coliseum@musikalokal.app'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Cebu_Coliseum.jpg/330px-Cebu_Coliseum.jpg'
    bio = 'Historic indoor arena in Cebu City used for concerts, pageants, and large public entertainment events.'
    location = 'Cebu City, Cebu, Philippines'
    studio_name = 'Cebu Coliseum'
    address = 'Sanciangko Street, Cebu City, Cebu, Philippines'
    description = 'Classic indoor arena in Cebu City for concerts, live shows, pageants, and large audience entertainment events.'
    image = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Cebu_Coliseum.jpg/330px-Cebu_Coliseum.jpg'
    studio_type = 'Arena'
    amenities = @('Backstage Rooms', 'Security', 'Parking', 'Lighting Rig', 'Loading Bay')
    hourly_rate = 11000
    rehearsal_rate = 8000
    recording_rate = 9200
    pax = 5000
    latitude = 10.2939
    longitude = 123.8996
  },
  [ordered]@{
    slug = 'ynares-center'
    full_name = 'Ynares Center'
    email = 'seed.ynares.center@musikalokal.app'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/YnaresCenterjf5353_02.JPG/330px-YnaresCenterjf5353_02.JPG'
    bio = 'Antipolo indoor venue used for concerts, assemblies, live productions, and community events in Rizal.'
    location = 'Antipolo, Rizal, Philippines'
    studio_name = 'Ynares Center'
    address = 'Circumferential Road, Antipolo, Rizal, Philippines'
    description = 'Multipurpose indoor venue in Antipolo suitable for live entertainment, showcases, and regional production events.'
    image = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/YnaresCenterjf5353_02.JPG/330px-YnaresCenterjf5353_02.JPG'
    studio_type = 'Arena'
    amenities = @('Parking', 'Security', 'Air Conditioning', 'Backstage Rooms', 'Loading Bay')
    hourly_rate = 10000
    rehearsal_rate = 7200
    recording_rate = 8500
    pax = 7000
    latitude = 14.5866
    longitude = 121.1762
  },
  [ordered]@{
    slug = 'manila-hotel'
    full_name = 'Manila Hotel'
    email = 'seed.manila.hotel@musikalokal.app'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Manila_hotel_luneta_%282012%29.jpg/330px-Manila_hotel_luneta_%282012%29.jpg'
    bio = 'Historic Manila landmark with grand event spaces used for galas, music events, corporate productions, and receptions.'
    location = 'Ermita, Manila, Philippines'
    studio_name = 'Manila Hotel Grand Events'
    address = '1 Rizal Park, Ermita, Manila, Philippines'
    description = 'Historic five-star Manila venue with elegant halls suited for formal live events, receptions, and premium productions.'
    image = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Manila_hotel_luneta_%282012%29.jpg/330px-Manila_hotel_luneta_%282012%29.jpg'
    studio_type = 'Hotel Ballroom'
    amenities = @('Valet Parking', 'Catering', 'Air Conditioning', 'Security', 'VIP Rooms')
    hourly_rate = 14000
    rehearsal_rate = 9800
    recording_rate = 11000
    pax = 1500
    latitude = 14.5794
    longitude = 120.9734
  },
  [ordered]@{
    slug = 'smx-convention-center'
    full_name = 'SMX Convention Center Manila'
    email = 'seed.smx.manila@musikalokal.app'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Bay_Area_City_Pasay_06.jpg/330px-Bay_Area_City_Pasay_06.jpg'
    bio = 'Major Pasay convention center used for exhibitions, large productions, conferences, and event activations.'
    location = 'Pasay, Metro Manila, Philippines'
    studio_name = 'SMX Convention Center Manila'
    address = 'Seashell Lane, Mall of Asia Complex, Pasay, Metro Manila, Philippines'
    description = 'Large-format Pasay convention venue for expos, concerts, conferences, and high-capacity event production.'
    image = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Bay_Area_City_Pasay_06.jpg/330px-Bay_Area_City_Pasay_06.jpg'
    studio_type = 'Convention Center'
    amenities = @('Parking', 'LED Walls', 'Security', 'Air Conditioning', 'Loading Bay')
    hourly_rate = 16000
    rehearsal_rate = 11500
    recording_rate = 13000
    pax = 5000
    latitude = 14.5352
    longitude = 120.9822
  },
  [ordered]@{
    slug = 'rizal-memorial-coliseum'
    full_name = 'Rizal Memorial Coliseum'
    email = 'seed.rizal.memorial.coliseum@musikalokal.app'
    avatar_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Rizal_Memorial_Coliseum_-_sign_%28Malate%2C_Manila%3B_11-23-2019%29.jpg/330px-Rizal_Memorial_Coliseum_-_sign_%28Malate%2C_Manila%3B_11-23-2019%29.jpg'
    bio = 'Historic indoor coliseum in Manila used for sports, live entertainment, and public events.'
    location = 'Malate, Manila, Philippines'
    studio_name = 'Rizal Memorial Coliseum'
    address = 'Rizal Memorial Sports Complex, Malate, Manila, Philippines'
    description = 'Historic Manila indoor venue suited for public performances, entertainment programming, and city-scale events.'
    image = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Rizal_Memorial_Coliseum_-_sign_%28Malate%2C_Manila%3B_11-23-2019%29.jpg/330px-Rizal_Memorial_Coliseum_-_sign_%28Malate%2C_Manila%3B_11-23-2019%29.jpg'
    studio_type = 'Arena'
    amenities = @('Parking', 'Security', 'Backstage Rooms', 'Lighting Rig', 'Loading Bay')
    hourly_rate = 9500
    rehearsal_rate = 7000
    recording_rate = 8200
    pax = 6000
    latitude = 14.5580
    longitude = 120.9875
  }
)

$userIdsBySlug = @{}
foreach ($venue in $venues) {
  if ($venue.Contains('existing_profile_id')) {
    $userIdsBySlug[$venue.slug] = $venue.existing_profile_id
    Ensure-Profile ([ordered]@{
      id = $venue.existing_profile_id
      email = $venue.email
      full_name = $venue.full_name
      role = 'venue-owner'
      avatar_url = $venue.avatar_url
      bio = $venue.bio
      location = $venue.location
    })
    continue
  }

  $userId = Ensure-AdminUser $venue.email 'MusikaLokal!2026' $venue.full_name
  $userIdsBySlug[$venue.slug] = $userId
  Ensure-Profile ([ordered]@{
    id = $userId
    email = $venue.email
    full_name = $venue.full_name
    role = 'venue-owner'
    avatar_url = $venue.avatar_url
    bio = $venue.bio
    location = $venue.location
  })
}

[ordered]@{
  venueOwnerCount = @((Invoke-RestMethod -Method Get -Uri "$base/profiles?select=id&role=eq.venue-owner" -Headers $restHeaders)).Count
  sampleVenues = @(Invoke-RestMethod -Method Get -Uri "$base/profiles?select=full_name,email,location,avatar_url&role=eq.venue-owner&order=created_at.desc&limit=15" -Headers $restHeaders)
} | ConvertTo-Json -Depth 6
