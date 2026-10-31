# Ediciones (paso 4B)

## Alcance

Las migraciones `20261029040000` a `20261029040500` agregan ediciones,
docentes asignados, matrículas, guards, RLS y cuatro RPC. El esquema `app`
permanece privado y no debe añadirse a los esquemas expuestos por la API.
Las pruebas `020` a `022` siguen el patrón pgTAP con transacción y rollback.

## Decisiones

- Una edición fija `version_id` a una versión `published`. Publicar otra
  versión cambia `courses.latest_published_version_id`, pero no cambia la
  edición. `version_id` solo puede cambiar si el estado anterior de la
  edición es `draft`; la nueva versión también debe estar publicada.
- `client_id`, `course_id`, `tenant_id`, `id`, `created_by` y `created_at`
  son inmutables. Las FKs compuestas impiden mezclar escuela, cliente,
  curso, versión o matrícula.
- Una edición con matrículas no admite DELETE ni pasar a `deleted_at`.
  Para ediciones sin matrículas se reserva `deleted_at` como borrado
  lógico. El navegador no recibe permiso DELETE sobre ediciones.
- Un docente asignado debe tener membresía activa `instructor` o
  `instructor_guest` en la escuela. El creador con rol `instructor` se
  asigna automáticamente como `lead`. Un instructor activo que creó
  una edición también satisface `app.is_offering_instructor`, aunque
  se haya retirado su fila de asignación; `can_manage_offering` exige
  la asignación o un rol administrativo.
- Administradores de escuela y operadores de plataforma pueden
  gestionar cualquier edición de su alcance. Un docente `lead` o
  `assistant` asignado puede gestionar su edición y sus matrículas.
  Solo administradores y operadores asignan o retiran docentes.
- Un coordinador solo lee ediciones y matrículas de su cliente. Un
  estudiante lee su propia matrícula; no escribe matrículas ni lee
  módulos, lecciones o recursos directamente.
- `enroll_user` serializa altas bloqueando la fila de la edición.
  Cuenta como cupo ocupado todo estado salvo `dropped`. La matrícula
  existente se devuelve sin cambiar su estado. Un usuario `dropped`
  no se reactiva mediante una nueva alta.
- `enroll_user` exige edición `open` o `running`, cliente activo,
  membresía activa `student` y membresía del usuario en ese cliente.
- Las transiciones de matrícula son `pending` a `active`, `dropped` o
  `suspended`; `active` a `completed`, `dropped` o `suspended`; y
  `suspended` a `active` o `dropped`. `completed` y `dropped` son
  terminales en esta RPC.
- `get_course_outline` acepta gestores o estudiantes con matrícula
  `active` o `completed`. Los gestores ven todo. Los estudiantes reciben
  títulos, posiciones, tipo y estado de bloqueo; `content` solo aparece
  en lecciones liberadas. La RPC no devuelve `lesson_resources` ni
  `storage_path`. Quien no tenga acceso recibe SQLSTATE `42501`.
- Los guards BEFORE pueden rechazar una escritura con `23514` antes
  de que RLS evalúe `WITH CHECK`.

## Formato de `release_schedule`

