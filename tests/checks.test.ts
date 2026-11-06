import { describe, expect, it } from 'vitest'
import { checkMods, issuesByUid, moveWarnings } from '../src/shared/checks.ts'
import { mod } from './helpers.ts'

const V = '1.6.4633 rev1261'
const core = mod('ludeon.rimworld')

function kinds(active: string[], installed: ReturnType<typeof mod>[], version = V) {
  return checkMods(active, installed, version).map((i) => `${i.kind}:${i.uid}`)
}

describe('checkMods', () => {
  it('reports nothing for a clean list', () => {
    const lib = mod('the.lib')
    const user = mod('uses.lib', { modDependencies: [{ packageId: 'the.lib' }], loadAfter: ['the.lib'] })
    expect(checkMods(['ludeon.rimworld', 'the.lib', 'uses.lib'], [core, lib, user], V)).toEqual([])
  })

  it('tells installed-but-inactive dependencies apart from missing ones', () => {
    const lib = mod('the.lib', { name: 'The Lib' })
    const user = mod('uses.lib', { modDependencies: [{ packageId: 'the.lib' }, { packageId: 'gone.lib', displayName: 'Gone' }] })
    const issues = checkMods(['ludeon.rimworld', 'uses.lib'], [core, lib, user], V)
    expect(issues.map((i) => i.message)).toEqual([
      'Needs The Lib, which is installed but not active',
      'Needs Gone, which is not installed'
    ])
    expect(issues.every((i) => i.kind === 'missing-dependency' && i.severity === 'error')).toBe(true)
  })

  it('uses the dependency list for the running version', () => {
    const user = mod('a', { modDependencies: [{ packageId: 'x' }], modDependenciesByVersion: { 'v1.6': [] } })
    expect(kinds(['ludeon.rimworld', 'a'], [core, user])).toEqual([])
    expect(kinds(['ludeon.rimworld', 'a'], [core, user], '1.5.1 rev1')).toContain('missing-dependency:a')
  })

  it('reports an incompatible pair once', () => {
    const a = mod('a', { incompatibleWith: ['b'] })
    const b = mod('b', { incompatibleWith: ['a'] })
    expect(kinds(['ludeon.rimworld', 'a', 'b'], [core, a, b])).toEqual(['incompatible:a'])
  })

  it('warns about unsupported versions but not for official content', () => {
    const old = mod('old.mod', { supportedVersions: ['1.4', '1.5'] })
    const dlc = mod('ludeon.rimworld.royalty', { supportedVersions: ['1.0'] })
    const issues = checkMods(['ludeon.rimworld', 'ludeon.rimworld.royalty', 'old.mod'], [core, dlc, old], V)
    expect(issues.map((i) => `${i.kind}:${i.uid}`)).toEqual(['unsupported-version:old.mod'])
    expect(issues[0].message).toBe('Built for 1.4, 1.5, game is 1.6')
  })

  it('flags mods that are active but not installed, and repeated entries', () => {
    expect(kinds(['ludeon.rimworld', 'ghost', 'ludeon.rimworld'], [core])).toEqual([
      'duplicate-package-id:ludeon.rimworld',
      'not-installed:ghost'
    ])
  })

  it('warns when the same packageId is installed twice', () => {
    const local = mod('dup.mod', { source: 'local', folderName: 'DupLocal' })
    const ws = mod('dup.mod', { uid: 'dup.mod_steam', source: 'workshop', folderName: '123' })
    const issues = checkMods(['ludeon.rimworld', 'dup.mod'], [core, local, ws], V)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'duplicate-package-id', severity: 'warning', uid: 'dup.mod' })
    expect(issues[0].message).toBe('Same packageId as workshop copy 123')
  })

  it('flags order violations on the mod that declared the rule', () => {
    const lib = mod('the.lib', { name: 'Lib' })
    const user = mod('after.lib', { name: 'User', loadAfter: ['the.lib'] })
    const harmony = mod('brrainz.harmony', { name: 'Harmony', loadBefore: ['ludeon.rimworld'] })
    const issues = checkMods(['ludeon.rimworld', 'brrainz.harmony', 'after.lib', 'the.lib'], [core, lib, user, harmony], V)
    const order = issues.filter((i) => i.kind === 'order')
    expect(order.map((i) => i.uid).sort()).toEqual(['after.lib', 'brrainz.harmony'])
    expect(order.map((i) => i.message)).toContain('Wrong order: User asks to load after Lib')
    expect(order.map((i) => i.message)).toContain('Wrong order: Harmony asks to load before ludeon.rimworld')
  })

  it('flags DLCs out of official order and mods placed above Core', () => {
    const royalty = mod('ludeon.rimworld.royalty')
    const a = mod('a')
    const issues = checkMods(['a', 'ludeon.rimworld.royalty', 'ludeon.rimworld'], [core, royalty, a], V)
    expect(issues.filter((i) => i.kind === 'order').length).toBeGreaterThanOrEqual(2)
  })

  it('reports load order loops', () => {
    const a = mod('a', { loadAfter: ['b'] })
    const b = mod('b', { loadAfter: ['a'] })
    const issues = checkMods(['ludeon.rimworld', 'a', 'b'], [core, a, b], V)
    expect(issues.some((i) => i.kind === 'cycle')).toBe(true)
  })

  it('groups issues by mod', () => {
    const grouped = issuesByUid(checkMods(['ludeon.rimworld', 'ghost'], [core], V))
    expect([...grouped.keys()]).toEqual(['ghost'])
  })
})

describe('moveWarnings', () => {
  const lib = mod('the.lib', { name: 'The Lib' })
  const user = mod('uses.lib', { name: 'User', modDependencies: [{ packageId: 'the.lib' }] })
  const other = mod('other')
  const mods = new Map([core, lib, user, other].map((m) => [m.uid, m]))

  it('warns when a mod is dropped above what it needs', () => {
    const list = ['ludeon.rimworld', 'uses.lib', 'the.lib']
    expect(moveWarnings(list, mods, V, 'uses.lib')).toEqual(['User needs The Lib'])
    expect(moveWarnings(list, mods, V, 'the.lib')).toEqual(['User needs The Lib'])
  })

  it('stays quiet for a fine drop or an unrelated mod', () => {
    expect(moveWarnings(['ludeon.rimworld', 'the.lib', 'uses.lib'], mods, V, 'uses.lib')).toEqual([])
    expect(moveWarnings(['ludeon.rimworld', 'uses.lib', 'the.lib', 'other'], mods, V, 'other')).toEqual([])
  })

  it('warns when a mod lands above Core, or Core drops below mods', () => {
    const list = ['other', 'ludeon.rimworld', 'the.lib']
    const coreName = core.name || core.packageIdRaw
    expect(moveWarnings(list, mods, V, 'other')).toEqual([`${other.name || other.packageIdRaw} loads after ${coreName}`])
    expect(moveWarnings(list, mods, V, 'ludeon.rimworld')).toEqual([`${other.name || other.packageIdRaw} loads after ${coreName}`])
    expect(moveWarnings(list, mods, V, 'the.lib')).toEqual([])
  })
})
