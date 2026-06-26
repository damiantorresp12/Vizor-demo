# tools/generate-portfolio-manifest.ps1
# Queries Cloudinary Search API, filters to assets under "Portfolio/",
# normalizes folder names, groups by category, and writes assets/data/portfolio.json.
# Run from repo root or via: powershell -File tools\generate-portfolio-manifest.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path (Split-Path -Parent $PSScriptRoot)

# --- Load .env ---
if (-not (Test-Path .env)) { Write-Error ".env not found at repo root." }
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') {
    Set-Item "env:$($Matches[1])" $Matches[2]
  }
}

$cloud  = $env:CLOUDINARY_CLOUD_NAME
$key    = $env:CLOUDINARY_API_KEY
$secret = $env:CLOUDINARY_API_SECRET
if (-not $cloud -or -not $key -or -not $secret) { Write-Error "Missing CLOUDINARY_* vars in .env" }

# --- Category metadata: slug -> { label_en, label_es, group } ---
# Five filter groups in the showcase: interiors / residential / hospitality / civic / urban
$catMeta = @{
  "airport"               = @{ label_en = "Airport";              label_es = "Aeropuerto";              group = "civic"       }
  "amenities"             = @{ label_en = "Amenities";            label_es = "Amenities";               group = "urban"       }
  "apartment-building"    = @{ label_en = "Apartment Building";   label_es = "Edificio";                group = "residential" }
  "balcony"               = @{ label_en = "Balcony";              label_es = "Balcon";                  group = "interiors"   }
  "bathroom"              = @{ label_en = "Bathroom";             label_es = "Bano";                    group = "interiors"   }
  "bedroom"               = @{ label_en = "Bedroom";              label_es = "Dormitorio";              group = "interiors"   }
  "classroom"             = @{ label_en = "Classroom";            label_es = "Aula";                    group = "civic"       }
  "convention-center"     = @{ label_en = "Convention Center";    label_es = "Centro de Convenciones";  group = "civic"       }
  "high-rise-development" = @{ label_en = "High-Rise";            label_es = "Torre Residencial";       group = "residential" }
  "hotel"                 = @{ label_en = "Hotel";                label_es = "Hotel";                   group = "hospitality" }
  "housing-developments"  = @{ label_en = "Housing";              label_es = "Conjunto Residencial";    group = "residential" }
  "kitchen"               = @{ label_en = "Kitchen";              label_es = "Cocina";                  group = "interiors"   }
  "living-room"           = @{ label_en = "Living Room";          label_es = "Living";                  group = "interiors"   }
  "lobby"                 = @{ label_en = "Lobby";                label_es = "Lobby";                   group = "interiors"   }
  "mixed-use-tower"       = @{ label_en = "Mixed-Use Tower";      label_es = "Torre de Usos Mixtos";    group = "hospitality" }
  "museum-gallery"        = @{ label_en = "Museum and Gallery";   label_es = "Museo y Galeria";         group = "civic"       }
  "office-building"       = @{ label_en = "Office Building";      label_es = "Oficinas";                group = "hospitality" }
  "resort"                = @{ label_en = "Resort";               label_es = "Resort";                  group = "hospitality" }
  "retail-center"         = @{ label_en = "Retail Center";        label_es = "Centro Comercial";        group = "hospitality" }
  "school-university"     = @{ label_en = "School and University";label_es = "Escuela y Universidad";   group = "civic"       }
  "showroom"              = @{ label_en = "Showroom";             label_es = "Showroom";                group = "hospitality" }
  "single-family-house"   = @{ label_en = "Single Family House";  label_es = "Casa Unifamiliar";        group = "residential" }
  "stadium"               = @{ label_en = "Stadium";              label_es = "Estadio";                 group = "civic"       }
  "streetscape"           = @{ label_en = "Streetscape";          label_es = "Paisaje Urbano";          group = "urban"       }
  "terrace"               = @{ label_en = "Terrace";              label_es = "Terraza";                 group = "interiors"   }
  "urban-masterplan"      = @{ label_en = "Urban Masterplan";     label_es = "Masterplan Urbano";       group = "urban"       }
  "villas-luxury-homes"   = @{ label_en = "Luxury Villas";        label_es = "Villas de Lujo";          group = "residential" }
}

# --- Folder name normalization: Cloudinary folder segment -> slug ---
function Convert-FolderToSlug {
  param([string]$name)
  $s = $name.Trim()
  # Fix known typos in Cloudinary folder names
  if ($s -eq "Mixed-Use-ower") { return "mixed-use-tower" }   # missing T in Tower
  # General slugify: lowercase, replace spaces with dash, collapse multiple dashes
  $s = $s.ToLowerInvariant() -replace '\s+', '-' -replace '-+', '-'
  return $s
}

# --- HTTP setup ---
$pair = "${key}:${secret}"
$b64  = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{ Authorization = "Basic $b64" }

# --- Fetch all assets (paginated) ---
$allResources = @()
$cursor = $null
$page = 0
do {
  $page++
  $bodyHash = @{
    expression  = "resource_type:image AND folder=Portfolio/*"
    max_results = 500
    sort_by     = @(@{ public_id = "asc" })
  }
  if ($cursor) { $bodyHash.next_cursor = $cursor }
  $body = $bodyHash | ConvertTo-Json -Depth 5

  Write-Host "Fetching page $page..." -ForegroundColor Cyan
  $resp = Invoke-RestMethod `
    -Uri "https://api.cloudinary.com/v1_1/$cloud/resources/search" `
    -Method POST -Headers $headers -ContentType "application/json" -Body $body

  $allResources += $resp.resources
  $cursor = $resp.next_cursor
} while ($cursor)

Write-Host ("Total Portfolio assets fetched: {0}" -f $allResources.Count) -ForegroundColor Green

# --- Group by normalized slug ---
$grouped = @{}
$unmapped = @()

foreach ($r in $allResources) {
  $folder = $r.asset_folder
  if (-not $folder) { continue }
  if ($folder -notmatch '^Portfolio/(.+)$') { continue }
  $segment = $Matches[1]
  $slug = Convert-FolderToSlug $segment

  if (-not $catMeta.ContainsKey($slug)) {
    $unmapped += "$folder -> $slug"
    continue
  }

  if (-not $grouped.ContainsKey($slug)) {
    $grouped[$slug] = New-Object System.Collections.ArrayList
  }
  # Build URLs with f_auto,q_auto transformation
  $base = $r.secure_url
  $full = $base -replace '/upload/', '/upload/f_auto,q_auto/'
  $thumb = $base -replace '/upload/', '/upload/f_auto,q_auto,w_800/'

  [void]$grouped[$slug].Add(@{
    url    = $full
    thumb  = $thumb
    width  = [int]$r.width
    height = [int]$r.height
  })
}

if ($unmapped.Count -gt 0) {
  Write-Host "WARNING -- folders not in catMeta:" -ForegroundColor Yellow
  $unmapped | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

# --- Build final manifest object (deterministic order) ---
$categoriesOrdered = [ordered]@{}
foreach ($slug in ($catMeta.Keys | Sort-Object)) {
  if (-not $grouped.ContainsKey($slug)) {
    Write-Host "  (empty) $slug" -ForegroundColor DarkGray
    continue
  }
  $meta = $catMeta[$slug]
  $categoriesOrdered[$slug] = [ordered]@{
    label_en = $meta.label_en
    label_es = $meta.label_es
    group    = $meta.group
    count    = $grouped[$slug].Count
    images   = $grouped[$slug].ToArray()
  }
}

# Sum image counts manually to avoid PS hashtable .Count collision
$totalImgs = 0
foreach ($cat in $categoriesOrdered.Values) { $totalImgs += [int]$cat.count }

$manifest = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  cloud_name   = $cloud
  total        = $totalImgs
  groups       = [ordered]@{
    interiors   = [ordered]@{ label_en = "Interiors";                  label_es = "Interiores"             }
    residential = [ordered]@{ label_en = "Residential";                label_es = "Residencial"            }
    hospitality = [ordered]@{ label_en = "Hospitality and Commercial"; label_es = "Hoteleria y Comercial"  }
    civic       = [ordered]@{ label_en = "Civic and Cultural";         label_es = "Civico y Cultural"      }
    urban       = [ordered]@{ label_en = "Urban";                      label_es = "Urbano"                 }
  }
  categories = $categoriesOrdered
}

# --- Write JSON ---
$outDir = Join-Path (Get-Location) "assets\data"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$outFile = Join-Path $outDir "portfolio.json"

$json = $manifest | ConvertTo-Json -Depth 8
# PS 5.1 escapes labels-es accents via ConvertTo-Json safely; we wrote labels ASCII-safe anyway.
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Manifest written -> $outFile" -ForegroundColor Green
Write-Host ("Total images: {0}, categories: {1}" -f $manifest.total, $categoriesOrdered.Count) -ForegroundColor Green
