param(
  [string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr',
  [string]$AndroidSdk = 'C:\Users\jesus\AppData\Local\Android\Sdk'
)
$ErrorActionPreference = 'Stop'
$previousJava = $env:JAVA_HOME
$previousAndroid = $env:ANDROID_HOME
$previousSdk = $env:ANDROID_SDK_ROOT
$previousTelemetry = $env:CAPACITOR_TELEMETRY_DISABLED
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (!(Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) { throw 'JDK not found' }
  if (!(Test-Path -LiteralPath (Join-Path $AndroidSdk 'platforms/android-36'))) { throw 'Android SDK 36 not found' }
  if (!(Test-Path -LiteralPath '.env.development.local')) { throw 'Run node scripts/configure-local-debug.mjs first' }
  $env:JAVA_HOME = $JavaHome
  $env:ANDROID_HOME = $AndroidSdk
  $env:ANDROID_SDK_ROOT = $AndroidSdk
  $env:CAPACITOR_TELEMETRY_DISABLED = '1'
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Mobile build failed' }
  & node node_modules/@capacitor/cli/bin/capacitor sync android
  if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed' }
  Push-Location android
  try {
    & .\gradlew.bat assembleDebug --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android debug build failed' }
  } finally { Pop-Location }
} finally {
  $env:JAVA_HOME = $previousJava
  $env:ANDROID_HOME = $previousAndroid
  $env:ANDROID_SDK_ROOT = $previousSdk
  $env:CAPACITOR_TELEMETRY_DISABLED = $previousTelemetry
  Pop-Location
}
