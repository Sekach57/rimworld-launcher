import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, emptyStats, evaluate, normalizeStats, stampUnlocks } from '../src/shared/achievements.ts'
import { StatsStore } from '../src/main/stats.ts'

describe('achievement rules', () => {
  it('has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
  })

  it('evaluates progress and caps it at the target', () => {
    const s = emptyStats()
    s.counters.launches = 30
    const list = evaluate(s)
    expect(list.find((a) => a.id === 'regular')).toMatchObject({ unlocked: true, value: 25 })
    expect(list.find((a) => a.id === 'veteran')).toMatchObject({ unlocked: false, value: 30 })
    expect(list.find((a) => a.id === 'founder')?.unlocked).toBe(false)
  })

  it('keeps an unlock once stamped', () => {
    const s = emptyStats()
    s.counters.launches = 1
    expect(stampUnlocks(s, 5)).toEqual(['first-landing'])
    expect(stampUnlocks(s, 6)).toEqual([])
    s.counters.launches = 0
    expect(evaluate(s).find((a) => a.id === 'first-landing')).toMatchObject({ unlocked: true, unlockedAt: 5 })
  })

  it('normalizes junk', () => {
    expect(normalizeStats(null)).toEqual(emptyStats())
    const s = normalizeStats({ counters: { launches: 2.7, crashes: -1, nope: 4, cleanExits: 'x' }, unlockedAt: { fake: 1, 'first-landing': 3 } })
    expect(s.counters).toEqual({ launches: 2 })
    expect(s.unlockedAt).toEqual({ 'first-landing': 3 })
  })
})

describe('StatsStore', () => {
  let dir: string
  let t: number

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rwl-stats-'))
    t = 1000
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('starts empty', async () => {
    const p = await new StatsStore(dir).profile()
    expect(p.stats.counters).toEqual({})
    expect(p.achievements.every((a) => !a.unlocked)).toBe(true)
  })

  it('counts concurrent bumps without losing any', async () => {
    const store = new StatsStore(dir, () => t)
    await Promise.all(Array.from({ length: 20 }, () => store.bump('launches')))
    const p = await store.profile()
    expect(p.stats.counters.launches).toBe(20)
    expect(p.stats.firstAt).toBe(1000)
    expect(p.stats.unlockedAt['first-landing']).toBe(1000)
  })

  it('keeps the maximum', async () => {
    const store = new StatsStore(dir)
    await store.max('maxActiveMods', 120)
    await store.max('maxActiveMods', 40)
    expect((await store.profile()).stats.counters.maxActiveMods).toBe(120)
    expect((await store.profile()).achievements.find((a) => a.id === 'big-pack')?.unlocked).toBe(true)
  })

  it('survives a broken file and an unwritable dir', async () => {
    await writeFile(join(dir, 'stats.json'), '{oops')
    const store = new StatsStore(dir)
    await store.bump('crashes')
    expect(JSON.parse(await readFile(join(dir, 'stats.json'), 'utf8')).counters.crashes).toBe(1)
    const bad = new StatsStore(join(dir, 'missing', 'deeper'))
    await expect(bad.bump('launches')).resolves.toBeUndefined()
  })
})
