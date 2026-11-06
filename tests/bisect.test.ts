import { describe, expect, it } from 'vitest'
import { answerBisect, dependencyClosure, halve, restoreList, splitActive, startBisect, stepsFor, testList, type DepMap } from '../src/shared/bisect.ts'

const official = (u: string) => u === 'ludeon.rimworld' || u.startsWith('ludeon.rimworld.')
const names = (n: number) => Array.from({ length: n }, (_, i) => `m.mod${i}`)

describe('bisect', () => {
  it('computes dependency closure within a set', () => {
    const deps: DepMap = { a: ['b'], b: ['c'], c: [], d: ['a'] }
    expect(dependencyClosure(['a'], deps)).toEqual(['a', 'b', 'c'])
    expect(dependencyClosure(['d'], deps, new Set(['d', 'a']))).toEqual(['d', 'a'])
  })

  it('keeps official mods, libraries and their dependencies fixed', () => {
    const active = ['ludeon.rimworld', 'lib.harmony', 'lib.core', 'm.a', 'm.b']
    const deps: DepMap = { 'm.a': ['lib.harmony'], 'm.b': ['lib.core'], 'lib.core': ['lib.harmony'] }
    const { fixed, suspects } = splitActive(active, deps, official)
    expect(fixed).toEqual(['ludeon.rimworld', 'lib.harmony', 'lib.core'])
    expect(suspects).toEqual(['m.a', 'm.b'])
  })

  it('halves the suspects and pulls in their dependencies', () => {
    const s = ['x', 'y', 'z', 'w']
    expect(halve(s, {})).toEqual(['x', 'y'])
    expect(halve(s, { x: ['w'] })).toEqual(['x', 'y', 'w'])
  })

  it('estimates steps', () => {
    expect([0, 1, 2, 3, 8, 9].map(stepsFor)).toEqual([0, 0, 1, 2, 3, 4])
  })

  it('converges on a culprit in about log2 steps and keeps load order', () => {
    const active = ['ludeon.rimworld', ...names(16)]
    const culprit = 'm.mod11'
    let state = startBisect(active, {}, official)
    expect(state.totalSteps).toBe(4)
    let steps = 0
    while (!state.done) {
      const list = testList(state)
      expect(list[0]).toBe('ludeon.rimworld')
      expect(list).toEqual(active.filter((u) => list.includes(u)))
      state = answerBisect(state, list.includes(culprit), {})
      steps++
    }
    expect(steps).toBe(4)
    expect(state.culprits).toEqual([culprit])
  })

  it('handles every possible culprit in a list of 11', () => {
    const active = ['ludeon.rimworld', ...names(11)]
    for (const culprit of names(11)) {
      let state = startBisect(active, {}, official)
      while (!state.done) state = answerBisect(state, testList(state).includes(culprit), {})
      expect(state.culprits).toEqual([culprit])
    }
  })

  it('ends with no culprits when everything is fixed', () => {
    const state = startBisect(['ludeon.rimworld'], {}, official)
    expect(state.done).toBe(true)
    expect(state.culprits).toEqual([])
  })

  it('treats mutual dependencies as libraries', () => {
    const state = startBisect(['ludeon.rimworld', 'a', 'b'], { a: ['b'], b: ['a'] }, official)
    expect(state.done).toBe(true)
    expect(state.culprits).toEqual([])
  })

  it('stops when the closure cannot shrink the set', () => {
    const start = startBisect(['ludeon.rimworld', 'a', 'b', 'c', 'd'], {}, official)
    const next = answerBisect(start, true, {})
    const stuck = answerBisect({ ...next, suspects: ['a', 'b', 'c'], testing: ['a', 'b'], done: false }, true, { a: ['b'] })
    expect(stuck.done).toBe(true)
    expect(stuck.culprits).toEqual(['a', 'b'])
  })

  it('restores the original list at any point', () => {
    const active = ['ludeon.rimworld', ...names(6)]
    const state = answerBisect(startBisect(active, {}, official), true, {})
    expect(restoreList(state)).toEqual(active)
    expect(testList(state)).not.toEqual(active)
  })
})
