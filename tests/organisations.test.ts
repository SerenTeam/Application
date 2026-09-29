import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { envelopeNameOf } from '../server/lib/organisations.js'
import { loadOrganisationsSeed } from './helpers/organisations-seed'

// Nom à imprimer sur l'enveloppe pour un organisme de l'annuaire (défaut du 2026-09-28) : le nom
// officiel DILA s'il tient sur une ligne (≤ 45 caractères), sinon la forme courte
// « SIGLE territoire » tirée du sigle que l'organisme publie lui-même entre parenthèses. Jamais
// de troncature : sans forme courte possible, le nom officiel est rendu tel quel (la garde 4
// de POST /api/letters/send le refusera et le formulaire le signale).

describe('envelopeNameOf — nom d’enveloppe d’un organisme', () => {
  it('nom officiel ≤ 45 caractères : inchangé', () => {
    const name = 'Caisse d\'allocations familiales (Caf) du Cher'
    expect(name).toHaveLength(45)
    expect(envelopeNameOf(name)).toBe(name)
  })

  it('CARSAT : « Carsat <région> », tiret de séparation retiré', () => {
    expect(envelopeNameOf('Caisse d\'assurance retraite et de la santé au travail (Carsat) - Bourgogne-Franche-Comté')).toBe(
      'Carsat Bourgogne-Franche-Comté'
    )
  })

  it('CAF, CPAM, CGSS : sigle suivi du territoire tel que publié', () => {
    expect(envelopeNameOf('Caisse d\'allocations familiales (Caf) de l\'Ain')).toBe('Caf de l\'Ain')
    expect(envelopeNameOf('Caisse primaire d\'assurance maladie (CPAM) des Alpes-de-Haute-Provence')).toBe(
      'CPAM des Alpes-de-Haute-Provence'
    )
    expect(envelopeNameOf('Caisse générale de sécurité sociale (CGSS) - La Réunion')).toBe('CGSS La Réunion')
  })

  it('SIP : seul le premier tiret est retiré, le nom du service reste entier', () => {
    expect(envelopeNameOf('Service des impôts des particuliers (SIP) - Montpellier - Millénaire')).toBe(
      'SIP Montpellier - Millénaire'
    )
  })

  it('Cnav Île-de-France (sans tiret après le sigle)', () => {
    expect(envelopeNameOf('Caisse nationale d’assurance vieillesse (Cnav) Assurance retraite Île-de-France')).toBe(
      'Cnav Assurance retraite Île-de-France'
    )
  })

  it('nom long sans sigle entre parenthèses : rendu tel quel, jamais tronqué', () => {
    const name = 'Direction départementale des finances publiques de la Haute-Garonne'
    expect(envelopeNameOf(name)).toBe(name)
  })

  it('forme courte elle-même trop longue : nom officiel rendu tel quel, jamais tronqué', () => {
    const name = `Caisse primaire d'assurance maladie (CPAM) ${'de la très longue circonscription '.repeat(2).trim()}`
    expect(envelopeNameOf(name)).toBe(name)
  })

  it('sigle vide ou territoire réduit à un tiret : nom officiel rendu tel quel, jamais « CPAM » seul', () => {
    const dashOnly = 'Caisse primaire d\'assurance maladie des Hauts-de-France (CPAM) -'
    const blankAcronym = 'Caisse primaire d\'assurance maladie ( ) de la Gironde et environs'
    expect(envelopeNameOf(dashOnly)).toBe(dashOnly)
    expect(envelopeNameOf(blankAcronym)).toBe(blankAcronym)
  })

  it('les 321 organismes du seed ont un nom d’enveloppe de 1 à 45 caractères', () => {
    const seed = loadOrganisationsSeed()
    expect(seed).toHaveLength(321) // garde contre un test vide
    const offenders = seed
      .map((org) => [org.id, envelopeNameOf(org.name)] as const)
      .filter(([, name]) => name.length === 0 || name.length > 45)
    expect(offenders).toEqual([])
  })
})
