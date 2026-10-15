# Importador: asistente visual de cierre

Continuación de `a5f24e9`, rama `delivery/magenta-20261014`. Solo administración Preview; Production y Atelier conservados. No se modificaron API, parser, RPC, migraciones, permisos ni reglas de escritura/reversión.

## Entrega

- URL estable: https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/settings/import
- Despliegue: https://cometa-ccmlyjgky-cometa-os-s-projects.vercel.app
- Menú: Sistema → Configuración → ¿Vienes de otro punto de venta? → Configurar importación.
- Tarjeta compacta al principio de Configuración, icono POS y acción cyan.
- Origen → Archivo → Revisión → Resultado. ELEVENTA único origen; productos/inventario/clientes seleccionables. Sucursal requerida para inventario.
- Archivo con arrastrar/soltar, selector accesible, nombre/tamaño y reemplazo; límites reales de 5 MB, 500 filas y 100 columnas. Inspección automática de la primera fila; hoja y fila de encabezados en opciones avanzadas, con relectura explícita.
- Revisión con correspondencias editables, validación, conteos, vista previa y decisiones explícitas por fila. Bloqueo síncrono de solicitudes repetidas; clave de reintento conservada tras error. Un error no muestra resultado exitoso ni borra el borrador.
- Resultado calculado a partir de las decisiones del lote confirmado por el servidor: creados/actualizados, filas con errores omitidas y omisiones voluntarias. No se presentan escrituras parciales ficticias. Historial y restricciones de reversión conservados.
- Ayuda sintética secundaria únicamente si el servidor confirma `VERCEL_ENV=preview` y `STOREFRONT_PAYMENTS_MODE=test`. Ausente en Production, incluso si su modo estuviera configurado accidentalmente como test.

## Verificación

- TypeScript `--noEmit --incremental false --pretty false`: pasa.
- ESLint de `import/page.tsx` y `import/importer.tsx`: pasa. Configuración conserva un error preexistente `react-hooks/set-state-in-effect` en `loadConfiguration`, línea 176; no se modificó ese flujo.
- `test-pos-eleventa-import.mjs`: pasa, códigos/ceros, formatos, mapeo, vacíos, duplicados y validaciones.
- `test-pos-eleventa-api.mjs`: pasa, módulo real con autorización/RPC simuladas; no acredita una nueva prueba de persistencia.
- `test-import-wizard.mjs`: pasa, componente con transporte simulado; carga válida/inválida, inspección automática, decisiones, resultado, permisos, doble clic, reintento con misma clave, sucursal requerida y aislamiento de ayuda test/Production.
- Build administrativo Vercel: READY/Preview; entorno aislado validado durante build. Se reutiliza el despliegue Atelier anterior sin cambios.
- Navegador: pasos Origen y Archivo revisados en escritorio y viewport móvil de 390 px; documento sin desbordamiento horizontal en el asistente (375 px de contenido, descontando scrollbar). Opciones avanzadas plegadas y requisito de sucursal comprobados. La revisión móvil detectó texto comprimido en la tarjeta de acceso; corregido situando su botón en una fila completa y acotando la columna de Configuración al ancho disponible. Revisión/Resultado se acreditan por el ensayo de componente, no por navegador.
- La prueba completa de selección/carga de CSV por navegador sigue pendiente del permiso de Chrome → Extensiones → ChatGPT → Detalles → Permitir acceso a URLs de archivo. No se eludió ese bloqueo. Alternativa: el titular ejecuta el recorrido desde la URL estable. La evidencia anterior de persistencia/reversión se conserva; no se declara repetida por estas pruebas de componente.

## Archivos de este ajuste

1. `src/app/brand/[brandSlug]/pos/settings/page.tsx`
2. `src/app/brand/[brandSlug]/pos/settings/import/page.tsx`
3. `src/app/brand/[brandSlug]/pos/settings/import/importer.tsx`
4. `src/app/brand/[brandSlug]/pos/settings/import/importer.module.css`
5. `scripts/test-import-wizard.mjs`
6. `docs/magenta-import-wizard-20261014.md`

PNG aprobado y directorio ajeno de recuperación preservados y excluidos del commit.

## Corrección del impuesto — 15 de octubre

El campo de tasa estaba dentro de la ayuda plegada “Datos necesarios para crear productos”. Ahora aparece siempre en Revisión, antes de validar, para importaciones de productos. Comienza vacío; incluso una tasa cero debe indicarse explícitamente. Se explica que solo completa el impuesto ausente de productos nuevos; no modifica existentes ni reemplaza la tasa del archivo.

Cambiar la tasa conserva archivo, hoja, fila de encabezados y correspondencias. Invalida únicamente la vista previa y sus decisiones para exigir nueva validación antes de escribir. No se cambió el motor, API ni SQL. En una pestaña anterior ya cargada puede desplegarse la ayuda para introducir la tasa sin recargar y perder el archivo seleccionado.

Prueba de regresión del componente: respuesta “Define el impuesto para productos nuevos” → tasa explícita 0 → nueva validación sin ese error → decisiones → confirmación. Se comparan el contenido del archivo y los campos de mapeo/hoja/encabezados entre ambas peticiones. Transporte simulado, sin escritura en DB. TypeScript y lint del componente pasan. Archivos de esta corrección: `importer.tsx`, `scripts/test-import-wizard.mjs` y este informe. Production intacto.

## Corrección de existencias — 15 de octubre

Reproducción en la API real de Preview: los códigos `0000123` y `0000456` encuentran exactamente una variante cada uno, sin errores, pero ambos devuelven `inventoryExists=false` para la sucursal elegida. Enviar `update` devuelve HTTP 409 / conflicto; la comparación de productos, variantes e inventario antes/después confirma que la petición rechazada no escribió nada. La RPC distingue correctamente entre un producto encontrado y un registro de existencias todavía inexistente. El error estaba en ofrecer indistintamente Crear/Actualizar para inventario.

La interfaz ahora ofrece **Actualizar existencias**: envía `create` solo para inicializar el registro de inventario ausente, o `update` si ya existe, según la vista previa autorizada. No crea productos. No ofrece aplicar a filas ambiguas/con errores ni inventa el estado de inventario si falta en la respuesta. Sigue exigiendo decisión explícita y conserva el token de concurrencia. El resumen distingue existencias inicializadas y actualizadas. Archivo y correspondencias no se reinician al elegir la acción.

Verificación ejecutada:

- Componente: una fila sin inventario y otra con inventario eligen la misma acción visible y envían decisiones correctas; archivo/mapeo idénticos, sin campo de impuesto, precio ni costo. Filas con errores solo pueden omitirse. TypeScript y lint pasan.
- PostgreSQL local desechable: reproduce el conflicto anterior, demuestra ausencia de escritura, inicialización correcta, reexportación con los mismos valores sin suma, una sola fila de inventario, reintentos, reversión y restricciones posteriores. Pruebas existentes pasan; base temporal retirada, sin reinicializar instancias existentes.
- API HTTP real, backend `ephmrsjnpkcgddulvckj`, marca `magenta-preview`: importación aplicada a los dos productos ya existentes. Existencias finales **10 y 0**, una fila por variante/sucursal. Productos y variantes idénticos antes/después; inventario ajeno al lote idéntico.
- Dos reintentos concurrentes: HTTP 200, mismo lote, sin cambios adicionales. Repetir exactamente el archivo con otra clave: HTTP 409 por archivo ya aplicado, sin modificaciones. Una nueva exportación con iguales cantidades: HTTP 200, cantidades siguen **10 y 0**, sin nuevos productos ni filas duplicadas. Quedan dos lotes auditados (inicialización y comprobación de nueva exportación); no son duplicados de catálogo/stock.

Evidencia: `.next/magenta-functional/ephmrsjnpkcgddulvckj/import-inventory-proof.json`. No se recargó ni manipuló la pestaña del usuario. El recorrido remoto se verificó por API autenticada; no se presenta como una nueva prueba de carga de archivos por navegador.

Archivos de este ajuste: `src/app/brand/[brandSlug]/pos/settings/import/importer.tsx`, `scripts/test-import-wizard.mjs`, `scripts/test-pos-eleventa-local.mjs`, `scripts/test-magenta-import-inventory.mjs` y este informe. API/parser/RPC y las cinco migraciones permanecen sin cambios. Production intacto.
