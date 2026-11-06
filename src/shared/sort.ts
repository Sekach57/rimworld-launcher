import { forVersion } from './about.ts'
import type { ModInfo } from './types.ts'

export const CORE_ID = 'ludeon.rimworld'
export const OFFICIAL_ORDER = [
  'ludeon.rimworld',
  'ludeon.rimworld.royalty',
  'ludeon.rimworld.ideology',
  'ludeon.rimworld.biotech',
  'ludeon.rimworld.anomaly',
  'ludeon.rimworld.odyssey'
]

export function isOfficial(packageId: string): boolean {
  return packageId === CORE_ID || packageId.startsWith('ludeon.')
}

function officialRank(packageId: string): number {
  const i = OFFICIAL_ORDER.indexOf(packageId)
  return i >= 0 ? i : OFFICIAL_ORDER.length
}

export type EdgeReason = 'loadAfter' | 'loadBefore' | 'forceLoadAfter' | 'forceLoadBefore' | 'dependency' | 'official'

/** `from` must load before `to`. Both are uids from the active list. */
export interface Edge {
  from: string
  to: string
  reason: EdgeReason
  /** The mod whose About.xml declared the rule. */
  declaredBy: string
}

/** The packageId a ModsConfig uid points at: "foo.bar_steam" -> "foo.bar". */
export function packageIdOfUid(uid: string): string {
  return uid.endsWith('_steam') ? uid.slice(0, -'_steam'.length) : uid
}

/**
 * Ordering rules between the active mods for one game version.
 * `mods` maps uid -> mod; active uids that are not installed are skipped.
 */
export function buildEdges(active: string[], mods: Map<string, ModInfo>, gameVersion: string): Edge[] {
  const byPkg = new Map<string, string>()
  for (const uid of active) {
    const pkg = mods.get(uid)?.packageId ?? packageIdOfUid(uid)
    if (!byPkg.has(pkg)) byPkg.set(pkg, uid)
  }
  const edges: Edge[] = []
  const seen = new Set<string>()
  const add = (from: string | undefined, to: string | undefined, reason: EdgeReason, declaredBy: string) => {
    if (!from || !to || from === to) return
    const key = `${from}\u0000${to}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ from, to, reason, declaredBy })
  }

  for (const uid of active) {
    const mod = mods.get(uid)
    if (!mod) continue
    for (const p of forVersion(mod.loadAfter, mod.loadAfterByVersion, gameVersion)) add(byPkg.get(p), uid, 'loadAfter', uid)
    for (const p of forVersion(mod.loadBefore, mod.loadBeforeByVersion, gameVersion)) add(uid, byPkg.get(p), 'loadBefore', uid)
    for (const p of mod.forceLoadAfter) add(byPkg.get(p), uid, 'forceLoadAfter', uid)
    for (const p of mod.forceLoadBefore) add(uid, byPkg.get(p), 'forceLoadBefore', uid)
    for (const d of forVersion(mod.modDependencies, mod.modDependenciesByVersion, gameVersion)) {
      add(byPkg.get(d.packageId), uid, 'dependency', uid)
    }
  }

  const officials = active
    .filter((uid) => isOfficial(mods.get(uid)?.packageId ?? packageIdOfUid(uid)))
    .map((uid, i) => ({ uid, i, rank: officialRank(mods.get(uid)?.packageId ?? packageIdOfUid(uid)) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
  for (let i = 1; i < officials.length; i++) add(officials[i - 1].uid, officials[i].uid, 'official', officials[i].uid)
  return edges
}

/** Mods that some rule places before an official mod, directly or through other mods. */
export function precedesOfficial(list: string[], edges: Edge[], pkg: (uid: string) => string): Set<string> {
  const preds = new Map<string, string[]>()
  for (const e of edges) preds.set(e.to, [...(preds.get(e.to) ?? []), e.from])
  const found = new Set<string>()
  const stack = list.filter((uid) => isOfficial(pkg(uid)))
  while (stack.length) {
    const cur = stack.pop()!
    for (const p of preds.get(cur) ?? []) {
      if (!found.has(p)) {
        found.add(p)
        stack.push(p)
      }
    }
  }
  return found
}

export interface SortResult {
  order: string[]
  /** Each entry lists mods caught in a dependency loop; the first one was placed early to break it. */
  cycles: string[][]
}

/**
 * Core and DLCs first in official order, then everything else in a stable topological order.
 * Ties keep the current list order. Loops never hang the sort: the stuck mod with the fewest
 * unmet rules goes next and the loop is reported.
 */
export function sortMods(active: string[], mods: Map<string, ModInfo>, gameVersion: string): SortResult {
  const list = [...new Set(active)]
  const index = new Map(list.map((uid, i) => [uid, i]))
  const edges = buildEdges(list, mods, gameVersion)
  const pkg = (uid: string) => mods.get(uid)?.packageId ?? packageIdOfUid(uid)

  // Mods that must come before some official (Harmony loads before Core) keep their own rules.
  // Every other mod goes after the last official.
  const mustPrecedeOfficial = precedesOfficial(list, edges, pkg)
  const officialEdges = edges.filter((e) => e.reason === 'official')
  const officials = list.filter((uid) => isOfficial(pkg(uid)))
  const lastOfficial = officialEdges.length ? officialEdges[officialEdges.length - 1].to : officials[0]
  const all = [...edges]
  if (lastOfficial) {
    for (const uid of list) {
      if (isOfficial(pkg(uid)) || mustPrecedeOfficial.has(uid)) continue
      all.push({ from: lastOfficial, to: uid, reason: 'official', declaredBy: uid })
    }
  }

  const out = new Map<string, Set<string>>()
  const indeg = new Map<string, number>(list.map((uid) => [uid, 0]))
  for (const e of all) {
    const set = out.get(e.from) ?? new Set<string>()
    if (set.has(e.to)) continue
    set.add(e.to)
    out.set(e.from, set)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }

  const remaining = new Set(list)
  const order: string[] = []
  const cycles: string[][] = []
  const byIndex = (a: string, b: string) => index.get(a)! - index.get(b)!
  while (remaining.size) {
    let next: string | undefined
    for (const uid of remaining) {
      if (indeg.get(uid) === 0 && (next === undefined || byIndex(uid, next) < 0)) next = uid
    }
    if (next === undefined) {
      for (const uid of remaining) {
        if (
          next === undefined ||
          indeg.get(uid)! < indeg.get(next)! ||
          (indeg.get(uid) === indeg.get(next) && byIndex(uid, next) < 0)
        ) {
          next = uid
        }
      }
      const blockers = [...remaining].filter((uid) => out.get(uid)?.has(next!))
      cycles.push([next!, ...blockers.sort(byIndex)])
    }
    const chosen = next!
    remaining.delete(chosen)
    order.push(chosen)
    for (const to of out.get(chosen) ?? []) indeg.set(to, indeg.get(to)! - 1)
  }
  return { order, cycles }
}
