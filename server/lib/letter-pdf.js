// Génération PDF des courriers côté serveur, pour la pièce jointe de l'envoi email (v1).
// Parité volontaire avec l'export client (src/components/letter/LetterActions.tsx,
// handleDownloadPdf) : A4, police standard, texte multi-lignes via splitTextToSize, mêmes
// marges. Pas de mise en page sophistiquée en v1 — le courrier EST le contenu, sans en-tête
// ni logo (voir docs/plan-envoi-courriers.md, Task 3).
import { jsPDF } from 'jspdf'

const MARGIN_MM = 20
const LINE_HEIGHT_MM = 6
const FONT_SIZE_PT = 11

/** @param {{ subject: string, body: string }} params @returns {Buffer} */
export function renderLetterPdf({ subject, body }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  if (subject) doc.setProperties({ title: subject })

  const pageWidth = doc.internal.pageSize.getWidth() - MARGIN_MM * 2
  const pageHeight = doc.internal.pageSize.getHeight() - MARGIN_MM * 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(FONT_SIZE_PT)

  const lines = doc.splitTextToSize(body ?? '', pageWidth)
  let y = MARGIN_MM

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
