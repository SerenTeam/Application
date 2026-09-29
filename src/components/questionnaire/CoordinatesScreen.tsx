import { useEffect, useRef, useState, type HTMLAttributes } from 'react'
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
import { focusIfIdle } from '@/lib/focus'
import { cn } from '@/lib/utils'
import type { QuestionnaireAnswersV2 } from '@/types/questionnaire'

// Titre de l'écran, focalisable par script (tabIndex -1) : passé en `as` à SectionHeading, primitive
// partagée qu'on ne modifie pas. Le focus arrive ainsi sur le vrai <h1>, annoncé « titre de niveau
// 1 », et non sur le div qui l'enveloppe. Défini hors du rendu : un composant recréé à chaque rendu
// remonterait le <h1> et lui ferait perdre le focus. L'anneau de focus du projet est un box-shadow
// (`:focus-visible` en layer base, src/index.css) : outline-none ne suffit pas, d'où ring-0 / ring-offset-0
// sur ce titre non interactif.
function FocusableH1({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 tabIndex={-1} className={cn(className, 'focus:outline-none focus:ring-0 focus:ring-offset-0')} {...props} />
}

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
  // serait perdu (body) — on le place sur le titre de l'écran dès qu'il s'affiche. Sans jamais le
  // voler : pendant la génération ou les lectures, la personne a pu aller dans l'en-tête (Tab,
  // bascule de langue).
  const headingRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (loading) return
    focusIfIdle(headingRef.current?.querySelector<HTMLElement>('h1'))
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
        as={FocusableH1}
        className="mb-8 max-w-none"
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
