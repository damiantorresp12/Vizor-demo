# tools/serve.ps1
# Minimal static file server using System.Net.HttpListener. Use when Python/Node
# are unavailable. Run from repo root: powershell -File tools\serve.ps1
param([int]$Port = 8000)

$ErrorActionPreference = "Stop"
Set-Location -Path (Split-Path -Parent $PSScriptRoot)
$root = (Get-Location).Path

$prefix = "http://localhost:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix" -ForegroundColor Green

$mime = @{
  ".html"="text/html; charset=utf-8"
  ".htm"="text/html; charset=utf-8"
  ".css"="text/css; charset=utf-8"
  ".js"="application/javascript; charset=utf-8"
  ".mjs"="application/javascript; charset=utf-8"
  ".json"="application/json; charset=utf-8"
  ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"
  ".png"="image/png"
  ".gif"="image/gif"
  ".svg"="image/svg+xml"
  ".webp"="image/webp"
  ".ico"="image/x-icon"
  ".woff"="font/woff"; ".woff2"="font/woff2"
  ".ttf"="font/ttf"; ".otf"="font/otf"
  ".pdf"="application/pdf"
  ".txt"="text/plain; charset=utf-8"
  ".map"="application/json"
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ($path -eq "/") { $path = "/index.html" }
      $relative = $path -replace "^/+", ""
      $file = Join-Path $root $relative
      $resolved = [System.IO.Path]::GetFullPath($file)

      # Path traversal guard
      if (-not $resolved.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403; $res.Close(); continue
      }

      if (-not (Test-Path $resolved) -or (Get-Item $resolved).PSIsContainer) {
        $res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
        $res.OutputStream.Write($msg, 0, $msg.Length)
        $res.Close()
        Write-Host "$($req.HttpMethod) $path -> 404" -ForegroundColor DarkYellow
        continue
      }

      $ext = [System.IO.Path]::GetExtension($resolved).ToLowerInvariant()
      $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $res.ContentType = $ct
      $res.Headers["Cache-Control"] = "no-store"
      $bytes = [System.IO.File]::ReadAllBytes($resolved)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      Write-Host "$($req.HttpMethod) $path -> 200 ($ct, $($bytes.Length) b)" -ForegroundColor DarkGray
    } catch {
      Write-Host "ERROR processing request: $($_.Exception.Message)" -ForegroundColor Red
      try { $res.StatusCode = 500; $res.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
