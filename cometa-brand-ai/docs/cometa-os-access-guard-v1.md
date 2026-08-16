# Cometa OS Access Guard V1 — Fase A

## Alcance

Esta fase separa Cometa POS de la API de dashboard exclusiva de Cometa OS y protege `GET /api/brand-dashboard` con la authority dedicada `public.brand_os_access`.

No mueve rutas, no crea `/brand/[brandSlug]/os`, no construye Brand Home y no protege todavía todas las superficies históricas de Mercury o Sales AI.

## Authorities separadas

| Concepto | Authority |
| --- | --- |
| Pertenencia de usuario a una empresa | `public.user_brand_access` con `status = active` |
| Operación y acceso comercial de POS | subscription, lifecycle y entitlements de POS |
| Acceso de producto Cometa OS | `public.brand_os_access` |
| Bypass operativo interno | `public.user_profiles.role = 'admin'` y `status = 'active'` |

Una membership no implica acceso a Cometa OS. La ausencia de una fila en `brand_os_access` significa `not_configured`; no equivale a acceso legacy.

## Regla de acceso de Brand Dashboard

Para un usuario normal, Brand Dashboard requiere:

```text
sesión autenticada
→ brand canónica en public.brands
→ user_brand_access activa para esa brand
→ brand_os_access.status = active
```

Los estados `paused`, `inactive` y `not_configured` responden con códigos estables `BRAND_OS_ACCESS_PAUSED`, `BRAND_OS_ACCESS_INACTIVE` y `BRAND_OS_ACCESS_NOT_CONFIGURED`. La ausencia de membership responde `BRAND_OS_MEMBERSHIP_REQUIRED`; una brand canónica ausente responde `BRAND_NOT_FOUND`.

Un platform admin activo puede acceder para operación interna. Ese bypass no crea membership, owner, seat, entitlement ni fila de `brand_os_access`.

## Decoupling de POS

`PosShell` ya no consulta `/api/brand-dashboard`. Usa `/api/pos/bootstrap`, que ya devuelve `user`, `brand`, lifecycle, entitlements, perfil y capabilities bajo la authority de POS.

Por tanto:

```text
membership activa + POS válido + OS not_configured
→ POS continúa funcionando
→ Brand Dashboard queda bloqueado
```

## Límite explícito de Fase A

Esta fase protege exclusivamente `GET /api/brand-dashboard` y prepara el guard reutilizable para la futura ruta `/brand/[brandSlug]/os`.

No protege todavía Mercury, Sales AI ni `/cometa-os/design` como superficies globales de OS. Ese rollout se auditará y autorizará por separado; no debe afirmarse que todo Cometa OS esté protegido globalmente tras esta fase.

## Casos manuales previstos

1. `tienda-morotiendas` con membership activa y OS `active`: Brand Dashboard permitido.
2. Membership activa, POS válido y OS `not_configured`: Brand Dashboard bloqueado; POS continúa funcionando.
3. OS `paused`: bloqueo `BRAND_OS_ACCESS_PAUSED`.
4. OS `inactive`: bloqueo `BRAND_OS_ACCESS_INACTIVE`.
5. Platform admin activo sin membership: acceso permitido por bypass explícito.
6. `brandSlug` desconocido: `BRAND_NOT_FOUND`, sin fallback a otra brand.
