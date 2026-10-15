# Supabase workflow

Este repositorio usa Supabase CLI con el proyecto `zhtagqrzyovsrmsicaot`.
Las migraciones nunca se aplican automáticamente durante `npm install`, el build o el arranque de Next.js.

## Flujo autorizado

Desde una terminal autenticada:

```bash
npx supabase --version
npx supabase login
npx supabase link --project-ref zhtagqrzyovsrmsicaot
npx supabase migration list
npx supabase db diff --linked
npx supabase db push
```

Revisar la salida de `migration list` y `db diff --linked` antes de hacer push. Si existe drift entre migraciones locales y remotas, detenerse y resolverlo; no hacer `db push` a ciegas. El `db diff` no sustituye la revisión humana del SQL.

## Migraciones actuales

Las migraciones versionadas viven en `supabase/migrations/` y no deben renombrarse, reordenarse ni sobrescribirse. Para este flujo están pendientes, entre otras:

- `20260827_brand_content_storage_v1.sql`
- `20260827_mercury_content_reviews_v1.sql`

## Seguridad

- Nunca guardar tokens, contraseñas de base de datos o claves en el repositorio.
- `supabase link` puede solicitar credenciales de forma interactiva; usar el mecanismo seguro del operador.
- La `service_role` de la aplicación no es la contraseña de la base de datos.
- No ejecutar `db pull` para crear una baseline sin entender primero el estado remoto.
- El `db push` es siempre una acción explícita y autorizada.

## Scripts npm

```bash
npm run supabase:version
npm run supabase:link
npm run supabase:migrations:list
npm run supabase:status
npm run supabase:push
```

`supabase:push` sólo envuelve `npx supabase db push`; no se ejecuta desde otros scripts.
