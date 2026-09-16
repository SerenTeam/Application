import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as Sentry from '@sentry/react'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { PasswordRules } from '@/components/auth/PasswordRules'
import { PasswordConfirmField } from '@/components/auth/PasswordConfirmField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePasswordValidation } from '@/hooks/usePasswordValidation'
import { useAuth } from '@/hooks/useAuth'
import { resetAccountCache } from '@/hooks/useAccount'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import { getActivationToken, clearActivationToken } from '@/lib/activation-fragment'
import { sha256Hex } from '@/lib/activation-token'
import { makeSchemas, type ResetPasswordConfirmValues } from '@/utils/validation'
import { useT } from '@/i18n/useT'
import { useLang } from '@/i18n/LanguageContext'
import { fmt } from '@/i18n'

interface Invitation {
  email: string
  partner_name: string | null
  family_first_name: string | null
  deceased_first_name: string | null
  expires_at: string
}

type ActivationState =
  | { kind: 'checking' }
  | { kind: 'missing' }
  | { kind: 'ready'; invitation: Invitation }
  | { kind: 'existing_account'; invitation: Invitation }
  | { kind: 'submitting'; invitation: Invitation }
  | { kind: 'claiming' }
  | { kind: 'invalid' }
  | { kind: 'expired'; partnerName: string | null }
  | { kind: 'closed' }
  | { kind: 'other_session' }
  | { kind: 'error'; retry: 'check' | 'claim' | null }

const DEFAULT_SUPPORT_EMAIL = 'support@seren-app.fr'

const CARD = 'rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7'
const TITLE = 'mb-3 text-center font-display text-[28px] font-normal leading-[1.3] text-text'

// Page PUBLIQUE (hors ProtectedRoute). Ne charge aucune ressource tierce. Le jeton n'est lu qu'en
// mémoire (capturé par main.tsx) ; seules ses empreintes sha256 partent vers l'API et vers Auth.
export function ActivationPage() {
  const t = useT()
  const { lang } = useLang()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [state, setState] = useState<ActivationState>({ kind: 'checking' })
  const [supportEmail, setSupportEmail] = useState(DEFAULT_SUPPORT_EMAIL)
  const [existingPassword, setExistingPassword] = useState('')
  const tokenHashRef = useRef<string | null>(null)
  const invitationRef = useRef<Invitation | null>(null)
  const langRef = useRef(lang)
  langRef.current = lang

  const { resetPasswordConfirmSchema } = makeSchemas(t)
  const form = useForm<ResetPasswordConfirmValues>({
    resolver: zodResolver(resetPasswordConfirmSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const watchedPassword = form.watch('password')
  const watchedConfirm = form.watch('confirmPassword')
  const { validation } = usePasswordValidation(watchedPassword)

  // Étape 5 (§7.3) : rattachement du compte au dossier.
  const claim = useCallback(async () => {
    const tokenHash = tokenHashRef.current
    if (!tokenHash) {
      setState({ kind: 'missing' })
      return
    }
    setState({ kind: 'claiming' })
    try {
      const res = await apiFetch('/api/activation/claim', {
        method: 'POST',
        body: JSON.stringify({ token_hash: tokenHash, lang: langRef.current }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        // Best effort : le hash est déjà invalidé en base par le claim ; on le retire aussi des métadonnées Auth.
        await supabase.auth.updateUser({ data: { invite_token_hash: null } })
        clearActivationToken()
        resetAccountCache()
        navigate('/bienvenue', { replace: true })
        return
      }
      if (data?.code === 'EMAIL_MISMATCH') return setState({ kind: 'other_session' })
      // 403 ACCOUNT_ROLE_FORBIDDEN : la session est celle d'un compte interne (gérant de PF, admin).
      // La RPC refusera à chaque tentative, par construction : proposer « Réessayer » enfermerait
      // dans une boucle sans issue. Écran d'erreur sans reprise, l'adresse de support fait le relais.
      if (res.status === 403) return setState({ kind: 'error', retry: null })
      if (res.status === 410) return setState({ kind: 'expired', partnerName: invitationRef.current?.partner_name ?? null })
      if (res.status === 404) return setState({ kind: 'invalid' })
      if (res.status === 503) return setState({ kind: 'closed' })
      setState({ kind: 'error', retry: res.status === 409 ? null : 'claim' })
    } catch {
      setState({ kind: 'error', retry: 'claim' })
    }
  }, [navigate])

  // Étapes 1 à 3 (§7.3) : jeton → hash → check → session éventuelle.
  const check = useCallback(async () => {
    const token = getActivationToken()
    if (!token) {
      setState({ kind: 'missing' })
      return
    }
    setState({ kind: 'checking' })
    try {
      const tokenHash = await sha256Hex(token)
      tokenHashRef.current = tokenHash
      const res = await fetch('/api/activation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_hash: tokenHash, lang: langRef.current }),
      })
      const data = await res.json().catch(() => null)
      if (typeof data?.support_email === 'string') setSupportEmail(data.support_email)

      if (res.status === 200 && data?.invitation) {
        const invitation = data.invitation as Invitation
        invitationRef.current = invitation
        const { data: sessionData } = await supabase.auth.getSession()
        const sessionEmail = sessionData.session?.user?.email?.toLowerCase()
        if (sessionEmail) {
          if (sessionEmail === invitation.email.toLowerCase()) {
            await claim()
            return
          }
          setState({ kind: 'other_session' })
          return
        }
        setState({ kind: 'ready', invitation })
        return
      }
      if (res.status === 404 || res.status === 400) return setState({ kind: 'invalid' })
      if (res.status === 410) return setState({ kind: 'expired', partnerName: data?.partner_name ?? null })
      if (res.status === 503) return setState({ kind: 'closed' })
      setState({ kind: 'error', retry: 'check' })
    } catch {
      setState({ kind: 'error', retry: 'check' })
    }
  }, [claim])

  useEffect(() => {
    void check()
  }, [check])

  // Compte existant (ancien compte, compte backfillé) : connexion puis claim.
  const signInThenClaim = useCallback(async (invitation: Invitation, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: invitation.email, password })
    if (error) {
      setState({ kind: 'existing_account', invitation })
      return
    }
    await claim()
  }, [claim])

  // Étape 4 (§7.3) : création du compte, le hash voyage dans user_metadata pour le hook Auth.
  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (state.kind !== 'ready') return
    const invitation = state.invitation
    const tokenHash = tokenHashRef.current
    if (!tokenHash) return setState({ kind: 'missing' })
    setState({ kind: 'submitting', invitation })

    const { data, error } = await supabase.auth.signUp({
      email: invitation.email,
      password,
      options: { data: { invite_token_hash: tokenHash }, emailRedirectTo: `${window.location.origin}/bienvenue` },
    })
    if (error) {
      if (error.status === 403 || error.message?.includes('signup_requires_invitation')) return setState({ kind: 'invalid' })
      if (error.code === 'weak_password') {
        form.setError('password', { message: t.activation.weakPassword })
        return setState({ kind: 'ready', invitation })
      }
      if (error.name === 'AuthRetryableFetchError') return setState({ kind: 'error', retry: 'check' })
      // Erreurs transitoires (429 over_email_send_rate_limit, panne 5xx côté Auth) : elles ne disent
      // RIEN sur l'existence du compte. Les faire tomber dans le repli ci-dessous afficherait
      // « un compte existe déjà avec cette adresse », factuellement faux, et demanderait un mot de
      // passe que la famille n'a jamais choisi. Écran d'erreur avec reprise.
      if (error.status === 429 || (error.status ?? 0) >= 500) return setState({ kind: 'error', retry: 'check' })
      // user_already_exists (422) et, par prudence (H4), toute autre erreur non 403 : tentative de connexion.
      return signInThenClaim(invitation, password)
    }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return signInThenClaim(invitation, password)
    }
    if (!data.session) {
      // « Confirm email » resté activé sur le projet : jamais d'adresse dans l'événement.
      Sentry.captureMessage('activation_no_session')
      return setState({ kind: 'error', retry: null })
    }
    await claim()
  })

  // useAuth().signOut (et non supabase.auth.signOut) : il neutralise la redirection « session
  // expirée » d'AuthProvider, qui renverrait sinon vers /login en perdant le jeton.
  const handleSignOutAndContinue = async () => {
    await signOut()
    await check()
  }

  const readOnlyEmail = (email: string) => (
    <div className="space-y-2">
      <Label htmlFor="activation-email">{t.activation.emailLabel}</Label>
      <Input id="activation-email" type="email" value={email} readOnly aria-readonly="true" autoComplete="username" />
    </div>
  )

  function renderContent() {
    if (state.kind === 'checking' || state.kind === 'claiming') {
      return (
        <>
          <h1 className={TITLE}>{t.activation.title}</h1>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-primary" />
            <p className="text-text-secondary">
              {state.kind === 'checking' ? t.activation.checking : t.activation.claiming}
            </p>
          </div>
        </>
      )
    }

    if (state.kind === 'ready' || state.kind === 'submitting') {
      const { invitation } = state
      const isSubmitting = state.kind === 'submitting'
      return (
        <>
          <h1 className={TITLE}>{t.activation.title}</h1>
          <p className="mb-2 text-center text-text-secondary">
            {invitation.partner_name
              ? fmt(t.activation.invitedBy, { partner: invitation.partner_name })
              : t.activation.invitedByGeneric}
          </p>
          {invitation.family_first_name && (
            <p className="mb-6 text-center text-text-secondary">
              {fmt(t.activation.greeting, { name: invitation.family_first_name })}
            </p>
          )}
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <div className="space-y-2">
              {readOnlyEmail(invitation.email)}
              <p className="text-sm text-text-muted">{t.activation.emailHint}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t.activation.passwordLabel}</Label>
              <PasswordInput id="password" autoComplete="new-password" {...form.register('password')} />
              <PasswordRules validation={validation} show={watchedPassword.length > 0} />
              {form.formState.errors.password && (
                <p className="text-sm text-error" role="alert">{form.formState.errors.password.message}</p>
              )}
            </div>

            <PasswordConfirmField
              password={watchedPassword}
              confirmPassword={watchedConfirm}
              onChange={(v) => form.setValue('confirmPassword', v, { shouldValidate: true })}
              error={form.formState.errors.confirmPassword?.message}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t.activation.submitting : t.activation.submit}
            </Button>
          </form>
        </>
      )
    }

    if (state.kind === 'existing_account') {
      const { invitation } = state
      return (
        <>
          <h1 className={TITLE}>{t.activation.existingAccountTitle}</h1>
          <p className="mb-6 text-center text-text-secondary">{t.activation.existingAccountBody}</p>
          <div className="space-y-4">
            {readOnlyEmail(invitation.email)}
            <div className="space-y-2">
              <Label htmlFor="existing-password">{t.activation.existingAccountPasswordLabel}</Label>
              <PasswordInput
                id="existing-password"
                autoComplete="current-password"
                value={existingPassword}
                onChange={(e) => setExistingPassword(e.target.value)}
              />
            </div>
          </div>
          <Button
            className="mt-6 w-full"
            onClick={() => {
              setState({ kind: 'submitting', invitation })
              void signInThenClaim(invitation, existingPassword)
            }}
          >
            {t.activation.existingAccountSubmit}
          </Button>
          <p className="mt-4 text-center text-sm">
            <Link to="/reset-password" className="font-medium text-primary underline hover:text-primary-hover">
              {t.activation.resetPassword}
            </Link>
          </p>
        </>
      )
    }

    if (state.kind === 'missing') {
      return (
        <>
          <h1 className={TITLE}>{t.activation.missingTitle}</h1>
          <p className="mb-6 text-center text-text-secondary">{t.activation.missingBody}</p>
          {/* Cas le plus fréquent de cet écran : retour arrière du navigateur APRÈS une activation
              réussie — le jeton a été effacé, mais le compte, lui, existe. */}
          <p className="text-center text-sm">
            <Link to="/login" className="font-medium text-primary underline hover:text-primary-hover">
              {t.activation.alreadyActivated}
            </Link>
          </p>
        </>
      )
    }

    if (state.kind === 'invalid') {
      return (
        <>
          <h1 className={TITLE}>{t.activation.invalidTitle}</h1>
          <p className="mb-6 text-center text-text-secondary">{t.activation.invalidBody}</p>
          <p className="text-center text-sm">
            <Link to="/login" className="font-medium text-primary underline hover:text-primary-hover">
              {t.activation.alreadyActivated}
            </Link>
          </p>
        </>
      )
    }

    if (state.kind === 'expired') {
      return (
        <>
          <h1 className={TITLE}>{t.activation.expiredTitle}</h1>
          <p className="text-center text-text-secondary">
            {state.partnerName
              ? fmt(t.activation.expiredBody, { partner: state.partnerName })
              : t.activation.expiredBodyGeneric}
          </p>
        </>
      )
    }

    if (state.kind === 'closed') {
      return (
        <>
          <h1 className={TITLE}>{t.activation.closedTitle}</h1>
          <p className="mb-6 text-center text-text-secondary">{t.activation.closedBody}</p>
          <div className="flex justify-center">
            <Button onClick={() => void check()}>{t.activation.retry}</Button>
          </div>
        </>
      )
    }

    if (state.kind === 'other_session') {
      return (
        <>
          <h1 className={TITLE}>{t.activation.otherSessionTitle}</h1>
          <p className="mb-6 text-center text-text-secondary">{t.activation.otherSessionBody}</p>
          <div className="flex justify-center">
            <Button onClick={() => void handleSignOutAndContinue()}>{t.activation.otherSessionCta}</Button>
          </div>
        </>
      )
    }

    const retry = state.retry
    return (
      <>
        <h1 className={TITLE}>{t.activation.errorTitle}</h1>
        <p className="mb-6 text-center text-text-secondary">{t.activation.errorBody}</p>
        {retry !== null && (
          <div className="flex justify-center">
            <Button onClick={() => void (retry === 'claim' ? claim() : check())}>{t.activation.retry}</Button>
          </div>
        )}
      </>
    )
  }

  return (
    <AuthLayout>
      <div className={CARD}>{renderContent()}</div>
      <p className="mt-6 text-center text-sm text-text-muted">
        {fmt(t.activation.support, { email: supportEmail })}
      </p>
    </AuthLayout>
  )
}
