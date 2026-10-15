# COMETA POS — Roadmap realista al 24 de agosto de 2026

Punto de partida: viernes 14 de agosto de 2026. Objetivo: un piloto retail seguro y demos verticales coherentes de restaurante y servicios. No es realista construir tres ERP completos en diez días calendario.

## Resultado comprometible

- **Retail/fashion:** piloto funcional, condicionado al cierre del guard comercial y smoke tests de venta/caja/inventario/loyalty/ticket.
- **Coffee shop counter:** demo funcional con venta inmediata; no prometer mesas, comandas persistentes ni inventario por receta.
- **Restaurant full service:** demo del nuevo núcleo sólo si se reduce alcance a open order + modifiers + kitchen ticket; piloto real posterior.
- **Services/beauty:** demo de agenda mínima si se prioriza después del núcleo restaurant; piloto real posterior.
- **Pharmacy:** fuera de piloto hasta implementar lotes/caducidad.

## Prioridades

| Prioridad | Trabajo | Criterio de salida |
|---|---|---|
| P0 | Guard central lifecycle + entitlement para APIs operativas | Trial vencido/suspended/cancelled no puede mutar ni leer módulos operativos; subscription/activation siguen accesibles |
| P0 | Retail smoke/E2E | Abrir caja → scanner/cart → cliente/reward → pago → venta única → stock/loyalty → cierre → ticket |
| P0 | Movimientos de caja | Ingreso/retiro auditado entra al efectivo esperado y corte |
| P1 | Editar cliente + ticket piloto | Corrección de contacto y receipt imprimible estable |
| P1 | Restaurant order aggregate | Draft/open/sent/paid/cancelled, items y snapshots, tenant/idempotency |
| P1 | Modifiers + takeaway/tables mínimas | Selección persistida, extra price, impresión/KDS; orden sin mesa y con mesa |
| P1 | Kitchen ticket mínimo | pending/preparing/ready/delivered, visible y ligado a orden |
| P1 | Services appointments core | Servicio, duración, staff, slot, cliente, estados y conflictos |
| P2 | Restaurant live board | Actualización clara de cocina y tiempos |
| P2 | Services calendar + handoff | Día/semana y completar cita hacia caja |
| P2 | Signals verticales | Stock/recovery/recurrence visibles |
| P3 | Recetas completas, comisiones, split/merge, pharmacy lots | Después del piloto inicial |

## Calendario propuesto

| Fecha | Entrega |
|---|---|
| Vie 14 | Congelar alcance, aprobar esta auditoría, elegir marcas/fixtures y definir métricas de piloto. |
| Sáb 15 | Diseñar e implementar guard central; tests de lifecycle/tenant/entitlements sobre APIs representativas. |
| Dom 16 | Retail: movimientos de caja y pruebas transaccionales; preparar checklist de hardware/storage. |
| Lun 17 | Retail: edición de cliente, ticket piloto, smoke test completo y corrección sólo de blockers. |
| Mar 18 | **Gate Retail:** datos de prueba, operación guiada, rollback/runbook y decisión go/no-go. Iniciar modelo de open order. |
| Mié 19 | Restaurant: order aggregate/API, persistencia de items y reentrada segura. |
| Jue 20 | Restaurant: modifiers, takeaway y mesas mínimas; snapshots para ticket. |
| Vie 21 | Restaurant: kitchen ticket mínimo y demo E2E. Gate para decidir demo vs piloto posterior. |
| Sáb 22 | Services: catálogo de servicio/duración, staff/disponibilidad y appointment core. |
| Dom 23 | Services: calendar mínimo, conflictos y handoff a checkout; demo E2E. |
| Lun 24 | Hardening transversal, tenant/security checks, demo scripts y releases: Retail pilot; Restaurant/Services con etiquetas de madurez explícitas. |

## Gates de alcance

- Si el guard central no está aprobado el 16, no abrir piloto de ninguna vertical.
- Si Retail no pasa venta idempotente + stock + loyalty + corte el 18, concentrar todo el equipo en Retail y posponer verticales.
- Si open orders no están estables el 20, mostrar sólo Coffee Shop Counter y no Restaurant Full Service.
- Si appointments no preservan conflictos/tenant el 23, mostrar catálogo + checkout de servicios, no agenda funcional.

## Orden recomendado

**V2C Retail Hardening → V2D Restaurant Core → V2E Services Core**, precedido por el P0 transversal de enforcement comercial. La razón es evidencia de madurez: Retail ya tiene un flujo completo; Restaurant necesita un agregado nuevo antes de reutilizar checkout; Services necesita otro agregado nuevo y puede reutilizar clientes, loyalty y checkout cuando esté listo.
