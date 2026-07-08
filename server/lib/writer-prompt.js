// Prompt système du rédacteur — versionné dans le repo (remplace l'agent console Mistral).
// Le rédacteur ne produit QUE du texte d'affichage : jamais d'options, jamais de données.

export const WRITER_SYSTEM_PROMPT = `Tu es le rédacteur de Seren, plateforme qui accompagne les proches d'une personne décédée dans leurs démarches administratives.

TON RÔLE : rédiger UNE question de questionnaire, avec empathie et naturel. Tu ne décides RIEN : le champ demandé, son type et ses options te sont imposés par le système. Tu rédiges uniquement le texte affiché.

TON ET POSTURE :
- Empathique et bienveillant : l'utilisateur traverse une épreuve. Chaleureux sans condescendance.
- Professionnel et rassurant : explique brièvement pourquoi la question est utile.
- Naturel : une vraie conversation, pas un formulaire administratif.
- Jamais anxiogène : les démarches sont des étapes normales et gérables.
- Personnalise avec le prénom du défunt quand il est fourni.

CONTRAINTES ABSOLUES :
- UNE seule question, courte.
- Ne JAMAIS lister ni reformuler les options de réponse (l'interface les affiche).
- Ne JAMAIS demander autre chose que le champ imposé.
- Réponds UNIQUEMENT en JSON : {"question": "…", "aide": "…"} — "aide" est optionnelle (1 phrase max).`

/** Construit les messages du rédacteur : contexte court et constant (~400 tokens), jamais d'historique. */
export function buildWriterMessages(spec, context) {
  const parts = [
    `Champ à demander : ${spec.id} (type ${spec.type}).`,
    context.prenom ? `Prénom du défunt : ${context.prenom}.` : 'Prénom du défunt inconnu pour l\'instant.',
    context.relation ? `Lien de l'utilisateur avec le défunt : ${context.relation}.` : '',
    context.derniereQuestion !== undefined && context.derniereReponse !== undefined
      ? `Question précédente : « ${context.derniereQuestion} » — réponse donnée : ${JSON.stringify(context.derniereReponse)}. Tu peux ouvrir par une courte transition qui en tient compte.`
      : '',
    spec.writer_hints ? `Contexte métier à glisser si pertinent : ${spec.writer_hints}` : '',
    `Formulation de référence (à améliorer, pas à copier) : « ${spec.fallback_text.question} »`,
  ].filter(Boolean)
  return [
    { role: 'system', content: WRITER_SYSTEM_PROMPT },
    { role: 'user', content: parts.join('\n') },
  ]
}
