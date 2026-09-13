import { describe, it, expect } from 'vitest'
// @ts-expect-error — module JS serveur
import { foldMsbStatus } from '../server/lib/msb-status.js'

// Fold events[] (MySendingBox, non ordonnés, potentiellement dupliqués) → statut Seren.
// Table de référence : docs/plan-chantier-2a-envoi-papier.md §M. Chaque ligne de la table a son
// test dédié, puis les cas de mélange/duplication/vigilances de revue.

function ev(id: string, type: string, extra: Record<string, unknown> = {}) {
  return { _id: id, type, ...extra }
}

describe('foldMsbStatus', () => {
  // ── Cas de base : aucun événement ──────────────────────────────────────────────────────────
  it('renvoie "prepared" quand la liste est vide (avant tout événement)', () => {
    expect(foldMsbStatus([])).toEqual({ status: 'prepared', ignored: [] })
  })

  it('renvoie "prepared" pour un appel sans argument (défensif — module JS non typé, `any`)', () => {
    expect(foldMsbStatus(undefined)).toEqual({ status: 'prepared', ignored: [] })
  })

  // ── Chaque ligne de §M, une par une ────────────────────────────────────────────────────────
  it('letter.created → submitted', () => {
    expect(foldMsbStatus([ev('1', 'letter.created')])).toEqual({ status: 'submitted', ignored: [] })
  })

  it('letter.accepted → submitted (no-op, chaîne d’impression)', () => {
    expect(foldMsbStatus([ev('1', 'letter.accepted')])).toEqual({ status: 'submitted', ignored: [] })
  })

  it('letter.created puis letter.accepted → submitted (les deux sont au même rang)', () => {
    expect(foldMsbStatus([ev('1', 'letter.created'), ev('2', 'letter.accepted')])).toEqual({
      status: 'submitted',
      ignored: [],
    })
  })

  it('letter.sent → sent (état final nominal du courrier simple)', () => {
    expect(foldMsbStatus([ev('1', 'letter.created'), ev('2', 'letter.sent')])).toEqual({
      status: 'sent',
      ignored: [],
    })
  })

  it('letter.wrong_address → failed_address (NPAI)', () => {
    expect(foldMsbStatus([ev('1', 'letter.wrong_address')])).toEqual({
      status: 'failed_address',
      ignored: [],
    })
  })

  it('letter.wrong_address APRÈS sent → failed_address (transition sent → failed_address autorisée)', () => {
    expect(
      foldMsbStatus([ev('1', 'letter.created'), ev('2', 'letter.sent'), ev('3', 'letter.wrong_address')])
    ).toEqual({ status: 'failed_address', ignored: [] })
  })

  it('letter.returned_to_sender avec wrong_address:true → failed_address', () => {
    expect(foldMsbStatus([ev('1', 'letter.returned_to_sender', { wrong_address: true })])).toEqual({
      status: 'failed_address',
      ignored: [],
    })
  })

  it('letter.returned_to_sender sans wrong_address (absent) → failed', () => {
    expect(foldMsbStatus([ev('1', 'letter.returned_to_sender')])).toEqual({
      status: 'failed',
      ignored: [],
    })
  })

  it('letter.returned_to_sender avec wrong_address:false → failed', () => {
    expect(foldMsbStatus([ev('1', 'letter.returned_to_sender', { wrong_address: false })])).toEqual({
      status: 'failed',
      ignored: [],
    })
  })

  it('letter.error → failed', () => {
    expect(foldMsbStatus([ev('1', 'letter.error')])).toEqual({ status: 'failed', ignored: [] })
  })

  it('letter.canceled → failed (suite à DELETE Seren)', () => {
    expect(foldMsbStatus([ev('1', 'letter.canceled')])).toEqual({ status: 'failed', ignored: [] })
  })

  // ── Vigilance de revue : failed depuis sent UNIQUEMENT via returned_to_sender sans wrong_address ──
  it('sent → returned_to_sender SANS wrong_address:true : transition sent → failed AUTORISÉE', () => {
    expect(
      foldMsbStatus([
        ev('1', 'letter.created'),
        ev('2', 'letter.sent'),
        ev('3', 'letter.returned_to_sender'),
      ])
    ).toEqual({ status: 'failed', ignored: [] })
  })

  it('un letter.error TARDIF après sent n’écrase JAMAIS un envoi expédié (reste "sent")', () => {
    expect(
      foldMsbStatus([ev('1', 'letter.created'), ev('2', 'letter.sent'), ev('3', 'letter.error')])
    ).toEqual({ status: 'sent', ignored: [] })
  })

  it('un letter.canceled tardif après sent n’écrase pas non plus un envoi expédié (même garde)', () => {
    expect(
      foldMsbStatus([ev('1', 'letter.created'), ev('2', 'letter.sent'), ev('3', 'letter.canceled')])
    ).toEqual({ status: 'sent', ignored: [] })
  })

  it('letter.error AVANT tout sent → failed normalement (la garde ne s’applique qu’une fois sent atteint)', () => {
    expect(foldMsbStatus([ev('1', 'letter.created'), ev('2', 'letter.error')])).toEqual({
      status: 'failed',
      ignored: [],
    })
  })

  // ── Événements lot 2c : ignorés proprement, pas d'erreur, PAS listés dans `ignored` ─────────
  it.each(['filing_proof', 'in_transit', 'distributed', 'delivery_proof', 'lost'])(
    'événement lot 2c "%s" seul → prepared, ignoré proprement (absent de `ignored`)',
    (type) => {
      expect(foldMsbStatus([ev('1', type)])).toEqual({ status: 'prepared', ignored: [] })
    }
  )

  it('événement lot 2c mélangé à des événements 2a n’interfère pas avec le statut', () => {
    expect(
      foldMsbStatus([ev('1', 'letter.created'), ev('2', 'letter.sent'), ev('3', 'in_transit')])
    ).toEqual({ status: 'sent', ignored: [] })
  })

  // ── Événement inconnu : ignoré + listé dans le retour ────────────────────────────────────────
  it('événement de type inconnu → prepared (aucun candidat), listé dans `ignored`', () => {
    expect(foldMsbStatus([ev('1', 'letter.some_future_event')])).toEqual({
      status: 'prepared',
      ignored: ['letter.some_future_event'],
    })
  })

  it('événement inconnu mélangé à un événement connu → statut du connu + inconnu listé', () => {
    expect(
      foldMsbStatus([ev('1', 'letter.created'), ev('2', 'letter.mystere')])
    ).toEqual({ status: 'submitted', ignored: ['letter.mystere'] })
  })

  // ── Dédup par _id ─────────────────────────────────────────────────────────────────────────
  it('un même _id répété (webhook + resync) ne compte qu’une fois — pas d’effet sur le statut', () => {
    expect(
      foldMsbStatus([ev('1', 'letter.created'), ev('1', 'letter.created'), ev('1', 'letter.created')])
    ).toEqual({ status: 'submitted', ignored: [] })
  })

  it('duplicats mélangés à des événements distincts → dédup correcte, statut le plus avancé', () => {
    expect(
      foldMsbStatus([
        ev('1', 'letter.created'),
        ev('2', 'letter.sent'),
        ev('2', 'letter.sent'), // doublon du même événement "sent"
        ev('1', 'letter.created'), // doublon du "created"
      ])
    ).toEqual({ status: 'sent', ignored: [] })
  })

  // ── Événements non ordonnés : le résultat ne dépend pas de l'ordre du tableau ────────────────
  it('ordre inversé des mêmes événements → même statut final (non ordonné)', () => {
    const forward = foldMsbStatus([
      ev('1', 'letter.created'),
      ev('2', 'letter.accepted'),
      ev('3', 'letter.sent'),
      ev('4', 'letter.wrong_address'),
    ])
    const backward = foldMsbStatus([
      ev('4', 'letter.wrong_address'),
      ev('3', 'letter.sent'),
      ev('2', 'letter.accepted'),
      ev('1', 'letter.created'),
    ])
    expect(forward).toEqual(backward)
    expect(forward).toEqual({ status: 'failed_address', ignored: [] })
  })

  it('mélange complexe réaliste : created + accepted + sent + wrong_address + in_transit + inconnu', () => {
    expect(
      foldMsbStatus([
        ev('5', 'unknown_thing'),
        ev('1', 'letter.created'),
        ev('3', 'letter.sent'),
        ev('4', 'in_transit'),
        ev('2', 'letter.accepted'),
      ])
    ).toEqual({ status: 'sent', ignored: ['unknown_thing'] })
  })
})
