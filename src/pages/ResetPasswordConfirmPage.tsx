import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { PasswordRules } from '@/components/auth/PasswordRules'
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrength'
import { PasswordConfirmField } from '@/components/auth/PasswordConfirmField'
import { usePasswordValidation } from '@/hooks/usePasswordValidation'
import { updatePassword } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import {
  makeSchemas,
  type ResetPasswordConfirmValues,
} from '@/utils/validation'
import { useT } from '@/i18n/useT'

export function ResetPasswordConfirmPage() {
  const t = useT()
  const { resetPasswordConfirmSchema } = makeSchemas(t)
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState(false)
  const [isReady, setIsReady] = useState(false)

  const form = useForm<ResetPasswordConfirmValues>({
    resolver: zodResolver(resetPasswordConfirmSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  const watchedPassword = form.watch('password')
  const watchedConfirm = form.watch('confirmPassword')
  const { validation, strength, score } = usePasswordValidation(watchedPassword)

  // Supabase injecte le token dans le hash fragment (#access_token=…)
  // et déclenche un événement PASSWORD_RECOVERY
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsReady(true)
      }
    })

    // Si aucun hash/token n'est présent, c'est un accès direct
    const hash = window.location.hash
    if (!hash || !hash.includes('access_token')) {
      // Laisser un court délai pour que Supabase détecte le token
      const timeout = setTimeout(() => {
        if (!isReady) {
          setTokenError(true)
        }
      }, 3000)

      return () => {
        timeout && clearTimeout(timeout)
        subscription.unsubscribe()
      }
    }

    return () => {
      subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSubmit = async (values: ResetPasswordConfirmValues) => {
    setServerError(null)
    setIsSubmitting(true)

    try {
      const { error } = await updatePassword(values.password)

      if (error) {
        if (
          error.message.includes('expired') ||
          error.message.includes('invalid')
        ) {
          setTokenError(true)
        } else {
          setServerError(error.message)
        }
        return
      }

      navigate('/reset-password/success', { replace: true })
    } catch {
      setServerError(t.auth.resetConfirm.connectionError)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Token expiré ou accès direct ──
  if (tokenError) {
    return (
      <AuthLayout>
        <div className="rounded-[20px] bg-bg-card p-8 shadow-md">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle
              className="h-12 w-12 text-warning"
              aria-hidden="true"
            />
            <h1 className="font-display text-[1.75rem] font-medium text-text">
              {t.auth.resetConfirm.linkExpiredTitle}
            </h1>
            <p className="text-text-soft">
              {t.auth.resetConfirm.linkExpiredDescription}
            </p>
            <div className="mt-4 flex flex-col gap-3 w-full">
              <Button asChild className="w-full">
                <Link to="/reset-password">{t.auth.resetConfirm.requestNewLink}</Link>
              </Button>
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm font-medium text-accent underline hover:text-accent-hover"
              >
                <ArrowLeft className="h-4 w-4" />
                {t.auth.resetConfirm.backToLogin}
              </Link>
            </div>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="rounded-[20px] bg-bg-card p-8 shadow-md">
        <h1 className="mb-2 text-center font-display text-[2rem] font-medium text-accent">
          {t.auth.resetConfirm.title}
        </h1>
        <p className="mb-8 text-center text-[1.05rem] text-text-soft">
          {t.auth.resetConfirm.subtitle}
        </p>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6"
          noValidate
        >
          {/* New password */}
          <div className="space-y-2">
            <Label htmlFor="password">{t.auth.resetConfirm.newPasswordLabel}</Label>
            <PasswordInput
              id="password"
              placeholder="........"
              autoComplete="new-password"
              {...form.register('password')}
            />
            <PasswordRules
              validation={validation}
              show={watchedPassword.length > 0}
            />
            <PasswordStrengthIndicator
              strength={strength}
              score={score}
              show={watchedPassword.length > 0}
            />
          </div>

          {/* Confirm password */}
          <PasswordConfirmField
            password={watchedPassword}
            confirmPassword={watchedConfirm}
            onChange={(val) =>
              form.setValue('confirmPassword', val, { shouldValidate: true })
            }
            error={form.formState.errors.confirmPassword?.message}
          />

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
            disabled={isSubmitting || !isReady}
            className="w-full"
          >
            {isSubmitting
              ? t.auth.resetConfirm.submitting
              : t.auth.resetConfirm.submit}
          </Button>
        </form>

        <p className="mt-6 text-center">
          <Link
            to="/login"
            className="flex items-center justify-center gap-2 text-sm font-medium text-accent underline hover:text-accent-hover"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.auth.resetConfirm.backToLogin}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
