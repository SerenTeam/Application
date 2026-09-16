// Gate v2 (contrat §4.1) : toutes les routes métier famille exigent un dossier ACTIF et le
// consentement à la version courante. Remplace le gate forfait (require-purchase.js, code mort
// jusqu'au nettoyage post-bêta) dans le même slot des routers.
//
// À monter APRÈS requireAuth : lit `my_account()` avec req.supabaseClient (token utilisateur) —
// aucune identité n'est jamais passée en paramètre, la RPC la tire de auth.uid().
//
// Fail-closed : une erreur de lecture n'ouvre JAMAIS la route (500 franc), une forme inattendue
// est refusée (403). Mieux vaut une famille qui réessaie qu'un compte non activé qui envoie.
import * as Sentry from '@sentry/node'
import { msg } from './messages.js'

function reqLang(req) {
  return req.body?.lang === 'en' || req.query?.lang === 'en' ? 'en' : 'fr'
}

/** Défaut des factories (arbitrage A5) : un router construit sans gate refuse tout. */
export const FAIL_CLOSED_GATE = (req, res) => {
  Sentry.captureException(new Error('gate_not_configured'))
  return res.status(500).json({ success: false, code: 'GATE_NOT_CONFIGURED', error: msg(reqLang(req), 'send_error') })
}

export function createRequireActiveDossier({ loadAccount = (client) => client.rpc('my_account') } = {}) {
  return async function requireActiveDossier(req, res, next) {
    const lang = reqLang(req)
    let account
    try {
      const result = await loadAccount(req.supabaseClient)
      if (result?.error) {
        // Jamais le message Postgres brut vers le client ; code seul dans les journaux.
        throw new Error(`my_account_failed:${result.error.code ?? 'unknown'}`)
      }
      account = result?.data ?? null
    } catch (error) {
      console.error('❌ requireActiveDossier :', error?.message ?? 'erreur inconnue')
      Sentry.captureException(error)
      return res.status(500).json({ success: false, code: 'ACCOUNT_ERROR', error: msg(lang, 'account_error') })
    }

    if (!account || account.role !== 'family' || account.dossier?.status !== 'active') {
      return res.status(403).json({ success: false, code: 'DOSSIER_NOT_ACTIVE', error: msg(lang, 'dossier_not_active') })
    }
    // Note N7 : `!== false` (et non `=== true`) — un objet consent absent ou malformé est refusé.
    if (account.consent?.required !== false) {
      return res.status(403).json({ success: false, code: 'CONSENT_REQUIRED', error: msg(lang, 'consent_required') })
    }
    req.account = account
    return next()
  }
}
