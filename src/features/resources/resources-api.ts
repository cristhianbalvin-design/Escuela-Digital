import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  kindOf, resourcePath, resourcesSchema, type LessonResource,
} from './resources-utils'

const BUCKET = 'lesson-resources'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

export function useLessonResources(lessonId: string) {
  return useQuery({
    queryKey: ['lesson-resources', lessonId],
    enabled: !!supabase,
    queryFn: async (): Promise<LessonResource[]> => {
      const { data, error } = await client().rpc('get_lesson_resources', {
        p_lesson_id: lessonId,
      })
      if (error) throw error
      return resourcesSchema.parse(data)
    },
  })
}

type Target = { tenantId: string; versionId: string; lessonId: string }

export function useUploadResources(target: Target) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (files: File[]) => {
      const db = client()
      for (const file of files) {
        const path = resourcePath(
          target.tenantId, target.lessonId, file.name, crypto.randomUUID(),
        )
        const { error: uploadError } = await db.storage.from(BUCKET)
          .upload(path, file, { contentType: file.type || undefined, upsert: false })
        if (uploadError) throw uploadError
        const { error: insertError } = await db.from('lesson_resources').insert({
          lesson_id: target.lessonId,
          version_id: target.versionId,
          tenant_id: target.tenantId,
          name: file.name,
          storage_path: path,
          kind: kindOf(file.name),
          size_bytes: file.size,
        })
        if (insertError) {
          await db.storage.from(BUCKET).remove([path])
          throw insertError
        }
      }
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['lesson-resources', target.lessonId] }),
  })
}

export function useDeleteResource(lessonId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (resource: LessonResource) => {
      const db = client()
      const { error } = await db.from('lesson_resources').delete().eq('id', resource.id)
      if (error) throw error
      // Las versiones nuevas comparten la ruta: el archivo se borra solo si nadie más lo usa.
      const { count } = await db.from('lesson_resources')
        .select('id', { count: 'exact', head: true })
        .eq('storage_path', resource.storage_path)
      if (count === 0) await db.storage.from(BUCKET).remove([resource.storage_path])
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['lesson-resources', lessonId] }),
  })
}

export async function openResource(path: string): Promise<void> {
  const { data, error } = await client().storage.from(BUCKET)
    .createSignedUrl(path, 60 * 60)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}
