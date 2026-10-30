// Arcs « à proposer » : ce ne sont pas de vrais arcs jouables. Pour ceux-ci,
// le panneau n'affiche pas l'onglet Serveur et le bouton Jouer devient
// « Proposer un arc » (ouvre un channel Discord, sans installation ni
// paramètres). Liste maintenue en dur par slug.
const PROPOSAL_ARC_SLUGS = new Set(['arcend-undefined'])

// Channel Discord « proposer un arc ».
export const PROPOSE_ARC_DISCORD_URL =
  'https://discord.com/channels/1508891005569728695/1518772868509597938'

export function isProposalArc(slug: string | null | undefined): boolean {
  return !!slug && PROPOSAL_ARC_SLUGS.has(slug)
}

// Arcs jouables sans serveur : pas d'onglet Serveur (mais Logs conservé).
const NO_SERVER_ARC_SLUGS = new Set(['arcend-prologue'])

export function hasServerTab(slug: string | null | undefined): boolean {
  return !isProposalArc(slug) && !(!!slug && NO_SERVER_ARC_SLUGS.has(slug))
}

// Arcs épinglés tout en haut de la sidebar, dans cet ordre, quel que soit leur
// calendrier.
export const PINNED_ARC_SLUGS = ['arcend-horror', 'arcend-prologue']
