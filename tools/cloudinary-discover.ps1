# tools/cloudinary-discover.ps1
# Reads .env, calls Cloudinary Search API, prints summary of what's in the account.
# One-shot exploratory script. Safe to delete after manifest generator is working.

$ErrorActionPreference = "Stop"
Set-Location -Path (Split-Path -Parent $PSScriptRoot)

# Parse .env
if (-not (Test-Path .env)) {
  Write-Error ".env not found at repo root."
}
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') {
    Set-Item "env:$($Matches[1])" $Matches[2]
  }
}

$cloud  = $env:CLOUDINARY_CLOUD_NAME
$key    = $env:CLOUDINARY_API_KEY
$secret = $env:CLOUDINARY_API_SECRET

if (-not $cloud -or -not $key -or -not $secret) {
  Write-Error "Missing CLOUDINARY_* vars in .env"
}

$pair = "${key}:${secret}"
$b64  = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{
  Authorization = "Basic $b64"
}

$body = @{
  expression  = "resource_type:image"
  max_results = 500
  with_field  = @("context","tags")
} | ConvertTo-Json

Write-Host "Querying Cloudinary Search API for cloud '$cloud'..." -ForegroundColor Cyan

try {
  $resp = Invoke-RestMethod `
    -Uri "https://api.cloudinary.com/v1_1/$cloud/resources/search" `
    -Method POST `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $body
} catch {
  Write-Host "API call failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
  exit 1
}

Write-Host ""
Write-Host "Total in account: $($resp.total_count)" -ForegroundColor Green
Write-Host "Returned in this page: $($resp.resources.Count)" -ForegroundColor Green
Write-Host ""

# Group by asset_folder
$byFolder = $resp.resources | Group-Object -Property asset_folder | Sort-Object Count -Descending

Write-Host "=== Distribution by asset_folder ===" -ForegroundColor Cyan
$byFolder | ForEach-Object {
  $f = if ([string]::IsNullOrEmpty($_.Name)) { "<root / no folder>" } else { $_.Name }
  Write-Host ("  {0,4}  {1}" -f $_.Count, $f)
}

Write-Host ""
Write-Host "=== Sample resource (first one) ===" -ForegroundColor Cyan
$first = $resp.resources[0]
$first | Select-Object asset_id, public_id, asset_folder, display_name, format, width, height, secure_url, bytes |
  Format-List

if ($resp.next_cursor) {
  Write-Host "WARNING: next_cursor present -- more than 500 assets, manifest generator needs pagination." -ForegroundColor Yellow
}
