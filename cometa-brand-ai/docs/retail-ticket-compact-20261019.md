# Ticket Retail compacto — 19 octubre 2026

## Diagnóstico y alcance

Dos tickets distintos, conforme a la aclaración del usuario. No se atribuye la longitud a impresión duplicada. No se recibió una nueva fotografía en esta ejecución.

Consulta remota de solo lectura: la terminal de Magenta usa `epson-tm-t20ii`, `width:80`, `autoPrint:true`, `autoDrawer:false`, `profile:escpos-pin5`. Los seis trabajos más recientes consultados usan esa misma ruta. El perfil guardado no fue modificado.

Ruta efectiva: API `terminal-print` → HTML generado por servidor → QZ RAW HTML → raster ESC/POS. Ancho de raster solicitado: 560 puntos (70 mm a 8 puntos/mm); altura omitida, `size.height:null`, `scaleContent:false`. No hay imágenes externas ni altura de 297 mm en el HTML. Inicialización `1B40`, corte `1D564200`; no se agregaron avances ni pulsos de cajón. La firma sigue validando exactamente el payload persistido.

La causa comprobada en el diseño anterior es la repetición del nombre, variante/SKU y renglón de importes por cada variante, con 4 mm de padding vertical más márgenes. El cambio agrupa por `product_id`, muestra una sola cabecera de columnas y conserva cada variante con cantidad, precio e importe. Los snapshots sin ID no se fusionan por nombre. Fuente base: Arial 12 px antes y después. SKU e historial de abonos son opciones de terminal desactivadas por defecto. Los abonos del comprobante general se agrupan por método; se conserva abonado, saldo, efectivo recibido y cambio. Los comprobantes individuales conservan su snapshot original.

La corrección de `?` entre talla/color se limita al separador rodeado por espacios en la presentación; no modifica nombres persistidos. FOOD, reglas monetarias, ventas históricas, inventario, schema y configuración existente no fueron modificados.

Referencias de rasterización: [QZ RAW HTML](https://qz.io/docs/raw), [PrintRaw de QZ 2.2.5](https://github.com/qzind/tray/blob/v2.2.5/src/qz/printer/action/PrintRaw.java). No se ejecutó QZ en el equipo del cliente ni se capturó su raster real; las dimensiones siguientes son estimaciones del HTML en Chrome, no certificación del papel.

## Comparación con datos idénticos

Venta real anonimizada: 26 variantes, 21 modelos, total $7.725, impuestos registrados $901,39. Ambos renders usan exactamente los mismos datos; no se recalculan importes ni impuestos. La muestra se eligió por mayor cantidad de variantes, no se afirma que sea uno de los tickets fotografiados.

| Render | Papel | Contenido | Alto estimado | Raster estimado a 8 puntos/mm |
|---|---|---|---|---|
| Antes | 80 mm | 70 mm | 560,07 mm | 560 × 4481 |
| Después | 80 mm | 70 mm | 293,92 mm | 560 × 2352 |
| Prueba corta sintética | 80 mm | 70 mm | 58,88 mm | 560 × 472 |

Reducción: 47,52 %. Las medidas excluyen la distancia mecánica del cabezal al cortador y pueden variar por el motor JavaFX de QZ. La altura resulta del contenido, sin redimensionar el ticket a una página ni reducir la letra.

Artefactos completos en `build/retail-compact/`: `before.png`, `after.png`, `short-after.png`, sus HTML y `measurements.json`. `comparison.html` reúne las vistas con medidas. No contienen datos de clientes ni credenciales.

Prueba física pendiente: abrir Configuración → Impresora y cajón → Probar impresión QZ; conservar el perfil Epson guardado. Medir desde el primer contenido hasta el último y anotar por separado el margen hasta el corte. Reimprimir una venta con varias variantes y comprobar cantidades, importes y que el cajón permanezca cerrado. No se ejecutó ninguna impresión física durante estas verificaciones.

## Verificación

- `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: PASS.
- `node scripts/test-pos-ticket-layout.mjs`: PASS.
- `node scripts/test-pos-ticket-compact.mjs`: PASS: agrupación por ID, separación de homónimos, preservación del snapshot, variantes, SKU/historial opcionales, suma por método, totales una vez, altura variable y corte.
- `node scripts/test-pos-retail-terminal.mjs`: PASS: firma real con certificado sintético, autorización, aislamiento de marca/sucursal, deduplicación, copia QZ sin cajón, abonos y resultados inciertos.
- `node scripts/test-pos-retail-orders-api.mjs`: PASS: autorización, exclusión FOOD y contratos de pedidos.
- ESLint dirigido a los cinco archivos de aplicación y dos scripts nuevos: PASS.
- ESLint del script existente `test-pos-retail-terminal.mjs`: error preexistente `@next/next/no-assign-module-variable` en su cargador VM. No se corrigió fuera de alcance.
- `git diff --check`: PASS.
- Render completo con Chrome local: sin overflow de celdas; inspección visual de la vista completa.

## Banditas: pendiente de identificación y autorización SQL

Consulta de catálogo confirmó dos productos activos, cada uno con una variante «Única»:

- `4d1afc58-fd94-447c-8619-352969374124`: Banditas, precio $15.
- `22873a43-aee6-4313-b110-38262c80b907`: Banditas Mayoreo, precio $10.

Se solicitó identificar el producto y autorizar una migración acotada: el cálculo canónico reside en `pos_retail_quote_v1`, consumido por ventas y pedidos. No se creó ni aplicó migración, no se asignó una excepción por nombre y no se ejecutaron las pruebas 49/50/51 del descuento aún no implementado.

## Publicación

Despliegue `dpl_5Q6VxNniyG1rqRkteqhgCB5McPzZ`, URL `https://cometa-gtzovohv1-cometa-os-s-projects.vercel.app`, estado READY. Build Next 16.4.0, TypeScript y generación de páginas PASS. Promoción completada; `vercel alias ls` confirma que `app.cometaos.com` apunta al nuevo despliegue. No se cambiaron variables de entorno ni valores de configuración del negocio.

Verificación HTTP posterior: `/login` 200; `/api/pos/terminal-print?brandSlug=magenta-fitwear` y `/api/pos/retail-orders?brandSlug=magenta-fitwear`, ambas 401 sin sesión. No se realizó una operación autenticada real de impresión/cobro como prueba de publicación. No se creó commit ni push.

## Archivos cambiados

1. `src/lib/pos/thermal.ts`
2. `src/lib/pos/retail-orders.ts`
3. `src/app/api/pos/terminal-print/route.ts`
4. `src/app/api/pos/retail-orders/route.ts`
5. `src/app/brand/[brandSlug]/pos/settings/terminal/page.tsx`
6. `scripts/test-pos-retail-terminal.mjs` (mock ampliado para consulta de historial)
7. `scripts/test-pos-ticket-compact.mjs` (nuevo)
8. `scripts/render-pos-ticket-compact.mjs` (nuevo)
9. `docs/retail-ticket-compact-20261019.md` (nuevo)

Los archivos no rastreados que ya existían se conservaron. Los artefactos locales bajo `build/retail-compact/` y la copia de despliegue bajo `.next/magenta-preview-preparation/` quedan fuera del código publicado.
