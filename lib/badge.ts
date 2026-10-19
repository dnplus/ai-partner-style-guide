// A shields-style badge for a GitHub README. Latin text only, so it renders the same through GitHub's image proxy.
const LABEL = 'AI Partner Style';
const width = (text: string) => Math.round([...text].reduce((n, c) => n + (/[A-Z0-9]/.test(c) ? 7.6 : c === ' ' ? 3.6 : 6.4), 0) + 14);
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function badgeSvg(value: string, color: string) {
  const left = width(LABEL), right = width(value), total = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${xml(LABEL)}: ${xml(value)}"><title>${xml(LABEL)}: ${xml(value)}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient><clipPath id="r"><rect width="${total}" height="20" rx="4" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${left}" height="20" fill="#2c2238"/><rect x="${left}" width="${right}" height="20" fill="${color}"/><rect width="${total}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${left / 2}" y="14">${xml(LABEL)}</text><text x="${left + right / 2}" y="14">${xml(value)}</text></g></svg>`;
}
// Rarity sets the colour, like the card frame: common, rare, epic, legendary.
export const badgeColors = {common: '#7a6b8f', rare: '#7954ed', epic: '#a347c9', legendary: '#c8922f', missing: '#9f9f9f'} as const;
