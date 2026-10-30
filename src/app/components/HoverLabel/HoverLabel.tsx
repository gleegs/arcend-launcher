import { clsx } from 'clsx'

// Étiquettes blanches (même blanc que la pastille « Nouveau » de l'arc Undefined).
export const LABEL_CLASS =
  'rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-black whitespace-nowrap'

const SIDE_CLASS = {
  // À gauche du bouton : glisse depuis le bouton vers la gauche.
  left: 'right-full top-1/2 mr-2 -translate-y-1/2 translate-x-1.5 origin-right group-hover/label:translate-x-0',
  // À droite du bouton : glisse depuis le bouton vers la droite.
  right:
    'left-full top-1/2 ml-2 -translate-y-1/2 -translate-x-1.5 origin-left group-hover/label:translate-x-0',
  // Sous le bouton (barre du haut) : descend depuis le bouton.
  bottom:
    'top-full left-1/2 mt-2 -translate-x-1/2 -translate-y-1 origin-top group-hover/label:translate-y-0',
  // Sous le bouton, aligné sur son bord droit (bouton collé au bord d'un conteneur).
  'bottom-end':
    'top-full right-0 mt-2 -translate-y-1 origin-top-right group-hover/label:translate-y-0',
}

/**
 * Étiquette qui explique un bouton au survol. Le bouton parent doit porter
 * `group/label relative`. Apparition en léger rebond (échelle + glissé + flou).
 */
export default function HoverLabel({
  children,
  side = 'left',
}: {
  children: string
  side?: keyof typeof SIDE_CLASS
}) {
  return (
    <span
      className={clsx(
        LABEL_CLASS,
        SIDE_CLASS[side],
        'pointer-events-none absolute z-20 scale-90 opacity-0 blur-[2px] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/label:scale-100 group-hover/label:opacity-100 group-hover/label:blur-none'
      )}
    >
      {children}
    </span>
  )
}
