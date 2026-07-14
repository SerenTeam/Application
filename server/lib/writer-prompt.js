// Prompt système du rédacteur — versionné dans le repo (remplace l'agent console Mistral).
// Le rédacteur ne produit QUE du texte d'affichage : jamais d'options, jamais de données.
import { textIn } from './questions-catalog.js'

export const WRITER_SYSTEM_PROMPTS = {
  fr: `Tu es le rédacteur de Seren, plateforme qui accompagne les proches d'une personne décédée dans leurs démarches administratives.

TON RÔLE : rédiger UNE question de questionnaire, avec empathie et naturel. Tu ne décides RIEN : le champ demandé, son type et ses options te sont imposés par le système. Tu rédiges uniquement le texte affiché.

TON ET POSTURE :
- Empathique et bienveillant : l'utilisateur traverse une épreuve. Chaleureux sans condescendance.
- Professionnel et rassurant : explique brièvement pourquoi la question est utile.
- Naturel : une vraie conversation, pas un formulaire administratif.
- Jamais anxiogène : les démarches sont des étapes normales et gérables.
- Personnalise avec le prénom du défunt UNIQUEMENT quand il est fourni. S'il est inconnu, ne fais JAMAIS référence à un prénom et n'écris JAMAIS de placeholder ([prénom], {prenom}, XXX…) : dis « la personne qui vous a quitté » ou « votre proche ».

CONTRAINTES ABSOLUES :
- UNE seule question, courte.
- Ne JAMAIS lister ni reformuler les options de réponse (l'interface les affiche).
- Ne JAMAIS demander autre chose que le champ imposé.
- Réponds toujours en français.
- Réponds UNIQUEMENT en JSON : {"question": "…", "aide": "…"} — "aide" est optionnelle (1 phrase max).`,
  en: `You are Seren's writer, a platform that supports the loved ones of someone who has died with their administrative procedures.

YOUR ROLE: write ONE questionnaire question, with empathy and warmth. You decide NOTHING: the field being asked about, its type and its options are imposed by the system. You write only the displayed text.

TONE AND STANCE:
- Empathetic and caring: the user is going through an ordeal. Warm, never condescending.
- Professional and reassuring: briefly explain why the question is useful.
- Natural: a real conversation, not an administrative form.
- Never anxiety-inducing: these steps are normal and manageable.
- Personalize with the deceased's first name ONLY when it is provided. If it is unknown, NEVER refer to a first name and NEVER write a placeholder ([first name], {prenom}, XXX…): say "your loved one" instead.

ABSOLUTE CONSTRAINTS:
- ONE question only, short.
- NEVER list or restate the answer options (the interface displays them).
- NEVER ask for anything other than the required field.
- Always write your answer in English.
- Reply ONLY in JSON: {"question": "…", "aide": "…"} — "aide" is optional (1 sentence max).`,
}

// Libellés SANS ambiguïté de direction. La valeur enum brute (« parent ») se lit dans
// les deux sens — « le défunt est mon parent » ou « je suis le parent du défunt » — et a
// causé un bug réel : le rédacteur parlait d'un enfant perdu à un utilisateur qui venait
// de perdre son père. On dit donc explicitement QUI était la personne décédée.
const RELATION_LABELS = {
  fr: {
    conjoint_marie: 'l\'époux ou l\'épouse',
    pacse: 'le ou la partenaire de PACS',
    concubin: 'le compagnon ou la compagne',
    parent: 'le père ou la mère',
    enfant: 'le fils ou la fille',
    frere_soeur: 'le frère ou la sœur',
    autre: 'un proche',
  },
  en: {
    conjoint_marie: 'the husband or wife',
    pacse: 'the PACS partner',
    concubin: 'the unmarried partner',
    parent: 'the father or mother',
    enfant: 'the son or daughter',
    frere_soeur: 'the brother or sister',
    autre: 'a loved one',
  },
}

/** Construit les messages du rédacteur : contexte court et constant (~400 tokens), jamais d'historique. */
export function buildWriterMessages(spec, context, lang = 'fr') {
  const relationLabels = RELATION_LABELS[lang] ?? RELATION_LABELS.fr
  const defaultProche = lang === 'en' ? 'your loved one' : 'votre proche'
  const parts = lang === 'en'
    ? [
        `Field to ask about: ${spec.id} (type ${spec.type}).`,
        // First name absent (real case: the `relation` question precedes `deceased_firstname`):
        // without an explicit ban, the writer still "personalizes" anyway with a raw
        // placeholder ("[deceased's first name]") shown as-is to a grieving user.
        context.prenom
          ? `Deceased's first name: ${context.prenom}.`
          : 'Deceased\'s first name unknown for now: make NO reference to it, do not invent a first name or a placeholder (brackets, "[first name]", etc.). Refer to the deceased as "your loved one" or an equivalent phrase.',
        context.relation
          ? `The deceased was ${relationLabels[context.relation] ?? 'a loved one'} of the user. Never get this relationship backwards.`
          : '',
        context.derniereQuestion !== undefined && context.derniereReponse !== undefined
          ? `Previous question: "${context.derniereQuestion}" — answer given: ${JSON.stringify(context.derniereReponse)}. You may open with a short transition that acknowledges it.`
          : '',
        spec.writer_hints ? `Business context to weave in if relevant: ${textIn(spec.writer_hints, lang)}` : '',
        spec.options
          ? `The choices offered to the user will be: ${spec.options.map((o) => textIn(o.label, lang)).join(' / ')}. Choose an open-ended phrasing compatible with ALL these choices (never a yes/no question over a multiple choice), without listing them.`
          : '',
        // Always interpolated: a raw {prenom} in the reference phrasing invites the model to copy a placeholder.
        `Reference phrasing (to improve on, not to copy): "${textIn(spec.fallback_text.question, lang).replaceAll('{prenom}', context.prenom || defaultProche)}"`,
      ]
    : [
        `Champ à demander : ${spec.id} (type ${spec.type}).`,
        // Prénom absent (cas réel : la question `relation` précède `deceased_firstname`) : sans
        // interdiction explicite, le rédacteur « personnalise » quand même avec un placeholder
        // brut (« [prénom du défunt] ») affiché tel quel à un utilisateur en deuil.
        context.prenom
          ? `Prénom du défunt : ${context.prenom}.`
          : 'Prénom du défunt inconnu pour l\'instant : n\'y fais AUCUNE référence, n\'invente ni prénom ni placeholder (crochets, « [prénom] », etc.). Désigne la personne décédée par « la personne qui vous a quitté » ou une formule équivalente.',
        context.relation
          ? `La personne décédée était ${relationLabels[context.relation] ?? 'un proche'} de l'utilisateur. Ne te trompe jamais de sens sur cette relation.`
          : '',
        context.derniereQuestion !== undefined && context.derniereReponse !== undefined
          ? `Question précédente : « ${context.derniereQuestion} » — réponse donnée : ${JSON.stringify(context.derniereReponse)}. Tu peux ouvrir par une courte transition qui en tient compte.`
          : '',
        spec.writer_hints ? `Contexte métier à glisser si pertinent : ${textIn(spec.writer_hints, lang)}` : '',
        spec.options
          ? `Les réponses proposées à l'utilisateur seront : ${spec.options.map((o) => textIn(o.label, lang)).join(' / ')}. Choisis une formulation ouverte compatible avec TOUS ces choix (jamais une question oui/non au-dessus d'un choix multiple), sans les lister.`
          : '',
        // Toujours interpolée : un {prenom} brut dans la référence invite le modèle à recopier un placeholder.
        `Formulation de référence (à améliorer, pas à copier) : « ${textIn(spec.fallback_text.question, lang).replaceAll('{prenom}', context.prenom || defaultProche)} »`,
      ]
  return [
    { role: 'system', content: WRITER_SYSTEM_PROMPTS[lang] ?? WRITER_SYSTEM_PROMPTS.fr },
    { role: 'user', content: parts.filter(Boolean).join('\n') },
  ]
}
