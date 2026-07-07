import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

interface MarkAsSentButtonProps {
  stepId: string
  userId: string
  hasActions: boolean
  onSent: () => void
}

export function MarkAsSentButton({ stepId, userId, hasActions, onSent }: MarkAsSentButtonProps) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  if (!hasActions) return null

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('step_actions').insert({
        step_id: stepId,
        user_id: userId,
        action_type: 'sent',
        action_date: date,
        note: note.trim() || null,
      })

      if (error) throw error

      toast({ title: 'Courrier marqué comme envoyé' })
      setOpen(false)
      setNote('')
      onSent()
    } catch {
      toast({ title: 'Erreur', description: 'Impossible d\'enregistrer. Veuillez réessayer.' })
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Send className="h-4 w-4" />
        Marquer comme envoyé
      </Button>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4 space-y-4">
      <h4 className="text-sm font-medium text-text-primary">Confirmer l'envoi</h4>

      <div className="space-y-1.5">
        <Label htmlFor="sent-date" className="text-sm">Date d'envoi</Label>
        <Input
          id="sent-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sent-note" className="text-sm">Note (optionnel)</Label>
        <Input
          id="sent-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex : Envoyé en recommandé AR"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving} className="gap-2">
          <Send className="h-4 w-4" />
          {saving ? 'Enregistrement...' : 'Confirmer'}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
          Annuler
        </Button>
      </div>
    </div>
  )
}
