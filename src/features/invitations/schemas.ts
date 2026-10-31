import { z } from 'zod'
import i18n from '@/lib/i18n'

export const invitationSignupSchema = z.object({
  fullName: z.string().trim().max(120, i18n.t('invitations.nameTooLong')),
  password: z.string()
    .min(8, i18n.t('invitations.passwordTooShort'))
    .max(72, i18n.t('invitations.passwordTooLong')),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: i18n.t('invitations.passwordMismatch'),
})

export type InvitationSignupValues = z.infer<typeof invitationSignupSchema>
