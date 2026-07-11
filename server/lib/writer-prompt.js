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

// Libellés SANS ambiguïté de direction. La valeur enum brute (« parent ») se lit dans
// les deux sens — « le défunt est mon parent » ou « je suis le parent du défunt » — et a
// causé un bug réel : le rédacteur parlait d'un enfant perdu à un utilisateur qui venait
// de perdre son père. On dit donc explicitement QUI était la personne décédée.
const RELATION_LABELS = {
  conjoint_marie: 'l\'époux ou l\'épouse',
  pacse: 'le ou la partenaire de PACS',
  concubin: 'le compagnon ou la compagne',
  parent: 'le père ou la mère',
  enfant: 'le fils ou la fille',
  frere_soeur: 'le frère ou la sœur',
  autre: 'un proche',
}

/** Construit les messages du rédacteur : contexte court et constant (~400 tokens), jamais d'historique. */
export function buildWriterMessages(spec, context) {
  const parts = [
    `Champ à demander : ${spec.id} (type ${spec.type}).`,
    context.prenom ? `Prénom du défunt : ${context.prenom}.` : 'Prénom du défunt inconnu pour l\'instant.',
    context.relation
      ? `La personne décédée était ${RELATION_LABELS[context.relation] ?? 'un proche'} de l'utilisateur. Ne te trompe jamais de sens sur cette relation.`
      : '',
    context.derniereQuestion !== undefined && context.derniereReponse !== undefined
      ? `Question précédente : « ${context.derniereQuestion} » — réponse donnée : ${JSON.stringify(context.derniereReponse)}. Tu peux ouvrir par une courte transition qui en tient compte.`
      : '',
    spec.writer_hints ? `Contexte métier à glisser si pertinent : ${spec.writer_hints}` : '',
    spec.options
      ? `Les réponses proposées à l'utilisateur seront : ${spec.options.map((o) => o.label).join(' / ')}. Choisis une formulation ouverte compatible avec TOUS ces choix (jamais une question oui/non au-dessus d'un choix multiple), sans les lister.`
      : '',
    `Formulation de référence (à améliorer, pas à copier) : « ${spec.fallback_text.question} »`,
  ].filter(Boolean)
  return [
    { role: 'system', content: WRITER_SYSTEM_PROMPT },
    { role: 'user', content: parts.join('\n') },
  ]
}
