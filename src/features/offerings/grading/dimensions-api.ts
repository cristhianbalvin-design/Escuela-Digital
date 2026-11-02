import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/lib/supabase/database.types'
import { parseDimensions, type DimensionRow, rowsToPayload } from './dimensions-utils'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado')
  return supabase
}

export function useOfferingDimensions(offeringId: string) {
  return useQuery({
    queryKey: ['grading', offeringId, 'dimensions'],
    enabled: !!supabase && !!offeringId,
    queryFn: async () => {
      const { data, error } = await client().rpc('get_offering_dimensions', {
        p_offering_id: offeringId,
      })
      if (error) throw error
      return parseDimensions(data)
    },
  })
}

export function useSaveDimensions(offeringId: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async (rows: DimensionRow[]) => {
      const { data, error } = await client().rpc('save_offering_dimensions', {
        p_offering_id: offeringId, p_dimensions: rowsToPayload(rows) as unknown as Json,
      })
      if (error) throw error
      return parseDimensions(data)
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['grading', offeringId, 'dimensions'] }),
        cache.invalidateQueries({ queryKey: ['grading', offeringId, 'gradebook'] }),
      ])
    },
  })
}
