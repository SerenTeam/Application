// Carte serveur { templateId → channel } pour le routage v1 (canal email seul opérationnel).
// Le serveur Express reste en JS (voir CLAUDE.md) et ne peut donc pas importer directement
// src/data/letter-templates.ts (source de vérité TS) : cette carte est maintenue à la main et
// sa parité avec LETTER_TEMPLATES est vérifiée par un test dédié
// (tests/letter-templates.test.ts, describe « parité server/lib/letter-channels.js ↔
// LETTER_TEMPLATES ») — même mécanique que la parité des catalogues FR/EN
// (tests/invariants.test.ts). Toute dérive entre les deux fichiers fait échouer `npm test`.
export const LETTER_CHANNELS = {
  'banque-declaration-deces': 'lre',
  'assurance-declaration-deces': 'lre',
  'assurance-vie-demande': 'lre',
  'employeur-notification': 'email',
  'caf-notification': 'portail',
  'carsat-notification': 'lre',
  'mutuelle-resiliation': 'email',
  'bailleur-notification': 'lre',
  'cpam-notification': 'portail',
  'impots-notification': 'portail',
}
