import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { CourseValues } from './schemas'

type Tables = Database['public']['Tables']
export type Course = Tables['courses']['Row']
export type Version = Tables['course_versions']['Row']
export type Module = Tables['modules']['Row']
export type Lesson = Tables['lessons']['Row']

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

function check(error: { code?: string; message: string } | null) {
  if (error) throw error
}

export function useCourses(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['courses', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async () => {
      const db = client()
      const { data: courses, error } = await db.from('courses')
        .select('*').eq('tenant_id', tenantId!).is('deleted_at', null)
        .order('updated_at', { ascending: false })
      check(error)
      const { data: versions, error: versionError } = await db.from('course_versions')
        .select('*').eq('tenant_id', tenantId!)
        .order('version_number', { ascending: false })
      check(versionError)
      return (courses ?? []).map((course) => ({
        ...course,
        latest: (versions ?? []).find((version) => version.course_id === course.id) ?? null,
        published: (versions ?? []).find(
          (version) => version.id === course.latest_published_version_id,
        ) ?? null,
      }))
    },
  })
}

export function useCourse(
  tenantId: string | undefined,
  courseId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: ['course', tenantId, courseId, userId],
    enabled: !!supabase && !!tenantId && !!courseId && !!userId,
    queryFn: async () => {
      const db = client()
      const { data: course, error } = await db.from('courses')
        .select('*').eq('tenant_id', tenantId!).eq('id', courseId!).single()
      check(error)
      if (!course) throw new Error('Curso no encontrado')
      const [versionResult, moduleResult, lessonResult, collaboratorResult, memberResult] =
        await Promise.all([
          db.from('course_versions').select('*')
            .eq('tenant_id', tenantId!).eq('course_id', courseId!)
            .order('version_number', { ascending: false }),
          db.from('modules').select('*').eq('tenant_id', tenantId!)
            .order('position'),
          db.from('lessons').select('*').eq('tenant_id', tenantId!)
            .order('position'),
          db.from('course_collaborators').select('*')
            .eq('tenant_id', tenantId!).eq('course_id', courseId!)
            .eq('user_id', userId!).maybeSingle(),
          db.from('tenant_members').select('role,can_author')
            .eq('tenant_id', tenantId!).eq('user_id', userId!).maybeSingle(),
        ])
      check(versionResult.error)
      check(moduleResult.error)
      check(lessonResult.error)
      check(collaboratorResult.error)
      check(memberResult.error)
      const versionIds = new Set((versionResult.data ?? []).map((version) => version.id))
      const canEdit = course.created_by === userId ||
        collaboratorResult.data?.role === 'editor'
      return {
        course,
        versions: versionResult.data ?? [],
        modules: (moduleResult.data ?? []).filter((module) => versionIds.has(module.version_id)),
        lessons: (lessonResult.data ?? []).filter((lesson) => versionIds.has(lesson.version_id)),
        canEdit: canEdit && (
          memberResult.data?.role === 'instructor' ||
          (memberResult.data?.role === 'instructor_guest' && memberResult.data.can_author)
        ),
      }
    },
  })
}

export function useCreateCourse(tenantId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (values: CourseValues) => {
      if (!tenantId) throw new Error('Escuela no disponible')
      const db = client()
      const { data: courseId, error } = await db.rpc('create_course', {
        p_tenant_id: tenantId,
        p_slug: values.slug,
        p_title: values.title,
        p_category: values.category.trim() || null,
        p_level: values.level.trim() || null,
        p_language: values.language,
      })
      check(error)
      if (!courseId) throw new Error('No se recibió el curso creado')
      if (values.structure === 'weekly') {
        const { data: version, error: versionError } = await db.from('course_versions')
          .select('id').eq('course_id', courseId).eq('tenant_id', tenantId)
          .eq('status', 'draft').single()
        check(versionError)
        if (!version) throw new Error('No se encontró el borrador')
        for (let index = 1; index <= values.weeks; index += 1) {
          const { data: module, error: moduleError } = await db.from('modules')
            .insert({
              tenant_id: tenantId,
              version_id: version.id,
              title: `Semana ${index}`,
              position: index,
            }).select('id').single()
          check(moduleError)
          if (!module) throw new Error('No se creó el módulo')
          const { error: lessonError } = await db.from('lessons').insert({
            tenant_id: tenantId,
            version_id: version.id,
            module_id: module.id,
            type: 'reading',
            title: `Lectura de la semana ${index}`,
            position: 1,
            content: { text: '' },
          })
          check(lessonError)
        }
      }
      return courseId
    },
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['courses', tenantId] }),
  })
}

export type CourseAction =
  | { kind: 'addModule'; versionId: string; title: string; position: number }
  | { kind: 'renameModule'; id: string; title: string }
  | { kind: 'moveModule'; id: string; position: number }
  | { kind: 'deleteModule'; id: string; versionId: string }
  | { kind: 'addLesson'; versionId: string; moduleId: string; title: string; position: number ; lessonType?: 'reading' | 'quiz' | 'assignment' }
  | { kind: 'saveLesson'; id: string; title: string; content: Json }
  | { kind: 'moveLesson'; id: string; position: number }
  | { kind: 'deleteLesson'; id: string }
  | { kind: 'publish'; versionId: string }
  | { kind: 'draft'; versionId: string }

export function useCourseAction(tenantId: string | undefined, courseId: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (action: CourseAction) => {
      if (!tenantId) throw new Error('Escuela no disponible')
      const db = client()
      if (action.kind === 'addModule') {
        const { error } = await db.from('modules').insert({
          tenant_id: tenantId, version_id: action.versionId,
          title: action.title, position: action.position,
        })
        check(error)
      } else if (action.kind === 'renameModule') {
        const { error } = await db.from('modules')
          .update({ title: action.title }).eq('id', action.id)
        check(error)
      } else if (action.kind === 'moveModule') {
        const { error } = await db.from('modules')
          .update({ position: action.position }).eq('id', action.id)
        check(error)
      } else if (action.kind === 'deleteModule') {
        const { data: lessons, error: lessonError } = await db.from('lessons')
          .select('id').eq('module_id', action.id).eq('version_id', action.versionId)
        check(lessonError)
        for (const lesson of lessons ?? []) {
          const { error: resourceError } = await db.from('lesson_resources')
            .delete().eq('lesson_id', lesson.id)
          check(resourceError)
        }
        const { error: deleteLessonsError } = await db.from('lessons')
          .delete().eq('module_id', action.id)
        check(deleteLessonsError)
        const { error } = await db.from('modules').delete().eq('id', action.id)
        check(error)
      } else if (action.kind === 'addLesson') {
        const { error } = await db.from('lessons').insert({
          tenant_id: tenantId, version_id: action.versionId,
          module_id: action.moduleId, type: action.lessonType ?? 'reading',
          title: action.title, position: action.position,
          content: (action.lessonType ?? 'reading') === 'reading' ? { text: '' } : {},
        })
        check(error)
      } else if (action.kind === 'saveLesson') {
        const { error } = await db.from('lessons')
          .update({ title: action.title, content: action.content }).eq('id', action.id)
        check(error)
      } else if (action.kind === 'moveLesson') {
        const { error } = await db.from('lessons')
          .update({ position: action.position }).eq('id', action.id)
        check(error)
      } else if (action.kind === 'deleteLesson') {
        const { error: resourceError } = await db.from('lesson_resources')
          .delete().eq('lesson_id', action.id)
        check(resourceError)
        const { error } = await db.from('lessons').delete().eq('id', action.id)
        check(error)
      } else if (action.kind === 'publish') {
        const { error } = await db.rpc('publish_version', { p_version_id: action.versionId })
        check(error)
      } else {
        const { error } = await db.rpc('create_draft_from_version', {
          p_version_id: action.versionId,
        })
        check(error)
      }
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['course', tenantId, courseId] })
      void cache.invalidateQueries({ queryKey: ['courses', tenantId] })
    },
  })
}
