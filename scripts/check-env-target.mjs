#!/usr/bin/env node
// ============================================================================
// scripts/check-env-target.mjs — Garde d'environnement : refuse une cible Supabase PROD
// ============================================================================
//
// Contexte (lot L0 du plan v2-démonstrateur, 2026-09-15) : le projet Supabase
// `oltwzvfjazwjvghpzhia` est la PROD (branche `main`, app.seren-app.fr,
// utilisateurs réels) — et non « dev », comme l'affirmait l'ancienne version de
// docs/runbook-supabase-cli.md. Il n'existe AUCUN projet Supabase distant de dev :
// le dev se fait sur Supabase local (`supabase start`). Un .env local qui pointe
// sur la prod transforme tout lancement local (dev, E2E, probes) en écriture
// potentielle sur des données réelles. Ce script est le garde-fou explicite à
// lancer avant ces usages.
//
// -- Usage --------------------------------------------------------------
//
//   npm run check:env                                    # variables du shell courant
//   node --env-file=.env scripts/check-env-target.mjs    # contrôler un fichier .env
//                                                         # (c'est Node qui charge le
//                                                         # fichier, pas ce script)
//   PROD_OK=1 npm run check:env                           # dérogation consciente
//
// Contrôle SUPABASE_URL et VITE_SUPABASE_URL. Code de sortie 1 si l'une vise la
// prod (sauf PROD_OK=1, valeur exacte), 0 sinon.
//
// Règles : le script ne lit JAMAIS de fichier .env lui-même (seule source :
// process.env) et n'affiche jamais de clé — seuls les noms de variables et le
// project-ref (non secrets) apparaissent dans les messages.
// ============================================================================

import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** project-ref du projet Supabase PROD (CLAUDE.md § Architecture branches/environnements). */
export const PROD_PROJECT_REF = 'oltwzvfjazwjvghpzhia'

/** project-ref du projet Supabase préprod — cité dans les messages comme cible légitime. */
export const PREPROD_PROJECT_REF = 'kvtzhyxlqouvpwasedbe'

/** Variables contrôlées : client backend et client frontend (figée au build Vite). */
export const CHECKED_VARS = ['SUPABASE_URL', 'VITE_SUPABASE_URL']

/**
 * Vrai si l'URL vise le projet Supabase PROD. Fonction pure.
 * Insensible à la casse (un nom d'hôte l'est) ; toute valeur non-chaîne → false.
 * Limite connue : un domaine personnalisé pointant sur la prod ne contiendrait pas
 * le project-ref et ne serait pas détecté (aucun n'est configuré à ce jour).
 */
export function isProdTarget(url) {
  if (typeof url !== 'string') return false
  return url.toLowerCase().includes(PROD_PROJECT_REF)
}

/**
 * Évalue un objet d'environnement (process.env en CLI, objet littéral en test).
 * Fonction pure : ne lit rien d'autre que `env`, n'écrit rien, ne quitte pas.
 * @returns {{ exitCode: 0 | 1, prodVars: string[], message: string }}
 */
export function checkEnvTarget(env) {
  const prodVars = CHECKED_VARS.filter((name) => isProdTarget(env[name]))

  if (prodVars.length === 0) {
    const present = CHECKED_VARS.filter((name) => typeof env[name] === 'string' && env[name] !== '')
    const message =
      present.length > 0
        ? `OK : ${present.join(', ')} ne vise pas le projet Supabase PROD (${PROD_PROJECT_REF}).`
        : 'OK : ni SUPABASE_URL ni VITE_SUPABASE_URL ne sont définies dans cet environnement — aucune cible Supabase à contrôler.'
    return { exitCode: 0, prodVars, message }
  }

  const list = prodVars.join(', ')
  if (env.PROD_OK === '1') {
    return {
      exitCode: 0,
      prodVars,
      message: `ATTENTION : ${list} vise le projet Supabase PROD (${PROD_PROJECT_REF}, utilisateurs réels) — dérogation PROD_OK=1 acceptée. Aucune écriture de test ne doit partir d'ici.`,
    }
  }

  return {
    exitCode: 1,
    prodVars,
    message: [
      `REFUS : ${list} vise le projet Supabase PROD (${PROD_PROJECT_REF} — app.seren-app.fr, utilisateurs réels).`,
      `Pointer ces variables vers la préprod (${PREPROD_PROJECT_REF}) ou vers un Supabase local (supabase start).`,
      'Dérogation consciente uniquement : relancer avec PROD_OK=1. Voir docs/runbook-supabase-cli.md.',
    ].join('\n'),
  }
}

// Exécution en CLI uniquement (pas à l'import, ex. depuis scripts/rls-probes.mjs ou Vitest).
function isCliEntry() {
  if (!process.argv[1]) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
  } catch {
    return false
  }
}

if (isCliEntry()) {
  const { exitCode, message } = checkEnvTarget(process.env)
  if (exitCode === 0) {
    console.log(message)
  } else {
    console.error(message)
  }
  process.exit(exitCode)
}
