// Version courante des consentements famille (contrat docs/design-v2-demonstrateur.md §7.5,
// arbitrage A4). Constante JUMELLE de public.consent_version() (migration 20260915200000_v2_core.sql) :
// la parité est testée par tests/consent-version.test.ts. Changer de version = migration corrective
// + modification de ce fichier, dans le même commit.
export const CONSENT_VERSION = '2026-09-beta-1' as const
