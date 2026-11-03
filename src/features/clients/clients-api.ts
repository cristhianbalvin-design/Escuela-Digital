import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { clientSlug, slugAttempt, type ClientStatus } from './clients-utils'

export type ClientRow = {
  id: string
  name: string
  slug: string
  status: ClientStatus
}

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

export function useClients(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['clients', tenantId],
    enabled: !!supabase && !!tenantId,
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await client().from('clients')
        .select('id,name,slug,status')
        .eq('tenant_id', tenantId!)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return (data ?? []) as ClientRow[]
    },
  })
}

export function useCreateClient(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const base = clientSlug(name)
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        const { error } = await client().from('clients')
          .insert({ tenant_id: tenantId, name, slug: slugAttempt(base, attempt) })
        if (!error) return
        if (error.code !== '23505') throw error
      }
      throw new Error('No se pudo generar un identificador único para el cliente')
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: ['clients', tenantId] }),
  })
}

export function useUpdateClient(tenantId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; status?: ClientStatus }) => {
      const { id, ...changes } = input
      const { error } = await client().from('clients').update(changes).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: ['clients', tenantId] }),
  })
}
