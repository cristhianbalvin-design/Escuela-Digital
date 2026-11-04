import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { issueAndRender } from '@/features/certificates/certificates-api'
import { shownEmail } from '@/lib/placeholder-email'
import { useTenantIssuable } from './admin-api'
import { groupIssuables } from './admin-utils'

type Outcome = { ok: number; failed: { name: string; message: string }[] }

export function IssuePanel({ tenantId }: { tenantId: string | undefined }) {
  const { t } = useTranslation()
  const { search } = useLocation()
  const cache = useQueryClient()
  const query = useTenantIssuable(tenantId)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const rows = query.data ?? []
  const groups = groupIssuables(rows)
  const chosen = rows.filter((row) => selected.has(row.enrollment_id))

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  async function issueChosen() {
    if (running || chosen.length === 0) return
    setRunning(true)
    setProgress(0)
    setOutcome(null)
    const result: Outcome = { ok: 0, failed: [] }
    for (const row of chosen) {
      try {
        const renderError = await issueAndRender(row.enrollment_id)
        if (renderError) result.failed.push({ name: row.full_name, message: renderError })
        else result.ok += 1
      } catch (cause) {
        result.failed.push({
          name: row.full_name,
          message: cause instanceof Error ? cause.message : t('adminViews.issue.rowError'),
        })
      }
      setProgress((value) => value + 1)
    }
    setSelected(new Set())
    setOutcome(result)
    setRunning(false)
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['tenant-issuable', tenantId] }),
      cache.invalidateQueries({ queryKey: ['tenant-certificates', tenantId] }),
      cache.invalidateQueries({ queryKey: ['certificates'] }),
    ])
  }

  if (query.isPending) return <Skeleton className="h-48" />
  if (query.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{t('adminViews.loadError')}</p>
        <Button variant="secondary" className="w-fit" onClick={() => void query.refetch()}>{t('retry')}</Button>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      <p className="text-text-muted">{t('adminViews.issue.hint')}</p>
      <div aria-live="polite" className="grid gap-1">
        {running && (
          <p role="status">{t('adminViews.issue.progress', { done: progress, total: chosen.length })}</p>
        )}
        {outcome && (
          <>
            <p role="status" className="font-semibold">
              {t('adminViews.issue.done', { count: outcome.ok })}
            </p>
            {outcome.failed.length > 0 && (
              <ul role="alert" className="list-disc pl-5 text-sm text-error">
                {outcome.failed.map((item, index) => (
                  <li key={`${item.name}-${index}`}>{item.name}: {item.message}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t('adminViews.issue.empty')} description={t('adminViews.issue.emptyHint')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={running}
              onClick={() => toggle(rows.map((row) => row.enrollment_id), chosen.length !== rows.length)}>
              {t(chosen.length === rows.length ? 'adminViews.issue.clearAll' : 'adminViews.issue.selectAll')}
            </Button>
            <Button disabled={running || chosen.length === 0} onClick={() => void issueChosen()}>
              {t('adminViews.issue.issueSelected', { count: chosen.length })}
            </Button>
          </div>
          {groups.map((group) => {
            const ids = group.rows.map((row) => row.enrollment_id)
            const all = ids.every((id) => selected.has(id))
            return (
              <Card key={group.offeringId} className="grid gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex min-h-11 items-center gap-2 font-semibold">
                    <input type="checkbox" checked={all} disabled={running}
                      onChange={(event) => toggle(ids, event.target.checked)} />
                    <span>
                      <Link to={{ pathname: `/docente/ediciones/${group.offeringId}`, search }}
                        className="text-brand underline">{group.title}</Link>
                      <span className="block text-sm font-normal text-text-muted">
                        {group.clientName} · {t('adminViews.issue.count', { count: group.rows.length })}
                      </span>
                    </span>
                  </label>
                </div>
                <ul className="grid gap-1 pl-1">
                  {group.rows.map((row) => (
                    <li key={row.enrollment_id}>
                      <label className="flex min-h-11 items-center gap-2">
                        <input type="checkbox" checked={selected.has(row.enrollment_id)} disabled={running}
                          onChange={(event) => toggle([row.enrollment_id], event.target.checked)} />
                        <span className="min-w-0 break-words">
                          {row.full_name.trim() || row.email}
                          <span className="block text-sm text-text-muted">{shownEmail(row.email)}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </>
      )}
    </div>
  )
}
