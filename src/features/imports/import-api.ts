import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CHUNK_SIZE, chunk, type PreviewRow } from './import-utils'

export type ImportResult = {
  email: string
  status: 'ok' | 'error'
  account_created: boolean
  enrollment_created: boolean
  scores: number
  error?: string
}

async function postChunk(offeringId: string, rows: PreviewRow[], token: string) {
  const response = await fetch('/api/imports/participants', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offering_id: offeringId,
      rows: rows.map((row) => ({
        email: row.email, full_name: row.full_name, scores: row.scores,
        phone: row.phone, job_title: row.job_title, company: row.company,
      })),
    }),
  })
  const body = await response.json().catch(() => null) as { results?: ImportResult[]; error?: string } | null
  if (!response.ok || !body?.results) {
    if (response.status === 403) throw new Error('No tienes permiso para importar en esta edición.')
    const detail = body?.error ? `${response.status}: ${body.error}` : String(response.status)
    throw new Error(`El servidor no pudo procesar el lote (${detail}). Intenta de nuevo.`)
  }
  return body.results
}

export function useImportParticipants(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { rows: PreviewRow[]; onProgress: (done: number) => void }) => {
      if (!supabase) throw new Error('Supabase no está configurado')
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      const token = data.session?.access_token
      if (!token) throw new Error('No hay una sesión activa.')
      const results: ImportResult[] = []
      for (const part of chunk(input.rows, CHUNK_SIZE)) {
        results.push(...await postChunk(offeringId, part, token))
        input.onProgress(results.length)
      }
      return results
    },
    onSettled: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['offering-roster', offeringId] }),
        cache.invalidateQueries({ queryKey: ['enrollable-students', offeringId] }),
        cache.invalidateQueries({ queryKey: ['grading', offeringId] }),
        cache.invalidateQueries({ queryKey: ['offering'] }),
        cache.invalidateQueries({ queryKey: ['offerings'] }),
      ])
    },
  })
}
