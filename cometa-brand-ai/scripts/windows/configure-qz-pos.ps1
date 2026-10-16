param([Parameter(Mandatory=$true)][string]$Origin)
$ErrorActionPreference = 'Stop'
$uri = [Uri]$Origin
if ($uri.Scheme -ne 'https' -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo) {
  throw 'Indica solo el origen HTTPS exacto, sin rutas ni credenciales.'
}
$originValue = $uri.GetLeftPart([UriPartial]::Authority)
# QZ desktop 2.3+; no firewall opening, service installation or arbitrary commands.
$options = "-Dsecurity.wss.host=127.0.0.1 -Dsecurity.wss.httpsonly=true -Dsecurity.wss.snistrict=true -Dsecurity.wss.alloworigin=$originValue -Dsecurity.print.tofile=false -Dsecurity.print.tohost=false -Dtray.file.enabled=false"
$existing = [Environment]::GetEnvironmentVariable('QZ_OPTS', 'User')
if ($existing -and $existing -ne $options) {
  throw 'QZ_OPTS ya contiene opciones. Revísalas antes de reemplazarlas; no se modificó nada.'
}
[Environment]::SetEnvironmentVariable('QZ_OPTS', $options, 'User')
Write-Output 'Restricciones locales guardadas. Cierra QZ Tray y vuelve a abrirlo para aplicarlas.'
Write-Output 'Permite únicamente el certificado COMETA esperado. No autorices solicitudes sin firma.'
