import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/useT'
import { fmt } from '@/i18n'

export interface SenderProfile {
  full_name: string
  address_line1: string
  address_line2?: string | null
  postal_code: string
  city: string
  relationship?: string | null
}

interface SenderProfileFormProps {
  userId: string
  profile: SenderProfile | null
  onSaved: (profile: SenderProfile) => void
}

const LINE_MAX = 45
const POSTAL_CODE_RE = /^[0-9]{5}$/

function emptyForm(): SenderProfile {
  return { full_name: '', address_line1: '', address_line2: '', postal_code: '', city: '', relationship: '' }
}

// Profil expéditeur (chantier 2a, spec §3.1) : lu et écrit DIRECTEMENT depuis le client Supabase
// (pas de route serveur dédiée) — la RLS owner de `sender_profiles` (for all using/with check
// auth.uid() = user_id) suffit, exactement comme le prescrit la Task 11. Édition inline à la
// première utilisation (aucun profil) ou sur demande explicite une fois enregistré.
export function SenderProfileForm({ userId, profile, onSaved }: SenderProfileFormProps) {
  const t = useT()
  // Plusieurs panneaux papier peuvent coexister dans la roadmap (un par étape dépliée) : des ids
  // DOM statiques dupliqueraient les associations <label htmlFor> d'un panneau à l'autre (revue
  // finale, mineur). `useId()` garantit un préfixe unique par instance.
  const uid = useId()
  const [editing, setEditing] = useState(!profile)
  const [form, setForm] = useState<SenderProfile>(() => (profile ? { ...profile } : emptyForm()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = (key: keyof SenderProfile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    setSaved(false)
  }

  const valid =
    form.full_name.trim().length > 0 &&
    form.full_name.length <= LINE_MAX &&
    form.address_line1.trim().length > 0 &&
    form.address_line1.length <= LINE_MAX &&
    (form.address_line2 ?? '').length <= LINE_MAX &&
    POSTAL_CODE_RE.test(form.postal_code.trim()) &&
    form.city.trim().length > 0 &&
    form.city.length <= LINE_MAX

  const handleSave = async () => {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        user_id: userId,
        full_name: form.full_name.trim(),
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2?.trim() || null,
        postal_code: form.postal_code.trim(),
        city: form.city.trim(),
        relationship: form.relationship?.trim() || null,
      }
      const { error: upsertError } = await supabase.from('sender_profiles').upsert(payload, { onConflict: 'user_id' })
      if (upsertError) throw upsertError
      setSaved(true)
      setEditing(false)
      onSaved(payload)
    } catch {
      setError(t.paperSend.senderSaveError)
    } finally {
      setSaving(false)
    }
  }

  if (!editing && profile) {
    return (
      <div className="space-y-1 rounded-xl border border-border-soft bg-surface p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text">{profile.full_name}</p>
            <p>{profile.address_line1}</p>
            {profile.address_line2 && <p>{profile.address_line2}</p>}
            <p>
              {profile.postal_code} {profile.city}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="gap-1.5 shrink-0">
            <Pencil className="h-3.5 w-3.5" />
            {t.paperSend.senderEditCta}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-soft bg-surface p-3">
      <div>
        <h4 className="font-body text-sm font-medium text-text">{t.paperSend.senderTitle}</h4>
        <p className="text-xs text-text-muted">{t.paperSend.senderHint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-full-name`} className="text-sm">
            {t.paperSend.senderFullNameLabel}
          </Label>
          <Input id={`${uid}-full-name`} value={form.full_name} maxLength={LINE_MAX} onChange={set('full_name')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-address1`} className="text-sm">
            {t.paperSend.senderAddressLine1Label}
          </Label>
          <Input id={`${uid}-address1`} value={form.address_line1} maxLength={LINE_MAX} onChange={set('address_line1')} />
          <p className="text-xs text-text-muted">{fmt(t.paperSend.lineCounter, { count: form.address_line1.length })}</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-address2`} className="text-sm">
            {t.paperSend.senderAddressLine2Label}
          </Label>
          <Input id={`${uid}-address2`} value={form.address_line2 ?? ''} maxLength={LINE_MAX} onChange={set('address_line2')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-postal-code`} className="text-sm">
            {t.paperSend.senderPostalCodeLabel}
          </Label>
          <Input id={`${uid}-postal-code`} value={form.postal_code} maxLength={5} onChange={set('postal_code')} />
          {form.postal_code.length > 0 && !POSTAL_CODE_RE.test(form.postal_code.trim()) && (
            <p className="text-xs text-warning">{t.paperSend.invalidPostalCode}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-city`} className="text-sm">
            {t.paperSend.senderCityLabel}
          </Label>
          <Input id={`${uid}-city`} value={form.city} maxLength={LINE_MAX} onChange={set('city')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${uid}-relationship`} className="text-sm">
            {t.paperSend.senderRelationshipLabel}
          </Label>
          <Input id={`${uid}-relationship`} value={form.relationship ?? ''} onChange={set('relationship')} />
        </div>
      </div>
      <Button size="sm" onClick={handleSave} disabled={!valid || saving} className="gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? t.paperSend.senderSaving : t.paperSend.senderSaveCta}
      </Button>
      {!valid && (form.full_name || form.address_line1 || form.postal_code || form.city) && (
        <p className="text-xs text-text-muted">{t.paperSend.senderMissingFields}</p>
      )}
      {saved && <p className="text-xs text-success">{t.paperSend.senderSavedHint}</p>}
      {error && <p className="text-xs text-warning">{error}</p>}
    </div>
  )
}
