import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/useT'
import { SectionHeading } from '@/components/ui/section-heading'
import { LetterProfileForm } from '@/components/letter/LetterProfileForm'
import {
  fetchDossierIdentity,
  fetchLetterProfile,
  saveDeceasedDob,
  type DossierIdentity,
  type LetterProfileRow,
} from '@/lib/letter-profile'
import { nullOnError } from '@/lib/sentry'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'

interface CoordinatesScreenProps {
  userId: string
  questionnaireId: string
  answers: QuestionnaireAnswersV2
  onDone: () => void
}

// Personnalisation v2 (spec docs/design-personnalisation-v2.md §4.4) : la roadmap est déjà
// enregistrée quand cet écran s'affiche — « Plus tard » ou un onglet fermé ne perdent rien. Aucune
// de ces données ne passe par la session du questionnaire ni par le rédacteur Mistral.
export function CoordinatesScreen({ userId, questionnaireId, answers, onDone }: CoordinatesScreenProps) {
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<LetterProfileRow | null>(null)
  const [dossier, setDossier] = useState<DossierIdentity | null>(null)
  // Accessibilité (note post-revue Task 8) : le spinner « completing » vient d'être démonté, le focus
  // serait perdu (body) — on le place sur le titre de l'écran dès qu'il s'affiche.
  const headingRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!loading) headingRef.current?.focus()
  }, [loading])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Lectures indépendantes : un échec laisse simplement le champ vide, jamais bloquant (mais signalé
      // à Sentry).
      const [p, d] = await Promise.all([
        nullOnError(fetchLetterProfile(supabase, userId)),
        nullOnError(fetchDossierIdentity(supabase)),
      ])
      if (cancelled) return
      setProfile(p)
      setDossier(d)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (loading) {
    return (
      <div className="px-8 py-16 text-center">
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-border border-t-primary" />
        <p className="text-base text-text-secondary">{t.letterProfile.screenLoading}</p>
      </div>
    )
  }

  return (
    <section className="animate-fade-in">
      <SectionHeading
        ref={headingRef}
        tabIndex={-1}
        as="h1"
        className="mb-8 max-w-none focus:outline-none"
        title={t.letterProfile.screenTitle}
        lead={t.letterProfile.screenLead}
      />
      <div className="rounded-card border border-border-card bg-white p-8 shadow-card-border max-sm:p-5">
        <LetterProfileForm
          userId={userId}
          profile={profile}
          defaults={{ firstName: dossier?.family_first_name ?? undefined, lastName: dossier?.family_last_name ?? undefined }}
          relation={answers.relation}
          deceasedFirstName={answers.deceased_firstname}
          deceasedDob={{
            value: answers.deceased_dob ?? null,
            max: answers.deceased_dod ?? null,
            save: async (dob) => {
              // saveDeceasedDob relit les réponses en base avant d'écrire (note post-revue Task 7).
              await saveDeceasedDob(supabase, questionnaireId, dob)
            },
          }}
          variant="screen"
          submitLabel={t.letterProfile.screenSubmit}
          onSaved={() => onDone()}
          onSkip={onDone}
        />
      </div>
    </section>
  )
}
