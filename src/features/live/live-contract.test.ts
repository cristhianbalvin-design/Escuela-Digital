import { describe, expect, it } from 'vitest'
import { liveRpcInputSchemas, liveRpcOutputSchemas, type LiveRpcName } from './live-contract'

const id = 'a4e2f934-65bb-4b06-a583-24200c54ab01'
const code = 'ABC234'
const token = 'a'.repeat(64)
const at = '2026-11-12T09:00:00+00:00'
const activity = { id, plan_item_id: null, title: 'Pregunta', type: 'poll_single',
  config: { options: [{ id: 'a', label: 'Sí' }, { id: 'b', label: 'No' }] }, position: 0 }
const response = { id, answer: 'a', hidden: false, pinned: false, participant_name: null }
const results = { total: 1, rows: [{ id: 'a', label: 'Sí', count: 1, percent: 100 }], average: null, responses: [] }
const run = { id, title: 'Pregunta', type: 'poll_single', config: activity.config,
  status: 'open', paused: false, show_results: true, opened_at: at, closed_at: null, results }
const controlState = {
  session: { id, offering_id: id, lesson_id: id, code, status: 'active', access_mode: 'both',
    ask_name: true, ask_company: false, created_at: at, ended_at: null },
  activities: [activity], runs: [{ ...run, activity_id: id, results: { ...results, responses: [response] } }],
  participant_count: 1,
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

  it('valida el código y el token', () => {
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

describe('salidas JSON de las 15 RPC en vivo', () => {
  const examples: Record<LiveRpcName, unknown> = {
    get_live_activities: [activity], save_live_activities: [activity],
    create_live_session: controlState, get_live_control_state: controlState,
    launch_live_run: controlState, close_live_run: controlState,
    set_live_run_visibility: controlState, moderate_live_response: controlState,
    set_live_run_paused: controlState,
    merge_live_term: controlState, end_live_session: controlState,
    join_live_session: { token, state: participantState },
    get_live_state: participantState, submit_live_response: participantState,
    get_projector_state: projectorState,
  }

  it.each(Object.keys(examples) as LiveRpcName[])('%s acepta su estructura', (name) => {
    expect(liveRpcOutputSchemas[name].safeParse(examples[name]).success).toBe(true)
  })

  it('acepta estados vacíos, resultados ocultos y sesión terminada', () => {
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
})
