// Détection stricte du type réel d'un fichier par magic bytes (coffre minimal, chantier 2a).
// Zéro confiance dans le Content-Type déclaré par le client ni dans l'extension du nom de
// fichier : les deux sont librement falsifiables (un .exe renommé .pdf passe les deux). Seules
// les signatures d'en-tête ci-dessous font foi. Spec : docs/design-chantier-2a-envoi-papier.md
// §3.4 ("contrôle du type réel par magic bytes (PDF, JPEG, PNG uniquement)").
const SIGNATURES = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
]

/**
 * Renvoie le mime CANONIQUE détecté à partir des premiers octets du buffer, ou `null` si aucune
 * signature connue ne correspond (le fichier doit alors être refusé, jamais accepté « au cas
 * où »). N'inspecte jamais le nom de fichier ni un Content-Type déclaré : ce module ne reçoit
 * que des octets.
 */
export function sniffMime(buffer) {
  if (!buffer || buffer.length === 0) return null
  for (const { mime, bytes } of SIGNATURES) {
    if (buffer.length < bytes.length) continue
    if (bytes.every((byte, i) => buffer[i] === byte)) return mime
  }
  return null
}
