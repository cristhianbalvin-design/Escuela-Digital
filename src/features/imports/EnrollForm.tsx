import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input } from '@/components/ui'
import { useImportParticipants } from './import-api'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMPTY = { email: '', full_name: '', phone: '', job_title: '', company: '' }

export function EnrollForm({ offeringId }: { offeringId: string }) {
  const { t } = useTranslation()
  const run = useImportParticipants(offeringId)
  const [values, setValues] = useState(EMPTY)
  const [touched, setTouched] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const email = values.email.trim().toLowerCase()
  const name = values.full_name.trim()
  // Se necesita el correo o, si no se tiene, al menos el nombre.
  const emailInvalid = email !== '' && !EMAIL.test(email)
  const identityMissing = email === '' && name === ''
  const emailError = touched && emailInvalid
  const nameError = touched && identityMissing

  function set(key: keyof typeof EMPTY, value: string) {
    setMessage(null)
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function submit() {
    setTouched(true)
    setMessage(null)
    if (emailInvalid || identityMissing) return
    try {
      const [result] = await run.mutateAsync({
        rows: [{
          line: 2, email, full_name: name, phone: values.phone.trim(),
          job_title: values.job_title.trim(), company: values.company.trim(),
          scores: {}, errors: [],
        }],
        onProgress: () => undefined,
      })
      if (!result || result.status === 'error') {
        setMessage({ ok: false, text: result?.error ?? t('enrollForm.failed') })
        return
      }
      setMessage({
        ok: true,
        text: email === ''
          ? t(result.account_created ? 'enrollForm.createdNoEmail' : 'enrollForm.enrolledNoEmail', { name })
          : t(result.account_created ? 'enrollForm.createdNew' : 'enrollForm.enrolledExisting', { email }),
      })
      setValues(EMPTY)
      setTouched(false)
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : t('enrollForm.failed') })
    }
  }

  return (
    <Card className="grid gap-4">
      <div>
        <h2 className="text-lg font-bold">{t('enrollForm.title')}</h2>
        <p className="text-sm text-text-muted">{t('enrollForm.hint')}</p>
      </div>
      <form noValidate className="grid gap-4"
        onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <Input id="enroll-email" type="email" label={t('enrollForm.email')} value={values.email}
          autoComplete="off" error={emailError ? t('enrollForm.emailError') : undefined}
          onChange={(event) => set('email', event.target.value)} />
        <Input id="enroll-name" label={t('enrollForm.name')} value={values.full_name} maxLength={120}
          error={nameError ? t('enrollForm.identityError') : undefined}
          onChange={(event) => set('full_name', event.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input id="enroll-phone" type="tel" label={t('enrollForm.phone')} value={values.phone}
            maxLength={30} onChange={(event) => set('phone', event.target.value)} />
          <Input id="enroll-job" label={t('enrollForm.job')} value={values.job_title}
            maxLength={120} onChange={(event) => set('job_title', event.target.value)} />
        </div>
        <Input id="enroll-company" label={t('enrollForm.company')} value={values.company}
          maxLength={120} onChange={(event) => set('company', event.target.value)} />
        <p className="text-sm text-text-muted">{t('enrollForm.optional')}</p>
        <div aria-live="polite">
          {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
        </div>
        <Button type="submit" className="w-fit" disabled={run.isPending}>
          {run.isPending ? t('enrollForm.saving') : t('enrollForm.submit')}
        </Button>
      </form>
    </Card>
  )
}
