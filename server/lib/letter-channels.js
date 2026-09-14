// Carte serveur { templateId → channel } pour le routage de POST /api/letters/send (canaux
// email ET papier opérationnels — chantier 2a, Task 11). Le serveur Express reste en JS (voir
// CLAUDE.md) et ne peut donc pas importer directement src/data/letter-templates.ts (source de
// vérité TS) : cette carte est maintenue à la main et sa parité avec LETTER_TEMPLATES est
// vérifiée par un test dédié (tests/letter-templates.test.ts, describe « parité
// server/lib/letter-channels.js ↔ LETTER_TEMPLATES ») — même mécanique que la parité des
// catalogues FR/EN (tests/invariants.test.ts). Toute dérive entre les deux fichiers fait échouer
// `npm test`.
//
// Requalification Task 11 : les 5 templates historiquement 'lre' (recommandé + AR — jamais
// implémenté, lot 2c) deviennent 'papier' (courrier simple, MySendingBox, chantier 2a). Aucun
// canal 'lre' ne reste dans ce catalogue — il réapparaîtra au lot 2c comme un canal distinct.
export const LETTER_CHANNELS = {
  'banque-declaration-deces': 'papier',
  'assurance-declaration-deces': 'papier',
  'assurance-vie-demande': 'papier',
  'employeur-notification': 'email',
  'caf-notification': 'portail',
  'carsat-notification': 'papier',
  'mutuelle-resiliation': 'email',
  'bailleur-notification': 'papier',
  'cpam-notification': 'portail',
  'impots-notification': 'portail',
}
