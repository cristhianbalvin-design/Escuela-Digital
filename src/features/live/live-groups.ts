export function groupLiveActivities<T extends { plan_item_id: string | null; position: number }>(
  activities: readonly T[], planItems: readonly { id: string; title: string }[], selectedId?: string | null,
): { id: string | null; title: string | null; activities: T[] }[] {
  const ordered = [...activities].sort((a, b) => a.position - b.position)
  const ids = selectedId ? [selectedId] : [
    ...planItems.map((item) => item.id),
    ...ordered.map((item) => item.plan_item_id).filter((id): id is string => id !== null && !planItems.some((item) => item.id === id)),
    null,
  ]
  return [...new Set(ids)].map((id) => ({
    id, title: planItems.find((item) => item.id === id)?.title ?? null,
    activities: ordered.filter((item) => item.plan_item_id === id),
  })).filter((group) => selectedId !== undefined && selectedId !== null || group.activities.length > 0)
}

export function runsForPlanItem<T extends { activity_id: string }, A extends { id: string; plan_item_id: string | null }>(
  runs: readonly T[], activities: readonly A[], planItemId: string | null,
): T[] {
  const ids = new Set(activities.filter((item) => item.plan_item_id === planItemId).map((item) => item.id))
  return runs.filter((run) => ids.has(run.activity_id))
}
