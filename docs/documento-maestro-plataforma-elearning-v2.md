# Documento Maestro — Plataforma E-learning Multi-tenant para Escuelas Digitales

**Versión:** 2.0 (Parte I funcional y de diseño + Parte II técnica) · **Fecha:** 28 de octubre de 2026
**Propósito:** brief completo para que Claude Design construya un **prototipo funcional navegable (PWA)**, con diseño moderno y foco en experiencia de usuario, y guía de construcción del producto real.
**Cómo usar este documento:**
- **Parte I (secciones 1 a 19):** producto, usuarios, pantallas, flujos, diseño visual y contenido de ejemplo. Es lo que se entrega a Claude Design para el prototipo.
- **Parte II (secciones T0 a T23):** especificación técnica con React, Supabase y Vercel. Es la guía para construir el producto real.

---

# PARTE I — Funcional y de diseño

## 1. Visión del producto

Una plataforma donde **escuelas digitales** (tenants) crean y dictan cursos online a **distintos clientes** (organizaciones o personas), gestionan a sus alumnos y emiten **certificados verificables**.

**Tres ideas centrales:**
1. **Cada escuela es independiente:** tiene su marca, su subdominio, sus usuarios y sus datos.
2. **Cada escuela puede dictar a muchos clientes:** el mismo curso se ofrece a UDEP, al Colegio de Economistas o a personas individuales sin duplicarlo.
3. **El docente es el protagonista:** el módulo docente debe sentirse como un estudio de creación, no como un formulario administrativo.

### 1.1 Modelo comercial (contexto para el diseño)
- **Hoy (servicio):** TIDEO Tech & Strategy es la escuela. Sus clientes (UDEP, Colegio de Economistas, TIDEO alumnos individuales) viven **dentro** de su escuela.
- **Mañana (SaaS):** cada cliente puede tener **su propia escuela**, y el docente seguiría como **docente invitado**.
- El prototipo debe mostrar ambos mundos: la escuela TIDEO con sus clientes, y un selector que permita ver al docente trabajando en más de una escuela.

---

## 2. Glosario (usar estos términos exactos en toda la interfaz)

| Término | Significado |
|---|---|
| **Escuela** | La organización que usa la plataforma (tenant). Ej.: TIDEO Tech & Strategy. |
| **Cliente** | Quien contrata el servicio o agrupa alumnos. Ej.: UDEP, Colegio de Economistas. |
| **Curso** | El contenido (módulos, lecciones, evaluaciones). Es reutilizable. |
| **Edición** | Una vez que se dicta un curso: fechas, cliente, docente, cupo. Ej.: "Excel Financiero · UDEP · 2026-II". |
| **Matrícula** | Un alumno inscrito en una edición. |
| **Certificado** | Documento verificable emitido al aprobar una edición. |
| **Emisor** | Quién firma el certificado: la escuela, el cliente o ambos (co-emisión). |

---

## 3. Usuarios y roles

| Rol | Objetivo principal | Qué ve |
|---|---|---|
| **Operador de plataforma** | Gestionar escuelas, planes y soporte | Lista de escuelas, planes, métricas globales |
| **Administrador de escuela** | Configurar marca, clientes, usuarios y certificados | Todo lo de su escuela |
| **Docente** | Crear cursos, dictar, evaluar, certificar | Sus cursos y ediciones asignadas |
| **Docente invitado** | Igual que docente, en una escuela ajena | Solo lo que esa escuela le asignó |
| **Coordinador de cliente** | Seguir el avance de los alumnos de su organización | Solo alumnos de su cliente (lectura) |
| **Estudiante** | Aprender, rendir evaluaciones, obtener certificado | Sus cursos y certificados |
| **Visitante** | Verificar un certificado | Página pública de verificación |

**Regla de identidad:** una persona tiene **una sola cuenta**, aunque participe en varias escuelas con roles distintos (ej.: administrador en TIDEO y docente invitado en otra escuela). El prototipo debe incluir un **selector de escuela** en la barra superior.

**Prioridad de diseño del prototipo:** Docente (máxima profundidad) → Estudiante → Administrador de escuela → Coordinador de cliente → Verificación pública → Operador de plataforma (versión simple).

---

## 4. Principios de experiencia de usuario

1. **Claridad antes que cantidad:** cada pantalla responde una pregunta ("¿qué tengo que hacer hoy?").
2. **Una acción principal por pantalla**, siempre visible y de color primario.
3. **Progreso visible:** barras, anillos y porcentajes en todo lo que se completa.
4. **Menos clics:** acciones frecuentes accesibles en 1–2 pasos; atajos y búsqueda global (`Ctrl/Cmd + K`).
5. **Feedback inmediato:** toda acción confirma con toast, animación sutil o cambio de estado.
6. **Estados siempre diseñados:** vacío, cargando, error, éxito y sin permisos.
7. **Celebrar logros:** terminar una lección, aprobar un examen y recibir un certificado deben sentirse bien.
8. **Autoguardado en el constructor:** el docente nunca debe temer perder trabajo.
9. **Lenguaje humano:** mensajes cortos, en español neutro, sin jerga técnica.
10. **Mobile-first para el estudiante**, escritorio-first para docente y administrador (pero ambos responsivos).

---

## 5. Sistema de diseño visual

### 5.1 Personalidad
Moderna, confiable, educativa y cálida. Debe verse como un producto SaaS premium (referencias de sensación: Linear, Notion, Stripe, Duolingo en celebración de logros). Mucho aire en blanco, tarjetas suaves, tipografía clara.

### 5.2 Paleta de colores

**Marca de la plataforma (por defecto)**

| Rol | Nombre | Hex | Uso |
|---|---|---|---|
| Primario | Índigo vibrante | `#4F46E5` | Botones principales, enlaces, selección |
| Primario hover | Índigo profundo | `#4338CA` | Hover y presionado |
| Primario suave | Índigo 50 | `#EEF2FF` | Fondos de selección, chips, resaltes |
| Secundario | Turquesa | `#14B8A6` | Progreso, aprobado, acentos de energía |
| Acento | Ámbar | `#F59E0B` | Destacados, insignias, logros |
| Acento 2 | Coral | `#F472B6` | Detalles decorativos, ilustraciones |

**Semánticos**

| Estado | Color | Fondo suave |
|---|---|---|
| Éxito / aprobado | `#16A34A` | `#DCFCE7` |
| Advertencia / pendiente | `#D97706` | `#FEF3C7` |
| Error / reprobado / revocado | `#DC2626` | `#FEE2E2` |
| Información | `#0EA5E9` | `#E0F2FE` |

**Neutros (modo claro)**

| Uso | Hex |
|---|---|
| Fondo de app | `#F8FAFC` |
| Superficie (tarjetas) | `#FFFFFF` |
| Borde | `#E2E8F0` |
| Texto principal | `#0F172A` |
| Texto secundario | `#475569` |
| Texto deshabilitado | `#94A3B8` |

**Modo oscuro (obligatorio en el prototipo, con interruptor)**

| Uso | Hex |
|---|---|
| Fondo de app | `#0B1020` |
| Superficie | `#131A2E` |
| Superficie elevada | `#1B2440` |
| Borde | `#2A3556` |
| Texto principal | `#F1F5F9` |
| Texto secundario | `#A3AECB` |
| Primario en oscuro | `#818CF8` |

**Gradientes sugeridos (usar con moderación):** cabeceras de curso y certificado: `#4F46E5 → #7C3AED`; logros y celebración: `#F59E0B → #F472B6`.

**Personalización por escuela (white-label):** cada escuela puede cambiar **logo, color primario y color secundario**. El prototipo debe demostrarlo con **dos escuelas** de distinto color (ver sección 12) y una vista previa en vivo en la configuración de marca. Todos los componentes deben derivar del color primario de la escuela.

### 5.3 Tipografía
- **Títulos:** Plus Jakarta Sans o Inter (peso 700).
- **Texto:** Inter (peso 400/500).
- **Certificado:** una serif elegante (Playfair Display o Cormorant) para el nombre del alumno.
- Escala: 12 / 14 / 16 / 20 / 24 / 32 / 40 px. Texto base 16 px; interlineado 1.5.

### 5.4 Forma y espacio
- Esquinas: tarjetas 16 px, botones y campos 12 px, chips 999 px.
- Sombras suaves de dos niveles; elevación solo al pasar el cursor o en modales.
- Espaciado en múltiplos de 4 px; márgenes generosos (24–32 px en escritorio).
- Iconografía: línea fina y consistente (estilo Lucide o Phosphor).

### 5.5 Componentes base (todos con estados: normal, hover, foco, activo, deshabilitado, error)
Botones (primario, secundario, fantasma, destructivo) · campos de texto, selector, fecha, archivo · interruptores y casillas · pestañas · tablas con orden, filtro y selección · tarjetas de curso · chips de estado · barras y anillos de progreso · avatares · modales y paneles laterales · toasts · menús contextuales · migas de pan · paginación · búsqueda global · insignias de logro · skeletons de carga · tooltips · banners informativos.

### 5.6 Movimiento
- Transiciones de 150–250 ms con suavizado.
- Aparición escalonada de tarjetas al cargar.
- Confeti discreto al aprobar un curso y al recibir un certificado.
- Respeta la opción "reducir movimiento" del usuario.

### 5.7 Accesibilidad
Contraste mínimo AA, foco visible, navegación completa por teclado, textos alternativos, no depender solo del color para comunicar estados (siempre ícono + texto).

---

### 5.8 Requisito PWA
La plataforma es una **PWA (Progressive Web App)**: se instala desde el navegador en móvil y escritorio, y se siente como una aplicación.
- **Instalable:** icono propio, pantalla de arranque con el logo de la escuela y banner amable "Instalar app" (con guía visual para iOS).
- **Sin conexión (estudiante):** ver cursos y progreso, leer lecciones ya visitadas, marcar avance y tomar notas con sincronización al reconectar. Las evaluaciones requieren conexión. Aviso claro: "Sin conexión · 3 cambios pendientes".
- **Notificaciones:** entregas calificadas, anuncios, sesiones en vivo y certificado emitido, con permiso solicitado en un momento oportuno y no al abrir la app.
- **Sensación de app:** navegación sin recargas, menú inferior en móvil, transiciones fluidas, zonas seguras en pantallas con muesca, vertical y horizontal, y tamaños táctiles de 44 px.
- **Marca por escuela:** nombre e iconos de la app instalada con la identidad de cada escuela.
- Detalle técnico en la Parte II, sección T10.

---

## 6. Estructura de navegación

### 6.1 Barra superior (todas las áreas)
Logo de la escuela · selector de escuela · búsqueda global · notificaciones · modo claro/oscuro · avatar con menú (perfil, idioma, cerrar sesión).

### 6.2 Menú lateral por rol

**Docente**
1. Inicio
2. Mis cursos
3. Ediciones
4. Estudiantes
5. Evaluaciones y tareas
6. Calificaciones
7. Calendario
8. Comunicación
9. Certificados
10. Analítica
11. Mi perfil docente

**Administrador de escuela:** Inicio · Clientes · Cursos y ediciones · Usuarios · Certificados y plantillas · Marca y dominio · Reportes · Configuración.

**Estudiante** (menú inferior en móvil): Inicio · Mis cursos · Calendario · Certificados · Perfil.

**Coordinador de cliente:** Resumen · Alumnos · Ediciones · Certificados · Reportes.

---

## 7. MÓDULO DOCENTE (máxima prioridad, desarrollar completo)

### 7.1 Inicio del docente
**Objetivo:** que el docente sepa en 5 segundos qué atender.

- Saludo personalizado y fecha.
- **Tarjetas de resumen:** ediciones activas, estudiantes totales, entregas por calificar, promedio de avance.
- **"Requiere tu atención":** lista priorizada (entregas pendientes, estudiantes inactivos más de 7 días, evaluaciones por publicar, preguntas sin responder).
- **Próximas sesiones en vivo** y fechas de cierre.
- **Ediciones activas** como tarjetas con cliente, avance medio, estudiantes y acceso rápido.
- Acceso rápido: *Crear curso*, *Nueva edición*, *Enviar anuncio*.

### 7.2 Mis cursos (biblioteca de contenido)
- Vista en cuadrícula y en lista, con búsqueda y filtros (estado, categoría, última edición).
- Cada tarjeta: portada, título, estado (borrador / en revisión / publicado), versión, número de ediciones, última modificación.
- Acciones: editar, duplicar, previsualizar como estudiante, archivar, ver ediciones.
- Botón principal: **Crear curso**.

### 7.3 Asistente de creación de curso (3 pasos)
1. **Datos básicos:** título, descripción corta, categoría, nivel, idioma, portada (subir o elegir una generada), duración estimada en horas.
2. **Estructura inicial:** elegir plantilla (curso vacío, curso por módulos semanales, taller práctico, curso con examen final) o importar de otro curso.
3. **Reglas de aprobación:** porcentaje de avance mínimo, nota mínima, intentos permitidos, si se emite certificado.

Al finalizar, el docente cae directamente en el constructor.

### 7.4 Constructor de curso (pantalla estrella)
**Distribución de tres zonas:**
- **Izquierda — Estructura:** árbol de módulos y lecciones con arrastrar y soltar, iconos por tipo de contenido, indicadores de completitud (completa, incompleta, borrador) y botón "Agregar módulo / lección".
- **Centro — Editor:** edita el elemento seleccionado.
- **Derecha — Propiedades:** visibilidad, fecha de liberación, obligatoria u opcional, duración estimada, requisitos previos, comentarios internos.

**Barra superior del constructor:** título editable, estado de guardado ("Guardado hace 3 s"), botón **Previsualizar como estudiante**, selector de versión, botón **Publicar**.

**Tipos de lección (el prototipo debe mostrar un editor para cada uno):**
| Tipo | Qué permite |
|---|---|
| Video | Subir o enlazar; capítulos con marcas de tiempo; subtítulos; recursos descargables |
| Lectura | Editor de texto enriquecido: títulos, listas, tablas, citas, imágenes, bloques de código, llamadas de atención |
| Documento | Subir PDF, presentación u hoja; visor integrado |
| Sesión en vivo | Fecha, hora, enlace, recordatorios automáticos, grabación posterior |
| Cuestionario | Ver 7.5 |
| Tarea | Ver 7.6 |
| Enlace o recurso externo | Título, descripción, enlace |

**Funciones del constructor:**
- Autoguardado y deshacer/rehacer.
- Duplicar módulo o lección.
- Vista previa en escritorio, tableta y móvil.
- **Lista de verificación de publicación:** "Todas las lecciones tienen contenido", "Evaluación final configurada", "Reglas de aprobación definidas", "Plantilla de certificado asignada". Si falta algo, el botón Publicar muestra qué falta.
- **Versiones:** al publicar cambios sobre un curso con ediciones activas, se pide crear una nueva versión; las ediciones en curso mantienen la versión anterior hasta que el docente decida actualizarlas.

### 7.5 Evaluaciones (cuestionarios y exámenes)
**Editor de preguntas:**
- Tipos: opción múltiple (una o varias respuestas), verdadero/falso, respuesta corta, desarrollo (calificación manual), emparejar, ordenar pasos.
- Cada pregunta: enunciado con imagen opcional, puntaje, retroalimentación para respuesta correcta e incorrecta, etiqueta de tema.
- **Banco de preguntas:** reutilizable entre cursos, con búsqueda por tema y dificultad.

**Configuración del examen:** tiempo límite, número de intentos, nota mínima, aleatorizar preguntas y opciones, mostrar resultados (inmediato, al cerrar, nunca), fecha de apertura y cierre, vista previa como estudiante.

**Resultados para el docente:** distribución de notas, promedio, preguntas con más errores, tiempo medio, lista de intentos por estudiante, revisión de respuestas abiertas con campo de comentario.

### 7.6 Tareas y rúbricas
- Enunciado con adjuntos, fecha de entrega, tipo de entrega (archivo, texto, enlace), permitir entrega tardía con penalización opcional.
- **Rúbrica visual:** matriz de criterios × niveles con puntaje; el docente la llena con un clic por criterio.
- **Pantalla de calificación:** a la izquierda la entrega (visor de archivo o texto), a la derecha la rúbrica, comentarios y nota; botones "Guardar y siguiente" para avanzar rápido entre estudiantes.
- Cola de entregas con filtros: pendientes, calificadas, tardías.

### 7.7 Ediciones (dictado de un curso)
**Lista de ediciones:** tarjetas o tabla con curso, **cliente**, fechas, estado (programada / en curso / finalizada), estudiantes, avance medio, aprobados.

**Crear edición (asistente):**
1. Elegir curso y versión.
2. Elegir **cliente** (UDEP, Colegio de Economistas, TIDEO individuales, o crear uno nuevo).
3. Fechas, cupo, modalidad (autoguiado, con docente, mixto) y docente responsable.
4. Calendario de liberación de módulos.
5. **Certificado:** plantilla, emisor (escuela, cliente o co-emisión) y reglas.
6. Matrícula: cargar lista, invitar por enlace o código.

**Detalle de edición (pestañas):** Resumen · Estudiantes · Contenido · Calendario · Evaluaciones · Calificaciones · Anuncios · Certificados · Ajustes.

### 7.8 Gestión de estudiantes
- Tabla con avatar, nombre, correo, cliente, avance (barra), última actividad, nota actual, estado (activo, en riesgo, completado, retirado).
- Filtros por edición, cliente y estado; búsqueda; selección múltiple.
- **Acciones masivas:** enviar mensaje, recordar, exportar, retirar, emitir certificado.
- **Importación masiva:** subir plantilla de hoja de cálculo, vista previa con errores resaltados antes de confirmar.
- **Ficha del estudiante** (panel lateral): progreso por módulo, notas, entregas, asistencia, historial de actividad, mensajes, certificados.
- **Etiqueta "En riesgo":** inactividad prolongada o avance por debajo del esperado, con botón "Enviar recordatorio amable".

### 7.9 Calificaciones
- Libro de notas en tabla: estudiantes en filas, actividades en columnas, notas en celdas editables.
- Ponderaciones configurables por tipo de actividad (ej.: 30 % tareas, 30 % cuestionarios, 40 % examen final).
- Nota final calculada, con indicador de aprobado/reprobado.
- Ajuste manual con motivo registrado.
- Exportar a hoja de cálculo.

### 7.10 Comunicación
- **Anuncios:** editor simple, selección de audiencia (toda la edición, un grupo, estudiantes en riesgo), programación de envío.
- **Mensajes directos** con estudiantes.
- **Foro por edición:** hilos por tema, respuestas, marcar como mejor respuesta, fijar publicaciones.
- Plantillas de mensaje (bienvenida, recordatorio, felicitación).

### 7.11 Calendario
Vista mensual y semanal con sesiones en vivo, fechas de entrega, aperturas y cierres de evaluaciones; color por edición; botón "Agregar sesión".

### 7.12 Certificados desde el docente
- Panel con estados: **por emitir** (cumplen reglas), **emitidos**, **revocados**.
- Aprobación individual o masiva con vista previa.
- Emisión manual excepcional con motivo obligatorio.
- Reglas visibles de aprobación por edición.

### 7.13 Analítica del docente
Gráficos claros y comprensibles: avance por módulo, tasa de aprobación, nota media por actividad, actividad por día de la semana, abandono por lección, preguntas más falladas, comparativo entre clientes para un mismo curso. Filtros por edición, cliente y fechas; botón exportar.

### 7.14 Perfil docente (global)
Foto, biografía, especialidades, firma digitalizada (se usa en certificados), escuelas donde enseña, y cursos dictados. Es el perfil que acompaña al docente en cualquier escuela.

---

## 8. MÓDULO ESTUDIANTE

### 8.1 Inicio
- Saludo y racha de estudio (opcional, discreta).
- Tarjeta grande **"Continúa donde lo dejaste"** con el último contenido y un botón claro.
- Mis cursos con anillo de progreso.
- Próximas fechas (entregas, sesiones en vivo, evaluaciones).
- Logros recientes y certificados obtenidos.

### 8.2 Mis cursos
Tarjetas con portada, cliente (si aplica), progreso, próxima actividad y estado. Pestañas: en curso, completados, por comenzar.

### 8.3 Página del curso
- Cabecera con título, docente, progreso y botón **Continuar**.
- Pestañas: Contenido · Calificaciones · Anuncios · Foro · Certificado.
- Contenido como módulos plegables con marcas de completado; lecciones bloqueadas con candado y motivo ("Se libera el 12 de noviembre").

### 8.4 Reproductor de lección (experiencia de aprendizaje)
- Contenido principal a ancho cómodo, índice del curso en panel plegable.
- Botones **Anterior / Marcar como completada y continuar**.
- Video con velocidad, subtítulos, capítulos y retomar donde quedó.
- Notas personales por lección y recursos descargables.
- Barra de progreso del curso siempre visible.
- Animación breve al completar la lección.

### 8.5 Rendir evaluación
Pantalla de instrucciones → examen con una pregunta visible, temporizador visible no intrusivo, navegador de preguntas, marcar para revisar, confirmación de envío → resultados con nota, retroalimentación y opción de reintento si corresponde.

### 8.6 Tareas
Ver enunciado y rúbrica, subir entrega, ver estado (sin entregar, entregada, calificada), leer retroalimentación y puntaje por criterio.

### 8.7 Certificados del estudiante
- Galería de certificados con vista previa.
- Botones **Descargar PDF**, **Copiar enlace de verificación**, **Compartir en LinkedIn**.
- Progreso hacia el siguiente certificado.
- Si el curso aún no cumple las reglas, mostrar **qué falta** ("Te falta completar 2 lecciones y aprobar el examen final").

### 8.8 Perfil y ajustes
Datos personales, nombre tal como debe aparecer en el certificado (con aviso: "revísalo bien, aparecerá en tu certificado"), idioma, notificaciones, privacidad.

### 8.9 Experiencia móvil
Menú inferior, tarjetas apiladas, reproductor a pantalla completa, subida de entregas desde cámara o archivos, notificaciones push simuladas.

---

## 9. MÓDULO ADMINISTRADOR DE ESCUELA

### 9.1 Inicio
Indicadores: alumnos activos, ediciones en curso, certificados emitidos este mes, clientes activos; gráfico de actividad; accesos rápidos; alertas (ediciones por cerrar, cupos llenos).

### 9.2 Clientes
- Lista con logo, nombre, tipo (organización / individuales), ediciones activas, alumnos y estado.
- **Ficha del cliente:** datos de contacto, logo, color, ediciones, alumnos, certificados emitidos, coordinadores asignados, notas internas y documentos del contrato.
- **Crear cliente (asistente):** datos, logo, plantilla de certificado por defecto, emisor por defecto (escuela, cliente o co-emisión), coordinador de contacto.

### 9.3 Cursos y ediciones
Vista general de todo el catálogo y calendario de ediciones de la escuela con filtros por docente y cliente.

### 9.4 Usuarios
Tabla con roles; invitar por correo; asignar docentes a ediciones; invitar **docentes invitados** con acceso limitado; desactivar cuentas.

### 9.5 Certificados y plantillas
**Editor visual de plantillas de certificado** (ver sección 10), biblioteca de plantillas por cliente y panel de emisión global con búsqueda por código o nombre y opción de revocar o reemitir.

### 9.6 Marca y dominio
- Subir logo (claro y oscuro), elegir colores primario y secundario con selector y paleta sugerida.
- **Vista previa en vivo** de la plataforma con la marca aplicada.
- Subdominio de la escuela y dominio propio (con guía visual de pasos).
- Textos de bienvenida y correo de soporte.

### 9.7 Reportes
Reportes por cliente, por curso, por docente y por periodo; exportables; con comparativos y rangos de fecha.

### 9.8 Configuración
Datos de la escuela, política de privacidad, plantillas de correo, idioma y zona horaria, preferencias de notificación.

---

## 10. CERTIFICADOS (flujo y diseño)

### 10.1 Regla de emisión
El docente o administrador define por edición: porcentaje de avance mínimo, nota mínima y requisitos adicionales (asistencia, entrega de proyecto). Cuando el estudiante cumple, el certificado queda **"por emitir"** o se **emite automáticamente**, según la configuración.

### 10.2 Contenido del certificado
- Logo(s) del emisor (escuela, cliente o ambos).
- Título "Certificado de aprobación" (o "de participación").
- Nombre completo del estudiante (protagonista visual).
- Nombre del curso, **horas académicas**, fechas de dictado y nota (opcional).
- Nombre del docente y su **firma digitalizada**; firma del director de la escuela y del representante del cliente en la co-emisión.
- **Código único de verificación** y **código QR**.
- Fecha de emisión.

### 10.3 Diseño
- Formato horizontal A4, con márgenes amplios.
- Marco sutil y detalle gráfico con los colores de la escuela; fondo claro, texto oscuro.
- Nombre del alumno en tipografía serif grande.
- **Tres variantes de plantilla** en el prototipo: Clásica, Moderna y Minimalista.
- **Variante de co-emisión** con dos logos en la cabecera.

### 10.4 Editor de plantillas
Lienzo con vista previa del certificado a la derecha y controles a la izquierda: logos, colores, textos con variables (nombre, curso, horas, fecha, docente), posición de firmas, fondo y marco. Botón "Previsualizar con datos de ejemplo".

### 10.5 Estados
Por emitir · Emitido · Reenviado · Revocado · Reemitido. Cada cambio guarda motivo, fecha y quién lo hizo, visible en un historial.

### 10.6 Página pública de verificación
Accesible sin iniciar sesión, desde el QR o ingresando el código.
- **Válido:** ícono de verificación verde, nombre del titular, curso, horas, emisor, fecha y docente.
- **Revocado:** aviso rojo con la fecha.
- **No encontrado:** mensaje amable con opción de reintentar.
- Diseño limpio, con la marca del emisor y botón "Ver certificado".

### 10.7 Entrega al estudiante
Aviso con celebración al emitirse, correo con enlace y botón de descarga, y presencia en su galería de certificados.

---

## 11. COORDINADOR DE CLIENTE (versión de lectura)
- **Resumen:** alumnos del cliente, avance medio, aprobados, certificados emitidos.
- **Alumnos:** tabla filtrable, ficha resumida, sin edición.
- **Ediciones:** estado de cada edición dictada a su organización.
- **Reportes** descargables.
- Interfaz con la **marca del cliente** como acento, manteniendo la de la escuela como base.
- No puede ver alumnos de otros clientes (el prototipo debe dejarlo evidente: un solo cliente en todos los filtros).

---

## 12. DATOS DE EJEMPLO PARA EL PROTOTIPO (para que parezca real)

### 12.1 Escuela principal
**TIDEO Tech & Strategy** — color primario índigo `#4F46E5`, secundario turquesa `#14B8A6`.

### 12.2 Segunda escuela (para demostrar white-label y docente invitado)
**Escuela Demo UDEP Digital** — color primario verde esmeralda `#059669`, secundario ámbar `#F59E0B`.

### 12.3 Clientes de TIDEO
| Cliente | Tipo | Ediciones activas | Alumnos |
|---|---|---|---|
| UDEP | Organización | 2 | 48 |
| Colegio de Economistas | Organización | 1 | 32 |
| TIDEO Tech & Strategy (alumnos individuales) | Individuales | 3 | 61 |

### 12.4 Cursos de ejemplo
1. **Power BI para el Análisis de Negocio** — 5 módulos, 24 lecciones, 40 h.
2. **Excel Financiero Avanzado** — 4 módulos, 18 lecciones, 32 h.
3. **Estrategia y Transformación Digital** — 6 módulos, 20 lecciones, 36 h.
4. **Introducción a la Analítica de Datos** — 3 módulos, 12 lecciones, 16 h.

### 12.5 Ediciones de ejemplo
- *Power BI para el Análisis de Negocio · UDEP · 2026-II* (en curso, 48 alumnos, avance medio 62 %).
- *Excel Financiero Avanzado · Colegio de Economistas · Noviembre 2026* (en curso, 32 alumnos, 41 %).
- *Estrategia y Transformación Digital · Individuales · Cohorte 5* (en curso, 29 alumnos, 74 %).
- *Introducción a la Analítica de Datos · Individuales · Cohorte 4* (finalizada, 21 alumnos, 24 certificados emitidos o por emitir).

### 12.6 Personas de ejemplo
- **Cristhian** — administrador de TIDEO y docente; docente invitado en Escuela Demo UDEP Digital.
- **Alumnos con nombres peruanos variados** (mínimo 15), con distintos estados: al día, en riesgo, completado, retirado.
- **Coordinadora de UDEP** (rol lectura) y **coordinador del Colegio de Economistas**.

### 12.7 Datos que deben verse reales
Entregas pendientes (8), evaluaciones con notas variadas, un estudiante en riesgo por 10 días de inactividad, un certificado revocado de ejemplo, un certificado por emitir, mensajes en el foro y anuncios enviados.

### 12.8 Códigos de certificado de ejemplo
`TIDEO-2026-A8F3K2` (válido), `TIDEO-2026-B7M4P9` (revocado), `TIDEO-2026-ZZZZZZ` (no existe, para probar el error).

---

## 13. FLUJOS CLAVE QUE EL PROTOTIPO DEBE PERMITIR RECORRER

1. **Docente crea un curso:** asistente → constructor → agregar módulo y lecciones de tres tipos → crear un cuestionario → revisar lista de verificación → publicar.
2. **Docente abre una edición para UDEP:** nueva edición → elegir curso y cliente UDEP → fechas y cupo → plantilla de certificado y co-emisión → invitar alumnos.
3. **Docente califica una entrega con rúbrica:** cola de entregas → abrir → rúbrica → comentario → guardar y siguiente.
4. **Docente detecta estudiantes en riesgo y los contacta:** inicio → "Requiere tu atención" → seleccionar → enviar recordatorio.
5. **Estudiante cursa y obtiene su certificado:** inicio → continuar lección → completar → rendir examen → aprobar → celebración → descargar certificado.
6. **Verificación pública:** escanear o ingresar código → ver resultado válido; probar código revocado y código inexistente.
7. **Administrador configura la marca:** cambiar colores y logo con vista previa y ver cómo toda la plataforma se adapta.
8. **Cambio de escuela:** el docente cambia de TIDEO a Escuela Demo UDEP Digital con selector y ve su rol limitado como docente invitado, con otra marca.
9. **Coordinador de cliente consulta avance:** ve solo los alumnos de UDEP.

---

## 14. ESTADOS Y MENSAJES (diseñar todos)

| Situación | Tratamiento |
|---|---|
| Sin datos todavía | Ilustración amable, frase corta y botón con la acción siguiente |
| Cargando | Skeletons con la forma del contenido final |
| Error | Mensaje claro, causa probable y botón "Reintentar" |
| Éxito | Toast con ícono y opción "Deshacer" cuando aplique |
| Sin permiso | Pantalla explicativa y a quién pedir acceso |
| Acción destructiva | Modal de confirmación que explica las consecuencias |
| Guardado | Indicador discreto "Guardado hace un momento" |
| Contenido bloqueado | Candado con fecha o requisito para liberarlo |

**Notificaciones (centro desplegable):** entregas nuevas, estudiante en riesgo, certificado emitido, anuncio del docente, sesión en vivo próxima. Agrupadas por hoy / esta semana, con marca de leído.

---

## 15. RESPONSIVE Y RENDIMIENTO PERCIBIDO
- Puntos de quiebre: móvil (hasta 640 px), tableta (hasta 1024 px) y escritorio.
- Constructor de curso y libro de calificaciones: en tableta se pliegan paneles; en móvil se ofrece versión de solo lectura con aviso.
- Estudiante: experiencia completa en móvil.
- Tablas en móvil se convierten en tarjetas apiladas.
- Imágenes con carga diferida y vista previa difuminada.

---

## 16. CRITERIOS DE ACEPTACIÓN DEL PROTOTIPO

**Debe cumplir:**
- [ ] Se puede navegar por todos los roles con un selector de rol para la demostración.
- [ ] El módulo docente tiene todas las pantallas de la sección 7, con datos de ejemplo.
- [ ] El constructor permite arrastrar módulos y lecciones, y muestra los siete tipos de lección.
- [ ] El flujo estudiante termina con la emisión y descarga simulada de un certificado.
- [ ] La verificación pública muestra los tres resultados (válido, revocado, no encontrado).
- [ ] El cambio de marca modifica colores y logo en toda la interfaz en vivo.
- [ ] Modo claro y oscuro completos y consistentes.
- [ ] Selector de escuela con dos escuelas y marcas distintas.
- [ ] Todos los estados de la sección 14 están diseñados.
- [ ] Se ve bien en móvil, tableta y escritorio.
- [ ] Contraste y navegación por teclado cumplen accesibilidad básica.
- [ ] Textos en español, coherentes con el glosario.

**Experiencia esperada:** alguien que no conoce el producto debe entender, en menos de un minuto, cómo crear un curso, dictarlo a un cliente y emitir un certificado.

---

## 17. FUERA DEL ALCANCE DEL PROTOTIPO
Pagos y facturación reales, integración con sistemas de universidades, videollamadas reales, aplicación móvil nativa, estándares de contenido externos, firma electrónica legal de los PDF, e inteligencia artificial.
(Se pueden mostrar como elementos "Próximamente" en la interfaz, sin funcionalidad.)

---

## 18. INSTRUCCIONES FINALES PARA QUIEN DISEÑE EL PROTOTIPO

1. Construir primero el **sistema de diseño** (colores, tipografía, componentes) y aplicarlo de forma consistente.
2. Priorizar el **módulo docente** y el **flujo del estudiante hasta el certificado**.
3. Usar los **datos de ejemplo** de la sección 12 en todas las pantallas; evitar texto de relleno genérico.
4. Hacer que los elementos interactivos principales **funcionen**: arrastrar y soltar, pestañas, filtros, formularios con validación, modales, cambio de marca, modo oscuro, selector de rol y de escuela.
5. Entregar el prototipo con un **menú de demostración** que permita saltar entre roles y flujos.
6. Cuidar los detalles que elevan la percepción de calidad: espaciado, microinteracciones, estados vacíos con personalidad y celebraciones sobrias.
7. Ante dudas, elegir la opción **más simple y clara** para el usuario.

---

## 19. Síntesis

La plataforma permite que una **escuela digital** (hoy TIDEO Tech & Strategy) dicte los mismos cursos a **distintos clientes** (UDEP, Colegio de Economistas, alumnos individuales), con **datos separados por cliente** y la posibilidad de que cada cliente tenga luego **su propia escuela** con el docente como invitado. El corazón del producto es un **módulo docente tipo estudio de creación** (constructor de cursos, evaluaciones, rúbricas, ediciones, seguimiento y analítica) que desemboca en **certificados verificables con QR y emisor configurable**. Visualmente, un estilo **moderno, cálido y personalizable por escuela**, con índigo y turquesa como base, modo oscuro completo y mucha atención a estados, progreso y microinteracciones.

---

# PARTE II — Especificación técnica

**Stack:** React · Supabase · Vercel
**Complementa a:** Parte I (funcional y de diseño). Los nombres de pantallas, roles y términos (escuela, cliente, curso, edición, matrícula, certificado) son los mismos del glosario de la Parte I.
**Alcance:** arquitectura, modelo de datos, seguridad, PWA, certificados, jobs, entornos, pruebas y plan de construcción.

---

## T0. Validación del stack

**Veredicto: el stack es adecuado.** React + Supabase + Vercel cubre todo lo que pide el producto, con cuatro puntos que conviene saber desde el inicio.

| Tema | Estado | Detalle |
|---|---|---|
| Multi-tenant con RLS en Postgres | Encaja muy bien | Aislamiento por escuela y por cliente directamente en la base de datos |
| Subdominio por escuela | Encaja, con una condición | El comodín `*.tudominio.com` en Vercel exige usar los **nameservers de Vercel** para el dominio raíz (necesario para el certificado SSL comodín) |
| Dominio propio por escuela | Encaja | Se agrega por API de Vercel y se verifica con un registro TXT; hay un límite de 100 altas de dominio por hora por equipo |
| PWA | Encaja | Mejor con una SPA en Vite que con Next.js (ver T1) |
| Auth con subdominios | Encaja, con matiz | Supabase permite comodines en las URL de redirección, pero la sesión es por origen (ver T4.3) |
| Generación de PDF | Requiere decisión | Se hace en una función de Vercel (Node), no en el navegador (ver T9) |
| Video | Supabase Storage no es suficiente | Hace falta un servicio de video con streaming adaptativo (ver T13) |
| Producción real | Planes de pago | Supabase Pro (respaldos, sin pausa por inactividad) y Vercel Pro (uso comercial y dominios) |

---

## T1. Decisiones de arquitectura

| # | Decisión | Elección | Motivo |
|---|---|---|---|
| D1 | Modelo de multi-tenancy | **Una base de datos compartida**, `tenant_id` en toda tabla de negocio, aislamiento con **RLS** | Costo bajo, un solo despliegue, migraciones únicas |
| D2 | Aislamiento por cliente | `client_id` en matrículas, ediciones y certificados, con RLS adicional | UDEP no ve a los alumnos del Colegio de Economistas |
| D3 | Frontend | **React + Vite + TypeScript (SPA)** | Aplicación detrás de login, PWA simple, un solo despliegue para todos los tenants |
| D4 | Resolución de tenant | Por **hostname** en el cliente, con función pública que devuelve solo la marca | Funciona con subdominio y dominio propio |
| D5 | Lógica sensible | En **funciones SQL** (RPC) y **Edge Functions**; nunca en el cliente | Calificación, emisión de certificados y matrícula masiva no se pueden manipular |
| D6 | Respuestas correctas de evaluaciones | **Tabla aparte** inaccesible para estudiantes | Un `select` desde el navegador nunca puede revelarlas |
| D7 | Versiones de curso | **Inmutables al publicar** | El certificado y las notas apuntan a lo que el alumno realmente cursó |
| D8 | Certificado | Registro con **datos congelados (snapshot)** y código **global** | Sigue siendo válido aunque se edite el curso o el cliente migre de escuela |
| D9 | Usuarios | **Cuenta global**, membresías por escuela | Un docente puede estar en varias escuelas con una sola cuenta |
| D10 | Archivos | Buckets privados con ruta `tenant_id/...` y **URLs firmadas** | Aislamiento y portabilidad de datos por escuela |
| D11 | Video | Servicio externo especializado | Streaming adaptativo y reproducción firmada |
| D12 | Jobs | `pg_cron` + cola `pgmq` + Edge Functions | Todo dentro de Supabase, sin infraestructura extra |

**¿Vite o Next.js?** Se recomienda **Vite** para el MVP. Si más adelante se quiere un catálogo público o marketing con SEO, se agrega un sitio Next.js aparte sin tocar la aplicación. El único caso donde se necesita HTML generado por servidor es la vista previa al compartir un certificado (ver T9.5).

---

## T2. Arquitectura general

```
                        ┌──────────────────────────────────────────┐
  Navegador / PWA  ───▶ │  Vercel                                  │
  (React SPA)           │  · SPA estática (Vite) + rewrite a index │
  escuela.plataforma    │  · Funciones Node (/api):                │
  o dominio propio      │      - render de certificados (PDF)      │
                        │      - metaetiquetas OG de verificación  │
                        │      - gestión de dominios (API Vercel)  │
                        └───────────────┬──────────────────────────┘
                                        │ supabase-js (JWT del usuario)
                                        ▼
        ┌─────────────────────────── Supabase ───────────────────────────┐
        │  Auth        Postgres + RLS      Storage        Realtime       │
        │              · tablas            · branding     · notificaciones│
        │              · RPC (SQL)         · cursos       · foro         │
        │              · pg_cron, pgmq     · entregas                    │
        │  Edge Functions: correo · push · invitaciones · lecciones      │
        │                  firmadas · webhooks                           │
        └──────────────┬─────────────────────────────┬───────────────────┘
                       ▼                             ▼
              Servicio de video              Correo transaccional
              (Mux / Cloudflare Stream)      (Resend / Postmark)
```

**Dominios de la plataforma:**
| Host | Uso |
|---|---|
| `www.plataforma.com` | Sitio de presentación (fuera del MVP) |
| `app.plataforma.com` | Administración de plataforma (operador) y selector de escuelas |
| `{slug}.plataforma.com` | Cada escuela (comodín) |
| `dominio-del-cliente.com` | Escuela con dominio propio |
| `verifica.plataforma.com` | **Verificación pública global** de certificados |

---

## T3. Frontend (React)

### T3.1 Librerías
| Necesidad | Librería |
|---|---|
| Build y PWA | Vite, `vite-plugin-pwa` (Workbox) |
| Lenguaje | TypeScript estricto |
| Rutas | React Router |
| Datos del servidor | TanStack Query + `supabase-js` |
| Estado de interfaz | Zustand |
| Formularios y validación | React Hook Form + Zod |
| Estilos y componentes | Tailwind CSS + shadcn/ui (Radix) |
| Arrastrar y soltar | dnd-kit |
| Editor de texto enriquecido | TipTap |
| Gráficos | Recharts |
| Fechas | date-fns (zona horaria por escuela) |
| Idiomas | i18next (español por defecto) |
| Datos sin conexión | Dexie (IndexedDB) |
| Errores | Sentry |
| Pruebas | Vitest, Testing Library, Playwright |

### T3.2 Estructura del repositorio
```
/
├─ apps/web/                  # SPA React
│  ├─ src/
│  │  ├─ app/                 # rutas, layouts, guards por rol
│  │  ├─ features/
│  │  │  ├─ auth/  tenants/  clients/
│  │  │  ├─ courses/          # constructor, versiones
│  │  │  ├─ offerings/        # ediciones
│  │  │  ├─ learners/         # estudiantes, fichas
│  │  │  ├─ assessments/  assignments/  gradebook/
│  │  │  ├─ certificates/     # plantillas, emisión, verificación
│  │  │  ├─ comms/            # anuncios, mensajes, foro
│  │  │  ├─ analytics/  reports/
│  │  │  └─ student/          # inicio, reproductor, mis cursos
│  │  ├─ components/ui/       # sistema de diseño
│  │  ├─ lib/                 # supabase, tenant, theme, offline, push
│  │  └─ sw/                  # service worker
├─ api/                       # funciones de Vercel (Node)
├─ supabase/
│  ├─ migrations/             # SQL versionado
│  ├─ functions/              # Edge Functions (Deno)
│  ├─ tests/                  # pgTAP
│  └─ seed.sql                # datos de ejemplo (sección 12 de la Parte I)
└─ packages/shared/           # tipos generados, esquemas Zod
```

### T3.3 Tokens de diseño (contrato con el prototipo)
Los colores de la Parte I se implementan como variables CSS. La escuela solo sobreescribe las de marca:

```css
:root {
  --brand-50:#EEF2FF; --brand-500:#4F46E5; --brand-600:#4338CA; --brand-700:#3730A3;
  --accent-500:#14B8A6; --highlight-500:#F59E0B;
  --success:#16A34A; --warning:#D97706; --danger:#DC2626; --info:#0EA5E9;
  --bg:#F8FAFC; --surface:#FFFFFF; --border:#E2E8F0;
  --text:#0F172A; --text-muted:#475569;
  --radius-card:16px; --radius-control:12px;
}
[data-theme="dark"] { --bg:#0B1020; --surface:#131A2E; --border:#2A3556;
  --text:#F1F5F9; --text-muted:#A3AECB; --brand-500:#818CF8; }
```

**Marca por escuela:** a partir de `primary_color` se genera la escala 50–900 con `color-mix` u `oklch`, se aplica en `<html>` y se **valida el contraste** al guardar (si el texto blanco no cumple AA sobre ese color, se usa texto oscuro automáticamente).

### T3.4 Guards y rutas
- Rutas públicas: inicio de sesión, aceptar invitación, verificación de certificado.
- Rutas protegidas por **rol activo** en la escuela actual (`useTenant()` entrega `{ tenant, role, permissions }`).
- Un solo árbol de rutas con layouts distintos: `/docente/*`, `/estudiante/*`, `/admin/*`, `/coordinador/*`, `/plataforma/*`.
- Los guards son solo experiencia de usuario. **La seguridad real es RLS.**

---

## T4. Multi-tenancy en la práctica

### T4.1 Resolución del tenant
1. Al cargar, se toma `window.location.hostname`.
2. Se llama a la función pública `get_tenant_branding(host)`, accesible sin sesión, que devuelve únicamente: nombre, logos, colores, textos de bienvenida, idioma y zona horaria.
3. La respuesta se guarda en caché (memoria, `localStorage` y service worker) para que la pantalla de inicio de sesión ya salga con la marca.
4. Si el host no existe: pantalla "Escuela no encontrada".

### T4.2 Dominios
**Subdominios:** se agrega `*.plataforma.com` al proyecto de Vercel. Requiere que el dominio raíz use los nameservers de Vercel para emitir el certificado comodín.

**Dominio propio de una escuela:**
1. El administrador escribe su dominio en *Marca y dominio*.
2. Una función de Vercel (con el token guardado como secreto) lo agrega al proyecto por API y devuelve las instrucciones DNS.
3. La interfaz muestra los pasos y el estado: pendiente, verificado o con error. Se verifica con un registro TXT y se puede reintentar.
4. Al verificar, `tenant_domains.status` pasa a `verified` y se puede marcar como principal.

Notas: la propagación DNS puede tardar entre 24 y 48 horas, y hay límite de altas por hora, así que el alta se encola.

### T4.3 Sesión entre escuelas
- Por defecto, la sesión del navegador vive en un solo origen. Para que el selector de escuela no obligue a iniciar sesión de nuevo entre subdominios, se usa un **adaptador de almacenamiento por cookie** con dominio `.plataforma.com` (con fragmentación por tamaño).
- **Los dominios propios no comparten sesión.** Para el MVP, el usuario inicia sesión de nuevo en ese dominio. Más adelante se puede agregar un traspaso con código de un solo uso.
- Cambiar de escuela en el selector = navegar al host de la otra escuela.
- URLs de redirección de Auth: se permiten comodines (`https://*.plataforma.com/**`), pero en producción conviene fijar las rutas exactas (`/auth/callback`) y agregar cada dominio propio verificado.

### T4.4 Autenticación
- Correo y contraseña, enlace mágico y Google.
- Registro **solo por invitación o código de edición** (no hay registro abierto).
- Correos de Auth con SMTP propio. Para que lleven la marca de cada escuela se puede usar el hook de envío de correo de Supabase Auth con plantillas por escuela (verificar disponibilidad vigente al implementar). Alternativa: plantilla neutra con el nombre de la escuela.
- Políticas: contraseña mínima, límite de intentos y cierre de sesión en todos los dispositivos.

---

## T5. Modelo de datos

**Convenciones**
- Claves `uuid` por defecto (`gen_random_uuid()`), `created_at` y `updated_at` en todas las tablas.
- `tenant_id` en toda tabla de negocio (también en tablas hijas, por rendimiento y RLS simple).
- `client_id` en todo lo que pertenece a un cliente.
- Borrado lógico (`deleted_at`) en cursos, clientes y matrículas; los certificados **nunca** se borran.
- Orden de listas con `position` (índice fraccionario) para reordenar sin reescribir todo.
- Enumeraciones como `enum` de Postgres.

### T5.1 Identidad, escuelas y clientes
| Tabla | Columnas clave | Notas |
|---|---|---|
| `profiles` | `user_id` (pk, → `auth.users`), `full_name`, `certificate_name`, `avatar_url`, `locale`, `phone` | `certificate_name` es el nombre que saldrá en certificados |
| `platform_admins` | `user_id` | Operadores de plataforma |
| `partners` | `id`, `name` | Quien vende o administra escuelas (TIDEO como socio) |
| `tenants` | `id`, `slug` (único), `name`, `status`, `plan`, `partner_id`, `logo_light_path`, `logo_dark_path`, `primary_color`, `secondary_color`, `welcome_text`, `support_email`, `locale`, `timezone`, `settings` (jsonb) | Escuela |
| `tenant_domains` | `id`, `tenant_id`, `domain` (único), `kind` (subdomain/custom), `status`, `verification` (jsonb), `is_primary` | Resolución por host |
| `tenant_members` | `tenant_id`, `user_id`, `role`, `status`, `can_author` (bool), `invited_by` | pk compuesta. Roles: `owner`, `admin`, `instructor`, `instructor_guest`, `client_coordinator`, `student` |
| `tenant_invitations` | `id`, `tenant_id`, `email`, `role`, `client_id`, `offering_id`, `token_hash`, `expires_at`, `accepted_at` | El token se guarda con hash |
| `instructor_profiles` | `user_id` (pk), `headline`, `bio`, `specialties` (text[]), `signature_path`, `public_slug` | Perfil global del docente |
| `clients` | `id`, `tenant_id`, `name`, `kind` (organization/individual), `logo_path`, `brand_color`, `status`, `default_issuer_mode`, `default_certificate_template_id`, `contact` (jsonb), `contract_ref`, `notes` | UDEP, Colegio de Economistas, TIDEO individuales |
| `client_members` | `client_id`, `tenant_id`, `user_id`, `role` (coordinator/member) | Coordinadores de cliente |

### T5.2 Catálogo
| Tabla | Columnas clave | Notas |
|---|---|---|
| `courses` | `id`, `tenant_id`, `slug`, `category`, `level`, `language`, `cover_path`, `status`, `created_by`, `latest_published_version_id` | Contenedor estable |
| `course_collaborators` | `course_id`, `user_id`, `role` (editor/viewer) | Permite compartir autoría con docentes invitados |
| `course_versions` | `id`, `course_id`, `tenant_id`, `version_number`, `status` (draft/published/retired), `title`, `summary`, `hours`, `completion_defaults` (jsonb), `published_at`, `published_by`, `source_version_id`, `source_tenant_id` | **Inmutable al publicar**. `source_*` se llena si vino de una licencia |
| `modules` | `id`, `version_id`, `tenant_id`, `title`, `position` | |
| `lessons` | `id`, `module_id`, `version_id`, `tenant_id`, `type`, `title`, `position`, `is_required`, `est_minutes`, `content` (jsonb) | `type`: video, reading, document, live, quiz, assignment, link |
| `lesson_resources` | `id`, `lesson_id`, `tenant_id`, `name`, `storage_path`, `kind`, `size_bytes` | Descargables |

**Contenido por tipo de lección (`lessons.content`):**
| Tipo | Contenido |
|---|---|
| video | `provider`, `asset_id`, `chapters[]`, `captions[]` |
| reading | documento TipTap (JSON) |
| document | `storage_path`, `mime`, `pages` |
| live | `starts_at`, `ends_at`, `join_url`, `reminders[]` |
| quiz | `assessment_id` |
| assignment | `assignment_id` |
| link | `url`, `description` |

### T5.3 Evaluaciones y tareas
| Tabla | Columnas clave | Notas |
|---|---|---|
| `question_banks` | `id`, `tenant_id`, `name`, `owner_id` | Bancos reutilizables |
| `questions` | `id`, `tenant_id`, `bank_id`, `current_revision_id`, `tags` (text[]), `difficulty` | Identidad estable |
| `question_revisions` | `id`, `question_id`, `tenant_id`, `type`, `prompt` (jsonb), `points`, `feedback_ok`, `feedback_bad`, `created_at` | **Inmutable**: editar una pregunta crea una revisión nueva |
| `question_options` | `id`, `revision_id`, `tenant_id`, `label` (jsonb), `position` | Visibles para el estudiante |
| `question_keys` | `revision_id` (pk), `tenant_id`, `answer` (jsonb) | **Solo docentes. Nunca visible a estudiantes** |
| `assessments` | `id`, `version_id`, `tenant_id`, `title`, `settings` (jsonb: tiempo, intentos, nota mínima, aleatorización, visibilidad de resultados, apertura y cierre) | |
| `assessment_questions` | `assessment_id`, `revision_id`, `position`, `points` | Apunta a revisiones, no a preguntas vivas |
| `attempts` | `id`, `assessment_id`, `enrollment_id`, `tenant_id`, `client_id`, `attempt_no`, `started_at`, `deadline_at`, `submitted_at`, `score`, `status`, `seed` | `deadline_at` se calcula en servidor |
| `attempt_answers` | `attempt_id`, `revision_id`, `answer` (jsonb), `score`, `graded_by`, `feedback` | |
| `rubrics` | `id`, `tenant_id`, `title`, `owner_id` | |
| `rubric_criteria` / `rubric_levels` | criterio: `rubric_id`, `title`, `weight`, `position`; nivel: `criterion_id`, `label`, `points`, `descriptor` | |
| `assignments` | `id`, `version_id`, `tenant_id`, `instructions` (jsonb), `rubric_id`, `submission_types`, `late_policy` (jsonb), `max_score` | |
| `submissions` | `id`, `assignment_id`, `enrollment_id`, `tenant_id`, `client_id`, `status`, `submitted_at`, `is_late`, `text`, `link`, `files` (jsonb) | |
| `submission_scores` | `submission_id`, `criterion_id`, `level_id`, `points`, `comment` | |
| `grade_items` | `id`, `version_id`, `tenant_id`, `source_type` (assessment/assignment/manual), `source_id`, `weight`, `max_score` | Define la ponderación |
| `grades` | `enrollment_id`, `grade_item_id`, `tenant_id`, `client_id`, `score`, `graded_by`, `comment`, `adjusted_reason` | Ajustes manuales con motivo |

### T5.4 Ediciones, matrículas y seguimiento
| Tabla | Columnas clave | Notas |
|---|---|---|
| `offerings` | `id`, `tenant_id`, `client_id`, `course_id`, `version_id`, `title`, `code`, `status`, `modality`, `starts_at`, `ends_at`, `seats`, `enrollment_mode` (invite/code/csv), `join_code`, `release_schedule` (jsonb), `completion_rules` (jsonb), `issuer_mode`, `certificate_template_id`, `timezone` | La **edición** |
| `offering_instructors` | `offering_id`, `user_id`, `tenant_id`, `role` (lead/assistant) | Define qué ve un docente invitado |
| `enrollments` | `id`, `tenant_id`, `client_id`, `offering_id`, `user_id`, `status`, `enrolled_at`, `completed_at`, `progress_pct`, `final_grade`, `last_activity_at`, `risk_level` | Único por (`offering_id`, `user_id`) |
| `lesson_progress` | `enrollment_id`, `lesson_id`, `tenant_id`, `client_id`, `status`, `completed_at`, `last_position_seconds`, `time_spent_seconds`, `updated_at` | pk (`enrollment_id`, `lesson_id`) |
| `lesson_notes` | `id`, `enrollment_id`, `lesson_id`, `tenant_id`, `body` | Notas personales |
| `live_sessions` | `id`, `offering_id`, `tenant_id`, `starts_at`, `ends_at`, `join_url`, `recording_url` | |
| `attendance` | `session_id`, `enrollment_id`, `tenant_id`, `status`, `source` | |
| `announcements` | `id`, `tenant_id`, `offering_id`, `author_id`, `title`, `body`, `audience` (jsonb), `scheduled_for`, `sent_at` | |
| `message_threads` / `messages` | hilo: `tenant_id`, `offering_id`, participantes; mensaje: `thread_id`, `sender_id`, `body`, `read_at` | |
| `forum_threads` / `forum_posts` | hilo: `offering_id`, `title`, `pinned`; mensaje: `thread_id`, `author_id`, `body`, `is_best_answer` | |
| `notifications` | `id`, `user_id`, `tenant_id`, `kind`, `payload` (jsonb), `read_at` | Alimenta el centro de notificaciones |
| `push_subscriptions` | `id`, `user_id`, `endpoint`, `keys` (jsonb), `user_agent` | Web Push |

### T5.5 Certificados
| Tabla | Columnas clave | Notas |
|---|---|---|
| `certificate_templates` | `id`, `tenant_id`, `client_id` (nulo = de la escuela), `name`, `variant` (classic/modern/minimal), `design` (jsonb: colores, textos con variables, posiciones), `signatories` (jsonb), `is_active` | Editor visual |
| `certificates` | `id`, `code` (**único global**), `tenant_id`, `client_id`, `offering_id`, `enrollment_id`, `version_id`, `user_id`, `status`, `issuer_mode`, `student_name`, `course_title`, `hours`, `grade`, `instructor_name`, `issuer_snapshot` (jsonb), `template_snapshot` (jsonb), `issued_at`, `pdf_path`, `revoked_at`, `revoked_reason`, `replaced_by` | **Datos congelados** al emitir |
| `certificate_events` | `id`, `certificate_id`, `tenant_id`, `type` (created/rendered/sent/revoked/reissued/downloaded), `actor_id`, `reason`, `created_at` | Historial de auditoría |

Estados: `pending_render` → `issued` → (`revoked` | `reissued`).

### T5.6 Transversales
| Tabla | Columnas clave |
|---|---|
| `audit_log` | `id`, `tenant_id`, `actor_id`, `action`, `entity`, `entity_id`, `diff` (jsonb), `ip`, `created_at` |
| `course_licenses` | `id`, `source_tenant_id`, `source_version_id`, `target_tenant_id`, `imported_version_id`, `status`, `terms` (jsonb) |
| `jobs_log` | `id`, `kind`, `status`, `payload`, `error`, `created_at` |

### T5.7 Índices obligatorios
- `(tenant_id, client_id)` en matrículas, ediciones, certificados, intentos y entregas.
- `(user_id)` en `enrollments`, `tenant_members`, `notifications`.
- `(offering_id)` en `enrollments`, `offering_instructors`, `live_sessions`.
- `(enrollment_id)` en `lesson_progress`, `attempts`, `submissions`, `grades`.
- Único `certificates(code)`, único `enrollments(offering_id, user_id)`, único `tenant_domains(domain)`.
- Índice parcial para certificados `pending_render`.

---

## T6. Seguridad

### T6.1 Reglas de oro
1. **RLS activado en toda tabla** del esquema público, sin excepciones.
2. La clave de servicio (`service_role`) **solo** en Edge Functions y funciones de Vercel, jamás en el navegador.
3. El cliente nunca decide su `tenant_id`: se valida contra membresías.
4. Funciones auxiliares en un esquema **no expuesto** por la API (`app`), con `security definer` y `search_path` fijo.
5. En las políticas se usa `(select auth.uid())` para que Postgres lo evalúe una sola vez por consulta.
6. Las escrituras críticas (matricular, calificar, emitir, revocar, publicar versión) pasan por **RPC**, no por `insert` directo.

### T6.2 Funciones auxiliares (esquema `app`)
```sql
create schema if not exists app;

create or replace function app.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_admins where user_id = (select auth.uid())
  );
$$;

create or replace function app.has_tenant_role(_tenant uuid, _roles public.tenant_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = _tenant
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(_roles)
  );
$$;

create or replace function app.is_offering_instructor(_offering uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.offering_instructors oi
    where oi.offering_id = _offering and oi.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_client_coordinator(_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_members cm
    where cm.client_id = _client
      and cm.user_id = (select auth.uid())
      and cm.role = 'coordinator'
  );
$$;
```

### T6.3 Ejemplo de políticas (matrículas)
```sql
alter table public.enrollments enable row level security;

create policy enrollments_select on public.enrollments
for select to authenticated using (
  user_id = (select auth.uid())                                          -- el propio estudiante
  or app.is_platform_admin()
  or app.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or app.is_offering_instructor(offering_id)                             -- docentes de la edición
  or app.is_client_coordinator(client_id)                                -- solo su cliente (lectura)
);

-- Sin políticas de insert/update/delete para usuarios:
-- se matricula y se modifica únicamente mediante RPC.
```

### T6.4 Matriz de permisos
**L** = leer · **E** = escribir · **—** = sin acceso · (alcance entre paréntesis)

| Entidad | Admin escuela | Docente | Docente invitado | Coordinador cliente | Estudiante |
|---|---|---|---|---|---|
| Marca y dominios | L/E | L | L | — | L (pública) |
| Clientes | L/E | L | solo los de sus ediciones | solo el suyo (L) | — |
| Cursos y versiones | L/E | L/E (propios y compartidos) | L/E si `can_author` y propios | — | — |
| Ediciones | L/E | L/E (donde es docente) | L/E (donde es docente) | L (de su cliente) | L (donde está matriculado) |
| Matrículas | L/E | L/E (sus ediciones) | L/E (sus ediciones) | L (su cliente) | L (propias) |
| Progreso y notas | L/E | L/E (sus ediciones) | L/E (sus ediciones) | L (su cliente) | L (propios) |
| Respuestas correctas | L/E | L/E | L/E | — | **—** |
| Plantillas de certificado | L/E | L | L | — | — |
| Certificados | L/E | L/E (emitir/revocar según permiso) | L (sus ediciones) | L (su cliente) | L (propios) |
| Auditoría | L | — | — | — | — |

### T6.5 Evaluaciones: reglas para evitar trampas
- El estudiante solo lee `question_options`; `question_keys` está bloqueada para él.
- La calificación ocurre en una RPC (`submit_attempt`) con `security definer`.
- El **tiempo límite lo controla el servidor** (`deadline_at`); el cronómetro del navegador es solo visual.
- La aleatorización usa una `seed` guardada en el intento, para que al recargar vea el mismo orden.
- Los resultados se muestran según `settings.show_results`.
- Las evaluaciones **no funcionan sin conexión**, por integridad.

### T6.6 Contenido bloqueado
Las lecciones aún no liberadas no deben filtrarse. El estudiante obtiene la estructura con `get_course_outline(offering_id)`, que devuelve títulos y un indicador `locked` con el motivo y la fecha, pero el `content` solo de las lecciones liberadas.

### T6.7 Inmutabilidad de versiones
Un `trigger` impide modificar módulos, lecciones, evaluaciones y tareas de una versión con `status = 'published'`. Para cambiar contenido publicado se crea una nueva versión borrador (copia profunda) mediante la RPC `create_draft_from_version`.

### T6.8 Storage

| Bucket | Visibilidad | Ruta | Acceso |
|---|---|---|---|
| `branding` | Público | `{tenant_id}/...` | Escritura: administradores |
| `course-assets` | Privado | `{tenant_id}/{course_id}/...` | Escritura: autores. Lectura de estudiantes por **URL firmada** emitida tras validar matrícula |
| `submissions` | Privado | `{tenant_id}/{offering_id}/{enrollment_id}/...` | Estudiante dueño y docentes de la edición |
| `certificates` | Privado | `{tenant_id}/{code}.pdf` | Titular, docentes y administradores; público solo mediante enlace firmado de corta duración |
| `signatures` | Privado | `{user_id}/...` | Solo el docente; el render usa la clave de servicio |

```sql
create policy "branding admin write" on storage.objects
for insert to authenticated with check (
  bucket_id = 'branding'
  and app.has_tenant_role(((storage.foldername(name))[1])::uuid,
                          array['owner','admin']::public.tenant_role[])
);
```

### T6.9 Otras medidas
- Límite de tasa en la verificación pública y en el inicio de sesión.
- Validación de archivos: tipo y tamaño máximo, y nombres saneados.
- Tokens de invitación guardados con hash y con vencimiento.
- Cabeceras de seguridad en Vercel (CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors`).
- Secretos solo en variables de entorno de Vercel y en los secretos de Edge Functions.
- Auditoría en `audit_log` para: publicar, calificar, ajustar notas, emitir, revocar, cambiar roles, cambiar dominios.
- Revisión periódica con los avisos de seguridad y rendimiento de Supabase (`get_advisors`).

---

## T7. Funciones SQL (RPC)

Todas validan permisos adentro y escriben en `audit_log` cuando corresponde.

| RPC | Quién | Qué hace |
|---|---|---|
| `get_tenant_branding(host)` | Público | Marca de la escuela por host |
| `list_my_tenants()` | Autenticado | Escuelas del usuario, con rol y dominio principal |
| `accept_invitation(token)` | Autenticado | Crea membresía y matrícula si aplica |
| `enroll_by_code(code)` | Estudiante | Matrícula por código de edición |
| `bulk_enroll(offering, rows)` | Docente/admin | Importa lista con validación y reporte de errores por fila |
| `get_course_outline(offering)` | Estudiante | Estructura con bloqueos |
| `mark_lesson_progress(enrollment, lesson, payload)` | Estudiante | Guarda avance de forma idempotente |
| `start_attempt(assessment, enrollment)` | Estudiante | Crea intento, `seed` y `deadline_at` |
| `save_answer(attempt, revision, answer)` | Estudiante | Guarda respuesta parcial |
| `submit_attempt(attempt)` | Estudiante | Califica automáticas y deja manuales pendientes |
| `grade_submission(submission, scores, comment)` | Docente | Registra la rúbrica y la nota |
| `compute_final_grade(enrollment)` | Interna | Calcula la nota ponderada |
| `evaluate_completion(enrollment)` | Estudiante/docente | Devuelve `{ met, unmet[] }`; **alimenta el mensaje "qué te falta"** |
| `publish_version(version)` | Autor | Valida la lista de verificación y congela |
| `create_draft_from_version(version)` | Autor | Copia profunda a nuevo borrador |
| `issue_certificate(enrollment, mode)` | Interna/docente | Crea el certificado con datos congelados |
| `revoke_certificate(certificate, reason)` | Admin/docente | Revoca y registra el motivo |
| `reissue_certificate(certificate, reason)` | Admin/docente | Nuevo registro enlazado al anterior |
| `verify_certificate(code)` | Público | Verificación pública (ver T9.4) |
| `import_course_version(source, target_tenant)` | Admin | Licencia por copia versionada |
| `migrate_client_to_tenant(client, new_tenant)` | Operador | Ver T14 |

**Finalización:** un `trigger` sobre `lesson_progress` y `grades` invoca `evaluate_completion`. Si se cumplen las reglas de la edición, se llama a `issue_certificate` en modo automático, o se marca "por emitir" si la edición exige aprobación manual.

**Ejemplo de reglas (`offerings.completion_rules`):**
```json
{
  "min_progress_pct": 80,
  "min_final_grade": 14,
  "required_assessments": ["<assessment_id>"],
  "min_attendance_pct": 70,
  "auto_issue": true
}
```

---

## T8. Edge Functions y funciones de Vercel

### T8.1 Edge Functions (Supabase, Deno)
| Función | Disparador | Qué hace |
|---|---|---|
| `send-email` | Cola `pgmq` | Envía correos transaccionales (Resend/Postmark) con plantilla y remitente por escuela |
| `send-push` | Cola `pgmq` | Envía notificaciones Web Push (VAPID) |
| `invite-user` | Llamada autenticada | Crea invitación y envía correo |
| `get-lesson-asset` | Llamada autenticada | Valida matrícula y entrega URL firmada de archivos o video |
| `video-webhook` | Webhook del proveedor de video | Actualiza el estado de procesamiento del video |
| `cron-dispatch` | `pg_cron` | Punto de entrada para tareas programadas |

### T8.2 Funciones de Vercel (Node, carpeta `/api`)
| Función | Qué hace |
|---|---|
| `certificates/render` | Genera el PDF, lo sube a Storage y marca el certificado como emitido (ver T9) |
| `verify-page` | Devuelve HTML con metaetiquetas Open Graph para `verifica.plataforma.com/c/CODIGO` y luego carga la SPA |
| `domains/add`, `domains/verify`, `domains/remove` | Gestionan dominios propios por API de Vercel (token en secreto) |

**Seguridad entre servicios:** las funciones internas se autentican con un secreto compartido o un JWT firmado de corta vida; nunca aceptan llamadas anónimas.

---

## T9. Certificados (flujo técnico)

### T9.1 Flujo de emisión
```
Estudiante cumple reglas ──▶ evaluate_completion = met
        │
        ▼
issue_certificate()
  · valida que no exista ya uno vigente para esa matrícula
  · genera código único global
  · congela: nombre, curso, horas, nota, docente, emisores, plantilla
  · inserta certificates (status = pending_render)
  · encola render en pgmq
        │
        ▼
Vercel /api/certificates/render  (idempotente, con reintentos)
  · lee el snapshot, aplica la plantilla
  · genera QR → https://verifica.plataforma.com/c/CODIGO
  · renderiza el PDF
  · sube a Storage certificates/{tenant}/{code}.pdf
  · status = issued, pdf_path, certificate_events(rendered)
        │
        ▼
send-email (enlace + botón) + notificación en la app + celebración
```

### T9.2 Código único
Formato `PREFIJO-AAAA-XXXXXXXX`. El prefijo viene del `slug` de la escuela y el sufijo usa un alfabeto sin caracteres ambiguos (sin `0`, `O`, `1`, `I`). Se recomiendan **8 caracteres** (el prototipo puede mostrar 6 solo como ejemplo visual).

```sql
create or replace function app.generate_certificate_code(_prefix text)
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea; suffix text; candidate text; i int;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    suffix := '';
    for i in 0..7 loop
      suffix := suffix || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    candidate := upper(_prefix) || '-' || extract(year from now())::int || '-' || suffix;
    exit when not exists (select 1 from public.certificates where code = candidate);
  end loop;
  return candidate;
end $$;
```

### T9.3 Generación del PDF
- Herramienta: `@react-pdf/renderer` en una función de Vercel (Node), con las fuentes del certificado incluidas y la librería `qrcode` para el QR.
- Formato A4 horizontal. Tres variantes (clásica, moderna, minimalista) más variante de **co-emisión** con dos logos.
- Un lote grande se procesa **de a uno por la cola**, para no exceder el tiempo de ejecución de las funciones.
- Si el render falla, el estado queda `pending_render`, se reintenta con espera creciente y se registra en `jobs_log`.

### T9.4 Verificación pública
```sql
create or replace function public.verify_certificate(_code text)
returns table (
  status text, holder_name text, course_title text, hours numeric,
  issuers jsonb, instructor_name text, issued_at date, revoked_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.status::text, c.student_name, c.course_title, c.hours,
         c.issuer_snapshot, c.instructor_name, c.issued_at::date, c.revoked_at
  from public.certificates c
  where c.code = upper(trim(_code));
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
```
- Devuelve **solo** datos públicos: titular, curso, horas, emisores, docente, fecha y estado. **Nunca** correo, documento de identidad ni datos del cliente.
- Se protege con límite de tasa para impedir que alguien pruebe códigos al azar.
- Resultados: `issued` (válido), `revoked` (revocado, con fecha), sin filas (no encontrado).

### T9.5 Vista previa al compartir
El QR y los enlaces apuntan a `verifica.plataforma.com/c/CODIGO`, un host **global** que no depende de la escuela, así el certificado sigue verificable aunque el cliente migre a otro tenant o cambie de dominio. Como una SPA no puede entregar metaetiquetas Open Graph por código, la ruta `/c/:code` pasa primero por la función `verify-page`, para que LinkedIn y WhatsApp muestren título e imagen.

### T9.6 Revocación y reemisión
- Revocar: `status = 'revoked'`, motivo obligatorio, evento en el historial. La verificación pública lo muestra de inmediato.
- Reemitir: se crea un certificado nuevo con `replaced_by` apuntando al nuevo y el anterior queda como `reissued`.
- Los PDF ya descargados no pueden "borrarse": por eso la verificación en línea es la fuente de verdad.

---

## T10. PWA y modo sin conexión

### T10.1 Requisitos
- `manifest.webmanifest`: nombre, `short_name`, iconos (192, 512 y *maskable*), `display: standalone`, `theme_color`, `background_color`, `start_url`, `scope`.
- **Manifest dinámico por escuela:** nombre e iconos con la marca del tenant (se sirve desde una función que lee el host).
- Service worker con Workbox:
  - **Precaché** de la interfaz (JS, CSS, fuentes, iconos).
  - **Caché de lectura** (stale-while-revalidate) para el contorno del curso y lecciones de lectura ya visitadas.
  - **Red primero** para datos sensibles (notas, evaluaciones).
  - Página de respaldo sin conexión con la marca de la escuela.
- Aviso de nueva versión ("Hay una actualización, recargar").
- Banner de instalación propio con el evento `beforeinstallprompt`; en iOS, guía visual para "Añadir a pantalla de inicio".
- HTTPS obligatorio (Vercel lo da por defecto).

### T10.2 Qué funciona sin conexión
| Función | Sin conexión |
|---|---|
| Ver cursos y progreso | Sí (último estado guardado) |
| Leer lecciones ya visitadas | Sí |
| Marcar lección como completada | Sí, **se encola** y se sincroniza al volver |
| Tomar notas personales | Sí, con sincronización |
| Reproducir video | No (solo si se habilita descarga en el futuro) |
| Rendir evaluaciones | **No** (integridad) |
| Entregar tareas | Se puede preparar el borrador; el envío espera conexión |
| Descargar certificados ya obtenidos | Sí, si ya se descargaron |

### T10.3 Cola de sincronización
- Las acciones pendientes se guardan en IndexedDB (Dexie) con identificador único y fecha.
- Al recuperar conexión (o con *Background Sync* donde exista) se envían en orden a las RPC, que son **idempotentes** (`mark_lesson_progress`).
- Resolución de conflictos: gana el estado más avanzado (una lección completada nunca vuelve a incompleta por una sincronización tardía).
- Indicador visible: "Sin conexión · 3 cambios pendientes".

### T10.4 Notificaciones push
- Claves VAPID guardadas como secretos; el usuario da permiso desde un aviso amable, **no al abrir la app**.
- Suscripción en `push_subscriptions`; envío por `send-push`.
- Eventos: entrega calificada, anuncio nuevo, sesión en vivo próxima, certificado emitido, recordatorio de inactividad.
- En iOS, las notificaciones push solo funcionan con la PWA **instalada** en la pantalla de inicio.
- Cada tipo de notificación se puede desactivar en el perfil.

### T10.5 Criterios de calidad
Auditoría con Lighthouse: instalable, rendimiento y accesibilidad altos; carga inicial rápida en móviles de gama media y conexiones lentas; tamaños táctiles de 44 px; zonas seguras en pantallas con muesca.

---

## T11. Notificaciones y correo

**Canales:** dentro de la app (tabla `notifications` con Realtime), correo y push.

| Evento | App | Correo | Push |
|---|---|---|---|
| Invitación a escuela o edición | — | Sí | — |
| Nuevo anuncio | Sí | Sí | Sí |
| Entrega pendiente (docente) | Sí | Resumen diario | — |
| Entrega calificada | Sí | Sí | Sí |
| Estudiante en riesgo (docente) | Sí | Resumen diario | — |
| Sesión en vivo próxima | Sí | Sí | Sí |
| Certificado emitido | Sí | Sí | Sí |
| Certificado revocado | Sí | Sí | — |

- Correos con plantillas por escuela (logo, colores, remitente visible y `reply-to` de soporte).
- Dominio de envío con SPF, DKIM y DMARC; en una fase posterior, dominio de envío propio por escuela.
- Tiempo real: suscripción solo a las notificaciones del usuario y al foro de sus ediciones, filtrada por RLS.

---

## T12. Jobs programados y colas

**Colas (`pgmq`):** `email`, `push`, `certificate_render`, `bulk_import`.

| Job (`pg_cron`) | Frecuencia | Qué hace |
|---|---|---|
| Despacho de anuncios programados | Cada 5 min | Envía anuncios con `scheduled_for` vencido |
| Recordatorios de sesión en vivo | Cada 15 min | Avisa 24 h y 1 h antes |
| Detección de estudiantes en riesgo | Diario | Actualiza `risk_level` por inactividad y avance bajo el esperado |
| Barrido de certificados pendientes | Cada hora | Red de seguridad: emite o reintenta lo que quedó a medias |
| Resumen diario para docentes | Diario (hora local de la escuela) | Entregas pendientes y alertas |
| Limpieza | Semanal | Invitaciones vencidas, archivos huérfanos, notificaciones antiguas |

La liberación de módulos y la apertura de evaluaciones **no necesitan job**: se calculan al leer, comparando con la fecha actual.

Las tareas llaman a Edge Functions con `pg_net`, usando secretos guardados en Vault. Cada ejecución queda en `jobs_log`.

---

## T13. Video y archivos

**Video:** Mux o Cloudflare Stream (a decidir, ver T22).
- Subida directa desde el navegador con URL de subida, sin pasar por nuestros servidores.
- Reproducción con **identificador firmado de corta duración**, emitido por `get-lesson-asset` tras validar la matrícula.
- Subtítulos y capítulos por video.
- Estado de procesamiento actualizado por webhook.

**Archivos (documentos, entregas, recursos):** Supabase Storage con subida reanudable, límite de tamaño por tipo y escaneo de tipo de archivo. Las descargas siempre con URL firmada.

---

## T14. Migración de cliente a escuela propia y licencias

### T14.1 "Graduación" de un cliente a tenant propio
Proceso asistido por el operador de plataforma, ejecutado en una transacción mediante `migrate_client_to_tenant(client_id, new_tenant_id)`:

1. Crear el tenant nuevo (marca, subdominio, plan) y su administrador.
2. Reasignar `tenant_id` en todas las tablas con `client_id` = ese cliente: ediciones, matrículas, avance, intentos, entregas, notas, anuncios, certificados.
3. Mover archivos en Storage a la nueva ruta `nuevo_tenant_id/...`.
4. Conservar usuarios (cuentas globales) y crear sus membresías en el tenant nuevo.
5. **Conservar los códigos de certificado.** Como la verificación es global, nada cambia para quien ya tiene su PDF.
6. Vincular a los docentes como `instructor_guest` en el nuevo tenant.
7. Archivar el histórico en el tenant origen según el contrato.

Reglas: ensayo previo en rama de pruebas, verificación de conteos antes y después, y plan de reversión.

### T14.2 Licencias de contenido entre escuelas
- Tabla `course_licenses`.
- `import_course_version(source_version, target_tenant)`: **copia profunda** de la versión publicada (módulos, lecciones, evaluaciones, tareas, rúbricas, recursos) al tenant destino como versión propia.
- `source_version_id` y `source_tenant_id` conservan el origen.
- Las actualizaciones son **opcionales**: al publicar una versión nueva, el tenant destino decide si la importa.
- Sin sincronización en vivo en el MVP.

---

## T15. Rendimiento

- RLS con funciones auxiliares `stable` y `(select auth.uid())`.
- Índices de T5.7 y revisión de planes de ejecución en consultas de listados (estudiantes, libro de notas, analítica).
- Paginación por cursor en tablas largas.
- Agregados de analítica en **vistas** (o vistas materializadas refrescadas por `pg_cron`) en vez de calcular en el cliente.
- Cargar de forma diferida (lazy) rutas y módulos pesados (constructor, editor, gráficos).
- Imágenes con tamaños adaptados y carga diferida.
- Elegir la región de Supabase **más cercana a los usuarios** (por ejemplo, São Paulo para Perú) y la región de las funciones de Vercel alineada con ella.
- Respuestas de la marca del tenant en caché.

---

## T16. Entornos, despliegue y migraciones

| Entorno | Frontend | Base de datos |
|---|---|---|
| Local | `vite dev` | Supabase local (CLI) con `seed.sql` |
| Vista previa (PR) | Despliegue de vista previa en Vercel | Rama de Supabase o proyecto de *staging* |
| Staging | Dominio de pruebas con comodín propio | Proyecto Supabase de *staging* |
| Producción | Dominio principal | Proyecto Supabase de producción |

**Reglas:**
- Todo cambio de esquema es una **migración SQL versionada** en el repositorio; nunca se edita producción a mano.
- Tipos de TypeScript generados desde la base en cada migración.
- Flujo de integración continua: revisar tipos, lint, pruebas unitarias, pruebas de RLS (pgTAP), pruebas E2E y despliegue.
- Despliegue de producción con aprobación; migraciones aplicadas antes del frontend y siempre compatibles hacia atrás (agregar antes de quitar).
- Variables de entorno separadas por entorno; nada de secretos en el repositorio.
- Las URLs de redirección de Auth y el comodín de dominios se configuran por entorno.

---

## T17. Estrategia de pruebas

| Nivel | Qué cubre | Herramienta |
|---|---|---|
| Seguridad de datos | RLS: aislamiento entre escuelas y clientes | pgTAP |
| Unitarias | Utilidades, reglas de finalización, cálculo de notas | Vitest |
| Componentes | Formularios, constructor, tablas | Testing Library |
| E2E | Los 9 flujos clave de la sección 13 de la Parte I | Playwright |
| PWA | Instalación, sin conexión, sincronización | Playwright + Lighthouse |
| Carga | Matrícula masiva, emisión masiva, verificación | k6 u otra herramienta |
| Accesibilidad | Contraste, teclado, lector de pantalla | axe + revisión manual |

**Casos de RLS que no pueden fallar:**
1. Un usuario de la escuela A no ve **nada** de la escuela B.
2. El coordinador de UDEP no ve alumnos del Colegio de Economistas ni de TIDEO individuales.
3. El coordinador solo lee: no puede escribir en ninguna tabla.
4. Un estudiante no puede leer `question_keys`, ni lecciones bloqueadas, ni datos de otros estudiantes.
5. Un docente invitado solo ve las ediciones donde figura como docente.
6. Una versión publicada no se puede modificar.
7. Un certificado revocado aparece como revocado en la verificación pública.
8. La verificación pública no devuelve datos privados.
9. Un usuario sin sesión no accede a ningún bucket privado.
10. Tras migrar un cliente a otro tenant, sus certificados siguen verificables con el mismo código.

---

## T18. Observabilidad y operación

- **Errores:** Sentry en frontend y funciones.
- **Métricas web:** analítica de Vercel y Web Vitals.
- **Base de datos:** registros y avisos de rendimiento y seguridad de Supabase, revisados cada semana.
- **Trabajos:** `jobs_log` con panel simple para el operador (fallidos y reintentos).
- **Alertas:** fallo de emisión de certificados, cola de correos atascada, errores de autenticación atípicos, certificados pendientes con más de una hora.
- **Respaldos:** copias diarias del plan de pago de Supabase; ensayo de restauración antes de salir a producción; exportación periódica de datos críticos (certificados y notas).
- **Soporte:** el operador puede consultar la auditoría y la ficha de una escuela, sin impersonar usuarios sin dejar registro.

---

## T19. Privacidad y cumplimiento

- Los alumnos de un cliente son **datos personales del cliente y de la escuela**: se necesita política de privacidad, términos y consentimiento visible al registrarse.
- Revisar con un abogado el cumplimiento de la **Ley de Protección de Datos Personales del Perú (Ley 29733)** y el acuerdo de tratamiento de datos con cada cliente (por ejemplo, UDEP), antes de cargar datos reales.
- Minimizar datos: no pedir documento de identidad salvo que el certificado lo exija; si se pide, restringir su lectura y no mostrarlo en la verificación pública.
- Derechos de acceso, rectificación y eliminación: proceso para atenderlos; los certificados emitidos se conservan con datos mínimos aunque se anonimice la cuenta, según lo acordado en el contrato.
- Retención definida por escuela y por contrato; exportación completa de datos de un cliente al terminar el servicio.
- Registro de accesos administrativos.

---

## T20. Costos y planes (referencia cualitativa)

| Servicio | Plan para producción | Qué lo hace crecer |
|---|---|---|
| Supabase | Pro | Almacenamiento, ancho de banda, usuarios activos, tamaño de base |
| Vercel | Pro | Ancho de banda, ejecuciones de funciones |
| Video (Mux/Cloudflare Stream) | Por minutos almacenados y vistos | Horas de video subidas y reproducidas |
| Correo (Resend/Postmark) | Por volumen | Alumnos × notificaciones |
| Dominio | Anual | — |
| Sentry | Plan base | Eventos |

El costo que más crece con el uso es el **video**. Conviene definir desde el inicio un límite de almacenamiento y de minutos por plan de escuela. Los precios y límites cambian: confirmarlos al contratar.

---

## T21. Plan de construcción por bloques

| Bloque | Entregable | Esfuerzo relativo |
|---|---|---|
| **B0 · Base** | Repositorio, entornos, integración continua, tokens de diseño, resolución de tenant, comodín de dominios | M |
| **B1 · Identidad** | Auth, perfiles, escuelas, membresías, invitaciones, marca en vivo, RLS base y pruebas de aislamiento | L |
| **B2 · Catálogo y docente (parte 1)** | Clientes, cursos, versiones, constructor con lecciones de lectura, video y documento, publicación con lista de verificación | L |
| **B3 · Ediciones y estudiante** | Ediciones, matrícula (invitación, código, CSV), reproductor, progreso, inicio del estudiante | L |
| **B4 · Evaluación** | Banco de preguntas, cuestionarios, tareas con rúbrica, libro de notas, reglas de finalización | XL |
| **B5 · Certificados** | Plantillas, emisión, render PDF, QR, verificación pública global, revocación, correo | L |
| **B6 · PWA y comunicación** | Instalación, modo sin conexión, cola de sincronización, push, anuncios, mensajes, foro, notificaciones | L |
| **B7 · Analítica y clientes** | Analítica del docente, reportes, rol coordinador, exportaciones, dominios propios | M |
| **B8 · Endurecimiento** | Revisión de seguridad, carga, accesibilidad, respaldos, legal, documentación, salida a producción | M |

**Hitos vendibles:** al terminar **B5** ya existe un producto que permite dictar a clientes y emitir certificados verificables. B6 a B8 lo vuelven robusto y listo para vender como plataforma.

**Del prototipo al producto:** el prototipo de Claude Design define pantallas, componentes y tokens. En B0 se traducen los tokens y componentes base a React (shadcn/ui). Cada bloque reemplaza los datos de ejemplo del prototipo por datos reales, respetando los mismos nombres de pantallas y términos.

---

## T22. Decisiones abiertas (resolver antes de B2)

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| 1 | Servicio de video | Mux, Cloudflare Stream, Bunny Stream | Comparar costo por minuto y firma de reproducción; arrancar con uno solo |
| 2 | Dominios propios en el MVP | Sí / Después | Después de B5; empezar con subdominios |
| 3 | Marca en correos de autenticación | Plantilla neutra / hook con plantillas por escuela | Neutra al inicio |
| 4 | Sesión entre dominios propios | Iniciar sesión de nuevo / traspaso | Iniciar de nuevo en el MVP |
| 5 | Documento de identidad en certificados | Sí / No | No, salvo exigencia de un cliente |
| 6 | Emisión de certificados | Automática / con aprobación | Configurable por edición, automática por defecto |
| 7 | Cobros | Fuera del MVP / Culqi / Izipay / Stripe | Fuera del MVP; facturar por contrato |
| 8 | Contenido SCORM/H5P | Fuera del MVP / después | Fuera del MVP |
| 9 | Región de datos | São Paulo u otra | La más cercana a los usuarios |
| 10 | Retención y exportación de datos al terminar un contrato | Definir plazos | Definir con asesoría legal |

---

## T23. Síntesis técnica

La plataforma se construye como **una SPA React/Vite (PWA) en Vercel** sobre **una sola base Postgres en Supabase** con **RLS por escuela y por cliente**. Las operaciones sensibles (matrícula, calificación, emisión y revocación) viven en **funciones SQL y Edge Functions**, las respuestas correctas están en una **tabla inaccesible para estudiantes** y las versiones de curso son **inmutables** una vez publicadas.

Los certificados se emiten con **datos congelados y un código global**, se generan como PDF en una función de Vercel y se verifican en `verifica.plataforma.com`, un host independiente de la escuela, lo que permite que un **cliente se gradúe a su propia escuela sin invalidar nada**. La PWA añade instalación, lectura sin conexión con sincronización idempotente y notificaciones push.

Condiciones a tener en cuenta: el comodín de subdominios requiere los **nameservers de Vercel**, el **video** necesita un servicio especializado y los datos de alumnos exigen **revisión legal** antes de usar datos reales. Con el plan por bloques, el producto vendible (docente completo y certificados verificables) llega al final del **bloque B5**.
