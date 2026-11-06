import { describe, expect, it } from 'vitest'
import { sortMods } from '../src/shared/sort.ts'
import { index, mod } from './helpers.ts'

const V = '1.6.4633 rev1261'

describe('sortMods', () => {
  it('puts Core first and DLCs in official order', () => {
    const mods = [
      mod('some.mod'),
      mod('ludeon.rimworld.biotech'),
      mod('ludeon.rimworld.odyssey'),
      mod('ludeon.rimworld'),
      mod('ludeon.rimworld.royalty'),
      mod('ludeon.rimworld.ideology'),
      mod('ludeon.rimworld.anomaly')
    ]
    const { order, cycles } = sortMods(mods.map((m) => m.uid), index(mods), V)
    expect(order).toEqual([
      'ludeon.rimworld',
      'ludeon.rimworld.royalty',
      'ludeon.rimworld.ideology',
      'ludeon.rimworld.biotech',
      'ludeon.rimworld.anomaly',
      'ludeon.rimworld.odyssey',
      'some.mod'
    ])
    expect(cycles).toEqual([])
  })

  it('keeps Harmony before Core when it asks to load before it', () => {
    const mods = [mod('ludeon.rimworld'), mod('a.mod'), mod('brrainz.harmony', { loadBefore: ['ludeon.rimworld'] })]
    expect(sortMods(mods.map((m) => m.uid), index(mods), V).order).toEqual(['brrainz.harmony', 'ludeon.rimworld', 'a.mod'])
  })

  it('places dependencies and loadAfter targets first, otherwise keeps the current order', () => {
    const mods = [
      mod('ludeon.rimworld'),
      mod('z.first'),
      mod('needs.lib', { modDependencies: [{ packageId: 'the.lib' }] }),
      mod('y.second'),
      mod('the.lib'),
      mod('after.second', { loadAfter: ['y.second'] })
    ]
    expect(sortMods(mods.map((m) => m.uid), index(mods), V).order).toEqual([
      'ludeon.rimworld',
      'z.first',
      'y.second',
      'the.lib',
      'needs.lib',
      'after.second'
    ])
  })

  it('is stable: a sorted list sorts to itself', () => {
    const mods = [mod('ludeon.rimworld'), mod('a'), mod('b', { loadAfter: ['a'] }), mod('c')]
    const first = sortMods(['c', 'b', 'ludeon.rimworld', 'a'], index(mods), V).order
    expect(sortMods(first, index(mods), V).order).toEqual(first)
  })

  it('respects ByVersion rules for the running version', () => {
    const mods = [mod('ludeon.rimworld'), mod('a', { loadAfter: ['b'], loadAfterByVersion: { 'v1.6': [] } }), mod('b')]
    expect(sortMods(['ludeon.rimworld', 'a', 'b'], index(mods), V).order).toEqual(['ludeon.rimworld', 'a', 'b'])
    expect(sortMods(['ludeon.rimworld', 'a', 'b'], index(mods), '1.5.1 rev1').order).toEqual(['ludeon.rimworld', 'b', 'a'])
  })

  it('breaks loops without hanging and reports them', () => {
    const mods = [mod('ludeon.rimworld'), mod('a', { loadAfter: ['b'] }), mod('b', { loadAfter: ['a'] }), mod('c')]
    const { order, cycles } = sortMods(['ludeon.rimworld', 'a', 'b', 'c'], index(mods), V)
    expect(order).toHaveLength(4)
    expect(new Set(order).size).toBe(4)
    expect(order[0]).toBe('ludeon.rimworld')
    expect(cycles.length).toBe(1)
    expect(cycles[0]).toContain('a')
  })

  it('keeps mods that are not installed and drops repeated entries', () => {
    const mods = [mod('ludeon.rimworld'), mod('a')]
    expect(sortMods(['ghost.mod', 'a', 'ludeon.rimworld', 'a'], index(mods), V).order).toEqual(['ludeon.rimworld', 'ghost.mod', 'a'])
  })
})
