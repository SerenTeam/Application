// Types de scripts/check-env-target.mjs (script Node pur, importé par les tests Vitest).
export declare const PROD_PROJECT_REF: 'oltwzvfjazwjvghpzhia'
export declare const PREPROD_PROJECT_REF: 'kvtzhyxlqouvpwasedbe'
export declare const CHECKED_VARS: readonly ['SUPABASE_URL', 'VITE_SUPABASE_URL']

export declare function isProdTarget(url: unknown): boolean

export interface EnvTargetResult {
  exitCode: 0 | 1
  prodVars: string[]
  message: string
}

export declare function checkEnvTarget(env: Record<string, string | undefined>): EnvTargetResult
