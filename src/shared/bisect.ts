/**
 * Pure bisect algorithm for finding the mod that causes a problem.
 * Core, DLC and library mods (anything another active mod depends on) always stay on.
 * The remaining suspects are halved each step. No file or Electron access here.
 */

export interface BisectState {
  /** The list to put back when the bisect ends or is cancelled. */
  original: string[]
  /** Always enabled: official content, libraries and their dependencies. */
  fixed: string[]
  /** Candidates that may still hold the culprit, in load order. */
  suspects: string[]
  /** The suspects enabled in the current test. */
  testing: string[]
  step: number
  totalSteps: number
  done: boolean
  /** Final suspects once done. Empty means the problem is in the fixed set. */
  culprits: string[]
}

/** uid -> uids it depends on (only active ones matter). */
export type DepMap = Record<string, string[]>

/** Seeds plus everything they depend on, limited to `within` when given. Result keeps discovery order. */
export function dependencyClosure(seeds: string[], deps: DepMap, within?: Set<string>): string[] {
  const seen = new Set<string>()
  const queue = [...seeds]
  while (queue.length) {
    const uid = queue.shift()!
    if (seen.has(uid) || (within && !within.has(uid))) continue
    seen.add(uid)
    queue.push(...(deps[uid] ?? []))
  }
  return [...seen]
}

export function stepsFor(suspects: number): number {
  return suspects <= 1 ? 0 : Math.ceil(Math.log2(suspects))
}

/** Splits the active list into fixed mods and suspects, both in load order. */
export function splitActive(active: string[], deps: DepMap, isOfficial: (uid: string) => boolean): { fixed: string[]; suspects: string[] } {
  const activeSet = new Set(active)
  const seeds = new Set(active.filter(isOfficial))
  for (const uid of active) for (const d of deps[uid] ?? []) if (activeSet.has(d)) seeds.add(d)
  const fixedSet = new Set(dependencyClosure([...seeds], deps, activeSet))
  return { fixed: active.filter((u) => fixedSet.has(u)), suspects: active.filter((u) => !fixedSet.has(u)) }
}

/** First half of the suspects plus whatever they need among the suspects. */
export function halve(suspects: string[], deps: DepMap): string[] {
  const set = new Set(suspects)
  const take = suspects.slice(0, Math.ceil(suspects.length / 2))
  const closed = new Set(dependencyClosure(take, deps, set))
  return suspects.filter((u) => closed.has(u))
}

function advance(state: BisectState, deps: DepMap): BisectState {
  const { suspects } = state
  if (suspects.length <= 1) return { ...state, testing: [], done: true, culprits: suspects }
  const testing = halve(suspects, deps)
  // The closure swallowed everything: this set cannot be narrowed further.
  if (testing.length >= suspects.length) return { ...state, testing: [], done: true, culprits: suspects }
  return { ...state, testing }
}

export function startBisect(active: string[], deps: DepMap, isOfficial: (uid: string) => boolean): BisectState {
  const { fixed, suspects } = splitActive(active, deps, isOfficial)
  return advance({ original: [...active], fixed, suspects, testing: [], step: 1, totalSteps: stepsFor(suspects.length), done: false, culprits: [] }, deps)
}

/** The mod list to write for the current test, in the original load order. */
export function testList(state: BisectState): string[] {
  const on = new Set([...state.fixed, ...state.testing])
  return state.original.filter((u) => on.has(u))
}

/** problemRemains: the problem is still there with the test list enabled. */
export function answerBisect(state: BisectState, problemRemains: boolean, deps: DepMap): BisectState {
  if (state.done) return state
  const testing = new Set(state.testing)
  const suspects = state.suspects.filter((u) => testing.has(u) === problemRemains)
  return advance({ ...state, suspects, step: state.step + 1 }, deps)
}

/** The list to restore when finishing or cancelling. */
export function restoreList(state: BisectState): string[] {
  return [...state.original]
}
