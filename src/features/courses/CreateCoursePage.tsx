import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { useTenantAccess } from '@/features/tenants'
import { supabase } from '@/lib/supabase'
import { courseSchema, readableError, slugify, type CourseValues } from './schemas'
import { useCreateCourse } from './api'

export function CreateCoursePage() {
  const { search } = useLocation()
  const { t } = useTranslation()
  const tenantId = useTenantAccess().active?.tenant_id
  const mutation = useCreateCourse(tenantId)
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [slugEdited, setSlugEdited] = useState(false)
  const form = useForm<CourseValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: '', slug: '', category: '', level: '', language: 'es',
      structure: 'empty', weeks: 4,
    },
  })
  const values = form.watch()

  if (!supabase || !tenantId) {
    return <EmptyState title={t('teacherCommon.connect')} />
  }

  async function next() {
    const valid = await form.trigger(
      step === 1
        ? ['title', 'slug', 'language']
        : ['structure', 'weeks'],
    )
    if (valid) setStep((current) => Math.min(3, current + 1))
  }

  async function submit(data: CourseValues) {
    const courseId = await mutation.mutateAsync(data)
    navigate({ pathname: `/docente/cursos/${courseId}`, search })
  }

  return (
    <section className="mx-auto grid max-w-2xl gap-5">
      <Link to={{ pathname: '/docente/cursos', search }} className="min-h-11 text-brand underline">
        {t('teacherCommon.back')}
      </Link>
      <h1 className="font-heading text-2xl font-bold">{t('teacherCourses.create')}</h1>
      <p>{t('teacherCommon.step', { number: step })}</p>
      <Card>
        <form noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-4">
          {step === 1 && (
            <>
              <Input label={t('teacherCourses.courseTitle')}
                error={form.formState.errors.title?.message}
                {...form.register('title', {
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                    if (!slugEdited) form.setValue('slug', slugify(event.target.value), {
                      shouldValidate: true,
                    })
                  },
                })} />
              <Input label={t('teacherCourses.slug')}
                error={form.formState.errors.slug?.message}
                {...form.register('slug', { onChange: () => setSlugEdited(true) })} />
              <Input label={t('teacherCourses.category')} {...form.register('category')} />
              <Input label={t('teacherCourses.level')} {...form.register('level')} />
              <Input label={t('teacherCourses.language')}
                error={form.formState.errors.language?.message}
                {...form.register('language')} />
            </>
          )}
          {step === 2 && (
            <>
              <label className="grid gap-1 text-sm font-semibold" htmlFor="course-structure">
                {t('teacherCourses.structure')}
              </label>
              <select id="course-structure" className="min-h-11 rounded-control border border-border bg-surface px-3 focus-visible:outline-3"
                {...form.register('structure')}>
                <option value="empty">{t('teacherCourses.emptyStructure')}</option>
                <option value="weekly">{t('teacherCourses.weeklyStructure')}</option>
              </select>
              {values.structure === 'weekly' && (
                <Input type="number" min={1} max={52}
                  label={t('teacherCourses.weeks')}
                  error={form.formState.errors.weeks?.message}
                  {...form.register('weeks')} />
              )}
            </>
          )}
          {step === 3 && (
            <div className="grid gap-2">
              <h2 className="font-bold">{t('teacherCourses.summary')}</h2>
              <p>{values.title}</p>
              <p>{values.slug}</p>
              <p>{values.structure === 'weekly'
                ? t('teacherCourses.weeklyCount', { count: Number(values.weeks) })
                : t('teacherCourses.emptyStructure')}</p>
            </div>
          )}
          {mutation.isError && (
            <p role="alert" className="text-error">{readableError(mutation.error)}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {step > 1 && (
              <Button variant="secondary" onClick={() => setStep(step - 1)}>
                {t('teacherCommon.previous')}
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={() => void next()}>{t('teacherCommon.next')}</Button>
            ) : (
              <Button type="submit" disabled={mutation.isPending}>
                {t('teacherCourses.finish')}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </section>
  )
}
