import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'
import type { RecipientAddress } from '@/lib/paper-send-resume'

interface Organisation {
  id: string
  name: string
  address_line1: string
  address_line2?: string | null
  postal_code: string
  city: string
}

interface RecipientAddressFormProps {
  // null = destinataire propre à l'utilisateur (banque, assurance, employeur…) : jamais
  // d'annuaire, saisie libre uniquement (spec §3.3).
  network: 'caf' | 'cpam' | 'carsat' | 'impots' | null
  deceasedDepartment?: string
  onDeceasedDepartmentResolved?: (department: string) => void
  value: RecipientAddress
  onChange: (value: RecipientAddress) => void
  // Legs R2 étendu (revue finale, I4) : l'adresse entre dans le `dedup_key` (§M) au même titre
  // que les PJ — un changement d'adresse sur une reprise crée en réalité une LIGNE DIFFÉRENTE,
  // débitée séparément, pendant que l'originale garde son propre débit à jamais (jamais libéré
  // puisqu'aucune erreur ne survient jamais sur elle). Figée exactement comme AttachmentPicker.
  frozen: boolean
}

const LINE_MAX = 45
const POSTAL_CODE_RE = /^[0-9]{5}$/
// Même motif que le CHECK SQL de organisations.department (migration Task 1) : 2 chiffres et
// plus (métropole) ou 2A/2B (Corse) ou 3 chiffres (DROM/COM), jamais inventé côté serveur.
const DEPARTMENT_RE = /^(2[AB]|[0-9]{2,3})$/

// La CARSAT n'a PAS de département (20 caisses RÉGIONALES, note post-revue Task 2) : le choix se
// fait par nom de région, aucun mapping département→région n'est inventé ici.
function needsDepartment(network: RecipientAddressFormProps['network']): boolean {
  return network !== null && network !== 'carsat'
}

export function RecipientAddressForm({
  network,
  deceasedDepartment,
  onDeceasedDepartmentResolved,
  value,
  onChange,
  frozen,
}: RecipientAddressFormProps) {
  const t = useT()
  // Plusieurs panneaux papier peuvent coexister dans la même roadmap (un par étape dépliée) :
  // des ids DOM statiques dupliqueraient les associations <label htmlFor> d'un panneau à
  // l'autre (revue finale, mineur). `useId()` garantit un préfixe unique par instance.
  const uid = useId()
  const [localDepartment, setLocalDepartment] = useState<string | undefined>(deceasedDepartment)
  const [departmentDraft, setDepartmentDraft] = useState('')
  const [orgs, setOrgs] = useState<Organisation[]>([])
  const [loadingOrgs, setLoadingOrgs] = useState(false)
  const [orgsError, setOrgsError] = useState(false)
  const [selectedOrgId, setSelectedOrgId] = useState('')

  useEffect(() => {
    if (deceasedDepartment) setLocalDepartment(deceasedDepartment)
  }, [deceasedDepartment])

  const department = localDepartment
  const departmentMissing = needsDepartment(network) && !department

  useEffect(() => {
    if (!network) return
    if (departmentMissing) return
    let cancelled = false
    setLoadingOrgs(true)
    setOrgsError(false)
    const query = new URLSearchParams({ network })
    if (department) query.set('department', department)
    apiFetch(`/api/letters/organisations?${query.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('http'))))
      .then((data: { organisations?: Organisation[] }) => {
        if (cancelled) return
        setOrgs(data.organisations ?? [])
      })
      .catch(() => {
        if (!cancelled) setOrgsError(true)
      })
      .finally(() => {
        if (!cancelled) setLoadingOrgs(false)
      })
    return () => {
      cancelled = true
    }
  }, [network, department, departmentMissing])

  const departmentDraftNormalized = departmentDraft.trim().toUpperCase()
  const departmentValid = DEPARTMENT_RE.test(departmentDraftNormalized)

  const handleConfirmDepartment = () => {
    if (!departmentValid) return
    setLocalDepartment(departmentDraftNormalized)
    onDeceasedDepartmentResolved?.(departmentDraftNormalized)
  }

  const handleSelectOrg = (id: string) => {
    setSelectedOrgId(id)
    const org = orgs.find((o) => o.id === id)
    if (!org) return
    onChange({
      name: org.name,
      address_line1: org.address_line1,
      address_line2: org.address_line2 ?? undefined,
      postal_code: org.postal_code,
      city: org.city,
    })
  }

  const set = (key: keyof RecipientAddress) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, [key]: e.target.value })
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-soft bg-surface p-3">
      <h4 className="font-body text-sm font-medium text-text">{t.paperSend.recipientTitle}</h4>

      {frozen && <p className="text-xs italic text-text-muted">{t.paperSend.recipientFrozenNote}</p>}

      {network && departmentMissing && !frozen && (
        <div className="space-y-1.5 rounded-lg border border-border-card bg-white p-3">
          <Label htmlFor={`${uid}-department`} className="text-sm">
            {t.paperSend.recipientDepartmentPrompt}
          </Label>
          <p className="text-xs text-text-muted">{t.paperSend.recipientDepartmentHint}</p>
          <div className="flex gap-2">
            <Input
              id={`${uid}-department`}
              value={departmentDraft}
              placeholder={t.paperSend.recipientDepartmentPlaceholder}
              maxLength={3}
              onChange={(e) => setDepartmentDraft(e.target.value)}
              className="max-w-[120px]"
            />
            <Button size="sm" variant="outline" onClick={handleConfirmDepartment} disabled={!departmentValid}>
              {t.paperSend.recipientDepartmentConfirmCta}
            </Button>
          </div>
          {departmentDraft.length > 0 && !departmentValid && (
            <p className="text-xs text-warning">{t.paperSend.recipientDepartmentInvalid}</p>
          )}
        </div>
      )}

      {network && !departmentMissing && (
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-org-picker`} className="text-sm">
            {t.paperSend.recipientPickerLabel}
          </Label>
          {loadingOrgs && <p className="text-xs text-text-muted">{t.paperSend.recipientPickerLoading}</p>}
          {orgsError && <p className="text-xs text-warning">{t.paperSend.recipientPickerError}</p>}
          {!loadingOrgs && !orgsError && (
            <>
              <select
                id={`${uid}-org-picker`}
                value={selectedOrgId}
                onChange={(e) => handleSelectOrg(e.target.value)}
                disabled={frozen}
                className="flex h-[52px] w-full rounded-2xl border border-border bg-white px-4 text-[16px] text-text transition-colors focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  {t.paperSend.recipientPickerPlaceholder}
                </option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-muted">{t.paperSend.recipientPickerHint}</p>
            </>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-name`} className="text-sm">
            {t.paperSend.recipientNameLabel}
          </Label>
          <Input id={`${uid}-name`} value={value.name} maxLength={LINE_MAX} onChange={set('name')} disabled={frozen} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-address1`} className="text-sm">
            {t.paperSend.recipientAddressLine1Label}
          </Label>
          <Input
            id={`${uid}-address1`}
            value={value.address_line1}
            maxLength={LINE_MAX}
            onChange={set('address_line1')}
            disabled={frozen}
          />
          <p className="text-xs text-text-muted">{fmt(t.paperSend.lineCounter, { count: value.address_line1.length })}</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-address2`} className="text-sm">
            {t.paperSend.recipientAddressLine2Label}
          </Label>
          <Input
            id={`${uid}-address2`}
            value={value.address_line2 ?? ''}
            maxLength={LINE_MAX}
            onChange={set('address_line2')}
            disabled={frozen}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-postal-code`} className="text-sm">
            {t.paperSend.recipientPostalCodeLabel}
          </Label>
          <Input
            id={`${uid}-postal-code`}
            value={value.postal_code}
            maxLength={5}
            onChange={set('postal_code')}
            disabled={frozen}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-city`} className="text-sm">
            {t.paperSend.recipientCityLabel}
          </Label>
          <Input id={`${uid}-city`} value={value.city} maxLength={LINE_MAX} onChange={set('city')} disabled={frozen} />
        </div>
      </div>
      {value.postal_code.length > 0 && !POSTAL_CODE_RE.test(value.postal_code.trim()) && (
        <p className="text-xs text-warning">{t.paperSend.invalidPostalCode}</p>
      )}
    </div>
  )
}
