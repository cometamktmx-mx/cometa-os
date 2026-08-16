# Cometa POS First Run Experience V1 — Smoke Test

DuraciÃ³n estimada: 15–25 minutos, adicional al smoke operativo Retail. Usar una cuenta y una brand de prueba nuevas. No reutilizar datos productivos.

## A. Brand nueva

1. Completar signup, confirmaciÃ³n de correo y creaciÃ³n de una brand Fashion o Retail.
   - Esperado: el alta redirige a `/brand/[brandSlug]/pos`, no al configurador avanzado.
2. Confirmar el hero “Tu negocio ya estÃ¡ listo”.
   - Esperado: muestra el nombre real de la brand y no presenta pricing como protagonista.
3. Revisar la fila de activaciÃ³n.
   - Esperado: “Negocio creado”, ubicación real `Principal`, caja real `Caja 1` y prueba gratuita con los dÃ­as restantes del lifecycle.
4. Revisar “Primeros pasos”.
   - Esperado: progreso `0/4` y únicamente “Agregar mi primer producto” aparece como siguiente acciÃ³n.
5. Abrir “Perfil del negocio”.
   - Esperado: `/pos/onboarding` conserva giro, funciones, identidad y operaciÃ³n. Volver al resumen sin guardar cambios.

## B. Producto e inventario

6. Pulsar “Agregar mi primer producto” y crear un producto activo.
   - Esperado: al volver a `/pos`, producto aparece completado y el CTA cambia a “Registrar inventario”.
7. Registrar inventario positivo para el producto.
   - Esperado: al volver, inventario aparece completado y el CTA cambia a “Abrir caja”.

## C. Caja y primera venta

8. Abrir `Caja 1` con un fondo inicial válido.
   - Esperado: caja aparece completada, progreso `3/4` y CTA “Hacer mi primera venta”.
9. Cerrar la caja sin vender y regresar a `/pos`.
   - Esperado: el paso histórico permanece completado, pero el CTA vuelve a “Abrir caja” porque no existe una sesión operativa abierta.
10. Abrir caja nuevamente y completar una venta.
    - Esperado: la venta queda en estado completado.
11. Regresar a `/pos`.
    - Esperado: desaparece la experiencia first-run y aparece el resumen operacional estándar con métricas y acciones rápidas.

## D. Seguridad, error y responsive

12. Probar la brand con lifecycle suspendido o trial vencido.
    - Esperado: PosShell muestra el locked state de CORE-1; first-run no permite operar ni hace bypass.
13. Simular fallo de red en `sales` o `cash-sessions` desde DevTools y recargar.
    - Esperado: no se afirma progreso falso; aparece un mensaje humano con “Reintentar” e “Ir al POS”.
14. Simular respuesta 401/403.
    - Esperado: se conserva como error de autorización, no como empty state.
15. Revisar desktop, tablet y móvil.
    - Esperado: hero, estados y checklist se apilan sin overflow; el CTA principal permanece visible cerca del inicio.
