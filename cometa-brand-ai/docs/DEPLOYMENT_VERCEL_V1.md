# COMETA OS — Vercel Deployment V1

## 1. Proyecto Vercel

- [ ] Importar el repositorio correcto en Vercel.
- [ ] Confirmar el framework Next.js y el directorio raíz del proyecto.
- [ ] Usar `npm run build` como comando de producción.
- [ ] Mantener Node.js y dependencias según `package.json` y `package-lock.json`.
- [ ] No habilitar `ignoreBuildErrors` ni omitir TypeScript.

## 2. Variables de entorno

### Públicas / browser-safe

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `NEXT_PUBLIC_APP_URL=https://app.cometaos.com`
- [ ] Configurar `NEXT_PUBLIC_META_APP_ID` y `NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID` solo cuando Embedded Signup esté habilitado.

### Server only — piloto COMETA

- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `OPENAI_API_KEY`
- [ ] `OPENAI_MODEL`, si se desea reemplazar el modelo por defecto.
- [ ] `COMETA_APP_ORIGIN=https://app.cometaos.com`
- [ ] `APP_ORIGIN=https://app.cometaos.com`
- [ ] Configurar `COMETA_ADMIN_EMAILS` y/o `COMETA_ADMIN_USER_IDS` únicamente si los flujos legacy que los consumen siguen habilitados.
- [ ] Mantener fuera del prefijo `NEXT_PUBLIC_` todas las service-role keys, API keys, secretos internos, tokens y secretos de webhook.

### Server only — integraciones condicionales

- [ ] Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- [ ] Correo: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- [ ] WhatsApp/Meta: configurar solamente los nombres usados por el entorno elegido: `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_ACCESS_TOKEN`, `META_WHATSAPP_TOKEN`, `META_WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `WHATSAPP_TOKEN_KEY_VERSION` y versiones Graph correspondientes.
- [ ] Procesos internos/cron: `CRON_SECRET`, `SALES_AI_INTERNAL_SECRET`, `MERCURY_INTERNAL_SECRET` y flags Sales AI solamente si esos procesos se habilitan.
- [ ] Modelos opcionales: `MERCURY_OPENAI_MODEL`, `PULSAR_OPENAI_MODEL` y variables `OPENAI_IMAGE_*` solamente para los módulos correspondientes.

## 3. Deploy

- [ ] Ejecutar localmente `npm run build` y exigir exit code `0`.
- [ ] Ejecutar los contratos read-only del piloto.
- [ ] Confirmar que `npx supabase db push --dry-run` no reporte migraciones pendientes.
- [ ] Crear el deployment de Vercel sin ejecutar migraciones desde el build.
- [ ] Revisar logs de build, funciones y proxy antes de promover a producción.

## 4. Dominio

- [ ] Agregar `app.cometaos.com` al proyecto Vercel.
- [ ] Definirlo como dominio de producción.
- [ ] Confirmar HTTPS válido y redirección al hostname canónico.

## 5. DNS

- [ ] Crear el registro DNS indicado por Vercel para `app.cometaos.com`.
- [ ] Esperar verificación y propagación.
- [ ] Confirmar que no exista un registro CNAME/A conflictivo.

## 6. Supabase Auth

- [ ] Establecer Site URL: `https://app.cometaos.com`.
- [ ] Agregar Redirect URL: `https://app.cometaos.com/auth/callback`.
- [ ] Agregar Redirect URL: `https://app.cometaos.com/auth/confirm`.
- [ ] Agregar Redirect URL: `https://app.cometaos.com/invite`.
- [ ] Agregar Redirect URL: `https://app.cometaos.com/reset-password`.
- [ ] Conservar URLs localhost únicamente para desarrollo local.
- [ ] Validar cookies y renovación de sesión sobre HTTPS.

## 7. Smoke tests de producción

### Admin

- [ ] Login redirige a `/workspace`.
- [ ] Abrir Bela Cosmetics, estrategia, calendario, contenido y aprobaciones.
- [ ] Confirmar que Team y Client no pueden abrir rutas Admin.

### Team — Karime

- [ ] Login redirige a `/studio`.
- [ ] Probar operación, piezas, cambios, grabaciones y recursos.
- [ ] Ejecutar COSMOS únicamente mediante acción explícita.
- [ ] Confirmar live updates, badge de cambios y notificaciones en sesión.
- [ ] Confirmar Shot Plan conservador cuando Bela no tiene Production Profile.

### Client — Bela

- [ ] Login redirige a `/brand/[brandSlug]`.
- [ ] Abrir Command Center, OS y contenido/calendario visible.
- [ ] Solicitar cambios y aprobar mediante el review canónico.
- [ ] Confirmar que Client no puede abrir `/workspace` ni `/studio`.

### Flujo E2E del piloto

- [ ] Auto Calendar → pieza → asignación Karime → Studio → producción.
- [ ] Revisión interna → cambio interno → Live Update → corrección.
- [ ] Aprobación interna → enviar al cliente → cambio cliente → Live Update → corrección.
- [ ] Aprobación cliente → Global Content refleja el estado final.

## 8. Rollback básico

- [ ] Conservar identificado el deployment estable anterior en Vercel.
- [ ] Ante una regresión crítica, promover nuevamente ese deployment.
- [ ] No revertir ni aplicar migraciones automáticamente durante el rollback.
- [ ] Revisar logs y aislar código, configuración o estado de migraciones antes de un nuevo deploy.
