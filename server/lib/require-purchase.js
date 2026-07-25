// Gating serveur du forfait (chantier 1, décision D1 : le payant démarre quand Seren AGIT à la
// place de l'utilisateur). Écrit une fois, réutilisable tel quel par les chantiers 2 (envoi
// papier/LRAR) et 3 (coffre documents) — c'est le seul endroit où « avoir payé » se vérifie.
//
// À monter APRÈS requireAuth : dépend de req.user et de req.supabaseClient.
//
// La lecture se fait avec le client UTILISATEUR : la policy `own purchases read` suffit, aucun
// contournement de RLS côté serveur. Un utilisateur ne peut pas mentir sur son achat — il ne
// peut rien écrire dans purchases (la table n'a aucune policy d'écriture).
import * as Sentry from '@sentry/node'
import { msg } from '../lib/messages.js'

export function createRequirePurchase({ store, paymentsEnabled }) {
  return async function requirePurchase(req, res, next) {
    // Vente fermée → gate ouvert, comportement STRICTEMENT identique à celui d'avant le
    // chantier 1. Les deux moitiés du flag sont indissociables (spec § 4.2) : les dissocier
    // produirait soit un mur infranchissable (gate fermé sans possibilité d'acheter), soit un
    // trou (vente ouverte, gate ouvert).
    if (!paymentsEnabled) return next()

    const lang = req.body?.lang === 'en' ? 'en' : 'fr'
    try {
      const purchase = await store.getPaidPurchase(req.supabaseClient, req.user.id)
      if (!purchase) {
        return res.status(402).json({
          success: false,
          error: msg(lang, 'purchase_required'),
          code: 'PURCHASE_REQUIRED',
        })
      }
      return next()
    } catch (error) {
      // On ne laisse JAMAIS passer sur erreur de lecture : un incident base ne doit pas ouvrir
      // le gate. Mieux vaut un 500 franc qu'un envoi payant offert par accident.
      console.error('❌ requirePurchase :', error?.message ?? error)
      Sentry.captureException(error)
      return res.status(500).json({ success: false, error: msg(lang, 'payments_status_error') })
    }
  }
}
