import { describe, expect, it } from 'vitest'
import { parseGradebook, parseQueue } from './grading-api'

describe('parseo defensivo de respuestas RPC', () => {
  it('descarta entradas incompletas de la cola', () => {
    const queue = parseQueue({
      submissions: [{ submission_id: 's1', student_email: 'a@example.com' }, null],
      attempts: [{ attempt_id: 'a1', attempt_no: 2 }, {}],
    })
    expect(queue.submissions).toHaveLength(1)
    expect(queue.attempts).toHaveLength(1)
    expect(queue.submissions[0]?.max_score).toBe(0)
  })
  it('acepta campos ausentes del libro como colecciones vacías', () => {
    expect(parseGradebook({}).items).toEqual([])
    expect(parseGradebook(null).students).toEqual([])
  })
})
