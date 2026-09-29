import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppHeader, HeaderNavLink } from '@/components/layout/AppHeader'
import { SectionHeading } from '@/components/ui/section-heading'
import { LetterProfileForm } from '@/components/letter/LetterProfileForm'
import { supabase } from '@/lib/supabase'
import {
  fetchDossierIdentity,
  fetchLatestQuestionnaire,
  fetchLetterProfile,
  saveDeceasedDob,
  type DossierIdentity,
  type LetterProfileRow,
} from '@/lib/letter-profile'
import { buildLetterAutofill } from '@/lib/letter-autofill'
import { nullOnError } from '@/lib/sentry'
import type { RelationV2 } from '@/types/questionnaire'
import { useT } from '@/i18n/useT'

export function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [loaded, setLoaded] = useState(false)
  const [profile, setProfile] = useState<LetterProfileRow | null>(null)
  const [dossier, setDossier] = useState<DossierIdentity | null>(null)
  const [questionnaire, setQuestionnaire] = useState<{ id: string; answers: Record<string, unknown> } | null>(null)

  // Personnalisation v2 (spec §4.5) : le profil courrier se consulte et se modifie aussi ici.
  // Dépend de l'id, pas de l'objet `user` : auth-js émet SIGNED_IN avec un NOUVEL objet user (même
  // id) à chaque retour sur l'onglet. Une relecture à chaque retour pouvait se terminer après un
  // enregistrement et remettre l'ancienne adresse à l'écran, puis en base au « Modifier » suivant.
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      // Non bloquantes : un échec masque la donnée concernée et est signalé à Sentry.
      const [p, d, q] = await Promise.all([
        nullOnError(fetchLetterProfile(supabase, userId)),
        nullOnError(fetchDossierIdentity(supabase)),
        nullOnError(fetchLatestQuestionnaire(supabase, userId)),
      ])
      if (cancelled) return
      setProfile(p)
      setDossier(d)
      setQuestionnaire(q)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const answers = questionnaire?.answers ?? {}
  // Défunt : même source que les courriers (réponses, sinon dossier PF ; chaîne vide écartée).
  const deceased = buildLetterAutofill({ profile, dossier, answers }).questionnaireData
  const deceasedFirstName = deceased.deceased_firstname
  const firstName = profile?.first_name ?? dossier?.family_first_name ?? null

  return (
    <div className="min-h-screen bg-bg">
      {/* showEmail=false : l'email est déjà affiché plus bas dans la carte "Informations du compte" */}
      <AppHeader showEmail={false}>
        <HeaderNavLink onClick={() => navigate('/')}>{t.profile.backToQuestionnaire}</HeaderNavLink>
      </AppHeader>

      <main className="mx-auto max-w-[600px] px-6 py-8 sm:py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.profile.back}
        </button>

        <SectionHeading as="h1" className="mb-8 max-w-none" title={t.profile.title} lead={t.profile.subtitle} />

        {/* User info card */}
        <div className="mb-8 rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
          <h2 className="mb-4 font-display text-[1.5rem] font-normal text-text">{t.profile.infoTitle}</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-secondary">Email</p>
              <p className="text-[1.05rem] text-text">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">{t.profile.firstNameLabel}</p>
              {/* Pendant les lectures : espace insécable (la ligne garde sa hauteur), jamais « Non renseigné ». */}
              <p className="text-[1.05rem] text-text">{loaded ? firstName || t.profile.notProvided : '\u00a0'}</p>
            </div>
          </div>
        </div>

        {/* Personnalisation v2 : profil courrier */}
        {user && loaded && (
          <div className="mb-8 rounded-card border border-border-card bg-white p-10 shadow-card-border max-sm:p-7">
            <h2 className="mb-2 font-display text-[1.5rem] font-normal text-text">{t.letterProfile.title}</h2>
            {/* profileHint : l'aide générale renvoie « à votre profil », où l'on est déjà (note post-revue Task 8) */}
            <p className="mb-6 text-sm text-text-muted">{t.letterProfile.profileHint}</p>
            <LetterProfileForm
              userId={user.id}
              profile={profile}
              showHeader={false}
              defaults={{ firstName: dossier?.family_first_name ?? undefined, lastName: dossier?.family_last_name ?? undefined }}
              relation={answers.relation as RelationV2 | undefined}
              deceasedFirstName={deceasedFirstName}
              deceasedDob={
                questionnaire
                  ? {
                      value: (answers.deceased_dob as string | undefined) ?? null,
                      max: deceased.deceased_dod ?? null,
                      save: async (dob) => {
                        const next = await saveDeceasedDob(supabase, questionnaire.id, dob)
                        setQuestionnaire({ id: questionnaire.id, answers: next })
                      },
                    }
                  : undefined
              }
              onSaved={setProfile}
            />
          </div>
        )}

        {/* SER-22: Change password form */}
        <ChangePasswordForm />
      </main>
    </div>
  )
}
