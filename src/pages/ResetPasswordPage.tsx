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
  makeSchemas,
  type ResetPasswordRequestValues,
} from '@/utils/validation'
import { useT } from '@/i18n/useT'

export function ResetPasswordPage() {
  const t = useT()
  const { resetPasswordRequestSchema } = makeSchemas(t)
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
      setServerError(t.auth.resetRequest.connectionError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
        <h1 className="mb-2 text-center font-display text-[28px] font-normal leading-[1.3] text-text">
          {t.auth.resetRequest.title}
        </h1>
        <p className="mb-8 text-center font-body text-[16px] text-text-secondary">
          {t.auth.resetRequest.subtitle}
        </p>

        {isSent ? (
          /* ── Confirmation envoi ── */
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary-border bg-primary-light p-6 text-center">
              <Mail className="h-10 w-10 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium text-text">
                  {t.auth.resetRequest.sentTitle}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {t.auth.resetRequest.sentDescription}
                </p>
              </div>
            </div>

            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm font-medium text-primary underline hover:text-primary-hover"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.auth.resetRequest.backToLogin}
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
                  placeholder={t.auth.emailPlaceholder}
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
                  className="rounded-2xl border border-error/20 bg-error-light p-4 text-center"
                  role="alert"
                >
                  <p className="text-[14px] text-error">{serverError}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? t.auth.resetRequest.submitting : t.auth.resetRequest.submit}
              </Button>
            </form>

            <p className="mt-6 text-center">
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm font-medium text-primary underline hover:text-primary-hover"
              >
                <ArrowLeft className="h-4 w-4" />
                {t.auth.resetRequest.backToLogin}
              </Link>
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  )
}
