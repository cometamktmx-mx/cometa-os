# COMU Seller — Product Editor Visual V3B

> Estado final aprobado: FUNCTIONALLY CERTIFIED = YES; VISUALLY APPROVED = YES. Los bloqueos descritos abajo son historicos y quedaron resueltos por la [certificacion POS round-trip](comu-v3b-pos-roundtrip-certification.md). Ver [checkpoint V3B](comu-product-editor-v3b-checkpoint.md) para alcance y validaciones finales.


Actualización posterior: ver [certificación final local](comu-product-editor-v3b-final-certification.md). V3A ya fue instalada localmente con autorización y el recorrido COMU de 12 variantes pasó. Este documento conserva la evidencia de la fase inicial; el bloqueo vigente es el entorno de la API POS, descrito en el informe final.

Estado: implementación local y validación parcial completas; **no certificar todavía el recorrido integral de generación de variantes en navegador**.
Checkpoint protegido: `7be84e59a0e0bf8cca5cc2e330bbf6fab63c1288`.
No commit V3B, deploy, push, cambios de schema ni migraciones aplicadas.

## Entorno y bloqueo verificado

Auth/Supabase de las pruebas HTTP y navegador: `http://127.0.0.1:54321`; Next: `http://localhost:3000`.
La API real de Seller A y B devuelve **sin `variantContract` ni `attributeDefinitions`**. La migración existente V3A solo tiene autorización para PostgreSQL desechable; no se instaló en la base principal.
El editor permite trabajar con el catálogo actual, pero bloquea generar combinaciones/SKU y retirar/reactivar hasta recibir V3A. No trata una ausencia de contrato como una marca sin atributos.
Para cerrar certificación integral: habilitar el contrato existente en un entorno HTTP local autorizado, configurar definiciones reales de la marca y recorrer generación 3×4 desde navegador. No se necesita una migración nueva para el editor.

## Implementación

- Crear/editar con el Shell V1 existente. Estilos limitados al editor; el listado V2 se oculta solo mientras está abierto y se restaura al cerrar.
- Fotos, información, precio, variantes; preview, mayoreo, inventario y publicación en segunda columna desktop. Tablet apila columnas; teléfono usa variantes como tarjetas y preview colapsable.
- Sin JSON visible. Los controles usan definiciones/orden/opciones reales de marca. Los valores de atributos textuales/numéricos de definición libre se añaden con Enter; select no inventa opciones.
- Único motor V3A: combinaciones, reconciliación, normalización, firma, SKU faltantes y validación. Máximo COMU 100 incluyendo referencias retiradas. Manual/persistido no se regenera.
- Precio común editable en estado antes de guardar, con excepciones individuales. Stock únicamente por variante/ubicación, `expectedQuantity`, reservas y cambios explícitos.
- Retirar persistidas envía `active=false`; reactivar conserva ID. Variantes con atributos legacy no representables se conservan, sin conversión a texto ni normalización silenciosa.
- Código persistido sin cambios se omite con contrato V3A, que lo preserva; nuevos/editados usan normalización compartida. Categoría sin cambios conserva su ID. SKU legacy >80 se mantiene mientras no se edite. Barcode no se envía ni se regenera.
- Estado PREPARING/progreso proviene de APIs reales. ACTIVE no muestra onboarding. No inferencia de POS por tablas compartidas.

## Guardado y reintentos

1. Catálogo/producto/variantes/stock: una RPC C2 transaccional con `requestId` estable. Ante respuesta ambigua se congela el formulario y reenvía exactamente el mismo comando. Rechazo HTTP definitivo de validación permite corregir. Tras confirmación se conserva productId/listingId y no se vuelve a ajustar stock durante las etapas posteriores.
2. Fotografías seleccionadas: después del catálogo. GET + comprobación SHA-256 evita repetir contenido. El POST de Storage no tiene clave idempotente: una respuesta incierta queda en verificación, **no se reenvía automáticamente**. Si el contenido aparece, se concilia; si no aparece, requiere revisión manual. No se promete resolución automática de una carga ambigua. Eliminación existente requiere confirmación.
3. Mayoreo: solo si fue editado. PUT del contrato existente y GET para verificar modo/niveles antes de avanzar. Se preservan flags/corridas leídos. No es una transacción con catálogo ni Storage.
4. Publicación: último paso después de dependencias requeridas. GET final confirma estado persistido. Si falla una etapa, no se presenta éxito global; se especifica cuál falló y que el catálogo ya fue guardado.
5. Producto previamente publicado: catálogo/imágenes guardados se aplican inmediatamente por los contratos existentes. La UI lo advierte; no promete una transacción atómica ni un borrador paralelo de edición.

Las claves y confirmaciones de reintento pertenecen a la sesión abierta del editor. No se promete persistencia de una operación ambigua tras cerrar/recargar el navegador. Salir con etapas pendientes requiere confirmación y conserva el catálogo válido.

## Verificación y alcance de evidencia

| Prueba | Resultado / alcance |
|---|---|
| `test-product-variants-v3a.mjs` | PASS caracterización POS antes/después, 3×4, tokens, colisiones, manual, firma/límites |
| `test-comu-seller-catalog-local.mjs` | PASS C2 Node y editor V3B |
| `test-comu-product-editor-v3b.mjs` | PASS componente real con inyección de fallos: crear, draft/publicar, 12 variantes, SKU manual, precio común, retiro/reactivación, respuesta perdida, imágenes/mayoreo fallidos, retry, legacy tipado. **No es HTTP real** |
| `test-comu-product-media-v3b.mjs` | PASS carga confirmada por contenido tras respuesta perdida; carga incierta sin reenvío ciego. **Prueba controlada** |
| `test-comu-product-editor-http-v3b.mjs` | PASS Auth y APIs locales reales: crear, draft, editar, retry, stock 5→7 una vez, Storage/public bytes, denegación B sobre asset A, tiers, publicación y mismos IDs/SKU canónicos POS |
| `test-product-variants-postgres-v3a.mjs` | PASS C1/C2/V3A, concurrencia/reservas, idempotencia, aislamiento, legacy, ambos recorridos RPC POS↔COMU. Base `comu_v3a_1791212120978` eliminada. **No recorrido UI POS** |
| `test-comu-product-editor-visual-v3b.mjs` | PASS apertura/preview/layout real ACTIVE y PREPARING: 1536, 834 y 390 px; sin overflow. Combinaciones bloqueadas por contrato ausente |
| `test-comu-product-editor-regressions-v3b.mjs` | PASS scripts originales Seller Visual V1 y Productos V2, ambos estados/tres tamaños. Evidencia redirigida a carpeta V3B; originales intactos |
| TypeScript | PASS `tsc --noEmit --incremental false --pretty false`, 0 errores |
| ESLint dirigido | PASS 0 errores/advertencias en fuentes y pruebas del bloque |
| `git diff --check` | PASS; índice vacío y HEAD continúa en checkpoint V3A |

El fixture HTTP se conserva en DRAFT, nombre `LOCAL TEST V3B …`; identificadores en `.env.comu-v3b-test-artifact.json` ignorado por Git. No usuarios nuevos ni credenciales documentadas. Foto de prueba PNG 1×1; no representa fotografía editorial. El script crea un fixture nuevo identificado al ejecutarse y no elimina fixtures anteriores.

## Evidencia visual

Referencia inspeccionada: `docs/visual-references/comu-seller-product-editor-approved.png`.
Capturas reales en `docs/visual-evidence/comu-product-editor-v3b/`:

- `product-editor-create-desktop.png`
- `product-editor-edit-desktop.png`
- `product-editor-create-phone.png`
- `product-editor-variants-desktop.png`
- Adicionales: PREPARING, tablet, edición phone y resultados JSON.

La captura de variantes muestra las variantes **reales existentes** con el aviso de contrato ausente; no certifica 12 variantes generadas en navegador.

Composición reproducida: crema/verde, headline editorial, fotos/información/precio/variantes, preview lateral sticky, mayoreo/inventario/estado. Se conserva Shell aprobado, sin copiar datos/fotografías del mockup.
Desviaciones: 5 MB real por imagen (mockup 10 MB); sin precio comparativo, margen ficticio, sincronización POS obligatoria, barcode, stock masivo, toolbar de texto enriquecido ni acciones falsas. No se expone reordenamiento/selección primaria en esta versión: el API existente permite actualizaciones individuales, pero no ofrece operación atómica de galería. Más altura por código, stock por ubicación y avisos de seguridad. Fotos actuales son fixtures mínimos; la fidelidad fotográfica no puede certificarse con esos assets.

## Archivos del bloque

- `src/app/comu/seller/product-editor.tsx`
- `src/app/comu/seller/product-editor-media.tsx`
- `src/app/comu/seller/product-editor.css`
- `scripts/test-comu-seller-catalog-local.mjs` (delegación de prueba de editor a V3B)
- `scripts/test-comu-product-editor-v3b.mjs`
- `scripts/test-comu-product-media-v3b.mjs`
- `scripts/test-comu-product-editor-http-v3b.mjs`
- `scripts/test-comu-product-editor-visual-v3b.mjs`
- `scripts/test-comu-product-editor-regressions-v3b.mjs`
- Este documento, snapshot Git y evidencia V3B.

No se modificó V3A, Shell, Dashboard, Productos V2, APIs, POS, Mobile, Buyer o migraciones. Cambios previos del working tree preservados.
