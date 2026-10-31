import { z } from 'zod'
import i18n from '@/lib/i18n'

export const offeringSchema = z.object({
  versionId: z.string().uuid('Elige una versión publicada'),
  clientId: z.string().uuid('Elige un cliente'),
  title: z.string().trim().min(1, 'Ingresa un título'),
  code: z.string().trim().min(1, 'Ingresa un código'),
  modality: z.enum(['self_paced', 'live', 'hybrid']),
  startsAt: z.string(),
  endsAt: z.string(),
  seats: z.string(),
  enrollmentMode: z.enum(['invite', 'code', 'csv']),
  timezone: z.string().trim().min(1, 'Ingresa una zona horaria'),
}).superRefine((value, context) => {
  if (value.startsAt && value.endsAt &&
    new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({
      code: 'custom', path: ['endsAt'],
      message: 'La fecha de cierre debe ser posterior al inicio',
    })
  }
  if (value.seats && (!Number.isInteger(Number(value.seats)) ||
    Number(value.seats) <= 0)) {
    context.addIssue({
      code: 'custom', path: ['seats'],
      message: 'El cupo debe ser un número positivo',
    })
  }
})

export const offeringInvitationSchema = z.object({
  email: z.string().trim().pipe(
    z.email(i18n.t('invitations.emailInvalid')),
  ),
})

export type OfferingValues = z.infer<typeof offeringSchema>
export type OfferingInvitationValues = z.infer<typeof offeringInvitationSchema>
