/**
 * Donne le focus à `el` seulement si personne n'est ailleurs : le focus doit être retombé sur body,
 * typiquement parce que l'élément qui l'avait vient d'être démonté. On ne vole jamais le focus à la
 * personne qui est passée dans l'en-tête ou dans un autre champ (principe posé à la Task 8).
 */
export function focusIfIdle(el: HTMLElement | null | undefined): void {
  if (!el) return
  const active = document.activeElement
  if (active && active !== document.body) return
  el.focus()
}
