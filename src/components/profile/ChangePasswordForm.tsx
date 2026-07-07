import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { PasswordRules } from '@/components/auth/PasswordRules'
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrength'
import { PasswordConfirmField } from '@/components/auth/PasswordConfirmField'
import { usePasswordValidation } from '@/hooks/usePasswordValidation'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { changePasswordSchema, type ChangePasswordValues } from '@/utils/validation'

export function ChangePasswordForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
    mode: 'onChange',
  })

  const watchedNewPassword = form.watch('newPassword')
  const watchedConfirm = form.watch('confirmNewPassword')
  const { validation, strength, score } = usePasswordValidation(watchedNewPassword)

  const onSubmit = async (values: ChangePasswordValues) => {
    setError(null)
    setIsSubmitting(true)

    try {
      // Verify current password
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        setError('Utilisateur non trouvé')
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: values.currentPassword,
      })

      if (signInError) {
        setError('Le mot de passe actuel est incorrect')
        return
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: values.newPassword,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      toast({
        title: 'Mot de passe modifié',
        description: 'Votre mot de passe a été mis à jour avec succès.',
      })

      form.reset()
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-[20px] bg-bg-card p-6 sm:p-8 shadow-md">
      <h2 className="mb-4 font-display text-[1.5rem] font-medium text-text">
        Modifier le mot de passe
      </h2>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {/* Current password */}
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Mot de passe actuel</Label>
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            {...form.register('currentPassword')}
          />
          {form.formState.errors.currentPassword && (
            <p className="text-sm text-error" role="alert">
              {form.formState.errors.currentPassword.message}
            </p>
          )}
        </div>

        {/* New password */}
        <div className="space-y-2">
          <Label htmlFor="newPassword">Nouveau mot de passe</Label>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            {...form.register('newPassword')}
          />
          <PasswordRules
            validation={validation}
            show={watchedNewPassword.length > 0}
          />
          <PasswordStrengthIndicator
            strength={strength}
            score={score}
            show={watchedNewPassword.length > 0}
          />
        </div>

        {/* Confirm new password */}
        <PasswordConfirmField
          password={watchedNewPassword}
          confirmPassword={watchedConfirm}
          onChange={(val) => form.setValue('confirmNewPassword', val, { shouldValidate: true })}
          error={form.formState.errors.confirmNewPassword?.message}
        />

        {/* Error */}
        {error && (
          <div className="rounded-[12px] border-2 border-error/30 bg-error/5 p-4 text-center" role="alert">
            <p className="text-error text-[0.95rem]">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full"
        >
          {isSubmitting ? 'Modification...' : 'Modifier le mot de passe'}
        </Button>
      </form>
    </div>
  )
}
