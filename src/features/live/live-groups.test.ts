import { describe, expect, it } from 'vitest'
import { groupLiveActivities, runsForPlanItem } from './live-groups'

describe('actividades por ítem de la guía', () => {
  const activities = [
    { id: 'b', plan_item_id: 'dos', position: 2 },
    { id: 'a', plan_item_id: 'uno', position: 1 },
    { id: 'c', plan_item_id: 'dos', position: 3 },
    { id: 'd', plan_item_id: null, position: 4 },
  ]
  const plan = [{ id: 'uno', title: 'Inicio' }, { id: 'dos', title: 'Práctica' }]

  it('ordena por guía y deja las actividades sin vincular al final', () => {
    expect(groupLiveActivities(activities, plan).map((group) => [group.title, group.activities.map((a) => a.id)]))
      .toEqual([['Inicio', ['a']], ['Práctica', ['b', 'c']], [null, ['d']]])
  })

  it('aísla el ítem seleccionado y sus resultados', () => {
    expect(groupLiveActivities(activities, plan, 'dos')[0]?.activities.map((a) => a.id)).toEqual(['b', 'c'])
    expect(runsForPlanItem([{ activity_id: 'a' }, { activity_id: 'c' }], activities, 'dos'))
      .toEqual([{ activity_id: 'c' }])
    expect(groupLiveActivities(activities, plan, 'vacío')[0]?.activities).toEqual([])
  })
})
