import type { TransmissionItem } from './types'

const CONTACT_KEYWORDS = [
  'Personnes a prevenir',
  "Contact d'urgence",
  'Medecin traitant',
  'Notaire',
]

interface ContactsViewProps {
  items: TransmissionItem[]
}

export function ContactsView({ items }: ContactsViewProps) {
  const contacts = items.filter(
    (item) =>
      CONTACT_KEYWORDS.some((kw) => item.question.includes(kw)) &&
      item.reponse !== null,
  )

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-[2.25rem] font-medium mb-2 text-accent">
        Contacts
      </h1>
      <p className="text-text-soft text-[1.05rem] mb-8">
        Personnes et organismes à contacter
      </p>

      {contacts.length === 0 ? (
        <p className="text-text-soft">Aucun contact transmis.</p>
      ) : (
        contacts.map((contact, idx) => (
          <div
            key={idx}
            className="bg-bg-card border-2 border-border rounded-[12px] p-5 mb-4"
          >
            <div className="font-semibold text-[1.1rem] mb-2 text-text">
              {contact.question}
            </div>
            <div className="text-text-soft text-[0.95rem]">
              {String(contact.reponse)}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
