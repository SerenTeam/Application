import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { useT } from '@/i18n/useT'

interface MarkAsSentButtonProps {
  stepId: string
  userId: string
  hasActions: boolean
  onSent: () => void
}

export function MarkAsSentButton({ stepId, userId, hasActions, onSent }: MarkAsSentButtonProps) {
  const t = useT()
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

      toast({ title: t.lettersPage.markSentSuccess })
      setOpen(false)
      setNote('')
      onSent()
    } catch {
      toast({ title: t.lettersPage.markSentErrorTitle, description: t.lettersPage.markSentErrorDescription })
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <Send className="h-4 w-4" />
        {t.lettersPage.markAsSent}
      </Button>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-border-card bg-surface p-5">
      <h4 className="font-body text-sm font-medium text-text">{t.lettersPage.confirmSending}</h4>

      <div className="space-y-1.5">
        <Label htmlFor="sent-date" className="text-sm">{t.lettersPage.sentDateLabel}</Label>
        <Input
          id="sent-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sent-note" className="text-sm">{t.lettersPage.noteLabel}</Label>
        <Input
          id="sent-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t.lettersPage.notePlaceholder}
        />
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={saving} className="gap-2">
          <Send className="h-4 w-4" />
          {saving ? t.lettersPage.saving : t.lettersPage.confirm}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
          {t.lettersPage.cancel}
        </Button>
      </div>
    </div>
  )
}
