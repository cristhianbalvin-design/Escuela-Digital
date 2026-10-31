# Supabase: identidad y aislamiento

## Aplicación

Las migraciones se aplican en orden por timestamp (`20261029020000` a
`20261029020500`). Después se carga `seed.sql` (solo entornos locales o de
prueba). En un entorno local de Supabase CLI, `supabase db reset` aplica
migraciones y seed. La primera fila de `platform_admins` debe crearla un
proceso con `service_role`; un usuario normal no puede otorgarse ese rol.

El esquema `app` es privado: no debe añadirse a los esquemas expuestos
por la API. La verificación de un dominio y su cambio a `verified = true`
corresponden al backend con `service_role`. Un administrador de escuela
puede registrar un host pendiente, eliminarlo y marcar como principal
uno ya verificado. Para cambiar el host se elimina y se registra de nuevo,
de modo que vuelva a pasar por verificación.

## Pruebas

Con una base local preparada, ejecutar `supabase test db`. Cada prueba
pgTAP crea datos dentro de una transacción y termina con `rollback`.
Referencia: [pruebas de base de datos de Supabase](https://supabase.com/docs/guides/local-development/testing/overview).

## Supuestos y diferencias de T5.1

- Se usan `host` y `verified` en `tenant_domains`, en lugar de `domain` y
  `status` de T5.1. `kind` y `verification` conservan información para el
  flujo de dominios propios.
- `invitations` corresponde a `tenant_invitations` de T5.1. `offering_id`
  queda para el bloque de ediciones, cuando exista su tabla.
- `clients.slug` añade una URL estable y unicidad por escuela.
  `client_members.id` añade una PK UUID; también se conserva la unicidad
  de escuela, cliente y usuario. `client_members.tenant_id` permite FKs
  compuestas que impiden vínculos entre escuelas.
- `logo_light_url`, `logo_dark_url`, `language` y `time_zone` siguen los
  nombres de este paso para la respuesta de marca. No se crean todavía
  `partners`, `profiles` ni las tablas de cursos y ediciones.
- `updated_at` lo mantiene el trigger `app.touch_updated_at()`.
  `deleted_at` en `clients` sigue la convención de borrado lógico.
- El seed usa `tideo.localhost` y `udep-demo.localhost` como hosts de
  desarrollo. Los dominios reales requieren verificación del backend.
- `list_my_tenants()` incluye la propia escuela de un docente invitado
  para permitir el selector, aunque RLS le impide leer directamente
  miembros, clientes, invitaciones y configuración.
- La aceptación de invitaciones y las demás RPC de T7 dependen de tablas
  y flujos posteriores. Este paso crea únicamente las dos RPC pedidas.

## Revisión de Claude (cambios sobre el borrador de Codex)

- `get_tenant_branding`: el parámetro `host` se califica como
  `get_tenant_branding.host`. En funciones SQL la columna `d.host` tiene
  prioridad sobre el parámetro, y sin calificar la función devolvía la
  marca de cualquier dominio verificado.
- Se quitaron dos `alter extension ... set schema` redundantes.
- Se añadió el trigger `touch_updated_at` y se retiró `updated_at` de los
  permisos de columna.
