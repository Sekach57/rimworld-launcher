/** Mod list snapshots: rotation of automatic ones and a diff between two lists. */

export type SnapshotKind = 'auto' | 'named'

export interface Snapshot {
  id: string
  kind: SnapshotKind
  /** Only for named snapshots. */
  name?: string
  /** What triggered an automatic one, such as "before launch". */
  reason?: string
  createdAt: string
  activeMods: string[]
}

export const MAX_AUTO = 30

/** Newest first. Keeps every named snapshot and the newest `maxAuto` automatic ones. */
export function rotate(list: Snapshot[], maxAuto = MAX_AUTO): Snapshot[] {
  const sorted = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  let autos = 0
  return sorted.filter((s) => s.kind === 'named' || ++autos <= maxAuto)
}

/** Adds a snapshot and rotates. An automatic one equal to the newest snapshot is skipped. */
export function addSnapshot(list: Snapshot[], snap: Snapshot, maxAuto = MAX_AUTO): Snapshot[] {
  if (snap.kind === 'auto') {
    const newest = rotate(list, maxAuto)[0]
    if (newest && sameList(newest.activeMods, snap.activeMods)) return rotate(list, maxAuto)
  }
  return rotate([...list, snap], maxAuto)
}

export function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export interface ListDiff {
  added: string[]
  removed: string[]
  /** Mods in both lists whose position relative to the others changed. */
  moved: string[]
}

/** Longest increasing subsequence of `seq`, as a set of indices. */
function lisIndices(seq: number[]): Set<number> {
  const best: number[] = seq.map(() => 1)
  const prev: number[] = seq.map(() => -1)
  let end = -1
  for (let i = 0; i < seq.length; i++) {
    for (let j = 0; j < i; j++) {
      if (seq[j] < seq[i] && best[j] + 1 > best[i]) {
        best[i] = best[j] + 1
        prev[i] = j
      }
    }
    if (end < 0 || best[i] > best[end]) end = i
  }
  const keep = new Set<number>()
  for (let i = end; i >= 0; i = prev[i]) keep.add(i)
  return keep
}

/** What it takes to go from `from` to `to`. A mod that merely shifted because others came or went is not "moved". */
export function diffLists(from: string[], to: string[]): ListDiff {
  const fromSet = new Set(from)
  const toSet = new Set(to)
  const added = to.filter((u) => !fromSet.has(u))
  const removed = from.filter((u) => !toSet.has(u))
  const common = from.filter((u) => toSet.has(u))
  const target = new Map(to.filter((u) => fromSet.has(u)).map((u, i) => [u, i]))
  const keep = lisIndices(common.map((u) => target.get(u)!))
  const moved = common.filter((_, i) => !keep.has(i))
  return { added, removed, moved }
}

export const isEmptyDiff = (d: ListDiff) => d.added.length + d.removed.length + d.moved.length === 0
