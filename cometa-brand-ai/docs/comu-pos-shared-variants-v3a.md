# COMU / POS V3A — shared variant contract

Estado: implementación y pruebas locales aisladas completas. No Visual V3B, no commit, no cambios de API POS, no migración de la base principal/remota.

## Archivos del bloque

- `src/lib/pos/product-variants.ts` (nuevo).
- `src/app/brand/[brandSlug]/pos/products/page.tsx`: importaciones y sustitución de lógica pura, sin cambios de JSX/UX/permisos.
- `src/lib/comu/seller-catalog.ts`: contrato ampliado, reexportación del dominio compartido y errores seguros.
- `supabase/migrations/20261003170000_comu_shared_variant_contract_v1.sql` (nuevo).
- `scripts/test-product-variants-v3a.mjs` (nuevo).
- `scripts/test-product-variants-postgres-v3a.mjs` (nuevo).
- `scripts/test-comu-seller-catalog-local.mjs`: carga del helper real en el harness existente.
- Este documento y `comu-pos-shared-variants-v3a-git-status.txt`.

## Un motor, adaptadores explícitos

El dominio no conoce POS/COMU, permisos, red, React ni stock. Exporta normalización de códigos/atributos, tokens, combinaciones, reconciliación, generación de SKU faltantes, validación de longitud y límites explícitos.

POS importa el motor. COMU expone el mismo contrato; la futura UI debe importar directamente `@/lib/pos/product-variants` (no importar el módulo server-side seller-catalog desde un Client Component).

La comparación histórica POS se conserva como `legacyVariantSignature` y se pasa explícitamente a reconciliación. No es un segundo generador: mantiene compatibilidad de la UI existente. El default de nuevas operaciones es `variantSignature`, con las mismas clases de equivalencia que SQL. Su string es una clave de comparación JS, no el texto JSONB literal de PostgreSQL.

## Caracterización y contrato

Oracle POS: código congelado en commit `c02f3664cd4ee62a9ccefb338b91e72b4add8b7f`. Las funciones originales se ejecutaron antes de extraer y luego se compararon con el editor adaptado.

- Colores Negro/Rosa/Beige × tallas CH/M/G/XL = 12, orden color externo/talla interna en el ejemplo.
- SKU: `LEG001-N-C`, `LEG001-N-M`, `LEG001-N-G`, `LEG001-N-X`, equivalentes R y B.
- CH → C; XL → X; Árbol → A; Azul marino → AM; 42 → 42. NFD elimina acentos solo para tokens SKU.
- sort_order determina orden de tokens. Colisiones del formulario usan expansión y sufijos; SKU manual/persistido se conserva.
- Cambiar nombre/base/atributos no regenera SKU existente.
- La combinación cartesiana conserva orden y multiplicidad original; los consumidores deben rechazar firmas repetidas, no insertar duplicados. DB sigue siendo autoridad final.
- El límite se comprueba antes de materializar el producto cartesiano. POS preview: 250; COMU: 100. Hallazgo adicional: la RPC POS de creación existente admite 100; no fue modificada.
- `validateSku` aplica 80 a valores nuevos/modificados, preserva un valor legacy idéntico. El generador conserva la semántica de preview POS; V3B debe validar los candidatos antes de guardar, sin truncarlos. DB C2 y API POS conservan el rechazo definitivo.
- `normalizeProductCode`: trim, uppercase, 1–64 caracteres ASCII alfanuméricos/guion/guion bajo, primer carácter alfanumérico. Valor legacy idéntico se conserva.

## Firma SQL y legacy

Se probaron orden de claves, texto/case/espacios/acentos, vacío, null, números, booleanos, arrays y objetos. SQL conserva tipos, null y vacío; la comparación POS histórica convertía valores a texto y omitía vacío/null. No se reescriben firmas ni filas existentes. Nuevas operaciones usan la equivalencia SQL. Colisiones de claves normalizadas se rechazan.

El helper reproduce `btrim` de espacios, no elimina tabs como `String.trim`. JSON debe ser serializable y números finitos. La prueba PostgreSQL compara el resultado del helper con la función SQL real para esos casos. No se afirma equivalencia universal para números fuera de la precisión de JavaScript ni todas las configuraciones de locale de PostgreSQL.

Nuevos/modificados atributos C2 deben tener código exacto definido/activo para la marca y valores textuales no vacíos, compatibles con controles POS. Los obligatorios se verifican en nuevas combinaciones/modificaciones. Valores legacy no textuales o claves antiguas permanecen cuando se envían sin cambios; no se convierten silenciosamente.

Legacy no textual sigue requiriendo cuidado en una edición por la API/UI POS antigua, que convierte valores a texto y filtra definiciones. El round-trip certificado usa atributos textuales definidos; no certifica esa edición legacy excepcional ni cambia la API POS.

## Migración C2

CREATE OR REPLACE de las funciones read/save existentes. No tablas nuevas, reescritura de datos ni grants POS. Lectura incorpora attributeDefinitions y variantContract (80 SKU/100 variantes). Son opcionales en TypeScript hasta rollout; ausencia NO significa permiso para inventar definiciones.

Save valida ownership/C1, valores nuevos, expectedUpdatedAt, idempotencia, SKU/code y atributos. Identificadores omitidos o legacy idénticos se preservan. Se permite active=false/true explícito por ID; omitir active preserva el estado. No DELETE. No actualiza barcode. Inventario mantiene location, quantity, reserved_quantity, expectedQuantity, locks y movimientos.

Reconciliación recupera variantes persistidas por firma y conserva ID/SKU/barcode/campos. Como POS actual, reintroducir una combinación inactiva NO la activa automáticamente. La reactivación es explícita por ID, comprobada en SQL. Variantes omitidas por C2 permanecen: el consumidor envía active=false para retirarlas; no se cambia silenciosamente el contrato histórico de omisión.

Si faltan definiciones, COMETA debe configurarlas mediante el flujo existente autorizado de atributos/perfil POS. No se da acceso POS al seller ni se crea una definición desde texto libre. La migración no provisiona definiciones automáticamente. Opciones y orden provienen de pos_product_attribute_definitions.

## Pruebas y aislamiento

`node scripts/test-product-variants-v3a.mjs`: PASS antes/después, 3×4, tokens, colisiones/manual, reconciliación, límites e identidad.

`node scripts/test-comu-seller-catalog-local.mjs`: PASS C2 (RPC autenticada, errores, autorización, aislamiento, editor existente, media y mayoreo).

`node scripts/test-product-variants-postgres-v3a.mjs`: PASS. Crea una base `comu_v3a_<timestamp>` con template0 en Docker local, conecta únicamente 127.0.0.1:54322 a ese nombre, crea schema aislado y carga SQL real C1/C2/V3A más definiciones reales POS. No copia datos de la base principal. Reproduce revocación de ejecución de RPC POS al rol authenticated. La base se elimina al terminar.

Última ejecución: `comu_v3a_1791065311504`, eliminada. Una primera ejecución encontró sesión pendiente al limpiar; su base `comu_v3a_1791064665602` fue eliminada explícitamente. Las demás bases de esta prueba también se eliminaron. No se aplicó la migración al public de la base principal.

Cobertura PostgreSQL:

- SKU 80 aceptado, 81 rechazado; legacy 90 preservado; modificarlo exige contrato nuevo.
- Código nuevo normalizado; legacy inválido preservado; edición inválida rechazada.
- Atributo definido aceptado; libre, no textual nuevo, vacío y obligatorio ausente rechazados.
- Firma compartida frente a SQL real.
- Inactivar/reactivar conserva ID/barcode/reservas.
- Cross-seller/buyer/rechazado DENIED; escrituras genéricas POS DENIED; cero memberships POS.
- Dos ediciones concurrentes, reserva concurrente, última unidad, retry y no sobreventa.
- C1+C2: PREPARING, catálogo desde cero, 10/10, Connect simulado SOLO como condición fixture, activación explícita COMETA.
- COMU save → POS update RPC real → COMU read: mismos IDs/SKU/atributos y cantidades/reservas. POS materializa filas de inventario ausentes con cero; se comprueba que no altera filas previas.
- POS create RPC real → COMU read/save → lectura de tablas canónicas POS: mismos IDs/SKU/atributos/inventario, sin duplicados.

Los round-trips certifican RPC/SQL real con identidades fixture, no navegador ni Auth HTTP. POS RPC se ejecuta como backend privilegiado de prueba; eso no otorga privilegios al seller. Los gates API existentes se cubren por regresión Node.

TypeScript: PASS. Lint helper/contrato/tests: PASS. Lint editor POS: 1 error preexistente react-hooks/set-state-in-effect y 3 warnings preexistentes; comparación contra checkpoint confirma mismo conjunto de reglas/severidades, sin hallazgos nuevos. git diff --check: PASS.

## Barcode y stock masivo

Barcode no cambia: EAN-13 interno prefijo 20, check digit, unicidad por marca. No GTIN/UPC oficial, etiquetas ni UI COMU. No se extrajo para evitar ampliar alcance.

Stock masivo NO implementado. V3B puede preparar múltiples ajustes con el contrato transaccional C2 existente, cada uno con variant ID, location ID, quantity física y expectedQuantity leído; nunca establecer reserved_quantity. Debe permitir revisión de excepciones, no asumir ubicación global, marcar solo cambios explícitos y reutilizar requestId para retry idéntico. C2 rechaza reducción por debajo de reservas y conflictos. Precio masivo puede ser estado de formulario, sin modificar stock implícitamente.

## V3B

Puede comenzar implementación sobre el dominio compartido, con autorización separada. No necesita copiar generador. Para validar la UI con el contrato nuevo será necesario autorizar rollout a su entorno objetivo: la base principal permanece sin V3A.

Archivos previstos: product-editor.tsx, estilos/componentes de editor autorizados por el mockup, pruebas UI/HTTP, documentación/evidencia. Importar helper puro y respetar attributeDefinitions/variantContract; detener operaciones si falta contrato/configuración. No adaptar legacy desconocido sin revisión. No se inició V3B.
