# Smoke test — Stripe Billing V1

1. Owner con trial abre Billing y ve el estado nativo.
2. Owner elige Pro; Checkout cobra inmediatamente.
3. `checkout.session.completed` reconcilia IDs, sin conceder acceso directamente.
4. `customer.subscription.created/updated` actualiza plan, status, periodos y cancelación.
5. Recargar/logout/login conserva el estado sincronizado.
6. Customer Portal abre para Owner.
7. Manager/admin reciben `POS_PERMISSION_REQUIRED` en Checkout y Portal.
8. `invoice.payment_failed` reconcilia el estado Stripe real; no cancela por inferencia.
9. Cancelación al final del periodo muestra el flag sin cambiar prematuramente a `cancelled`.
10. Un grant activo muestra beneficio y bloquea Checkout; no crea Stripe automáticamente.
11. Repetir el mismo webhook devuelve 200 idempotente.
12. Los eventos procesados mínimos son `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`.
13. Probar Test Mode en viewport móvil y desktop.
