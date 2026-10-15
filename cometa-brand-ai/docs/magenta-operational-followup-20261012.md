# MAGENTA: seguimiento operativo — 12 octubre 2026

## Identidad: consulta remota de solo lectura

Destino: proyecto Supabase compartido `zhtagqrzyovsrmsicaot`. No se reaplicaron migraciones.

| Relación | magenta-fit-wear | magenta-fitwear |
|---|---|---|
| Marca | a0573fc6-eb6c-4747-9343-9ad71ca66f7b | 70880b54-b6fe-4775-bb39-c9ff19c47c39 |
| Owner en user_brand_access / Auth | cometa.mktadmon@gmail.com | guiasmagenta@gmail.com |
| Perfil user_profiles | active | no encontrado por user_id |
| Sucursal | ninguna | Principal, activa |
| Productos | ninguno | SHORT DUPE EFECTO BOMBA |
| Variantes | ninguna | 27, precio POS 75 |
| Inventario | ninguna fila | 27 filas, 50 unidades totales |
| Ventas POS | 0 | 0 |
| A1 / canales online / M2 / Apariencia / checkout | sin configuración | sin configuración |

Se solicitó confirmar la segunda identidad. No se fusionaron registros, transfirieron existencias, reasignaron propietarios ni activó la tienda. El precio existente no certifica aprobación comercial para menudeo/mayoreo online. La ausencia de perfil requiere resolución canónica; una membresía no debe saltarse las guardas de perfil activo.

## Seguridad

- Next 16.2.7 → 16.4.0 en OS y storefront; ESLint Next alineado.
- SheetJS xlsx 0.18.5 → distribución oficial 0.20.3, lockfile con integridad. Runtime en la API autenticada Food inventory-import; no es una dependencia exclusiva de desarrollo.
- Parches compatibles de baseline-browser-mapping, source-map-js, brace-expansion, browserslist y js-yaml.
- Árbol instalado: sharp 0.35.5, postcss 8.5.23, source-map-js 1.2.2, baseline-browser-mapping 2.11.28.
- `npm audit --omit=dev`: **0 vulnerabilidades conocidas**. Esto no equivale a una auditoría completa de la aplicación.
- Audit completo: quedan cinco alertas high de la cadena ESLint → plugin-next → fast-glob → micromatch → braces. npm propone retroceder ESLint Next a 14.2.35; no se aplicó ese cambio incompatible. Los patrones de lint provienen del código/configuración del repositorio, no de solicitudes de compradores.
- La vulnerabilidad de optimización AVIF GHSA-2xp9-vwfh-vxw4 afecta Next anterior a 16.3.3; la versión nueva está fuera de ese rango. No se ejecutó un exploit.
- `images.unoptimized` NO prueba que Vercel cierre `/_next/image`. Se corrigió el comentario que lo sugería. La mitigación principal es actualizar el framework; no se declara el endpoint deshabilitado.

Fuentes: https://github.com/advisories/GHSA-2xp9-vwfh-vxw4 y https://docs.sheetjs.com/docs/getting-started/installation/nodejs/.

## Verificación local

- TypeScript sin emisión: PASS.
- Lint dirigido next.config y API XLSX: PASS.
- `test-comu-purchase-boundary.mjs`: PASS; unitario/estático, conserva cierre de compras.
- `test-storefront-m5-contract.mjs`: PASS; fetch/storage simulados.
- `test-storefront-m6-contract.mjs`: PASS; firmas sintéticas con SDK Stripe real, sin cobros.
- `test-pos-food-inventory-recipes-v1.mjs`: 12 PASS; mocks/estático/SSR, sin mutaciones de base.
- SheetJS: escribir y leer XLSX sintético preserva celdas: PASS.
- `git diff --check`: PASS. HEAD e índice sin cambios.

## Cierre comercial pendiente

1. Confirmación de identidad MAGENTA y perfil del propietario por el mecanismo canónico.
2. Contenido comercial aprobado y asociaciones de fotos por color. No hay documentos M2/M3 persistidos para estas marcas en la base compartida. Los screenshots y fixtures anteriores no se publican como mercancía real.
3. Sucursal de despacho y política de precio autorizadas. M6 actualmente admite `RETAIL_GROSS`, no un motor nuevo de mayoreo.
4. Cuenta Stripe propia y credenciales de prueba configuradas fuera del chat. El código actual acepta únicamente test; no se habilitó cobro comercial.
5. Productor confiable de cotizaciones de envío, cobertura y tarifa real. No existe cotización verificable para MAGENTA; pago permanece bloqueado.
6. Flujo WhatsApp: definir número y política de reserva/cierre. No existe aún un checkout WhatsApp certificado. Un enlace de contacto no representa pedido ni pago; el futuro flujo debe persistir el pedido antes de abrir WhatsApp y conservar la idempotencia de inventario.

No hubo escrituras de base, mensajes, cobros, cambios de contraseña, staging, commits ni push en esta continuación. C: tuvo ENOSPC al consultar npm; se cambió solamente la caché de estos comandos a D:, sin borrar datos.

## Publicación verificada

- OS: `https://cometa-ogpqxho09-cometa-os-s-projects.vercel.app`, READY, alias `https://app.cometaos.com`.
- Storefront: `https://magenta-controlled-preview-qx7ef1uoe-cometa-os-s-projects.vercel.app`, READY, alias `https://magenta-controlled-preview.vercel.app`.
- Ambos builds remotos verifican Next 16.4.0, compilación y TypeScript PASS. Copia revisada `source-1791823325939`, sin secretos ni fixtures.
- HTTP: login/solicitud COMU/login COMU 200; Workspace/POS sin sesión 307 a login; APIs módulos/admin y productos POS sin sesión 401; reserva/checkout/intento COMU 503.
- Optimización de PNG benigno en OS: 200 image/png. El endpoint sigue presente, no se afirma cierre. La actualización de versión está comprobada en ambos builds; no es una prueba de explotación AVIF ni una auditoría de infraestructura de Vercel.
- La tienda sigue sin vínculo de marca mientras se espera la decisión solicitada. No se declara catálogo comercial ni checkout operativo.
