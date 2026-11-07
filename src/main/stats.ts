/** Usage counters for profile achievements. Writes are queued; failures never reach the caller. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { emptyStats, evaluate, normalizeStats, stampUnlocks, type Profile, type StatKey, type Stats } from '../shared/achievements.ts'

export class StatsStore {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now
  ) {}

  private get file(): string {
    return join(this.dir, 'stats.json')
  }

  async load(): Promise<Stats> {
    try {
      return normalizeStats(JSON.parse(await readFile(this.file, 'utf8')))
    } catch {
      return emptyStats()
    }
  }

  async profile(): Promise<Profile> {
    await this.queue
    const stats = await this.load()
    return { stats, achievements: evaluate(stats) }
  }

  private update(fn: (s: Stats) => void): Promise<void> {
    const run = this.queue.then(async () => {
      const s = await this.load()
      fn(s)
      const t = this.now()
      s.firstAt ??= t
      s.lastAt = t
      stampUnlocks(s, t)
      await writeFile(this.file, JSON.stringify(s), 'utf8')
    })
    this.queue = run.catch(() => undefined)
    return this.queue as Promise<void>
  }

  bump(key: StatKey, n = 1): Promise<void> {
    return this.update((s) => {
      s.counters[key] = (s.counters[key] ?? 0) + n
    })
  }

  /** Keeps the highest value seen, e.g. the biggest active mod list. */
  max(key: StatKey, value: number): Promise<void> {
    return this.update((s) => {
      if (value > (s.counters[key] ?? 0)) s.counters[key] = Math.floor(value)
    })
  }
}
