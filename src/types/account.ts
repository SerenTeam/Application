// Compte v2 tel que renvoyé par GET /api/me (contrat docs/design-v2-demonstrateur.md §3.3.6 et §4.3).
// Stub contractuel L0bis : types FIGÉS, propriété L3 ensuite. Aucun snapshot prix ou commission,
// aucun e-mail famille, aucun hash de jeton : my_account() ne les expose jamais.

export type AccountRole = 'partner' | 'family' | 'none'

export interface AccountPartner {
  id: string
  name: string
  status: 'prospect' | 'active' | 'suspended' | 'terminated'
  user_role: 'manager' | 'advisor'
}

export interface AccountDossier {
  id: string
  status: 'active' | 'closed'
  source: 'partner' | 'direct' | 'demo'
  partner_name: string | null
  deceased_first_name: string | null
  activated_at: string
  included_sends: number
}

export interface Account {
  user_id: string
  role: AccountRole
  is_admin: boolean
  partner: AccountPartner | null
  dossier: AccountDossier | null
  consent: { version: string; required: boolean; accepted_at: string | null }
}

export interface PublicFlags {
  llm_enabled: boolean
  email_sends_enabled: boolean
  extra_sends_enabled: boolean
  paper_sends_enabled: boolean
  partner_activations_enabled: boolean
  partner_billing_preview: boolean
}

export interface MeResponse {
  success: true
  account: Account | null
  quota: { balance: number; included_total: number } | null
  flags: PublicFlags
  support_email: string
}
