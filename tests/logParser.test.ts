import { describe, expect, it } from 'vitest'
import { formatReport, normalizeMessage, parseLog, type AttribMod } from '../src/shared/logParser.ts'

const mods: AttribMod[] = [
  { uid: 'author.cool', packageId: 'author.cool', name: 'Cool Mod', folderName: '111', steamId: '111', assemblies: ['CoolMod'] },
  { uid: 'other.big', packageId: 'other.big', name: 'Big Pack', folderName: 'BigPack', assemblies: ['BigPack', 'BigPackHarmony'] }
]

const LOG = [
  'Loading game from Core',
  'Exception in Tick: System.NullReferenceException: Object reference not set to an instance of an object',
  '  at CoolMod.Comp.Tick () [0x00010] in <abc>:0',
  '  at Verse.ThingWithComps.Tick () [0x00001] in <abc>:0',
  '(Filename: C:/x Line: 1)',
  'Exception in Tick: System.NullReferenceException: Object reference not set to an instance of an object',
  '  at CoolMod.Comp.Tick () [0x00010] in <abc>:0',
  'Could not resolve cross-reference: No Verse.ThingDef named Gizmo_7 found to give to Verse.RecipeDef Make_7',
  'Could not resolve cross-reference: No Verse.ThingDef named Gizmo_9 found to give to Verse.RecipeDef Make_9',
  "XML error: <li>x</li> doesn't correspond to any field in type Foo. Context: C:\\Steam\\steamapps\\workshop\\content\\294100\\111\\Defs\\a.xml",
  '[Big Pack] Failed to load texture Things/Foo',
  'Could not load type of field Bar:x (Foo.Missing)',
  'Patching failed: HarmonyLib.HarmonyException: other.big could not patch Verse.Pawn:Tick',
  'OutOfMemoryException: Out of memory',
  'Everything fine here'
].join('\n')

describe('parseLog', () => {
  const r = parseLog(LOG, mods)
  const find = (s: string) => r.issues.find((i) => i.message.includes(s))!

  it('dedupes by message and counts occurrences', () => {
    expect(find('NullReference').count).toBe(2)
    expect(find('Gizmo').count).toBe(2)
    expect(r.total).toBe(9)
  })
  it('captures stack traces', () => {
    expect(find('NullReference').stack[0]).toContain('CoolMod.Comp.Tick')
    expect(find('NullReference').stack).toHaveLength(2)
  })
  it('attributes by assembly namespace', () => {
    expect(find('NullReference').suspect).toMatchObject({ uid: 'author.cool', reason: 'assembly' })
  })
  it('attributes by [Name] prefix', () => {
    expect(find('Failed to load texture').suspect).toMatchObject({ uid: 'other.big', reason: 'prefix' })
  })
  it('attributes by workshop path in XML errors', () => {
    expect(find('XML error').suspect).toMatchObject({ uid: 'author.cool', reason: 'path' })
  })
  it('attributes by package id in Harmony errors', () => {
    expect(find('Patching failed').suspect).toMatchObject({ uid: 'other.big', reason: 'package-id' })
  })
  it('flags known patterns', () => {
    expect(find('Gizmo').category).toBe('cross-reference')
    expect(find('XML error').category).toBe('xml-def')
    expect(find('Patching failed').category).toBe('harmony')
    expect(find('OutOfMemory').category).toBe('out-of-memory')
    expect(find('Could not load type').category).toBe('missing-type')
    expect(find('Failed to load texture').category).toBe('texture')
    expect(find('NullReference').category).toBe('exception')
  })
  it('ignores clean logs and leaves unknown issues unattributed', () => {
    expect(parseLog('Loading ok\nAll good\n').issues).toEqual([])
    expect(parseLog('Something Error here', mods).issues[0].suspect).toBeUndefined()
  })
  it('normalizes numbers and formats a report', () => {
    expect(normalizeMessage('Foo 12 at 0xFF')).toBe('Foo # at #xFF')
    expect(formatReport(r, 'Run')).toContain('Suspect: Cool Mod')
  })
})
