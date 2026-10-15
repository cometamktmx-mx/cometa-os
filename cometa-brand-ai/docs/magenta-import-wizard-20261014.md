# Importador: asistente visual de cierre

Continuación de `a5f24e9`, rama `delivery/magenta-20261014`. Solo administración Preview; Production y Atelier conservados. No se modificaron API, parser, RPC, migraciones, permisos ni reglas de escritura/reversión.

## Entrega

- URL estable: https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/settings/import
- Despliegue: https://cometa-9czxl30kc-cometa-os-s-projects.vercel.app
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
