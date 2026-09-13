// Génération PDF des courriers côté serveur, pour la pièce jointe de l'envoi email (v1).
// Parité volontaire avec l'export client (src/components/letter/LetterActions.tsx,
// handleDownloadPdf) : A4, police standard, texte multi-lignes via splitTextToSize, mêmes
// marges. Pas de mise en page sophistiquée en v1 — le courrier EST le contenu, sans en-tête
// ni logo (voir docs/plan-envoi-courriers.md, Task 3).
import { jsPDF } from 'jspdf'

const MARGIN_MM = 20
const LINE_HEIGHT_MM = 6
const FONT_SIZE_PT = 11
// Espace laissé entre le bloc expéditeur/destinataire (canal papier, chantier 2a) et le début du
// corps, quand ce bloc est rendu.
const ADDRESS_BLOCK_GAP_MM = 10

/**
 * @param {{ subject: string, body: string, sender?: PostalAddress, recipient?: PostalAddress }} params
 * @returns {Buffer}
 *
 * `sender`/`recipient` (chantier 2a, canal papier, Task 7) — chacun optionnel indépendamment :
 * `{ name, address_line1, address_line2?, postal_code, city }`. Quand fourni, un bloc adresse est
 * ajouté en tête de la première page du CORPS, SI ABSENT du corps lui-même (décision : c'est
 * l'appelant — route Task 9 — qui sait si le corps regénéré contient déjà cette information via
 * le template, et ne passe ces paramètres QUE si elle est absente). Ce bloc n'a AUCUNE position
 * normée à respecter : la page « fenêtre enveloppe » est déléguée à MySendingBox
 * (`address_placement: 'insert_blank_page'`, voir server/lib/paper-sender.js) — il sert
 * uniquement à ce que le corps du courrier reste lisible en autonomie, comme une lettre papier
 * classique. Le canal email (v1, server/routes/letters.js) n'appelle jamais ces deux paramètres :
 * leur absence laisse le rendu strictement identique à avant (signature de la fonction
 * conservée, appel existant inchangé).
 */
export function renderLetterPdf({ subject, body, sender, recipient }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  if (subject) doc.setProperties({ title: subject })

  const pageWidth = doc.internal.pageSize.getWidth() - MARGIN_MM * 2
  const pageHeight = doc.internal.pageSize.getHeight() - MARGIN_MM * 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_SIZE_PT)

  let y = MARGIN_MM
  if (sender || recipient) {
    y = renderAddressBlock(doc, { sender, recipient, y, pageWidth })
  }

  const lines = doc.splitTextToSize(body ?? '', pageWidth)

  for (const line of lines) {
    if (y > pageHeight + MARGIN_MM) {
      doc.addPage()
      y = MARGIN_MM
    }
    doc.text(line, MARGIN_MM, y)
    y += LINE_HEIGHT_MM
  }

  return Buffer.from(doc.output('arraybuffer'))
}

// Bloc expéditeur (colonne gauche) / destinataire (colonne droite), style courrier administratif
// FR classique — purement visuel, aucune contrainte de position (voir note ci-dessus). Chaque
// partie est rendue indépendamment de l'autre (l'une des deux peut être absente).
function renderAddressBlock(doc, { sender, recipient, y, pageWidth }) {
  const recipientX = MARGIN_MM + pageWidth / 2
  let senderY = y
  let recipientY = y

  if (sender) {
    for (const line of addressLines(sender)) {
      doc.text(line, MARGIN_MM, senderY)
      senderY += LINE_HEIGHT_MM
    }
  }
  if (recipient) {
    for (const line of addressLines(recipient)) {
      doc.text(line, recipientX, recipientY)
      recipientY += LINE_HEIGHT_MM
    }
  }
  return Math.max(senderY, recipientY, y) + ADDRESS_BLOCK_GAP_MM
}

// `{ name, address_line1, address_line2?, postal_code, city }` → lignes à imprimer, dans l'ordre
// postal usuel ; ligne code postal + ville fusionnée (convention FR), champs manquants omis
// plutôt que d'imprimer une ligne vide.
function addressLines(addr) {
  const lines = []
  if (addr?.name) lines.push(addr.name)
  if (addr?.address_line1) lines.push(addr.address_line1)
  if (addr?.address_line2) lines.push(addr.address_line2)
  const cityLine = [addr?.postal_code, addr?.city].filter(Boolean).join(' ')
  if (cityLine) lines.push(cityLine)
  return lines
}
