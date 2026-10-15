# Cometa POS — Product Code, SKU y barcode interno V2

## Product code

`pos_products.product_code` identifica la familia del producto. Es nullable para preservar el catálogo histórico y es único por marca, ignorando mayúsculas y espacios externos.

Cometa sugiere un prefijo legible derivado del nombre y el siguiente consecutivo disponible, por ejemplo `LEG001`. La sugerencia es editable; una edición manual no se regenera automáticamente.

El código no reemplaza `variant_id`, SKU, barcode ni la autoridad de inventario.

## SKU de variantes

Las variantes nuevas sin SKU pueden recibir una propuesta basada en:

```text
PRODUCTCODE-ATTR1-ATTR2
```

El orden respeta `pos_product_attribute_definitions.sort_order`. Los tokens eliminan acentos, usan mayúsculas y compactan valores como `S/M`, `M/L` y `L/XL`. Las colisiones se amplían de forma determinística.

Los SKU existentes nunca se sobrescriben automáticamente. `Generar SKU faltantes` es una acción explícita.

La variante técnica `Única` de un producto simple usa el `product_code` como SKU sugerido, sin agregar el sufijo `-U`.

## Barcode interno opcional

La generación es opt-in mediante `Generar código interno` o `Generar códigos faltantes`. Los valores manuales o del fabricante siempre se conservan.

Cometa genera un número de 13 dígitos con check digit EAN-13 y prefijo de circulación restringida `20`–`29`. Es un identificador interno/restringido del negocio: no sustituye un GTIN oficial, no es un código del fabricante y no debe asumirse válido para marketplaces o distribución externa. Un GTIN comercial debe provenir del esquema GS1 correspondiente.

La generación es server-side, no deriva directamente del SKU, verifica unicidad por marca y reintenta ante conflictos. La constraint de base de datos sigue siendo la autoridad final.

## Búsqueda y Register

- `product_code` identifica el producto padre y puede abrir el selector de variantes.
- SKU exacto identifica una variante.
- Barcode exacto identifica una variante.
- La venta continúa enviando únicamente `variantId`.

No se implementan impresión de etiquetas, cámara, QR, reportes, receiving, stock redesign ni cambios en ventas.
