import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui'
import { readableError } from '@/features/courses/schemas'
import { useUpdateStudent } from './api'

export type StudentEditValues = {
  full_name: string
  phone: string
  job_title: string
  company: string
}

type Props = {
  offeringId: string
  enrollmentId: string
  initial: StudentEditValues
  onDone: () => void
}

export function StudentEditForm({ offeringId, enrollmentId, initial, onDone }: Props) {
  const { t } = useTranslation()
  const update = useUpdateStudent(offeringId)
  const [values, setValues] = useState<StudentEditValues>(initial)
  const [error, setError] = useState('')
  const nameMissing = values.full_name.trim() === ''

  function set(field: keyof StudentEditValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (nameMissing) return
    try {
      await update.mutateAsync({ enrollmentId, ...values })
      onDone()
    } catch (cause) {
      setError(readableError(cause) || t('teacherOfferings.editStudentError'))
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3" noValidate>
      <Input label={t('teacherOfferings.studentName')} value={values.full_name} maxLength={120}
        error={nameMissing ? t('teacherOfferings.studentNameRequired') : undefined}
        onChange={(event) => set('full_name', event.target.value)} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label={t('teacherOfferings.studentPhone')} value={values.phone} maxLength={30}
          onChange={(event) => set('phone', event.target.value)} />
        <Input label={t('teacherOfferings.studentJob')} value={values.job_title} maxLength={120}
          onChange={(event) => set('job_title', event.target.value)} />
        <Input label={t('teacherOfferings.studentCompany')} value={values.company} maxLength={120}
          onChange={(event) => set('company', event.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={update.isPending || nameMissing}>
          {update.isPending ? t('teacherOfferings.savingStudent') : t('teacherOfferings.saveStudent')}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t('teacherOfferings.cancelEdit')}
        </Button>
      </div>
    </form>
  )
}
