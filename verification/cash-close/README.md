# Impresión de cierres — revisión local

Rama: `feat/cash-close-print-20261023`, desde `main` / `b4039f0ee2a7a1612e0574b06ad689c6839bdfee`.

Abrir en Chrome o Safari:

- [Ticket original sintético](ticket-original.html)
- [Ticket de reimpresión sintético](ticket-reimpresion.html)
- [Datos sintéticos](fixture.json)

Formato existente de 80 mm, con área imprimible de 70 mm. Vista de reimpresión revisada en Chrome en la Mac. Los HTML no conectan a ningún servicio ni imprimen automáticamente.

## Comportamiento

- El cierre sigue usando las RPC y claves idempotentes existentes. No cambian importes, conciliación, ventas, movimientos ni reglas de verificación.
- Después del cierre confirmado se congela el ticket en `pos_staff_audit_events.metadata.cashCloseReceipt`, conservando `payload` y `result`. No hay tablas, columnas ni migraciones nuevas. La escritura usa comparación del JSON anterior para que gane una sola copia ante respuestas concurrentes.
- Esta conservación ocurre después del commit monetario: si falla, la respuesta sigue confirmando el cierre y muestra una advertencia. No se repite el comando de cierre por un error de preparación o impresión. En ese caso se imprime únicamente el saldo original disponible, con una advertencia sobre el desglose ausente.
- Los cierres previos sin snapshot imprimen apertura, esperado, contado y diferencia persistidos, más identificación disponible. Indican **“Desglose original no conservado”**. No se reconstruyen las ventas por método con totales actuales. Nombres de cierres antiguos pueden reflejar los catálogos actuales.
- La reimpresión lee el snapshot guardado; no consulta las RPC de totales cuando ya existe. Conserva moneda, zona horaria, operadores e importes y marca **REIMPRESIÓN**. Un segundo intento de impresión también lleva esa marca si ya existe un trabajo anterior.
- En Retail exige permisos de cuenta `pos.cash.read`, operador `CASH` y, para historial, `REPRINT`; en FOOD usa `CASH_OPERATE`. Se revalidan sesión activa, marca, sucursal y dispositivo al preparar, firmar y registrar el resultado del trabajo. El botón del historial se oculta sin esos permisos de operador; el servidor aplica la autorización definitiva.
- La impresión inicial queda limitada al operador que cerró durante cinco minutos; después se usa el historial con permisos de reimpresión. No se concede permiso de venta para imprimir cierres.
- Se usa la cola, firma, opciones QZ y perfil Epson existentes. Un trabajo solo puede firmarse/despacharse una vez. Cada reintento manual crea un trabajo de impresión, nunca un segundo cierre. El resultado de QZ no confirma la salida física del papel. No hay apertura de cajón ni reintento automático.
- Se conserva la distinción de transferencias verificadas y pendientes **al cierre**, sin cambiar su participación en la conciliación. Las verificaciones posteriores no alteran el ticket. Se separan ventas y abonos; los abonos en efectivo ya están incluidos en depósitos.

## Verificaciones realizadas

Con Node 24.22.1 disponible en la Mac:

```sh
node --test verification/cash-close/verify.cjs
cd cometa-brand-ai
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/eslint/bin/eslint.js src/lib/pos/cash-close-receipt.ts src/lib/pos/cash-close-server.ts src/lib/pos/thermal.ts src/app/api/pos/cash-sessions/route.ts src/app/api/pos/terminal-print/route.ts 'src/app/brand/[brandSlug]/pos/cash/page.tsx'
git diff --check
```

11 pruebas aisladas aprobadas: centavos y conciliación; verificación antes/después del cierre; permisos de cuenta, operador, sucursal y dispositivo; lectura del snapshot sin recálculo; preparación y conservación del snapshot; fallo posterior al commit; fallo/reintento QZ y doble clic concurrente; cierres históricos; compatibilidad exacta de tickets de venta 58/80 mm; transporte Epson sin cajón; firma única y permisos revocados. TypeScript y ESLint dirigido: sin errores. Diff sin problemas de whitespace.

Las pruebas ejecutan los módulos reales con almacenamiento, autorización y puente QZ simulados. No sustituyen una prueba de integración con Postgres/RLS ni una sesión de UI autenticada. La captura del desglose posterior al commit no es una transacción conjunta con el cierre. No se ejecutó build ni pruebas que requieran credenciales, bases o ventas reales. No se añadieron dependencias, no se copiaron `.env`, no se tocó el repositorio anterior, no se hizo push, despliegue ni migraciones.

## Archivos de código

- `cometa-brand-ai/src/app/api/pos/cash-sessions/route.ts`
- `cometa-brand-ai/src/app/api/pos/terminal-print/route.ts`
- `cometa-brand-ai/src/app/brand/[brandSlug]/pos/cash/page.tsx`
- `cometa-brand-ai/src/lib/pos/thermal.ts`
- `cometa-brand-ai/src/lib/pos/cash-close-receipt.ts` (nuevo)
- `cometa-brand-ai/src/lib/pos/cash-close-server.ts` (nuevo)

Artefactos nuevos en `verification/cash-close/`: este README, `verify.cjs`, `fixture.json`, `ticket-original.html`, `ticket-reimpresion.html`.

## Pendiente

**La impresión física en la Epson de Magenta queda pendiente.** Debe comprobarse con la configuración, certificado, QZ Tray y controlador de esa terminal, verificando papel, corte y reimpresión de un cierre existente. Este trabajo no autoriza ni ejecuta el despliegue.
