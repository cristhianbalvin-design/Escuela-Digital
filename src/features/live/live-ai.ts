import { z } from 'zod'
import { normalizeTerm } from './live-utils'

export const liveAnalysisSchema = z.object({ summary: z.string().max(3000) }).strict()
export const liveWordcloudGroupsSchema = z.object({
  groups: z.array(z.object({
    canonical: z.string().trim().min(1).max(30),
    terms: z.array(z.string().min(1).max(30)).min(2),
  }).strict()),
}).strict()

export type LiveWordcloudGroup = z.infer<typeof liveWordcloudGroupsSchema>['groups'][number]

export function termsToMerge(groups: LiveWordcloudGroup[]): { term: string; canonical: string }[] {
  return groups.flatMap(({ canonical, terms }) => terms
    .filter((term) => normalizeTerm(term) !== normalizeTerm(canonical))
    .map((term) => ({ term, canonical })))
}
