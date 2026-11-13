import { describe, expect, it } from 'vitest'
import { liveRpcInputSchemas, liveRpcOutputSchemas, type LiveRpcName } from './live-contract'

const id = 'a4e2f934-65bb-4b06-a583-24200c54ab01'
const code = 'ABC234'
const token = 'a'.repeat(64)
const at = '2026-11-12T09:00:00+00:00'
const activity = { id, set_id: null, plan_item_id: null, title: 'Pregunta', type: 'poll_single',
  config: { options: [{ id: 'a', label: 'Sí' }, { id: 'b', label: 'No' }] }, position: 0 }
const response = { id, answer: 'a', hidden: false, pinned: false, participant_name: null }
const results = { total: 1, rows: [{ id: 'a', label: 'Sí', count: 1, percent: 100 }], average: null, responses: [] }
const run = { id, title: 'Pregunta', type: 'poll_single', config: activity.config,
  status: 'open', paused: false, show_results: true, reveal: false, show_ranking: false, opened_at: at, closed_at: null, results }
const controlState = {
  session: { id, offering_id: id, lesson_id: id, code, status: 'active', access_mode: 'both',
    ask_name: true, ask_company: false, created_at: at, ended_at: null },
  activities: [activity], runs: [{ ...run, activity_id: id, results: { ...results, responses: [response] } }],
  participant_count: 1, ranking: [],
}
const participantState = {
  session: { id, code, status: 'active', ask_name: true, ask_company: false },
  participant: { id, name: 'Ana', company: null }, run, my_response: 'a',
}
const projectorState = { session: { code, status: 'active' }, run }

describe('entradas de las RPC en vivo', () => {
  it('acepta una actividad y rechaza opciones repetidas', () => {
    const item = { type: activity.type, title: activity.title, plan_item_id: null, config: activity.config }
    expect(liveRpcInputSchemas.save_live_activities.safeParse({ p_lesson_id: id, p_items: [item] }).success).toBe(true)
    expect(liveRpcInputSchemas.save_live_activities.safeParse({ p_lesson_id: id, p_items: [
      { ...item, config: { options: [{ id: 'a', label: 'Sí' }, { id: 'a', label: 'No' }] } },
    ] }).success).toBe(false)
  })

  it('acepta contexto hasta 6000 caracteres en todos los tipos', () => {
    const base = { options: [{ id: 'a', label: 'Sí' }, { id: 'b', label: 'No' }] }
    const cases = [
      ['poll_single', base], ['poll_multi', base], ['vote', base],
      ['wordcloud', { max_answers: 3 }], ['open', {}], ['scale', { scale_min: 1, scale_max: 5 }],
      ['quiz', { ...base, correct: 'a', seconds: 30 }],
      ['compare', { options: [{ id: 'a', label: 'A', real_name: '', content: '' }, { id: 'b', label: 'B', real_name: '', content: '' }],
        criteria: [{ id: 'c', label: 'C', description: '' }], final_question: '', ask_comment: false, comment_max: 0 }],
    ] as const
    for (const [type, config] of cases) {
      const valid = { p_lesson_id: id, p_items: [{ title: 'Pregunta', type, config: { ...config, context: 'x'.repeat(6000) } }] }
      expect(liveRpcInputSchemas.save_live_activities.safeParse(valid).success).toBe(true)
      expect(liveRpcInputSchemas.save_live_activities.safeParse({ ...valid, p_items: [{ ...valid.p_items[0], config: { ...config, context: 'x'.repeat(6001) } }] }).success).toBe(false)
    }
  })

  it('valida el código y el token', () => {
    expect(liveRpcInputSchemas.get_offering_live_session.safeParse({ p_offering_id: id }).success).toBe(true)
    expect(liveRpcInputSchemas.get_offering_live_session.safeParse({ p_offering_id: id, extra: true }).success).toBe(false)
    expect(liveRpcInputSchemas.get_live_state.safeParse({ p_code: code, p_token: token }).success).toBe(true)
    expect(liveRpcInputSchemas.get_live_state.safeParse({ p_code: 'ABC230', p_token: token }).success).toBe(false)
    expect(liveRpcInputSchemas.get_live_state.safeParse({ p_code: code, p_token: 'corto' }).success).toBe(false)
  })
  it('acepta ayuda, etiqueta, puntaje y pausa; rechaza valores inválidos', () => {
    const item = { type: 'poll_single', title: 'Pregunta', config: { help: 'Pista', indicator_label: 'Herramientas', options: [
      { id: 'a', label: 'Sí', score: 100 }, { id: 'b', label: 'No', score: 0 },
    ] } }
    const save = (config: unknown) => liveRpcInputSchemas.save_live_activities.safeParse({ p_lesson_id: id, p_items: [{ ...item, config }] }).success
    expect(save(item.config)).toBe(true)
    expect(save({ ...item.config, help: ' ' })).toBe(false)
    expect(save({ ...item.config, indicator_label: 'x'.repeat(61) })).toBe(false)
    expect(save({ ...item.config, options: [{ id: 'a', label: 'Sí', score: 101 }, item.config.options[1]] })).toBe(false)
    expect(save({ ...item.config, options: [{ id: 'a', label: 'Sí', score: 2.5 }, item.config.options[1]] })).toBe(false)
    expect(save({ ...item.config, extra: true })).toBe(false)
    expect(save({ help: 'Pista' })).toBe(false)
    expect(liveRpcInputSchemas.save_live_activities.safeParse({ p_lesson_id: id, p_items: [{ ...item, type: 'open', config: { help: 'Pista' } }] }).success).toBe(true)
    expect(liveRpcInputSchemas.set_live_run_paused.safeParse({ p_run_id: id, p_paused: true }).success).toBe(true)
  })
})

describe('entradas nuevas de quiz y comparativa', () => {
  it('valida configuración estricta y respuesta estructurada', () => {
    const save = (type: string, config: unknown) => liveRpcInputSchemas.save_live_activities.safeParse({
      p_lesson_id: id, p_items: [{ title: 'Ronda', type, config }],
    }).success
    const quiz = { options: [{ id: 'a', label: 'Sí' }, { id: 'b', label: 'No' }], correct: 'a', seconds: 15 }
    expect(save('quiz', quiz)).toBe(true)
    expect(save('quiz', { ...quiz, correct: 'c' })).toBe(false)
    expect(save('quiz', { ...quiz, seconds: 121 })).toBe(false)
    expect(save('quiz', { ...quiz, text: 'No se usa' })).toBe(false)
    const compare = { options: [{ id: 'a', label: 'Modelo A', content: 'Texto', real_name: 'Uno' },
      { id: 'b', label: 'Modelo B', content: 'Texto', real_name: 'Dos' }],
      criteria: [{ id: 'c', label: 'Claridad', description: 'Se entiende' }], final_question: '¿Cuál?', ask_comment: true, comment_max: 100 }
    expect(save('compare', compare)).toBe(true)
    expect(save('compare', { ...compare, options: [compare.options[0], compare.options[0]] })).toBe(false)
    expect(save('compare', { ...compare, scale_max: 11 })).toBe(false)
    expect(liveRpcInputSchemas.submit_live_response.safeParse({ p_code: code, p_token: token, p_run_id: id,
      p_answer: { ratings: { a: { c: 5 }, b: { c: 3 } }, choice: 'a' } }).success).toBe(true)
  })
})

describe('salidas JSON de las 18 RPC en vivo', () => {
  const examples: Record<LiveRpcName, unknown> = {
    get_live_activities: [activity], save_live_activities: [activity],
    create_live_session: controlState, get_live_control_state: controlState, get_offering_live_session: controlState,
    launch_live_run: controlState, launch_live_set: controlState, search_live_roster: [], get_live_screen: { mode: 'activity', slide: 1, updated_at: null, presentation: null }, set_live_screen: { mode: 'slides', slide: 2, updated_at: '2026-11-13T22:00:00+00:00', presentation: { file_name: 'clase.pdf', folder: 'a/b', page_count: 24, aspect: 1.7778, updated_at: '2026-11-13T22:00:00+00:00' } }, get_lesson_presentation: null, save_lesson_presentation: { file_name: 'clase.pdf', folder: 'a/b', page_count: 24, aspect: 1.7778, updated_at: '2026-11-13T22:00:00+00:00' }, delete_lesson_presentation: null, close_live_run: controlState,
    set_live_run_visibility: controlState, moderate_live_response: controlState,
    set_live_run_paused: controlState, set_live_run_reveal: controlState, set_live_run_ranking: controlState,
    merge_live_term: controlState, end_live_session: controlState, reset_live_run: controlState, reset_live_session_results: controlState,
    join_live_session: { token, state: participantState },
    get_live_state: participantState, submit_live_response: participantState,
    get_projector_state: projectorState, list_live_sessions: [],
    get_live_sets: [], save_live_set: { id, sets: [] }, delete_live_set: [],
  }

  it.each(Object.keys(examples) as LiveRpcName[])('%s acepta su estructura', (name) => {
    expect(liveRpcOutputSchemas[name].safeParse(examples[name]).success).toBe(true)
  })

  it('acepta estados vacíos, resultados ocultos y sesión terminada', () => {
    expect(liveRpcOutputSchemas.get_offering_live_session.safeParse(null).success).toBe(true)
    expect(liveRpcOutputSchemas.get_live_state.safeParse({ ...participantState, run: null, my_response: null }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState, run: { ...run, results: null } }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ session: { code, status: 'ended' }, run: null }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_live_control_state.safeParse({ ...controlState, runs: [], activities: [], participant_count: 0 }).success).toBe(true)
  })

  it('acepta filas de escala y nube, y respuestas ocultas solo en control', () => {
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState,
      run: { ...run, type: 'scale', config: { scale_min: 1, scale_max: 5 },
        results: { total: 1, rows: [{ value: 3, count: 1, percent: 100 }], average: 3, responses: [] } },
    }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_live_control_state.safeParse({ ...controlState,
      runs: [{ ...run, activity_id: id, type: 'wordcloud', config: { max_answers: 3 },
        results: { total: 1, rows: [{ term: 'lima', count: 1 }], average: null, responses: [] } }],
    }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_live_control_state.safeParse({ ...controlState,
      runs: [{ ...run, activity_id: id, results: { ...results,
        responses: [{ ...response, hidden: true, participant_name: 'Ana' }] } }],
    }).success).toBe(true)
  })

  it('rechaza campos ajenos a las salidas SQL', () => {
    expect(liveRpcOutputSchemas.get_live_state.safeParse({ ...participantState, run: { ...run, paused: undefined } }).success).toBe(false)
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState, run: { ...run, paused: true } }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_live_control_state.safeParse({ ...controlState, runs: [{ ...controlState.runs[0], paused: true }] }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_live_state.safeParse({ ...participantState,
      participant: { ...participantState.participant, token_hash: token } }).success).toBe(false)
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState,
      session: { ...projectorState.session, offering_id: id } }).success).toBe(false)
    expect(liveRpcOutputSchemas.get_live_activities.safeParse([{ ...activity, tenant_id: id }]).success).toBe(false)
    expect(liveRpcOutputSchemas.get_live_control_state.safeParse({ ...controlState,
      runs: [{ ...controlState.runs[0], token_hash: token }] }).success).toBe(false)
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState,
      run: { ...run, results: { ...results, responses: [{ ...response, participant_name: 'Ana' }] } } }).success).toBe(false)
    expect(liveRpcOutputSchemas.get_live_state.safeParse({ ...participantState,
      run: { ...run, results: { ...results, responses: [{ ...response, hidden: true }] } } }).success).toBe(false)
  })

  it('acepta la configuración pública ciega y resultados de quiz y comparativa', () => {
    const quiz = { options: [{ id: 'a', label: 'Sí' }, { id: 'b', label: 'No' }], correct: 'a', seconds: 30, explanation: 'Porque sí' }
    const quizRows = [{ id: 'a', label: 'Sí', count: 1, percent: 100, correct: null }, { id: 'b', label: 'No', count: 0, percent: 0, correct: null }]
    const publicQuiz = { ...run, type: 'quiz', config: { options: quiz.options, seconds: 30 }, results: { total: 1, rows: quizRows, average: null, responses: [] } }
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState, run: publicQuiz }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_live_state.safeParse({ ...participantState, run: publicQuiz }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState, run: { ...publicQuiz, config: quiz } }).success).toBe(false)
    expect(liveRpcOutputSchemas.get_live_control_state.safeParse({ ...controlState, runs: [{ ...run, activity_id: id, type: 'quiz', config: quiz,
      results: { ...publicQuiz.results, correct_percent: 100, avg_seconds: 2, rows: quizRows.map((row) => ({ ...row, correct: row.id === 'a' })) } }] }).success).toBe(true)

    const compare = { options: [{ id: 'a', label: 'Modelo A', content: 'Texto', real_name: 'GPT' }, { id: 'b', label: 'Modelo B', content: 'Otro', real_name: 'Gemini' }],
      criteria: [{ id: 'claridad', label: 'Claridad', description: 'Se entiende' }], final_question: '¿Cuál prefieres?', ask_comment: true, comment_max: 200 }
    const matrix = compare.options.map((option) => ({ option_id: option.id, label: option.label, real_name: null,
      criteria: [{ criterion_id: 'claridad', average: 4 }], overall: 4, votes: option.id === 'a' ? 1 : 0, vote_percent: option.id === 'a' ? 100 : 0 }))
    const publicCompare = { ...run, type: 'compare', config: { ...compare, options: compare.options.map((option) => ({ id: option.id, label: option.label, content: option.content })) },
      results: { total: 1, rows: [], average: null, responses: [], matrix } }
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState, run: publicCompare }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState, run: { ...publicCompare, config: compare } }).success).toBe(false)
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState, run: { ...publicCompare, results: { ...publicCompare.results, comments: ['Bien'] } } }).success).toBe(false)
    expect(liveRpcOutputSchemas.get_projector_state.safeParse({ ...projectorState, run: { ...publicCompare, reveal: true,
      config: compare, results: { ...publicCompare.results, comments: ['Bien'], matrix: matrix.map((row) => ({ ...row, real_name: row.option_id === 'a' ? 'GPT' : 'Gemini' })) } } }).success).toBe(true)
  })

  it('valida ranking y nuevas entradas', () => {
    const rank = { participant_id: id, name: 'Ana', points: 950, correct: 1, answered: 1, best_streak: 1, rank: 1 }
    expect(liveRpcOutputSchemas.get_live_state.safeParse({ ...participantState, ranking: [rank], my_rank: { rank: 1, points: 950, streak_current: 1 } }).success).toBe(true)
    expect(liveRpcOutputSchemas.get_live_state.safeParse({ ...participantState, ranking: [{ ...rank, secret: true }] }).success).toBe(false)
    expect(liveRpcInputSchemas.set_live_run_reveal.safeParse({ p_run_id: id, p_reveal: true }).success).toBe(true)
    expect(liveRpcInputSchemas.set_live_run_ranking.safeParse({ p_run_id: id, p_show: true }).success).toBe(true)
  })
})
