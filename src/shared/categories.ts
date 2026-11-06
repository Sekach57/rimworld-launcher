import type { ModInfo } from './types.ts'

export const CATEGORIES = [
  'Official',
  'Framework',
  'UI & QoL',
  'Performance',
  'Graphics',
  'Weapons',
  'Apparel',
  'Races',
  'Factions',
  'Buildings',
  'Animals',
  'Events',
  'Translation',
  'Other'
] as const

export type Category = (typeof CATEGORIES)[number]

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
}

const FRAMEWORK_IDS = new Set([
  'brrainz.harmony',
  'unlimitedhugs.hugslib',
  'jecrell.jecstools',
  'oskarpotocki.vanillafactionsexpanded.core',
  'oskarpotocki.vfe.core',
  'erdelf.humanoidalienraces',
  'ogliss.alienvspredator.core',
  'adaptive.storage.framework',
  'owlchemist.cherrypicker',
  'zetrith.prepatcher',
  'kentington.saveourship2',
  'imranfish.xmlextensions'
])

/** Checked in order; the first rule with a hit wins. Name and packageId count double, description once. */
const RULES: [Category, RegExp][] = [
  ['Translation', /\b(translation|localization|localisation|russian|chinese|japanese|korean|german|french|spanish|polish|portuguese|ukrainian|русск|перевод)\b/],
  ['Performance', /\b(performance|optimi[sz]ation|optimi[sz]er|fps|tick ?rate|rocketman|lag|faster)\b/],
  ['Races', /\b(race|races|xenotype|xenotypes|genes?|humanoid|alien)\b/],
  ['Factions', /\b(faction|factions|tribe|empire|pirates?|outlanders?|mechanoids?)\b/],
  ['Weapons', /\b(weapons?|guns?|firearms?|swords?|melee|ammo|turrets?|armou?ry)\b/],
  ['Apparel', /\b(apparel|clothing|clothes|armou?r|outfits?|hats?|helmets?|hair|hairstyles?|beards?)\b/],
  ['Animals', /\b(animals?|creatures?|pets?|beasts?|insects?|livestock|fauna)\b/],
  ['Buildings', /\b(furniture|buildings?|walls?|doors?|floors?|architect|decorations?|storage|shelf|shelves|production|bench)\b/],
  ['Events', /\b(storytellers?|events?|incidents?|quests?|raids?)\b/],
  ['Graphics', /\b(textures?|retexture|graphics?|sprites?|visuals?|art|hd|portraits?)\b/],
  ['UI & QoL', /\b(ui|interface|qol|quality of life|tabs?|menus?|overlay|hotkeys?|keybinds?|alerts?|manager|sorting|search|filters?|info)\b/],
  ['Framework', /\b(framework|library|lib|core|api)\b/]
]

function score(re: RegExp, strong: string, weak: string): number {
  return (re.test(strong) ? 2 : 0) + (re.test(weak) ? 1 : 0)
}

/** Best guess at a mod's category from its About.xml and its folder layout. */
export function autoCategory(mod: Pick<ModInfo, 'packageId' | 'name' | 'description' | 'source'> & { contentHints?: string[] }): Category {
  const pkg = mod.packageId.toLowerCase()
  if (mod.source === 'official' || pkg.startsWith('ludeon.')) return 'Official'
  if (FRAMEWORK_IDS.has(pkg)) return 'Framework'

  const strong = `${mod.name} ${pkg.replace(/[._]/g, ' ')}`.toLowerCase()
  const weak = (mod.description ?? '').slice(0, 600).toLowerCase()
  let best: Category | undefined
  let bestScore = 0
  for (const [cat, re] of RULES) {
    const s = score(re, strong, weak)
    if (s > bestScore) {
      best = cat
      bestScore = s
    }
  }
  // A name hit is a strong signal; a description-only hit needs no better folder hint.
  if (best && bestScore >= 2) return best

  const hints = new Set(mod.contentHints ?? [])
  if (hints.size > 0) {
    const only = (...names: string[]) => [...hints].every((h) => names.includes(h))
    if (only('textures', 'sounds')) return 'Graphics'
    if (only('languages')) return 'Translation'
    if (hints.has('assemblies') && !hints.has('defs') && !hints.has('patches')) return 'UI & QoL'
  }
  return best ?? 'Other'
}

/** Manual choice wins over the guess. Overrides are keyed by packageId so they survive Workshop/local copies. */
export function categoryOf(mod: Parameters<typeof autoCategory>[0], overrides: Record<string, string>): Category {
  const manual = overrides[mod.packageId.toLowerCase()]
  return isCategory(manual) ? manual : autoCategory(mod)
}

/** Keep only known categories with non-empty string keys. */
export function sanitizeOverrides(raw: unknown): Record<string, Category> {
  const out: Record<string, Category> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k && k.length < 300 && isCategory(v)) out[k.toLowerCase()] = v
  }
  return out
}
