param([string]$Apk = 'android/app/build/outputs/apk/debug/app-debug.apk')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$file = Get-Item -LiteralPath $Apk
$archive = [IO.Compression.ZipFile]::OpenRead($file.FullName)
$jwtCount = 0
$assetCount = 0
$backendFound = $false
$authFound = $false
try {
  foreach ($entry in $archive.Entries) {
    if ($entry.FullName -match '(?i)(\.env(?:\.|$)|\.(jks|keystore|p12|pfx|pem)$)') { throw "Forbidden packaged file: $($entry.FullName)" }
    if ($entry.Length -eq 0) { continue }
    $stream = $entry.Open()
    $reader = [IO.StreamReader]::new($stream)
    try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($content -match '(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)') { throw "Secret signature found in $($entry.FullName)" }
    foreach ($jwt in [regex]::Matches($content, 'eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+')) {
      $encoded = $jwt.Groups[1].Value.Replace('-','+').Replace('_','/')
      $encoded = $encoded.PadRight($encoded.Length + ((4 - $encoded.Length % 4) % 4), '=')
      try { $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json } catch { continue }
      if ($claims.role -ne 'anon') { throw "Non-public JWT found in $($entry.FullName)" }
      $jwtCount++
    }
    if ($entry.FullName -like 'assets/public/*') {
      $assetCount++
      if ($content -match 'SUPABASE_SERVICE_ROLE|STRIPE_SECRET_KEY|PIN_HASH_SECRET|next/headers|local-configuration-required"\s*[,;]') { throw "Unexpected server/placeholder material in $($entry.FullName)" }
      if ($content.Contains('http://127.0.0.1:3105')) { $backendFound = $true }
      if ($content.Contains('http://127.0.0.1:58130')) { $authFound = $true }
    }
    if ($entry.FullName -eq 'assets/capacitor.config.json') {
      $config = $content | ConvertFrom-Json
      if ($config.appId -ne 'com.cometaos.pos' -or $config.appName -ne 'COMETA POS' -or $config.server.url) { throw 'Unexpected native identity or remote WebView URL' }
    }
  }
} finally { $archive.Dispose() }
if (!$backendFound -or !$authFound -or $jwtCount -lt 1) { throw 'Expected public LOCAL configuration missing' }
[pscustomobject]@{
  Apk = $file.FullName; Bytes = $file.Length; MiB = [Math]::Round($file.Length / 1MB, 2)
  SHA256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  PublicAnonJwtOccurrences = $jwtCount; WebAssetsInspected = $assetCount
  LocalBackend = $backendFound; LocalAuth = $authFound; SecretPatternScan = 'PASS'
} | ConvertTo-Json
