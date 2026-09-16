import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useLang } from '@/i18n/LanguageContext'
import type { DossierFormValues, PartnerCountersData, PartnerDossier, PartnerInfo } from '@/lib/partner-dossier'

// Espace PF v2 : toutes les lectures et écritures passent par l'API (/api/partner/*), elle-même
// adossée aux RPC security definer. Le hook ne reçoit JAMAIS de contenu famille.
export type PartnerActionResult =
  | { ok: true; emailSent: boolean; activationUrl?: string; alreadyCancelled?: boolean }
  | { ok: false; code: string; message: string; field?: string; duplicateCount?: number }

interface PartnerDashboardState {
  loading: boolean
  error: boolean
  notPartner: boolean
  partner: PartnerInfo | null
  dossiers: PartnerDossier[]
  counters: PartnerCountersData | null
}

const INITIAL: PartnerDashboardState = { loading: true, error: false, notPartner: false, partner: null, dossiers: [], counters: null }

async function readJson(res: Response) {
  return res.json().catch(() => null)
}

function failure(res: Response, data: Record<string, unknown> | null): PartnerActionResult {
  return {
    ok: false,
    code: typeof data?.code === 'string' ? data.code : `HTTP_${res.status}`,
    message: typeof data?.error === 'string' ? data.error : '',
    field: typeof data?.field === 'string' ? data.field : undefined,
    duplicateCount: typeof data?.duplicate_count === 'number' ? data.duplicate_count : undefined,
  }
}

export function usePartnerDashboard() {
  const { lang } = useLang()
  const [state, setState] = useState<PartnerDashboardState>(INITIAL)

  const refresh = useCallback(async () => {
    try {
      const [listRes, countersRes] = await Promise.all([
        apiFetch(`/api/partner/dossiers?lang=${lang}`),
        apiFetch(`/api/partner/counters?lang=${lang}`),
      ])
      const [list, counters] = await Promise.all([readJson(listRes), readJson(countersRes)])
      if (listRes.status === 403 || countersRes.status === 403) {
        setState({ ...INITIAL, loading: false, notPartner: true })
        return
      }
      if (!listRes.ok || !countersRes.ok || !list?.success || !counters?.success) {
        setState((prev) => ({ ...prev, loading: false, error: true }))
        return
      }
      setState({ loading: false, error: false, notPartner: false, partner: list.partner, dossiers: list.dossiers ?? [], counters: counters.counters })
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: true }))
    }
  }, [lang])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const post = useCallback(async (url: string, body: Record<string, unknown>): Promise<PartnerActionResult> => {
    try {
      const res = await apiFetch(url, { method: 'POST', body: JSON.stringify({ ...body, lang }) })
      const data = await readJson(res)
      if (!res.ok || !data?.success) return failure(res, data)
      void refresh()
      return { ok: true, emailSent: Boolean(data.email_sent), activationUrl: data.activation_url, alreadyCancelled: data.already_cancelled }
    } catch {
      return { ok: false, code: 'NETWORK', message: '' }
    }
  }, [lang, refresh])

  const createDossier = useCallback(
    (values: DossierFormValues, confirmDuplicate: boolean) =>
      post('/api/partner/dossiers', {
        ...values,
        family_email: values.family_email.trim().toLowerCase(),
        family_phone: values.family_phone.trim() || null,
        confirm_duplicate: confirmDuplicate,
      }),
    [post],
  )
  const resendInvitation = useCallback((id: string) => post(`/api/partner/dossiers/${id}/resend`, {}), [post])
  const cancelDossier = useCallback((id: string) => post(`/api/partner/dossiers/${id}/cancel`, {}), [post])

  return { ...state, refresh, createDossier, resendInvitation, cancelDossier }
}
