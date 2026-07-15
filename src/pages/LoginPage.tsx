import { useState } from 'react'
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { signIn } from '@/lib/auth'
import { ArrowRight } from 'lucide-react'
import { makeSchemas, type LoginFormValues } from '@/utils/validation'
import { useT } from '@/i18n/useT'

export function LoginPage() {
  const t = useT()
  const { loginSchema } = makeSchemas(t)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const successMessage = (location.state as { message?: string })?.message
  const returnUrl = searchParams.get('returnUrl')
  const from = returnUrl || (location.state as { from?: { pathname: string } })?.from?.pathname || '/'

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null)
    setIsSubmitting(true)

    try {
      const { error: authError } = await signIn(values.email, values.password)

      if (authError) {
        setServerError(t.auth.login.incorrectCredentials)
        return
      }

      navigate(from, { replace: true })
    } catch {
      setServerError(t.auth.login.connectionError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
        <h1 className="mb-2 text-center font-display text-[28px] font-normal leading-[1.3] text-text">
          {t.auth.login.title}
        </h1>
        <p className="mb-8 text-center font-body text-[16px] text-text-secondary">
          {t.auth.login.subtitle}
        </p>

        {successMessage && (
          <div className="mb-6 rounded-2xl border border-primary-border bg-primary-light p-4 text-center">
            <p className="text-[14px] text-primary">{successMessage}</p>
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t.auth.login.emailLabel}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t.auth.emailPlaceholder}
              autoComplete="email"
              aria-invalid={!!form.formState.errors.email}
              aria-describedby={form.formState.errors.email ? 'login-email-error' : undefined}
              {...form.register('email')}
            />
            {form.formState.errors.email && (
              <p id="login-email-error" className="text-sm text-error" role="alert">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t.auth.login.passwordLabel}</Label>
            <PasswordInput
              id="password"
              placeholder="........"
              autoComplete="current-password"
              aria-invalid={!!form.formState.errors.password}
              aria-describedby={form.formState.errors.password ? 'login-password-error' : undefined}
              {...form.register('password')}
            />
            {form.formState.errors.password && (
              <p id="login-password-error" className="text-sm text-error" role="alert">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <div className="rounded-2xl border border-error/20 bg-error-light p-4 text-center" role="alert">
              <p className="text-[14px] text-error">{serverError}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full gap-2"
          >
            {isSubmitting ? t.auth.login.submitting : t.auth.login.submit}
            {!isSubmitting && <ArrowRight className="h-5 w-5" />}
          </Button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-text-secondary">
          <p>
            <Link to="/reset-password" className="font-medium text-primary underline hover:text-primary-hover">
              {t.auth.login.forgotPassword}
            </Link>
          </p>
          <p>
            {t.auth.login.noAccount}{' '}
            <Link to="/signup" className="font-medium text-primary underline hover:text-primary-hover">
              {t.auth.login.createAccount}
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  )
}
