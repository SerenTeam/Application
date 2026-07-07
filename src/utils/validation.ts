import { z } from 'zod'

// ─── Champs réutilisables ────────────────────────────────────────────────

/** Email — validation format uniquement (pas d'existence en base) */
export const emailSchema = z
  .string()
  .min(1, 'Veuillez renseigner votre adresse email.')
  .email('Cette adresse email n\u2019est pas valide.')

/** Mot de passe — 4 règles SER-38 */
export const passwordSchema = z
  .string()
  .min(8, 'Au moins 8 caractères')
  .regex(/[A-Z]/, 'Une majuscule requise')
  .regex(/\d/, 'Un chiffre requis')
  .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, 'Un caractère spécial requis')

// ─── Schémas formulaires ─────────────────────────────────────────────────

/** Inscription (SER-5) */
export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptCGU: z.literal(true, {
      errorMap: () => ({ message: 'Vous devez accepter les CGU pour continuer' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

export type SignupFormValues = z.infer<typeof signupSchema>

/** Connexion (SER-12) */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Veuillez renseigner votre mot de passe.'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

/** Demande de réinitialisation (SER-13 étape 1) */
export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
})

export type ResetPasswordRequestValues = z.infer<typeof resetPasswordRequestSchema>

/** Nouveau mot de passe (SER-13 étape 2) */
export const resetPasswordConfirmSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

export type ResetPasswordConfirmValues = z.infer<typeof resetPasswordConfirmSchema>

/** Changement de mot de passe (SER-22) */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: passwordSchema,
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmNewPassword'],
  })

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
