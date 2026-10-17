# QZ's documented override.crt mechanism. No certificate-store or TLS changes.
[CmdletBinding(SupportsShouldProcess=$true)]
param(
  [ValidateSet('Install','Uninstall','Status')][string]$Action='Status',
  [string]$QzDirectory="$env:ProgramFiles\QZ Tray",
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ExpectedRootSha256
)
$ErrorActionPreference='Stop'
$rootFile=Join-Path $PSScriptRoot 'cometa-root.crt'
$certificate=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($rootFile)
$sha=[System.Security.Cryptography.SHA256]::Create()
try { $fingerprint=([BitConverter]::ToString($sha.ComputeHash($certificate.RawData))).Replace('-','') } finally { $sha.Dispose() }
if ($fingerprint -ne $ExpectedRootSha256) { throw 'Root fingerprint mismatch. Nothing changed.' }
if ($certificate.NotAfter -le (Get-Date) -or $certificate.NotBefore -gt (Get-Date)) { throw 'Root is not currently valid.' }
$directory=Get-Item -LiteralPath $QzDirectory
if (-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid QZ directory.' }
if (-not (Test-Path -LiteralPath (Join-Path $directory.FullName 'qz-tray.exe'))) { throw 'Official QZ Tray installation not found.' }
$target=Join-Path $directory.FullName 'override.crt'
$marker=Join-Path $directory.FullName 'cometa-root-install.json'
foreach ($file in @($target,$marker)) {
  if ((Test-Path -LiteralPath $file) -and ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing linked configuration file.' }
}
$sourceHash=(Get-FileHash -LiteralPath $rootFile -Algorithm SHA256).Hash
$exists=Test-Path -LiteralPath $target
$owned=$exists -and (Test-Path -LiteralPath $marker) -and ((Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json).sha256 -eq $sourceHash) -and ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $sourceHash)
if ($Action -eq 'Status') { Write-Output "COMETA root installed: $owned; root SHA256: $fingerprint"; exit 0 }
if (Get-Process -Name 'qz-tray' -ErrorAction SilentlyContinue) { throw 'Exit QZ Tray from its tray menu first. No print process will be killed.' }
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run PowerShell as administrator to modify the QZ application directory.' }
if ($Action -eq 'Install') {
  if ($owned) { Write-Output 'Already installed; no changes.'; exit 0 }
  if ($exists -or (Test-Path -LiteralPath $marker)) { throw 'An existing custom root or installation marker was found. Nothing overwritten; administrator review required.' }
  if ($PSCmdlet.ShouldProcess($target,'Install COMETA public root for QZ only')) {
    Copy-Item -LiteralPath $rootFile -Destination $target -ErrorAction Stop
    @{sha256=$sourceHash;rootFingerprint=$fingerprint;installedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8
  }
} else {
  if (-not $exists -and -not (Test-Path -LiteralPath $marker)) { Write-Output 'Already absent; no changes.'; exit 0 }
  if (-not $owned) { throw 'Root differs from this package. Refusing to remove another configuration.' }
  if ($PSCmdlet.ShouldProcess($target,'Remove only the COMETA QZ root and ownership marker')) {
    Remove-Item -LiteralPath $target
    Remove-Item -LiteralPath $marker
  }
  Write-Output 'Also block/remove COMETA in QZ Advanced > Site Manager for each Windows user; disable central signing for revocation.'
}
Write-Output 'Restart QZ Tray manually. Windows trust stores, TLS, printers and cash drawer settings were not modified.'
