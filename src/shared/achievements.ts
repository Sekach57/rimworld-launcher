/** Local profile achievements: pure rules over counters kept in userData/stats.json. */

export type StatKey =
  | 'launches'
  | 'cleanExits'
  | 'crashes'
  | 'instancesCreated'
  | 'imports'
  | 'modListSaves'
  | 'bisectsDone'
  | 'logsAnalyzed'
  | 'snapshotsSaved'
  | 'snapshotsRestored'
  | 'listsExported'
  | 'listsImported'
  | 'categoriesSet'
  | 'steamLinked'
  | 'maxActiveMods'

export const STAT_KEYS: StatKey[] = [
  'launches',
  'cleanExits',
  'crashes',
  'instancesCreated',
  'imports',
  'modListSaves',
  'bisectsDone',
  'logsAnalyzed',
  'snapshotsSaved',
  'snapshotsRestored',
  'listsExported',
  'listsImported',
  'categoriesSet',
  'steamLinked',
  'maxActiveMods'
]

export interface Stats {
  counters: Partial<Record<StatKey, number>>
  firstAt?: number
  lastAt?: number
  /** When each achievement was first seen unlocked. */
  unlockedAt: Record<string, number>
}

export type AchievementIcon = 'rocket' | 'shield' | 'skull' | 'layers' | 'search' | 'save' | 'share' | 'tag' | 'link' | 'boxes' | 'flame'

export interface AchievementDef {
  id: string
  title: string
  description: string
  icon: AchievementIcon
  stat: StatKey
  target: number
}

export interface Achievement extends AchievementDef {
  value: number
  unlocked: boolean
  unlockedAt?: number
}

export interface Profile {
  stats: Stats
  achievements: Achievement[]
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-landing', title: 'First landing', description: 'Launch the game from the launcher.', icon: 'rocket', stat: 'launches', target: 1 },
  { id: 'regular', title: 'Regular', description: 'Launch the game 25 times.', icon: 'rocket', stat: 'launches', target: 25 },
  { id: 'veteran', title: 'Veteran', description: 'Launch the game 100 times.', icon: 'flame', stat: 'launches', target: 100 },
  { id: 'clean-run', title: 'Clean run', description: 'Close the game with no errors in the log.', icon: 'shield', stat: 'cleanExits', target: 1 },
  { id: 'stable-colony', title: 'Stable colony', description: '10 clean game sessions.', icon: 'shield', stat: 'cleanExits', target: 10 },
  { id: 'red-errors', title: 'Red errors', description: 'Survive a crash or an error-filled session.', icon: 'skull', stat: 'crashes', target: 1 },
  { id: 'founder', title: 'Founder', description: 'Create an instance.', icon: 'layers', stat: 'instancesCreated', target: 1 },
  { id: 'many-worlds', title: 'Many worlds', description: 'Create 5 instances.', icon: 'layers', stat: 'instancesCreated', target: 5 },
  { id: 'big-pack', title: 'Big pack', description: 'Have 100 mods active at once.', icon: 'boxes', stat: 'maxActiveMods', target: 100 },
  { id: 'mega-pack', title: 'Mega pack', description: 'Have 300 mods active at once.', icon: 'boxes', stat: 'maxActiveMods', target: 300 },
  { id: 'detective', title: 'Detective', description: 'Finish a bisect and find the broken mod.', icon: 'search', stat: 'bisectsDone', target: 1 },
  { id: 'log-reader', title: 'Log reader', description: 'Analyze the game log 10 times.', icon: 'search', stat: 'logsAnalyzed', target: 10 },
  { id: 'insurance', title: 'Insurance', description: 'Save a snapshot by hand.', icon: 'save', stat: 'snapshotsSaved', target: 1 },
  { id: 'time-travel', title: 'Time travel', description: 'Restore a snapshot.', icon: 'save', stat: 'snapshotsRestored', target: 1 },
  { id: 'sharer', title: 'Sharer', description: 'Export a mod list.', icon: 'share', stat: 'listsExported', target: 1 },
  { id: 'librarian', title: 'Librarian', description: 'Set a category by hand 10 times.', icon: 'tag', stat: 'categoriesSet', target: 10 },
  { id: 'linked', title: 'Linked', description: 'Add a Steam Web API key.', icon: 'link', stat: 'steamLinked', target: 1 }
]

export function emptyStats(): Stats {
  return { counters: {}, unlockedAt: {} }
}

/** Drops unknown keys and bad numbers so a hand-edited stats.json cannot break the view. */
export function normalizeStats(raw: unknown): Stats {
  const out = emptyStats()
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  const counters = (r.counters ?? {}) as Record<string, unknown>
  for (const k of STAT_KEYS) {
    const v = counters[k]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.counters[k] = Math.floor(v)
  }
  if (typeof r.firstAt === 'number') out.firstAt = r.firstAt
  if (typeof r.lastAt === 'number') out.lastAt = r.lastAt
  const unlocked = (r.unlockedAt ?? {}) as Record<string, unknown>
  for (const a of ACHIEVEMENTS) if (typeof unlocked[a.id] === 'number') out.unlockedAt[a.id] = unlocked[a.id] as number
  return out
}

export function evaluate(stats: Stats): Achievement[] {
  return ACHIEVEMENTS.map((a) => {
    const value = stats.counters[a.stat] ?? 0
    const unlocked = value >= a.target || a.id in stats.unlockedAt
    return { ...a, value: Math.min(value, a.target), unlocked, unlockedAt: stats.unlockedAt[a.id] }
  })
}

/** Records the unlock time for anything newly reached; returns the ids that just unlocked. */
export function stampUnlocks(stats: Stats, now: number): string[] {
  const fresh: string[] = []
  for (const a of ACHIEVEMENTS) {
    if (a.id in stats.unlockedAt) continue
    if ((stats.counters[a.stat] ?? 0) >= a.target) {
      stats.unlockedAt[a.id] = now
      fresh.push(a.id)
    }
  }
  return fresh
}
