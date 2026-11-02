export type DimensionKind = 'manual' | 'attendance'

export type DimensionRow = {
  key: string
  id: string | null
  name: string
  weight: string
  kind: DimensionKind
  scored: number
}

export type DimensionsData = {
  dimensions: { id: string; name: string; weight_pct: number; kind: DimensionKind; scored: number }[]
  total: number
}

export const MAX_DIMENSIONS = 12

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

export function parseDimensions(value: unknown): DimensionsData {
  const root = record(value)
  const list = Array.isArray(root?.dimensions) ? root.dimensions : []
  const dimensions = list.flatMap((entry) => {
    const row = record(entry)
    if (!row || typeof row.id !== 'string') return []
    return [{
      id: row.id,
      name: typeof row.name === 'string' ? row.name : '',
      weight_pct: typeof row.weight_pct === 'number' ? row.weight_pct : 0,
      kind: row.kind === 'attendance' ? 'attendance' as const : 'manual' as const,
      scored: typeof row.scored === 'number' ? row.scored : 0,
    }]
  })
  return { dimensions, total: typeof root?.total === 'number' ? root.total : 0 }
}

export function toRows(data: DimensionsData): DimensionRow[] {
  return data.dimensions.map((item) => ({
    key: item.id, id: item.id, name: item.name, weight: String(item.weight_pct),
    kind: item.kind, scored: item.scored,
  }))
}

export function parseWeight(raw: string): number | null {
  const value = Number(raw.replace(',', '.'))
  return raw.trim() !== '' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null
}

export function totalWeight(rows: DimensionRow[]): number {
  const sum = rows.reduce((acc, row) => acc + (parseWeight(row.weight) ?? 0), 0)
  return Math.round(sum * 100) / 100
}

export type DimensionsProblem = 'name' | 'weight' | 'over' | null

export function validateRows(rows: DimensionRow[]): DimensionsProblem {
  for (const row of rows) {
    const name = row.name.trim()
    if (name.length < 1 || name.length > 80) return 'name'
    const weight = parseWeight(row.weight)
    if (weight === null || weight <= 0 || weight > 100) return 'weight'
  }
  return totalWeight(rows) > 100 ? 'over' : null
}

export function rowsToPayload(rows: DimensionRow[]) {
  return rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    name: row.name.trim(),
    weight_pct: parseWeight(row.weight) ?? 0,
    kind: row.kind,
  }))
}
