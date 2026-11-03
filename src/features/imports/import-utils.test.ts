import { describe, expect, it } from 'vitest'
import { buildPreview, buildTemplate, chunk, parseCsv, parseScore } from './import-utils'

const dims = [
  { id: 'd1', name: 'Examen final', kind: 'manual' as const },
  { id: 'd2', name: 'Asistencia', kind: 'attendance' as const },
]

describe('import-utils', () => {
  it('lee CSV con comillas, BOM y punto y coma', () => {
    expect(parseCsv('﻿a;b\n"x;y";2\n')).toEqual([['a', 'b'], ['x;y', '2']])
    expect(parseCsv('a,b\r\n"1,5",""\r\n\r\n')).toEqual([['a', 'b'], ['1,5', '']])
  })
  it('parsea notas con coma y rango', () => {
    expect(parseScore('15,5')).toBe(15.5)
    expect(parseScore('')).toBeNull()
    expect(parseScore('21')).toBe('invalid')
    expect(parseScore('x')).toBe('invalid')
  })
  it('arma la vista previa, marca errores y duplicados', () => {
    const table = parseCsv('Correo,Nombre,EXAMEN FINAL,Asistencia,Otro\nAna@x.com,Ana,16,10,z\nana@x.com,Ana 2,12,,\nmal,Luis,25,,\n')
    const out = buildPreview(table, dims)
    expect(out.ignoredColumns).toEqual(['Asistencia', 'Otro'])
    expect(out.rows[0]).toMatchObject({ email: 'ana@x.com', full_name: 'Ana', scores: { d1: 16 }, errors: [] })
    const extra = buildPreview(parseCsv('correo,Celular,Cargo,Empresa\na@x.com,999,Jefe,ACME\n'), dims)
    expect(extra.rows[0]).toMatchObject({ phone: '999', job_title: 'Jefe', company: 'ACME' })
    expect(extra.ignoredColumns).toEqual([])
    expect(out.rows[1]!.errors).toEqual(['duplicate'])
    expect(out.rows[2]!.errors).toEqual(['email', 'score:Examen final'])
  })
  it('detecta archivo vacío o sin columna de correo', () => {
    expect(buildPreview([['correo']], dims).problem).toBe('empty')
    expect(buildPreview([['celular'], ['x']], dims).problem).toBe('noEmail')
  })
  it('acepta participantes solo con nombre y avisa de homónimos o filas vacías', () => {
    const out = buildPreview(parseCsv('nombre,Examen final\nAna Pérez,15\nana  pérez,12\n,10\nLuis,\n'), dims)
    expect(out.problem).toBeNull()
    expect(out.rows[0]).toMatchObject({ email: '', full_name: 'Ana Pérez', errors: [] })
    expect(out.rows[1]!.errors).toEqual(['duplicateName'])
    expect(out.rows[2]!.errors).toEqual(['identity'])
    expect(out.rows[3]!.errors).toEqual([])
  })
  it('mezcla filas con correo y filas sin correo', () => {
    const out = buildPreview(parseCsv('correo,nombre\nana@x.com,Ana\n,Luis\n'), dims)
    expect(out.rows.map((r) => r.errors)).toEqual([[], []])
  })
  it('genera plantilla con las dimensiones manuales', () => {
    expect(buildTemplate(dims).split('\n')[0]).toBe('correo,nombre,celular,cargo,empresa,Examen final')
  })
  it('divide en lotes', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
