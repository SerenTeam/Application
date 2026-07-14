import { z } from 'zod'
import type { Strings } from '@/i18n/strings.fr'

// ─── Schémas paramétrés par langue ───────────────────────────────────────
// Les messages zod ne peuvent pas être figés à l'import (ils dépendent de la
// langue active) : chaque écran appelle `makeSchemas(t)` avec son `useT()`.

export function makeSchemas(t: Strings) {
  const emailSchema = z
    .string()
    .min(1, t.validation.emailRequired)
    .email(t.validation.emailInvalid)

  const passwordSchema = z
    .string()
    .min(8, t.validation.passwordMinLength)
    .regex(/[A-Z]/, t.validation.passwordUppercase)
    .regex(/\d/, t.validation.passwordDigit)
    .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, t.validation.passwordSpecialChar)

  const signupSchema = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      confirmPassword: z.string(),
      acceptCGU: z.literal(true, {
        errorMap: () => ({ message: t.validation.acceptCguRequired }),
      }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t.validation.passwordsMismatch,
      path: ['confirmPassword'],
    })

  const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, t.validation.passwordRequired),
  })

  const resetPasswordRequestSchema = z.object({
    email: emailSchema,
  })

  const resetPasswordConfirmSchema = z
    .object({
      password: passwordSchema,
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t.validation.passwordsMismatch,
      path: ['confirmPassword'],
    })

  const changePasswordSchema = z
    .object({
      currentPassword: z.string().min(1, t.validation.currentPasswordRequired),
      newPassword: passwordSchema,
      confirmNewPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
      message: t.validation.passwordsMismatch,
      path: ['confirmNewPassword'],
    })

  return {
    emailSchema,
    passwordSchema,
    signupSchema,
    loginSchema,
    resetPasswordRequestSchema,
    resetPasswordConfirmSchema,
    changePasswordSchema,
  }
}

export type SignupFormValues = z.infer<ReturnType<typeof makeSchemas>['signupSchema']>
export type LoginFormValues = z.infer<ReturnType<typeof makeSchemas>['loginSchema']>
export type ResetPasswordRequestValues = z.infer<ReturnType<typeof makeSchemas>['resetPasswordRequestSchema']>
export type ResetPasswordConfirmValues = z.infer<ReturnType<typeof makeSchemas>['resetPasswordConfirmSchema']>
export type ChangePasswordValues = z.infer<ReturnType<typeof makeSchemas>['changePasswordSchema']>
