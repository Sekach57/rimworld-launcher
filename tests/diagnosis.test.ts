import { describe, expect, it } from 'vitest'
import { applyAllSafe, applyFix, buildDiagnoses, summarize, type DiagInput } from '../src/shared/diagnosis.ts'
import { checkMods } from '../src/shared/checks.ts'
import { parseLog, type AttribMod } from '../src/shared/logParser.ts'
import { mod } from './helpers.ts'

const core = mod('ludeon.rimworld')
const harmony = mod('brrainz.harmony', { name: 'Harmony' })
const survival = mod('rim.survival', { name: 'Rimsurvival Core', modDependencies: [{ packageId: 'brrainz.harmony' }] })
const attrib: AttribMod[] = [
  { uid: 'rim.survival', packageId: 'rim.survival', name: 'Rimsurvival Core', folderName: '1', assemblies: ['RimSurvival'] },
  { uid: 'rim.extra', packageId: 'rim.extra', name: 'Rim Extra', folderName: '2', assemblies: ['RimExtra'] }
]

function input(active: string[], installed = [core, harmony, survival], log = ''): DiagInput {
  const report = log ? parseLog(log, attrib) : null
  return { report, issues: checkMods(active, installed, '1.7'), installed, active, gameVersion: '1.7' }
}

function harmonyLog(n: number): string {
  const lines: string[] = []
  for (let i = 0; i < n; i++) {
    lines.push(`Could not load type RimSurvival.Patch${i} from assembly 'RimSurvival': Could not load file or assembly '0Harmony'`)
    lines.push('  at RimSurvival.Init.Run () [0x00000] in <abc>:0')
  }
  return lines.join('\n')
}

describe('missing dependency', () => {
  it('turns a disabled dependency into one enable fix placed before the dependent', () => {
    const active = ['ludeon.rimworld', 'rim.survival']
    const d = buildDiagnoses(input(active)).find((x) => x.id === 'dep:brrainz.harmony')!
    expect(d.title).toBe('Rimsurvival Core needs Harmony, which is off')
    expect(d.severity).toBe('fixable')
    const fix = d.fixes[0]
    expect(fix.kind).toBe('enable')
    expect(applyFix(active, fix)).toEqual(['ludeon.rimworld', 'brrainz.harmony', 'rim.survival'])
  })

  it('offers a Workshop link when Harmony is not installed', () => {
    const d = buildDiagnoses(input(['ludeon.rimworld', 'rim.survival'], [core, survival])).find((x) => x.id === 'dep:brrainz.harmony')!
    expect(d.title).toContain('not installed')
    expect(d.fixes[0]).toMatchObject({ kind: 'workshop' })
  })

  it('collapses many Harmony log errors and the problem into one diagnosis', () => {
    const active = ['ludeon.rimworld', 'rim.survival']
    const diags = buildDiagnoses(input(active, undefined, harmonyLog(22)))
    const harm = diags.filter((d) => d.id === 'dep:brrainz.harmony')
    expect(harm).toHaveLength(1)
    expect(harm[0].covers).toBeGreaterThanOrEqual(22)
    expect(diags.filter((d) => d.severity === 'mod-bug')).toHaveLength(0)
  })
})

describe('other rules', () => {
  it('fixes a broken load order by moving the mod after its anchor', () => {
    const a = mod('a.mod', { name: 'A', loadAfter: ['b.mod'] })
    const b = mod('b.mod', { name: 'B' })
    const active = ['ludeon.rimworld', 'a.mod', 'b.mod']
    const d = buildDiagnoses(input(active, [core, a, b])).find((x) => x.id.startsWith('order:'))!
    expect(d.fixes[0]).toMatchObject({ kind: 'move', uid: 'a.mod', afterUid: 'b.mod' })
    expect(applyFix(active, d.fixes[0])).toEqual(['ludeon.rimworld', 'b.mod', 'a.mod'])
  })

  it('offers to disable either side of an incompatible pair', () => {
    const a = mod('a.mod', { name: 'A', incompatibleWith: ['b.mod'] })
    const b = mod('b.mod', { name: 'B' })
    const d = buildDiagnoses(input(['ludeon.rimworld', 'a.mod', 'b.mod'], [core, a, b])).find((x) => x.id.startsWith('incompat:'))!
    expect(d.fixes.map((f) => f.kind)).toEqual(['disable', 'disable'])
    expect(applyFix(['a.mod', 'b.mod'], d.fixes[1])).toEqual(['a.mod'])
  })

  it('groups mods not built for the game version into one info card', () => {
    const d = buildDiagnoses(input(['ludeon.rimworld', 'brrainz.harmony', 'rim.survival'])).find((x) => x.id === 'version')!
    expect(d.severity).toBe('info')
    expect(d.covers).toBe(2)
    expect(d.fixes).toHaveLength(0)
  })

  it('attributes XML def errors to a mod and offers an author report', () => {
    const log = [
      'XML error: Could not find a type named RimExtra.FooDef',
      '  at RimExtra.Loader.Load () [0x00001] in <abc>:0',
      'Config error: Exception parsing XML in RimExtraThing',
      '  at RimExtra.Loader.Load () [0x00002] in <abc>:0'
    ].join('\n')
    const diags = buildDiagnoses({ ...input(['ludeon.rimworld']), report: parseLog(log, attrib) })
    const bug = diags.filter((d) => d.severity === 'mod-bug')
    expect(bug.map((d) => d.id)).toEqual(['xml:rim.extra'])
    expect(bug[0].covers).toBe(2)
    expect(bug[0].fixes[0]).toMatchObject({ kind: 'report' })
    expect((bug[0].fixes[0] as { text: string }).text).toContain('Rim Extra')
  })

  it('treats texture atlas spam as noise', () => {
    const log = 'Texture atlas error: failed to pack atlas\n'.repeat(5)
    const diags = buildDiagnoses({ ...input(['ludeon.rimworld']), report: parseLog(log, attrib) })
    const n = diags.find((d) => d.severity === 'noise')!
    expect(n.id).toBe('noise:atlas')
    expect(n.covers).toBe(5)
  })

  it('summarizes and applies all safe fixes at once', () => {
    const active = ['ludeon.rimworld', 'rim.survival']
    const diags = buildDiagnoses(input(active))
    expect(summarize(diags).text).toMatch(/^1 fixable in one click, 0 inside mods, 0 harmless noise$/)
    expect(applyAllSafe(active, diags)).toEqual(['ludeon.rimworld', 'brrainz.harmony', 'rim.survival'])
  })
})
