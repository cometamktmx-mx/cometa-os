# Checkpoint COMU Product Editor Visual V3B

FUNCTIONALLY CERTIFIED = YES. VISUALLY APPROVED = YES (revision manual del usuario).

Commit: `feat(comu): redesign seller product editor`.

## Validaciones ejecutadas antes del commit

- V3A: caracterizacion POS antes/despues, combinaciones, SKU y contratos PASS.
- C2 Node y V3B: permisos, editor, reintentos, fallos parciales, legacy y media PASS.
- PostgreSQL V3A/C2 aislado: POS product create/update RPC, round-trips, identidad, stock, reservas y concurrencia PASS; base desechable eliminada.
- Seller Visual V1 y Productos V2: ACTIVE/PREPARING, desktop/tablet/phone PASS.
- TypeScript sin emision PASS.
- ESLint dirigido: editor, media y los 12 scripts incluidos PASS.
- Revision selectiva del indice y git diff --cached --check antes del commit.

## Alcance y exclusiones

Solo V3B. El harness C2 cambia exclusivamente la prueba del editor, ahora delegada al test V3B. Sin cambios funcionales C2/V3A, POS, Buyer, Home o Mobile. Sin migraciones incluidas. Sin fixtures privados, credenciales ni snapshots generales de git status.

La evidencia inicial y sus bloqueos se conservan como historial. La certificacion final POS round-trip resuelve esos bloqueos; el script certify-comu-v3b-roundtrip-local.mjs reproduce el diagnostico historico previo a M1 y no es el comando de certificacion actual. El comando actual es certify-comu-pos-roundtrip-local.mjs.

Los tests browser/HTTP requieren Auth, servicios y fixtures locales ignorados; no contienen credenciales ni se presentan como autosuficientes. Las capturas V1/V2 incluidas son regresiones de V3B.

## Archivos incluidos (77)

- `docs/comu-product-editor-v3b-checkpoint.md`
- `docs/comu-product-editor-v3b-final-certification.md`
- `docs/comu-product-editor-v3b.md`
- `docs/comu-v3b-pos-roundtrip-certification.md`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/browser-results.json`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/legacy-results.json`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/local-installation.json`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/pos-http-blocker.json`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/product-editor-variants-12-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/product-editor-variants-12-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/product-editor-variants-12-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v1/active-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v1/active-phone-viewport.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v1/active-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v1/active-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v1/preparing-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v1/preparing-phone-viewport.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v1/preparing-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v1/preparing-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v1/results.json`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v2/products-active-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v2/products-active-phone-viewport.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v2/products-active-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v2/products-active-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v2/products-preparing-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v2/products-preparing-phone-viewport.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v2/products-preparing-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v2/products-preparing-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/regression-v2/results.json`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/stock-http-results.json`
- `docs/visual-evidence/comu-product-editor-v3b/pos-roundtrip/inventory-verification.json`
- `docs/visual-evidence/comu-product-editor-v3b/pos-roundtrip/m1-installation.json`
- `docs/visual-evidence/comu-product-editor-v3b/pos-roundtrip/results.json`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-create-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-create-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-create-preparing-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-create-preparing-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-create-preparing-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-create-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-edit-a-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-edit-b-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-edit-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/product-editor-variants-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v1/active-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v1/active-phone-viewport.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v1/active-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v1/active-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v1/preparing-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v1/preparing-phone-viewport.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v1/preparing-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v1/preparing-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v1/results.json`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v2/products-active-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v2/products-active-phone-viewport.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v2/products-active-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v2/products-active-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v2/products-preparing-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v2/products-preparing-phone-viewport.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v2/products-preparing-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v2/products-preparing-tablet.png`
- `docs/visual-evidence/comu-product-editor-v3b/regression-v2/results.json`
- `docs/visual-evidence/comu-product-editor-v3b/results.json`
- `scripts/certify-comu-pos-roundtrip-local.mjs`
- `scripts/certify-comu-v3b-browser-local.mjs`
- `scripts/certify-comu-v3b-legacy-browser-local.mjs`
- `scripts/certify-comu-v3b-local-setup.mjs`
- `scripts/certify-comu-v3b-regressions-local.mjs`
- `scripts/certify-comu-v3b-roundtrip-local.mjs`
- `scripts/test-comu-product-editor-http-v3b.mjs`
- `scripts/test-comu-product-editor-regressions-v3b.mjs`
- `scripts/test-comu-product-editor-v3b.mjs`
- `scripts/test-comu-product-editor-visual-v3b.mjs`
- `scripts/test-comu-product-media-v3b.mjs`
- `scripts/test-comu-seller-catalog-local.mjs`
- `src/app/comu/seller/product-editor-media.tsx`
- `src/app/comu/seller/product-editor.css`
- `src/app/comu/seller/product-editor.tsx`
