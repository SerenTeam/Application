import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Mail } from 'lucide-react'
import { resetPasswordForEmail } from '@/lib/auth'
import {
  resetPasswordRequestSchema,
  type ResetPasswordRequestValues,
} from '@/utils/validation'

export function ResetPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<ResetPasswordRequestValues>({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  const onSubmit = async (values: ResetPasswordRequestValues) => {
    setServerError(null)
    setIsSubmitting(true)

    try {
      const { error } = await resetPasswordForEmail(values.email)

      if (error) {
        // Ne jamais révéler si l'email existe (anti-énumération)
        console.error('Reset password error:', error)
      }

      // Toujours afficher la confirmation, même en cas d'erreur Supabase
      // pour ne pas révéler l'existence d'un compte
      setIsSent(true)
    } catch {
      setServerError(
        'Un problème de connexion est survenu. Veuillez vérifier votre connexion internet et réessayer.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-[20px] bg-bg-card p-8 shadow-md">
        <h1 className="mb-2 text-center font-display text-[2rem] font-medium text-accent">
          Mot de passe oublié
        </h1>
        <p className="mb-8 text-center text-[1.05rem] text-text-soft">
          Renseignez votre adresse email et nous vous enverrons un lien pour
          réinitialiser votre mot de passe.
        </p>

        {isSent ? (
          /* ── Confirmation envoi ── */
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 rounded-[12px] border-2 border-accent/30 bg-accent-soft p-6 text-center">
              <Mail className="h-10 w-10 text-accent" aria-hidden="true" />
              <div>
                <p className="font-medium text-text">
                  Un lien vous a été envoyé.
                </p>
                <p className="mt-1 text-sm text-text-soft">
                  Si un compte est associé à cette adresse, vous recevrez un
                  email avec les instructions pour réinitialiser votre mot de
                  passe. Pensez à vérifier vos courriers indésirables.
                </p>
              </div>
            </div>

            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm font-medium text-accent underline hover:text-accent-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à la connexion
            </Link>
          </div>
        ) : (
          /* ── Formulaire ── */
          <>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
              noValidate
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  autoComplete="email"
                  aria-invalid={!!form.formState.errors.email}
                  aria-describedby={
                    form.formState.errors.email
                      ? 'reset-email-error'
                      : undefined
                  }
                  {...form.register('email')}
                />
                {form.formState.errors.email && (
                  <p
                    id="reset-email-error"
                    className="text-sm text-error"
                    role="alert"
                  >
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              {serverError && (
                <div
                  className="rounded-[12px] border-2 border-error/30 bg-error/5 p-4 text-center"
                  role="alert"
                >
                  <p className="text-error text-[0.95rem]">{serverError}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? 'Envoi en cours...' : 'Recevoir le lien'}
              </Button>
            </form>

            <p className="mt-6 text-center">
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm font-medium text-accent underline hover:text-accent-hover"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à la connexion
              </Link>
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  )
}
