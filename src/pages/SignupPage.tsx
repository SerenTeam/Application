import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { PasswordRules } from '@/components/auth/PasswordRules'
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrength'
import { PasswordConfirmField } from '@/components/auth/PasswordConfirmField'
import { CGUCheckbox } from '@/components/auth/CGUCheckbox'
import { usePasswordValidation } from '@/hooks/usePasswordValidation'
import { signUp } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { ArrowRight } from 'lucide-react'
import { makeSchemas, type SignupFormValues } from '@/utils/validation'
import { useT } from '@/i18n/useT'

export function SignupPage() {
  const t = useT()
  const { signupSchema } = makeSchemas(t)
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isEmailUsed, setIsEmailUsed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      acceptCGU: false as unknown as true,
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  const watchedPassword = form.watch('password')
  const watchedConfirm = form.watch('confirmPassword')
  const { validation, strength, score } = usePasswordValidation(watchedPassword)

  const onSubmit = async (values: SignupFormValues) => {
    setServerError(null)
    setIsEmailUsed(false)
    setIsSubmitting(true)

    try {
      const { data, error } = await signUp(values.email, values.password)

      if (error) {
        // SER-8: Handle "email already used"
        if (
          error.message.includes('already registered') ||
          error.message.includes('User already registered') ||
          error.status === 422
        ) {
          setIsEmailUsed(true)
        } else {
          setServerError(error.message)
        }
        return
      }

      if (data.session) {
        navigate('/')
      } else {
        navigate('/login', {
          state: { message: t.auth.signup.accountCreatedMessage },
        })
      }
    } catch {
      setServerError(t.auth.signup.connectionError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-[20px] bg-bg-card p-8 shadow-md">
        <h1 className="mb-2 text-center font-display text-[2rem] font-medium text-accent">
          {t.auth.signup.title}
        </h1>
        <p className="mb-8 text-center text-[1.05rem] text-text-soft">
          {t.auth.signup.subtitle}
        </p>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">{t.auth.signup.emailLabel}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t.auth.emailPlaceholder}
              autoComplete="email"
              aria-invalid={!!form.formState.errors.email}
              aria-describedby={form.formState.errors.email ? 'email-error' : undefined}
              {...form.register('email')}
            />
            {form.formState.errors.email && (
              <p id="email-error" className="text-sm text-error" role="alert">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">{t.auth.signup.passwordLabel}</Label>
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

          {/* Confirm Password */}
          <PasswordConfirmField
            password={watchedPassword}
            confirmPassword={watchedConfirm}
            onChange={(val) => form.setValue('confirmPassword', val, { shouldValidate: true })}
            error={form.formState.errors.confirmPassword?.message}
          />

          {/* CGU */}
          <CGUCheckbox
            checked={form.watch('acceptCGU') === true}
            onCheckedChange={(checked) =>
              form.setValue('acceptCGU', checked as unknown as true, { shouldValidate: true })
            }
            error={form.formState.errors.acceptCGU?.message}
          />

          {/* SER-8: Email already used error */}
          {isEmailUsed && (
            <div className="rounded-[12px] border-2 border-error/30 bg-error/5 p-4 text-center" role="alert">
              <p className="text-error text-[0.95rem]">
                {t.auth.signup.emailUsedMessage}{' '}
                <Link to="/login" className="font-medium underline hover:text-accent-hover">
                  {t.auth.signup.signIn}
                </Link>
              </p>
            </div>
          )}

          {/* Generic server error */}
          {serverError && (
            <div className="rounded-[12px] border-2 border-error/30 bg-error/5 p-4 text-center" role="alert">
              <p className="text-error text-[0.95rem]">{serverError}</p>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full gap-2"
          >
            {isSubmitting ? t.auth.signup.submitting : t.auth.signup.submit}
            {!isSubmitting && <ArrowRight className="h-5 w-5" />}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-soft">
          {t.auth.signup.alreadyHaveAccount}{' '}
          <Link to="/login" className="text-accent font-medium underline hover:text-accent-hover">
            {t.auth.signup.signIn}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
