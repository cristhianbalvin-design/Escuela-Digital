# Catálogo (paso 4A)

## Alcance

Las migraciones `20261029030000` a `20261029030400` agregan el contenedor de cursos, colaboradores, versiones, módulos, lecciones, recursos, controles de acceso y tres RPC. El esquema `app` sigue siendo privado y no debe exponerse por la API.

Cada curso pertenece a una escuela. Las referencias entre cursos, versiones y contenido incluyen `tenant_id`; las claves foráneas compuestas impiden mezclar escuelas aun cuando se use un UUID válido de otra escuela. El `slug` sigue el formato y la lista de nombres reservados empleados para escuelas y clientes.

## Decisiones

- Solo puede existir un borrador por curso. Un índice único parcial aplica esta regla también frente a solicitudes concurrentes.
- `publish_version` exige al menos un módulo con una lección. Cambia el puntero `courses.latest_published_version_id` y el estado del curso a `active`. Las versiones publicadas anteriores siguen `published`: una edición existente puede continuar apuntando a su versión original.
- `create_draft_from_version` acepta una versión `published` o `retired`, crea nuevos UUID para módulos, lecciones y recursos, conserva los campos de contenido y registra `source_version_id` y `source_tenant_id`. Serializa la operación por curso.
- Los autores editan los campos descriptivos de un borrador y su contenido. El cliente no recibe permisos de columna para cambiar `tenant_id`, `created_by`, estados de versión, datos de publicación ni el puntero a la última versión.
- Solo administradores de escuela y operadores de plataforma gestionan colaboradores. Un `viewer` docente puede leer; un `editor` docente puede leer y editar. El docente invitado necesita `can_author = true` y acceso por autoría o colaboración `editor`.
- El bloqueo compartido en el trigger de contenido serializa las escrituras con la publicación. Las claves de identidad de módulos, lecciones y recursos no se pueden cambiar para mover contenido a otra versión.
- Las posiciones son numéricas para permitir inserciones intermedias. Las restricciones únicas `DEFERRABLE` permiten reordenar varias filas dentro de una transacción mediante `SET CONSTRAINTS ... DEFERRED`.
- `deleted_at` reserva el borrado lógico del curso. Este paso no expone una operación de borrado lógico ni permite borrar cursos directamente.

## Supuestos y trabajo posterior

- El operador de plataforma puede crear un curso en cualquier escuela activa, de acuerdo con su alcance global. Para los demás usuarios, `create_course` exige una membresía activa en la escuela indicada.
- El acceso de un docente invitado a la versión fijada por una edición se incorporará en el paso 4B. Los coordinadores y estudiantes no reciben acceso directo a estas tablas del catálogo.
- Este paso no crea `audit_log`, evaluaciones, tareas, ediciones ni políticas de Storage. Cuando exista `audit_log`, la publicación deberá registrar allí el evento previsto en T7.
- Una licencia entre escuelas podrá usar `source_tenant_id` y `source_version_id`; la RPC de importación de licencias pertenece a un paso posterior.
- La transición de una versión publicada a `retired` queda permitida por el trigger para un flujo administrativo futuro. No se expone todavía una RPC para retirarla.
- Las rutas de recursos son metadatos. La autorización de descarga del bucket privado requiere las políticas de Storage y URLs firmadas del paso correspondiente.

## Pruebas

Los archivos `010` a `012` siguen el patrón pgTAP existente: transacción, plan, datos de prueba y `rollback`. Deben ejecutarse en una base local con las migraciones aplicadas mediante `supabase test db`. Esta propuesta no se ha ejecutado.
