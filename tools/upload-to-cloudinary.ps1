# tools/upload-to-cloudinary.ps1
# Uploads the curated 7 videos to Cloudinary asset_folder Animations/,
# and the 15 VR panoramas to VR/, via signed Upload API (using curl.exe
# because PS 5.1's Invoke-RestMethod has no -Form parameter).
# Writes uploaded results to tools/upload-results.json for the manifest step.

$ErrorActionPreference = "Stop"
Set-Location -Path (Split-Path -Parent $PSScriptRoot)

# Parse .env
if (-not (Test-Path .env)) { Write-Error ".env not found at repo root." }
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') {
    Set-Item "env:$($Matches[1])" $Matches[2]
  }
}
$cloud     = $env:CLOUDINARY_CLOUD_NAME
$apiKey    = $env:CLOUDINARY_API_KEY
$apiSecret = $env:CLOUDINARY_API_SECRET
if (-not $cloud -or -not $apiKey -or -not $apiSecret) { Write-Error "Missing CLOUDINARY_* vars" }

# --- Curated lists: (source filename, target public_id) ---
$videos = @(
  @{ src = "Animacion dining room.mp4";                                                                                                                                                                                                                                            id = "anim-dining-room" }
  @{ src = "Porsche_and_house_cinematic_move___202605061232.mp4";                                                                                                                                                                                                                  id = "anim-porsche-house" }
  @{ src = "White_villa_overlooking_202604122212.mp4";                                                                                                                                                                                                                             id = "anim-white-villa" }
  @{ src = "Gen-4_5 - Contemporary architectural building in an urban environment at dusk, surrounded by streets.gen-4_5 - contemporary architectural building in an urban environment .mp4";                                                                                       id = "anim-contemporary-urban-dusk" }
  @{ src = "Gen-4_5 Minimalist single-story modern house with white walls, wooden details, and a landscaped garden with grass, plants, and a small terraceCreate a cinematic timelapse where the sun moves from mid.mp4";                                                          id = "anim-minimalist-house-timelapse" }
  @{ src = "Suburban_house_with_202604131744.mp4";                                                                                                                                                                                                                                  id = "anim-suburban-house" }
  @{ src = "Use_the_original_image_exactly_202605061226.mp4";                                                                                                                                                                                                                       id = "anim-use-original-image" }
)
$vrs = @(
  @{ src = "Amenities_View01_01.jpg";          id = "vr-amenities-01" }
  @{ src = "Amenities_View02_01.jpg";          id = "vr-amenities-02" }
  @{ src = "Bano Habitacion Principal.jpg";    id = "vr-master-bathroom-1" }
  @{ src = "Bano Habitacion Principal 2.jpg";  id = "vr-master-bathroom-2" }
  @{ src = "Bano Principal 1.jpg";             id = "vr-main-bathroom-1" }
  @{ src = "Bano Principal 2.jpg";             id = "vr-main-bathroom-2" }
  @{ src = "Distribuidor.jpg";                 id = "vr-distributor" }
  @{ src = "Entrada.jpg";                      id = "vr-entrance" }
  @{ src = "Habitacion Nina.jpg";              id = "vr-girl-bedroom" }
  @{ src = "Habitacion Nino 1.jpg";            id = "vr-boy-bedroom-1" }
  @{ src = "Habitacion Nino 2.jpg";            id = "vr-boy-bedroom-2" }
  @{ src = "Habitacion Principal.jpg";         id = "vr-master-bedroom" }
  @{ src = "Living-Cocina.jpg";                id = "vr-living-kitchen" }
  @{ src = "Pasillo.jpg";                      id = "vr-hallway-1" }
  @{ src = "Pasillo2.jpg";                     id = "vr-hallway-2" }
)

# --- Image resize (System.Drawing) to fit Cloudinary free-tier 10MB image limit ---
Add-Type -AssemblyName System.Drawing
function Resize-Image {
  param([string]$InPath, [string]$OutPath, [int]$MaxWidth = 4096, [int]$Quality = 82)
  $abs = (Resolve-Path -LiteralPath $InPath).Path
  $img = [System.Drawing.Image]::FromFile($abs)
  try {
    $w = $img.Width; $h = $img.Height
    if ($w -le $MaxWidth) {
      Copy-Item -LiteralPath $InPath -Destination $OutPath -Force
      return
    }
    $ratio = $MaxWidth / $w
    $newW = $MaxWidth
    $newH = [int][Math]::Round($h * $ratio)
    $bmp = New-Object System.Drawing.Bitmap($newW, $newH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode    = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode  = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $newW, $newH)
    $g.Dispose()
    $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $ep  = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$Quality)
    $bmp.Save($OutPath, $enc, $ep)
    $bmp.Dispose()
    Write-Host ("    (resized {0}x{1} -> {2}x{3})" -f $w, $h, $newW, $newH) -ForegroundColor DarkGray
  } finally {
    $img.Dispose()
  }
}

# --- Pre-stage source files with ASCII-safe names (so curl multipart can handle them) ---
function Stage-Files {
  param([array]$List, [string]$SrcDir, [string]$StagedDir, [bool]$ResizeIfLarge = $false)
  if (Test-Path $StagedDir) { Remove-Item $StagedDir -Recurse -Force }
  New-Item -ItemType Directory -Path $StagedDir | Out-Null
  $missing = @()
  foreach ($item in $List) {
    # Try a few common variants since the original filenames may have unicode (ñ, …)
    # but we want to be tolerant of either the original name or the renamed version.
    $candidates = @($item.src) + @(
      ($item.src -replace 'Bano','Baño'),
      ($item.src -replace 'Nina','Niña'),
      ($item.src -replace 'Nino','Niño'),
      ($item.src -replace '___','…_')
    ) | Sort-Object -Unique
    $found = $null
    foreach ($c in $candidates) {
      $p = Join-Path $SrcDir $c
      if (Test-Path -LiteralPath $p) { $found = $p; break }
    }
    if (-not $found) { $missing += $item.src; continue }
    $ext = [System.IO.Path]::GetExtension($found)
    $stagedPath = Join-Path $StagedDir "$($item.id)$ext"
    $sizeMB = (Get-Item -LiteralPath $found).Length / 1MB
    if ($ResizeIfLarge -and $sizeMB -gt 8 -and $ext -match '\.jpe?g$') {
      Write-Host "  resizing $(Split-Path $found -Leaf) ($([math]::Round($sizeMB,1)) MB > 8 MB)" -ForegroundColor DarkCyan
      Resize-Image -InPath $found -OutPath $stagedPath -MaxWidth 4096 -Quality 82
    } else {
      Copy-Item -LiteralPath $found -Destination $stagedPath -Force
    }
    $item.staged = $stagedPath
  }
  return ,$missing
}

$videoMissing = Stage-Files -List $videos -SrcDir "assets\video\anim-source" -StagedDir "assets\video\_staged"
$vrMissing    = Stage-Files -List $vrs    -SrcDir "assets\img\vr-source"     -StagedDir "assets\img\_staged" -ResizeIfLarge $true

if ($videoMissing.Count -gt 0 -or $vrMissing.Count -gt 0) {
  Write-Host "MISSING source files:" -ForegroundColor Yellow
  $videoMissing + $vrMissing | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  Write-Error "Aborting -- fix source filenames or update script."
}

# --- Signed upload helper ---
function Get-Signature {
  param([hashtable]$Params)
  $sorted = $Params.GetEnumerator() | Where-Object { $_.Value -ne $null -and $_.Value -ne "" } | Sort-Object Key
  $str = ($sorted | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"
  $toHash = $str + $apiSecret
  $sha1 = [System.Security.Cryptography.SHA1]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($toHash)
  $hash = $sha1.ComputeHash($bytes)
  return ($hash | ForEach-Object { "{0:x2}" -f $_ }) -join ""
}

function Upload-File {
  param([string]$Path, [string]$Folder, [string]$PublicId, [string]$ResourceType)
  # PS 5.1 bug: Get-Date -UFormat %s returns local-tz seconds, off by tz offset.
  # Use DateTimeOffset.UtcNow for actual Unix UTC seconds.
  $ts = [int][System.DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $signParams = @{
    asset_folder = $Folder
    public_id    = $PublicId
    overwrite    = "true"
    timestamp    = $ts
  }
  $sig = Get-Signature $signParams
  $url = "https://api.cloudinary.com/v1_1/$cloud/$ResourceType/upload"

  $abs = (Resolve-Path -LiteralPath $Path).Path
  $name = Split-Path $Path -Leaf
  Write-Host "  -> $name" -NoNewline

  $curlArgs = @(
    "-s", "-X", "POST",
    "-F", "file=@$abs",
    "-F", "api_key=$apiKey",
    "-F", "timestamp=$ts",
    "-F", "signature=$sig",
    "-F", "asset_folder=$Folder",
    "-F", "public_id=$PublicId",
    "-F", "overwrite=true",
    $url
  )
  $raw = & curl.exe @curlArgs
  try { $resp = $raw | ConvertFrom-Json } catch { Write-Host " [PARSE FAIL: $raw]" -ForegroundColor Red; return $null }
  if ($resp.error) {
    Write-Host " FAIL: $($resp.error.message)" -ForegroundColor Red
    return $null
  }
  Write-Host (" {0}" -f $resp.secure_url) -ForegroundColor DarkGray
  return $resp
}

$results = [ordered]@{
  cloud_name = $cloud
  videos = @()
  vrs    = @()
}

Write-Host "`n=== Uploading 7 videos to Animations/ ===" -ForegroundColor Cyan
foreach ($v in $videos) {
  $r = Upload-File -Path $v.staged -Folder "Animations" -PublicId $v.id -ResourceType "video"
  if ($r) { $results.videos += @{ id = $v.id; src = $v.src; resp = $r } }
}

Write-Host "`n=== Uploading 15 VR panoramas to VR/ ===" -ForegroundColor Cyan
foreach ($p in $vrs) {
  $r = Upload-File -Path $p.staged -Folder "VR" -PublicId $p.id -ResourceType "image"
  if ($r) { $results.vrs += @{ id = $p.id; src = $p.src; resp = $r } }
}

# Persist for the manifest generator
$out = "tools\upload-results.json"
$json = $results | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText((Resolve-Path .).Path + "\$out", $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "`nResults written to $out" -ForegroundColor Green
Write-Host ("Uploaded: {0} videos, {1} VRs" -f $results.videos.Count, $results.vrs.Count) -ForegroundColor Green

# Cleanup staging
Remove-Item "assets\video\_staged" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "assets\img\_staged"   -Recurse -Force -ErrorAction SilentlyContinue
