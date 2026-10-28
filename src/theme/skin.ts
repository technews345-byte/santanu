/** Video-reference skin. Financial semantics and storage live elsewhere. */
export const skin = {
  background: ['#081734', '#07124A', '#05091F'] as const,
  azure: '#4DA3FF', blue: '#0A3CFF', cyan: '#22D3EE',
  violet: '#A855F7', green: '#34D399', pink: '#F6A6D7',
  glassFill: 'rgba(255,255,255,0.08)',
  edge: 'rgba(255,255,255,0.45)', quietEdge: 'rgba(255,255,255,0.08)',
  cardRadius: 30, margin: 20, gap: 12, touchTarget: 44,
  spring: { damping: 24, stiffness: 220, mass: 1 },
  press: { damping: 25, stiffness: 350, mass: 0.8 },
  fadeMs: 200,
};
