import { describe, expect, it } from 'vitest'
import { cleanSheet, emptySheet, isEmptySheet, sheetInputSchema, type SheetInput } from './sheet-utils'

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
