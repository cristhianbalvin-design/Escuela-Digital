import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Card, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import {
  formatPct,
  formatSessionDate,
  STATUSES,
} from '@/features/attendance/attendance-utils'

const schema = z.object({
  pct: z.number().nullable(),
  sessions: z.array(
    z.object({
      title: z.string(),
      session_date: z.string(),
      status: z.enum(STATUSES),
    }),
  ),
})

function useMyAttendance(enrollmentId: string) {
  return useQuery({
    queryKey: ['student-attendance', enrollmentId],
    enabled: !!supabase,
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase no está configurado')
      const { data, error } = await supabase.rpc('get_my_attendance', {
        p_enrollment_id: enrollmentId,
      })
      if (error) throw error
      return schema.parse(data)
    },
  })
}

export function MyAttendancePanel({ enrollmentId }: { enrollmentId: string }) {
  const { t } = useTranslation()
  const q = useMyAttendance(enrollmentId)
  if (q.isPending) return <Skeleton className="h-24" />
  if (q.isError) {
    return (
      <Card className="grid gap-3">
        <p role="alert">{t('student.attendanceError')}</p>
        <Button onClick={() => void q.refetch()}>{t('retry')}</Button>
      </Card>
    )
  }
  const { pct, sessions } = q.data
  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">{t('student.myAttendance')}</h2>
        <p className="font-semibold">{formatPct(pct)}</p>
      </div>
      {sessions.length === 0 ? (
        <p>{t('student.attendanceEmpty')}</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {sessions.map((s, i) => (
            <li key={`${s.session_date}-${i}`}
              className="flex justify-between gap-3 border-b border-border py-2">
              <span>{s.title} · {formatSessionDate(s.session_date)}</span>
              <span className="font-semibold">{t(`attendance.status.${s.status}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
