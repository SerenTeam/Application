import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { validateAddress } from '../server/lib/paper-sender.js'
// @ts-expect-error — module JS serveur
import { envelopeNameOf } from '../server/lib/organisations.js'
import { lineTooLong, recipientFromOrganisation, recipientValid, type Organisation } from '@/lib/paper-recipient'
import type { RecipientAddress } from '@/lib/paper-send-resume'
import { loadOrganisationsSeed } from './helpers/organisations-seed'

// Défaut du 2026-09-28 (chantier 2a, envoi papier) : choisir un organisme dans l'annuaire
// recopiait son nom officiel DILA dans la ligne « nom » de l'enveloppe, alors qu'une ligne
// d'enveloppe est limitée à 45 caractères (refuser, jamais tronquer — §M du plan 2a). 312 noms
// sur 321 dépassent : le bouton « Envoyer » restait grisé, sans aucun message. Ces tests
// rejouent le pré-remplissage sur les 321 organismes RÉELS du seed, avec le nom d'enveloppe
// calculé par la fonction serveur (envelopeNameOf). Le passage par la route elle-même est
// vérifié dans tests/letters-paper-routes.test.ts.

const SEED = loadOrganisationsSeed()
const DIRECTORY: Organisation[] = SEED.map((org) => ({
  ...org,
  envelope_name: envelopeNameOf(org.name),
}))

function refusedByServer(recipient: RecipientAddress): string | null {
  try {
    validateAddress(recipient, 'recipient')
    return null
  } catch (error) {
    return (error as { field?: string }).field ?? String(error)
  }
}

describe('seed de l’annuaire lu par les tests', () => {
  it('321 organismes, comptes par réseau conformes à l’en-tête du seed', () => {
    // Garde contre un test vide : un parseur qui ne lirait rien rendrait les tests suivants
    // trivialement verts.
    expect(SEED).toHaveLength(321)
    const counts = SEED.reduce<Record<string, number>>((acc, org) => {
      acc[org.network] = (acc[org.network] ?? 0) + 1
      return acc
    }, {})
    expect(counts).toEqual({ caf: 100, cpam: 99, impots: 102, carsat: 20 })
  })
})

describe('annuaire → adresse de l’enveloppe (pré-remplissage du destinataire)', () => {
  it('chaque organisme pré-remplit une adresse acceptée par la garde 4 de POST /api/letters/send', () => {
    const refused = DIRECTORY.map((org) => [org.id, refusedByServer(recipientFromOrganisation(org))])
      .filter(([, field]) => field !== null)
    expect(refused).toEqual([])
  })

  it('chaque organisme pré-remplit une adresse qui débloque le bouton « Envoyer »', () => {
    const blocked = DIRECTORY.filter((org) => !recipientValid(recipientFromOrganisation(org))).map((org) => org.id)
    expect(blocked).toEqual([])
  })

  it('CARSAT Bourgogne-Franche-Comté (nom officiel de 88 caractères) : l’envoi est possible', () => {
    const org = DIRECTORY.find((o) => o.id === 'carsat-bourgogne-franche-comte')!
    expect(org.name.length).toBe(88)
    const recipient = recipientFromOrganisation(org)
    expect(recipient.name).toBe('Carsat Bourgogne-Franche-Comté')
    expect(refusedByServer(recipient)).toBeNull()
    expect(recipientValid(recipient)).toBe(true)
  })

  it('réponse sans envelope_name (serveur antérieur, rollback) : repli sur le nom officiel, signalé, sans plantage', () => {
    const org = DIRECTORY.find((o) => o.id === 'carsat-midi-pyrenees')!
    const recipient = recipientFromOrganisation({ ...org, envelope_name: undefined })
    expect(recipient.name).toBe(org.name)
    expect(lineTooLong(recipient.name)).toBe(true)
    expect(recipientValid(recipient)).toBe(false)
  })
})

describe('filet de sécurité : nom trop long signalé sous le champ (jamais un bouton grisé muet)', () => {
  const VALID: RecipientAddress = {
    name: 'Carsat Midi-Pyrénées',
    address_line1: '2 rue Georges-Vivent',
    postal_code: '31065',
    city: 'Toulouse Cedex 9',
  }

  it('45 caractères : ni message, ni blocage', () => {
    const recipient = { ...VALID, name: 'N'.repeat(45) }
    expect(lineTooLong(recipient.name)).toBe(false)
    expect(recipientValid(recipient)).toBe(true)
  })

  it('46 caractères : le bouton est bloqué ET le message s’affiche', () => {
    const recipient = { ...VALID, name: 'N'.repeat(46) }
    expect(recipientValid(recipient)).toBe(false)
    expect(lineTooLong(recipient.name)).toBe(true)
  })
})
