import { describe, expect, it } from 'vitest'
import { checkSheetFile, cleanSheet, emptySheet, formatBytes, isEmptySheet, publicSheetOutputSchema, safeFileName, sheetInputSchema, type SheetInput } from './sheet-utils'

describe('ficha de actividad', () => {
  it('una ficha vacía no se guarda', () => {
    expect(isEmptySheet(emptySheet())).toBe(true)
    expect(isEmptySheet(cleanSheet({ ...emptySheet(), objective: '   ', teacher: { solution: '  ' }, steps: [{ text: ' ', minutes: null, prompt_id: null }] }))).toBe(true)
    expect(isEmptySheet({ ...emptySheet(), tool_kind: 'native' })).toBe(false)
  })

  it('limpia el borrador: quita pasos y prompts vacíos y nombra los prompts sin título', () => {
    const draft: SheetInput = { ...emptySheet(), tool_kind: 'external', tool_url: ' https://gemini.google.com/ ', tool_name: ' ',
      prompts: [{ id: 'a', title: '', text: ' Texto ' }, { id: 'b', title: '', text: '' }],
      steps: [{ text: ' Paso ', minutes: 2, prompt_id: 'b' }, { text: '', minutes: null, prompt_id: null }, { text: 'Otro', minutes: null, prompt_id: 'a' }],
      teacher: { solution: ' ', intro: 'Hola' } }
    const cleaned = cleanSheet(draft)
    expect(cleaned.tool_name).toBeNull()
    expect(cleaned.tool_url).toBe('https://gemini.google.com/')
    expect(cleaned.prompts).toEqual([{ id: 'a', title: 'Prompt 1', text: 'Texto' }])
    expect(cleaned.steps).toEqual([{ text: 'Paso', minutes: 2, prompt_id: null }, { text: 'Otro', minutes: null, prompt_id: 'a' }])
    expect(cleaned.teacher).toEqual({ intro: 'Hola' })
    expect(sheetInputSchema.safeParse(cleaned).success).toBe(true)
  })

  it('solo admite enlaces https', () => {
    const base = cleanSheet({ ...emptySheet(), tool_kind: 'external', tool_url: 'https://notebooklm.google.com/' })
    expect(sheetInputSchema.safeParse(base).success).toBe(true)
    for (const url of ['http://x.com', 'javascript:alert(1)', 'gemini.google.com', 'https://a b.com', 'https://x.com/"onload']) {
      expect(sheetInputSchema.safeParse({ ...base, tool_url: url }).success).toBe(false)
    }
  })

  it('no permite prompts repetidos ni pasos que apunten a un prompt inexistente', () => {
    const prompt = { id: 'p1', title: 'Uno', text: 'Texto' }
    expect(sheetInputSchema.safeParse({ ...emptySheet(), prompts: [prompt, prompt] }).success).toBe(false)
    expect(sheetInputSchema.safeParse({ ...emptySheet(), steps: [{ text: 'x', minutes: null, prompt_id: 'zz' }] }).success).toBe(false)
    expect(sheetInputSchema.safeParse({ ...emptySheet(), prompts: [prompt], steps: [{ text: 'x', minutes: null, prompt_id: 'p1' }] }).success).toBe(true)
  })
})

describe('archivos de recursos', () => {
  const part = '11111111-1111-4111-8111-111111111111'
  const file = { path: `${part}/${part}/${part}/${part}-R01.pdf`, name: 'R01.pdf', size: 1234 }
  const sheetWith = (resource: unknown) => ({ ...emptySheet(), resources: [resource] })

  it('acepta un recurso con archivo y rechaza rutas fuera del formato', () => {
    expect(sheetInputSchema.safeParse(sheetWith({ name: 'R01', audience: 'students', status: 'ready', file })).success).toBe(true)
    expect(sheetInputSchema.safeParse(sheetWith({ name: 'R01', audience: 'students', status: 'ready', file: { ...file, path: '../secreto.pdf' } })).success).toBe(false)
    expect(sheetInputSchema.safeParse(sheetWith({ name: 'R01', audience: 'students', status: 'ready', file: { ...file, size: 30_000_000 } })).success).toBe(false)
    expect(sheetInputSchema.safeParse(sheetWith({ name: 'R01', audience: 'students', status: 'ready', file: { ...file, extra: 1 } })).success).toBe(false)
  })
  it('el alumno nunca recibe la ruta del archivo', () => {
    const base = { tool_kind: 'none', tool_name: null, tool_url: null, tool_feature: null, objective: '', context_md: '', steps: [], prompts: [],
      deliverable_md: '', item_id: part, title: 'A1', minutes: 20, published_at: '2026-11-27T20:00:00+00:00' }
    const pub = { idx: 0, name: 'R01', audience: 'students', status: 'ready' }
    expect(publicSheetOutputSchema.safeParse({ ...base, resources: [{ ...pub, file: { name: 'R01.pdf', size: 1234 } }] }).success).toBe(true)
    expect(publicSheetOutputSchema.safeParse({ ...base, resources: [{ ...pub, file }] }).success).toBe(false)
  })
  it('valida tipo y tamaño antes de subir', () => {
    expect(checkSheetFile('R12.md', 100)).toBe('ok')
    expect(checkSheetFile('Informe.PDF', 100)).toBe('ok')
    expect(checkSheetFile('virus.exe', 100)).toBe('type')
    expect(checkSheetFile('constructor', 100)).toBe('type')
    expect(checkSheetFile('a.pdf', 0)).toBe('empty')
    expect(checkSheetFile('a.pdf', 26_214_401)).toBe('size')
  })
  it('limpia el nombre para la ruta de almacenamiento', () => {
    expect(safeFileName('Política de Cambios y Devoluciones (v2).pdf')).toBe('Politica_de_Cambios_y_Devoluciones__v2_.pdf')
    expect(safeFileName('../../etc/passwd')).toBe('_.._etc_passwd')
    expect(safeFileName('...')).toBe('archivo')
    expect(safeFileName('x'.repeat(300) + '.pdf').length).toBeLessThanOrEqual(120)
    expect(safeFileName('x'.repeat(300) + '.pdf').endsWith('.pdf')).toBe(true)
  })
  it('da formato legible al tamaño', () => {
    expect(formatBytes(500)).toBe('500 B'); expect(formatBytes(2048)).toBe('2 KB'); expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
