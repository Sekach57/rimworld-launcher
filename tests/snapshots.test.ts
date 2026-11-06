import { describe, expect, it } from 'vitest'
import { addSnapshot, diffLists, isEmptyDiff, rotate, type Snapshot } from '../src/shared/snapshots.ts'
import { missingMods, parseList, serializeList } from '../src/shared/modlistIO.ts'

const snap = (n: number, kind: 'auto' | 'named' = 'auto', mods = [`m${n}`]): Snapshot => ({
  id: `s${n}`,
  kind,
  name: kind === 'named' ? `n${n}` : undefined,
  createdAt: new Date(2026, 0, 1, 0, n).toISOString(),
  activeMods: mods
})

describe('rotate', () => {
  it('keeps the newest 30 automatic snapshots, newest first', () => {
    const list = Array.from({ length: 40 }, (_, i) => snap(i))
    const out = rotate(list)
    expect(out).toHaveLength(30)
    expect(out[0].id).toBe('s39')
    expect(out[29].id).toBe('s10')
  })
  it('never drops named snapshots', () => {
    const list = [...Array.from({ length: 35 }, (_, i) => snap(i + 100)), ...Array.from({ length: 5 }, (_, i) => snap(i, 'named'))]
    const out = rotate(list)
    expect(out.filter((s) => s.kind === 'named')).toHaveLength(5)
    expect(out.filter((s) => s.kind === 'auto')).toHaveLength(30)
  })
  it('skips an automatic snapshot identical to the newest one', () => {
    const a = addSnapshot([], snap(1, 'auto', ['a', 'b']))
    expect(addSnapshot(a, snap(2, 'auto', ['a', 'b']))).toHaveLength(1)
    expect(addSnapshot(a, snap(3, 'auto', ['b', 'a']))).toHaveLength(2)
    expect(addSnapshot(a, snap(4, 'named', ['a', 'b']))).toHaveLength(2)
  })
})

describe('diffLists', () => {
  it('reports added and removed', () => {
    const d = diffLists(['a', 'b', 'c'], ['a', 'c', 'd'])
    expect(d.added).toEqual(['d'])
    expect(d.removed).toEqual(['b'])
    expect(d.moved).toEqual([])
  })
  it('reports a moved mod once, not everything it jumped over', () => {
    expect(diffLists(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a']).moved).toEqual(['a'])
    expect(diffLists(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c']).moved).toEqual(['d'])
  })
  it('ignores shifts caused by additions and removals', () => {
    expect(diffLists(['a', 'x', 'b'], ['a', 'b']).moved).toEqual([])
  })
  it('is empty for equal lists', () => {
    expect(isEmptyDiff(diffLists(['a', 'b'], ['a', 'b']))).toBe(true)
  })
})

describe('modlistIO', () => {
  const input = { name: 'My list', activeMods: ['ludeon.rimworld', 'a.b'], gameVersion: '1.6.0 rev1', knownExpansions: [] }
  it('round-trips the launcher JSON', () => {
    expect(parseList(serializeList(input, 'json'))).toEqual({ name: 'My list', activeMods: ['ludeon.rimworld', 'a.b'] })
  })
  it('round-trips the ModsConfig.xml style', () => {
    expect(parseList(serializeList(input, 'xml')).activeMods).toEqual(['ludeon.rimworld', 'a.b'])
  })
  it('rejects other files', () => {
    expect(() => parseList('hello')).toThrow()
    expect(() => parseList('{"a":1}')).toThrow()
  })
  it('lists mods that are not installed', () => {
    expect(missingMods(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual(['b'])
  })
})

describe('snapshot files', () => {
  it('stores, rotates and deletes in a temp dir', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { deleteSnapshot, readSnapshots, takeSnapshot } = await import('../src/main/tools.ts')
    const dir = await mkdtemp(join(tmpdir(), 'rwl-snap-'))
    try {
      for (let i = 0; i < 33; i++) await takeSnapshot(dir, [`m${i}`], 'auto', 'before change')
      await takeSnapshot(dir, ['x'], 'named', 'Stable')
      const all = await readSnapshots(dir)
      expect(all.filter((s) => s.kind === 'auto')).toHaveLength(30)
      const named = all.find((s) => s.kind === 'named')!
      expect(named.name).toBe('Stable')
      expect(await deleteSnapshot(dir, named.id)).toHaveLength(30)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
