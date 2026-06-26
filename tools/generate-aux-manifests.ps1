# tools/generate-aux-manifests.ps1
# Reads tools/upload-results.json (produced by upload-to-cloudinary.ps1) and
# writes assets/data/animations.json + assets/data/vrs.json with bilingual
# labels and the right Cloudinary delivery transformations baked into URLs.

$ErrorActionPreference = "Stop"
Set-Location -Path (Split-Path -Parent $PSScriptRoot)

$resultsPath = "tools\upload-results.json"
if (-not (Test-Path $resultsPath)) { Write-Error "$resultsPath not found. Run upload-to-cloudinary.ps1 first." }
$results = Get-Content $resultsPath -Raw | ConvertFrom-Json

# --- Bilingual labels per id (EN / ES) ---
$videoLabels = @{
  "anim-dining-room"                = @{ en = "Dining Room";                  es = "Comedor" }
  "anim-porsche-house"              = @{ en = "Porsche and House";            es = "Porsche y Casa" }
  "anim-white-villa"                = @{ en = "White Villa Aerial";           es = "Villa Blanca Aerea" }
  "anim-contemporary-urban-dusk"    = @{ en = "Contemporary Tower at Dusk";   es = "Torre Contemporanea al Atardecer" }
  "anim-minimalist-house-timelapse" = @{ en = "Minimalist House Timelapse";   es = "Casa Minimalista Timelapse" }
  "anim-suburban-house"             = @{ en = "Suburban House";               es = "Casa Suburbana" }
  "anim-use-original-image"         = @{ en = "Cinematic Render";             es = "Render Cinematico" }
}

$vrLabels = @{
  "vr-amenities-01"      = @{ en = "Amenities, View 01";              es = "Amenities, Vista 01" }
  "vr-amenities-02"      = @{ en = "Amenities, View 02";              es = "Amenities, Vista 02" }
  "vr-master-bathroom-1" = @{ en = "Master Bathroom";                 es = "Bano Habitacion Principal" }
  "vr-master-bathroom-2" = @{ en = "Master Bathroom, View 2";         es = "Bano Habitacion Principal, Vista 2" }
  "vr-main-bathroom-1"   = @{ en = "Main Bathroom";                   es = "Bano Principal" }
  "vr-main-bathroom-2"   = @{ en = "Main Bathroom, View 2";           es = "Bano Principal, Vista 2" }
  "vr-distributor"       = @{ en = "Vestibule";                       es = "Distribuidor" }
  "vr-entrance"          = @{ en = "Entrance";                        es = "Entrada" }
  "vr-girl-bedroom"      = @{ en = "Girls' Bedroom";                  es = "Habitacion Nina" }
  "vr-boy-bedroom-1"     = @{ en = "Boys' Bedroom";                   es = "Habitacion Nino" }
  "vr-boy-bedroom-2"     = @{ en = "Boys' Bedroom, View 2";           es = "Habitacion Nino, Vista 2" }
  "vr-master-bedroom"    = @{ en = "Master Bedroom";                  es = "Habitacion Principal" }
  "vr-living-kitchen"    = @{ en = "Living and Kitchen";              es = "Living y Cocina" }
  "vr-hallway-1"         = @{ en = "Hallway";                         es = "Pasillo" }
  "vr-hallway-2"         = @{ en = "Hallway, View 2";                 es = "Pasillo, Vista 2" }
}

# --- Animations manifest ---
$videos = @()
foreach ($v in $results.videos) {
  $id   = $v.id
  $resp = $v.resp
  $lbl  = $videoLabels[$id]
  if (-not $lbl) { Write-Host "WARN: no label for $id" -ForegroundColor Yellow; continue }

  $url  = $resp.secure_url   # full mp4 stream
  # Poster: extract first frame as a JPG, optimized
  $poster = $url -replace '/video/upload/', '/video/upload/so_0,f_jpg,q_auto,w_1200/' `
                 -replace '\.mp4$', '.jpg'

  $videos += [ordered]@{
    id       = $id
    label_en = $lbl.en
    label_es = $lbl.es
    url      = $url
    poster   = $poster
    duration = $resp.duration
    width    = $resp.width
    height   = $resp.height
    bytes    = $resp.bytes
  }
}

$animManifest = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  cloud_name   = $results.cloud_name
  total        = $videos.Count
  videos       = $videos
}

# --- VRs manifest ---
$panos = @()
foreach ($p in $results.vrs) {
  $id   = $p.id
  $resp = $p.resp
  $lbl  = $vrLabels[$id]
  if (-not $lbl) { Write-Host "WARN: no label for $id" -ForegroundColor Yellow; continue }

  # Full equirectangular for Pannellum (no crop, only delivery-format auto)
  $url   = $resp.secure_url -replace '/image/upload/', '/image/upload/f_auto,q_auto/'
  # Thumbnail for the grid: smart 16:9 crop
  $thumb = $resp.secure_url -replace '/image/upload/', '/image/upload/f_auto,q_auto,c_fill,g_auto,w_800,ar_16:9/'

  $panos += [ordered]@{
    id       = $id
    label_en = $lbl.en
    label_es = $lbl.es
    url      = $url
    thumb    = $thumb
    width    = $resp.width
    height   = $resp.height
  }
}

$vrsManifest = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  cloud_name   = $results.cloud_name
  total        = $panos.Count
  panoramas    = $panos
}

# --- Write both ---
$outDir = "assets\data"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Resolve-Path .).Path + "\assets\data\animations.json", ($animManifest | ConvertTo-Json -Depth 6), $utf8)
[System.IO.File]::WriteAllText((Resolve-Path .).Path + "\assets\data\vrs.json",        ($vrsManifest  | ConvertTo-Json -Depth 6), $utf8)

Write-Host "Wrote assets\data\animations.json ($($videos.Count) videos)" -ForegroundColor Green
Write-Host "Wrote assets\data\vrs.json        ($($panos.Count) panoramas)" -ForegroundColor Green
