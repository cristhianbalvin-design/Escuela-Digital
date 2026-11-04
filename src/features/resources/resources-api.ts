import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  kindOf, marksSchema, resourcePath, resourcesSchema,
  type Audience, type LessonResource, type MarkState, type ResourceMark,
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
    mutationFn: async ({ files, audience }: { files: File[]; audience: Audience }) => {
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
          audience,
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

export function useRenameResource(lessonId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await client().from('lesson_resources')
        .update({ name: input.name }).eq('id', input.id)
      if (error) throw error
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['lesson-resources', lessonId] }),
  })
}

export function useSetResourceAudience(lessonId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; audience: Audience }) => {
      const { error } = await client().from('lesson_resources')
        .update({ audience: input.audience }).eq('id', input.id)
      if (error) throw error
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['lesson-resources', lessonId] }),
  })
}

/** Reemplaza el archivo conservando el registro (y con él las marcas de cada edición). */
export function useReplaceResource(target: Target) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { resource: LessonResource; file: File }) => {
      const db = client()
      const path = resourcePath(
        target.tenantId, target.lessonId, input.file.name, crypto.randomUUID(),
      )
      const { error: uploadError } = await db.storage.from(BUCKET)
        .upload(path, input.file, { contentType: input.file.type || undefined, upsert: false })
      if (uploadError) throw uploadError
      const { error: updateError } = await db.from('lesson_resources').update({
        name: input.file.name,
        storage_path: path,
        kind: kindOf(input.file.name),
        size_bytes: input.file.size,
      }).eq('id', input.resource.id)
      if (updateError) {
        await db.storage.from(BUCKET).remove([path])
        throw updateError
      }
      // Las versiones nuevas comparten la ruta: el archivo anterior se borra solo si nadie más lo usa.
      const { count } = await db.from('lesson_resources')
        .select('id', { count: 'exact', head: true })
        .eq('storage_path', input.resource.storage_path)
      if (count === 0) await db.storage.from(BUCKET).remove([input.resource.storage_path])
    },
    onSettled: () => cache.invalidateQueries({ queryKey: ['lesson-resources', target.lessonId] }),
  })
}

export async function openResource(path: string): Promise<void> {
  const { data, error } = await client().storage.from(BUCKET)
    .createSignedUrl(path, 60 * 60)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

export function useOfferingResourceMarks(offeringId: string | undefined) {
  return useQuery({
    queryKey: ['offering-resource-marks', offeringId],
    enabled: !!supabase && !!offeringId,
    queryFn: async (): Promise<ResourceMark[]> => {
      const { data, error } = await client().rpc('get_offering_resource_marks', {
        p_offering_id: offeringId!,
      })
      if (error) throw error
      return marksSchema.parse(data)
    },
  })
}

export function useSetResourceMark(offeringId: string) {
  const cache = useQueryClient()
  const key = ['offering-resource-marks', offeringId]
  return useMutation({
    mutationFn: async (input: { resourceId: string; state: MarkState }) => {
      const { error } = await client().rpc('set_offering_resource_mark', {
        p_offering_id: offeringId,
        p_resource_id: input.resourceId,
        p_shared: input.state.shared,
        p_used: input.state.used,
      })
      if (error) throw error
    },
    // La casilla responde al instante; si falla, se vuelve a leer el estado real.
    onMutate: async (input) => {
      await cache.cancelQueries({ queryKey: key })
      const previous = cache.getQueryData<ResourceMark[]>(key)
      const now = new Date().toISOString()
      const rest = (previous ?? []).filter((mark) => mark.resource_id !== input.resourceId)
      const old = (previous ?? []).find((mark) => mark.resource_id === input.resourceId)
      cache.setQueryData<ResourceMark[]>(key, input.state.shared
        ? [...rest, {
          resource_id: input.resourceId,
          shared_at: old?.shared_at ?? now,
          used_at: input.state.used ? (old?.used_at ?? now) : null,
        }]
        : rest)
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) cache.setQueryData(key, context.previous)
    },
    onSettled: () => cache.invalidateQueries({ queryKey: key }),
  })
}
