export type ImportDimension = { id: string; name: string; kind: 'manual' | 'attendance' }

export type PreviewRow = {
  line: number
  email: string
  full_name: string
  phone: string
  job_title: string
  company: string
  scores: Record<string, number>
  errors: string[]
}

export type ParsedImport = {
  rows: PreviewRow[]
  ignoredColumns: string[]
  problem: 'empty' | 'noEmail' | null
}

export const CHUNK_SIZE = 25
export const MAX_IMPORT_ROWS = 500

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const EMAIL_HEADERS = new Set(['correo', 'correo electronico', 'email', 'e mail', 'mail'])
const PHONE_HEADERS = new Set(['celular', 'telefono', 'movil', 'phone', 'whatsapp', 'numero de celular'])
const JOB_HEADERS = new Set(['cargo', 'cargo actual', 'puesto', 'job title'])
const COMPANY_HEADERS = new Set(['empresa', 'empresa donde labora', 'organizacion', 'compania', 'company'])
const NAME_HEADERS = new Set(['nombre', 'nombres', 'nombre completo', 'participante', 'alumno', 'name', 'full name'])

/** Lee CSV con comillas; detecta coma o punto y coma como separador. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1 } else quoted = false
      } else field += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) { row.push(field); field = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(field); field = ''
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
    } else field += char
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}

export function parseScore(raw: string): number | null | 'invalid' {
  const text = raw.trim().replace(',', '.')
  if (text === '') return null
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 20) return 'invalid'
  return Math.round(value * 100) / 100
}

export function buildPreview(table: string[][], dimensions: ImportDimension[]): ParsedImport {
  if (table.length < 2) return { rows: [], ignoredColumns: [], problem: 'empty' }
  const header = table[0]!.map((cell) => cell.trim())
  const normalized = header.map(normalizeHeader)
  const emailIndex = normalized.findIndex((h) => EMAIL_HEADERS.has(h))
  if (emailIndex < 0) return { rows: [], ignoredColumns: [], problem: 'noEmail' }
  const nameIndex = normalized.findIndex((h) => NAME_HEADERS.has(h))
  const phoneIndex = normalized.findIndex((h) => PHONE_HEADERS.has(h))
  const jobIndex = normalized.findIndex((h) => JOB_HEADERS.has(h))
  const companyIndex = normalized.findIndex((h) => COMPANY_HEADERS.has(h))
  const known = new Set([emailIndex, nameIndex, phoneIndex, jobIndex, companyIndex])
  const dimensionColumns = new Map<number, ImportDimension>()
  const ignored: string[] = []
  normalized.forEach((h, index) => {
    if (known.has(index) || h === '') return
    const match = dimensions.find((d) => normalizeHeader(d.name) === h)
    if (match && match.kind === 'manual') dimensionColumns.set(index, match)
    else ignored.push(header[index]!)
  })
  const seen = new Set<string>()
  const rows: PreviewRow[] = table.slice(1).map((cells, offset) => {
    const email = (cells[emailIndex] ?? '').trim().toLowerCase()
    const row: PreviewRow = {
      line: offset + 2, email,
      full_name: nameIndex >= 0 ? (cells[nameIndex] ?? '').trim() : '',
      phone: phoneIndex >= 0 ? (cells[phoneIndex] ?? '').trim() : '',
      job_title: jobIndex >= 0 ? (cells[jobIndex] ?? '').trim() : '',
      company: companyIndex >= 0 ? (cells[companyIndex] ?? '').trim() : '',
      scores: {}, errors: [],
    }
    if (!EMAIL.test(email)) row.errors.push('email')
    else if (seen.has(email)) row.errors.push('duplicate')
    seen.add(email)
    for (const [index, dimension] of dimensionColumns) {
      const score = parseScore(cells[index] ?? '')
      if (score === 'invalid') row.errors.push(`score:${dimension.name}`)
      else if (score !== null) row.scores[dimension.id] = score
    }
    return row
  })
  return { rows, ignoredColumns: ignored, problem: null }
}

export function buildTemplate(dimensions: ImportDimension[]): string {
  const manual = dimensions.filter((d) => d.kind === 'manual')
  const quote = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const header = ['correo', 'nombre', 'celular', 'cargo', 'empresa', ...manual.map((d) => quote(d.name))]
  const example = ['ana.perez@ejemplo.com', 'Ana Pérez', '999111222', 'Analista de datos', 'Empresa SAC',
    ...manual.map(() => '15')]
  return `${header.join(',')}\n${example.join(',')}\n`
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
