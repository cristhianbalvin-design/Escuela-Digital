import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui'
import { useClients } from '@/features/clients/clients-api'
import { useTenantAccess } from '@/features/tenants'
import {
  useInvitePerson, usePlaceholderStudents, useRevokeInvitation, useSchoolPeople,
  useSetMemberAccess, useSetMemberStatus, useSetStudentEmail,
} from './people-api'
import {
  EDITABLE_ROLES, INVITE_ROLES, canEditMember, inviteLink, invitationsOf, isAcademicCoordinator,
  isValidEmail, memberName, membersOf, peopleErrorKey, type PeopleTab,
} from './people-utils'

const selectClass = 'min-h-11 w-full min-w-0 rounded-control border border-border bg-transparent px-2'
const TABS: PeopleTab[] = ['instructors', 'coordinators', 'admins', 'noEmail']

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function PeoplePage() {
  const { t } = useTranslation()
  const access = useTenantAccess()
  const active = access.active
  const tenantId = active?.tenant_id
  const [tab, setTab] = useState<PeopleTab>('instructors')

  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-2xl font-bold">{t('peopleViews.title')}</h1>
      <p className="text-text-muted">{t('peopleViews.hint')}</p>
      <div role="tablist" aria-label={t('peopleViews.title')} className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Button key={item} role="tab" aria-selected={tab === item}
            variant={tab === item ? 'primary' : 'secondary'} onClick={() => setTab(item)}>
            {t(`peopleViews.tab.${item}`)}
          </Button>
        ))}
      </div>
      {tab === 'noEmail'
        ? <NoEmailPanel tenantId={tenantId} />
        : <TeamPanel key={tab} tab={tab} tenantId={tenantId} tenantSlug={active?.slug ?? null}
          viewerIsOwner={active?.role === 'owner' || access.isPlatformAdmin} />}
    </section>
  )
}

function TeamPanel({ tab, tenantId, tenantSlug, viewerIsOwner }: {
  tab: Exclude<PeopleTab, 'noEmail'>
  tenantId: string | undefined
  tenantSlug: string | null
  viewerIsOwner: boolean
}) {
  const { t } = useTranslation()
  const people = useSchoolPeople(tenantId)
  const clients = useClients(tab === 'coordinators' ? tenantId : undefined)
  const invite = useInvitePerson(tenantId)
  const setStatus = useSetMemberStatus(tenantId)
  const setAccess = useSetMemberAccess(tenantId)
  const revoke = useRevokeInvitation(tenantId)
  const roles = INVITE_ROLES[tab]
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(roles[0]!)
  const [clientId, setClientId] = useState('')
  const [emailError, setEmailError] = useState('')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')

  const activeClients = (clients.data ?? []).filter((item) => item.status === 'active')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setLink('')
    if (!isValidEmail(email)) {
      setEmailError(t('peopleViews.emailInvalid'))
      return
    }
    if (tab === 'coordinators' && !clientId) {
      setMessage(t('peopleViews.errors.chooseClient'))
      return
    }
    setEmailError('')
    try {
      const created = await invite.mutateAsync({
        email, role, clientId: tab === 'coordinators' ? clientId : undefined,
      })
      setLink(inviteLink(window.location.origin, created.token, tenantSlug))
      setEmail('')
    } catch (cause) {
      setMessage(t(peopleErrorKey(cause)))
    }
  }

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(link)
      setMessage(t('peopleViews.copied'))
    } catch {
      setMessage(t('peopleViews.selectToCopy'))
    }
  }

  async function changeStatus(userId: string, status: 'active' | 'suspended') {
    setMessage('')
    try {
      await setStatus.mutateAsync({ userId, status })
    } catch (cause) {
      setMessage(t(peopleErrorKey(cause)))
    }
  }

  async function changeAccess(userId: string, change: { role?: string; canIssue?: boolean }) {
    setMessage('')
    try {
      await setAccess.mutateAsync({ userId, ...change })
    } catch (cause) {
      setMessage(t(peopleErrorKey(cause)))
    }
  }

  async function revokeInvitation(id: string) {
    setMessage('')
    try {
      await revoke.mutateAsync(id)
    } catch (cause) {
      setMessage(t(peopleErrorKey(cause)))
    }
  }

  const members = people.data ? membersOf(people.data, tab) : []
  const pending = people.data ? invitationsOf(people.data, tab) : []

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <h2 className="font-heading text-lg font-bold">{t(`peopleViews.invite.${tab}`)}</h2>
        <form noValidate onSubmit={(event) => { void submit(event) }}
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t('peopleViews.email')} type="email" value={email} error={emailError}
              autoComplete="off" onChange={(event) => setEmail(event.target.value)} />
            {tab === 'instructors' && (
              <label className="grid gap-1.5 text-sm font-semibold">
                {t('peopleViews.roleLabel')}
                <select value={role} onChange={(event) => setRole(event.target.value)}
                  className={`${selectClass} font-normal`}>
                  {roles.map((item) => (
                    <option key={item} value={item}>{t(`peopleViews.role.${item}`)}</option>
                  ))}
                </select>
              </label>
            )}
            {tab === 'coordinators' && (
              <label className="grid gap-1.5 text-sm font-semibold">
                {t('peopleViews.client')}
                <select value={clientId} onChange={(event) => setClientId(event.target.value)}
                  className={`${selectClass} font-normal`}>
                  <option value="">{t('peopleViews.chooseClient')}</option>
                  {activeClients.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? t('peopleViews.generating') : t('peopleViews.generate')}
          </Button>
        </form>
        {link && (
          <div className="grid gap-2 rounded-control border border-border p-3">
            <p className="text-sm">{t('peopleViews.oneTime')}</p>
            <div className="flex flex-wrap gap-2">
              <input readOnly value={link} aria-label={t('peopleViews.link')}
                onFocus={(event) => event.currentTarget.select()}
                className="min-h-11 min-w-0 flex-1 basis-64 rounded-control border border-border bg-transparent px-2 text-sm" />
              <Button variant="secondary" onClick={() => void copy()}>{t('peopleViews.copy')}</Button>
            </div>
          </div>
        )}
        {tab === 'admins' && <p className="text-sm text-text-muted">{t('peopleViews.adminsHint')}</p>}
        <span role="status" className="text-sm text-text-muted">{message}</span>
      </Card>

      {people.isPending ? <Skeleton className="h-40" /> : people.isError ? (
        <Card className="grid gap-3">
          <p role="alert">{t('peopleViews.loadError')}</p>
          <Button variant="secondary" className="w-fit" onClick={() => void people.refetch()}>{t('retry')}</Button>
        </Card>
      ) : (
        <>
          {members.length === 0 ? (
            <EmptyState title={t(`peopleViews.empty.${tab}`)} description={t('peopleViews.emptyHint')} />
          ) : (
            <ul className="grid gap-2">
              {members.map((member) => {
                const locked = member.role === 'owner'
                return (
                  <li key={member.user_id}>
                    <Card className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="break-words font-semibold">{memberName(member)}</p>
                        {member.full_name && <p className="break-words text-sm text-text-muted">{member.email}</p>}
                        {member.clients.length > 0 && (
                          <p className="text-sm text-text-muted">{member.clients.join(', ')}</p>
                        )}
                        {tab === 'instructors' && (
                          <p className="text-sm text-text-muted">{t('peopleViews.teaches', { count: member.teaches })}</p>
                        )}
                      </div>
                      {canEditMember(member, viewerIsOwner) ? (
                        <select aria-label={t('peopleViews.roleLabel')} value={member.role}
                          disabled={setAccess.isPending}
                          onChange={(event) => void changeAccess(member.user_id, { role: event.target.value })}
                          className="min-h-11 rounded-control border border-border bg-transparent px-2 text-sm">
                          {EDITABLE_ROLES.filter((item) => item !== 'admin' || viewerIsOwner).map((item) => (
                            <option key={item} value={item}>{t(`peopleViews.role.${item}`)}</option>
                          ))}
                        </select>
                      ) : (
                        <Badge status="neutral">{t(`peopleViews.role.${member.role}`)}</Badge>
                      )}
                      {member.teaches > 0 && member.role !== 'instructor' && member.role !== 'instructor_guest' && (
                        <Badge status="info">{t('peopleViews.teachesBadge', { count: member.teaches })}</Badge>
                      )}
                      {isAcademicCoordinator(member) && (
                        <Badge status="info">{t('peopleViews.academicCoordinator')}</Badge>
                      )}
                      <Badge status={member.status === 'active' ? 'success' : 'warning'}>
                        {t(`peopleViews.status.${member.status}`)}
                      </Badge>
                      {canEditMember(member, viewerIsOwner) && member.role !== 'admin' && (
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input type="checkbox" checked={member.can_issue}
                            disabled={setAccess.isPending}
                            onChange={(event) => void changeAccess(member.user_id, { canIssue: event.target.checked })} />
                          {t('peopleViews.canIssue')}
                        </label>
                      )}
                      {!locked && (
                        <Button variant="secondary" disabled={setStatus.isPending}
                          onClick={() => void changeStatus(member.user_id,
                            member.status === 'active' ? 'suspended' : 'active')}>
                          {t(member.status === 'active' ? 'peopleViews.suspend' : 'peopleViews.reactivate')}
                        </Button>
                      )}
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
          {pending.length > 0 && (
            <div className="grid gap-2">
              <h2 className="font-heading text-lg font-bold">{t('peopleViews.pending')}</h2>
              <ul className="grid gap-2">
                {pending.map((item) => (
                  <li key={item.id}>
                    <Card className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="break-words font-semibold">{item.email}</p>
                        <p className="text-sm text-text-muted">
                          {t(`peopleViews.role.${item.role}`)}
                          {item.client_name ? ` · ${item.client_name}` : ''}
                          {' · '}{t('peopleViews.expires', { date: formatDate(item.expires_at) })}
                        </p>
                      </div>
                      <Badge status={item.expired ? 'error' : 'info'}>
                        {t(item.expired ? 'peopleViews.expired' : 'peopleViews.pendingBadge')}
                      </Badge>
                      <Button variant="secondary" disabled={revoke.isPending}
                        onClick={() => void revokeInvitation(item.id)}>
                        {t('peopleViews.revoke')}
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-text-muted">{t('peopleViews.regenerateHint')}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function NoEmailPanel({ tenantId }: { tenantId: string | undefined }) {
  const { t } = useTranslation()
  const list = usePlaceholderStudents(tenantId, true)
  const setEmail = useSetStudentEmail(tenantId)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState('')

  async function save(userId: string) {
    const value = (drafts[userId] ?? '').trim()
    setDone('')
    if (!isValidEmail(value)) {
      setErrors((current) => ({ ...current, [userId]: t('peopleViews.emailInvalid') }))
      return
    }
    setErrors((current) => ({ ...current, [userId]: '' }))
    try {
      await setEmail.mutateAsync({ userId, email: value })
      setDone(t('peopleViews.noEmail.saved', { email: value }))
      setDrafts((current) => ({ ...current, [userId]: '' }))
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : ''
      setErrors((current) => ({
        ...current,
        [userId]: t(text === 'email_exists' ? 'peopleViews.noEmail.exists' : 'peopleViews.errors.generic'),
      }))
    }
  }

  if (list.isPending) return <Skeleton className="h-40" />
  if (list.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{t('peopleViews.loadError')}</p>
        <Button variant="secondary" className="w-fit" onClick={() => void list.refetch()}>{t('retry')}</Button>
      </Card>
    )
  }
  return (
    <div className="grid gap-3">
      <p className="text-text-muted">{t('peopleViews.noEmail.hint')}</p>
      <span role="status" className="text-sm text-success">{done}</span>
      {list.data.length === 0 ? (
        <EmptyState title={t('peopleViews.noEmail.empty')} />
      ) : (
        <ul className="grid gap-2">
          {list.data.map((student) => (
            <li key={student.user_id}>
              <Card className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="break-words font-semibold">{student.full_name ?? '—'}</p>
                  {student.clients.length > 0 && (
                    <p className="text-sm text-text-muted">{student.clients.join(', ')}</p>
                  )}
                </div>
                <div className="min-w-0 flex-1 basis-64">
                  <Input label={t('peopleViews.email')} type="email" autoComplete="off"
                    value={drafts[student.user_id] ?? ''} error={errors[student.user_id] || undefined}
                    onChange={(event) => setDrafts((current) => ({ ...current, [student.user_id]: event.target.value }))} />
                </div>
                <Button className="mt-6" disabled={setEmail.isPending} onClick={() => void save(student.user_id)}>
                  {t('peopleViews.noEmail.save')}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
