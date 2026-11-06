/**
 * Turns raw Player.log groups and pre-launch problems into a short list of
 * plain-language diagnoses. Pure: no file access, no UI. Rules are data
 * (see LOG_RULES and NOISE_PATTERNS) so new patterns are easy to add.
 */
import type { LogIssue, LogReport } from './logParser.ts'
import { buildEdges, isOfficial, packageIdOfUid } from './sort.ts'
import type { Issue, ModInfo } from './types.ts'

export type DiagSeverity = 'fixable' | 'mod-bug' | 'noise' | 'info'

export type FixAction =
  | { kind: 'enable'; uid: string; label: string; beforeUid?: string }
  | { kind: 'disable'; uid: string; label: string }
  | { kind: 'move'; uid: string; label: string; afterUid?: string; beforeUid?: string }
  | { kind: 'workshop'; url: string; label: string }
  | { kind: 'report'; text: string; label: string }

export interface Diagnosis {
  id: string
  severity: DiagSeverity
  title: string
  cause: string
  mods: { uid: string; name: string }[]
  /** Number of underlying raw errors or problems this diagnosis covers. */
  covers: number
  /** Raw log messages (or problem texts) behind it, for the expander. */
  raw: string[]
  fixes: FixAction[]
}

export interface DiagInput {
  report: LogReport | null
  issues: Issue[]
  installed: ModInfo[]
  active: string[]
  gameVersion: string
}

export const HARMONY_ID = 'brrainz.harmony'
export const HARMONY_WORKSHOP = 'https://steamcommunity.com/sharedfiles/filedetails/?id=2009463077'

/** True when the fix changes the mod list (as opposed to opening a link or copying). */
export function isListFix(f: FixAction): boolean {
  return f.kind === 'enable' || f.kind === 'disable' || f.kind === 'move'
}

function without(list: string[], uid: string): string[] {
  return list.filter((u) => u !== uid)
}

function insertAt(list: string[], uid: string, beforeUid?: string, afterUid?: string): string[] {
  const rest = without(list, uid)
  if (beforeUid) {
    const i = rest.indexOf(beforeUid)
    if (i >= 0) return [...rest.slice(0, i), uid, ...rest.slice(i)]
  }
  if (afterUid) {
    const i = rest.indexOf(afterUid)
    if (i >= 0) return [...rest.slice(0, i + 1), uid, ...rest.slice(i + 1)]
  }
  return [...rest, uid]
}

/** The new active list after a fix. Non-list fixes return the list unchanged. */
export function applyFix(active: string[], fix: FixAction): string[] {
  switch (fix.kind) {
    case 'enable':
      return active.includes(fix.uid) ? active : insertAt(active, fix.uid, fix.beforeUid)
    case 'disable':
      return without(active, fix.uid)
    case 'move':
      return active.includes(fix.uid) ? insertAt(active, fix.uid, fix.beforeUid, fix.afterUid) : active
    default:
      return active
  }
}

/** Apply every list fix in turn, one per diagnosis (the first). Skips those that no longer apply. */
export function applyAllSafe(active: string[], diagnoses: Diagnosis[]): string[] {
  let list = active
  for (const d of diagnoses) {
    const fix = d.fixes.find(isListFix)
    if (d.severity === 'fixable' && fix) list = applyFix(list, fix)
  }
  return list
}

export interface DiagSummary {
  fixable: number
  modBugs: number
  noise: number
  info: number
  text: string
}

export function summarize(diagnoses: Diagnosis[]): DiagSummary {
  const fixable = diagnoses.filter((d) => d.fixes.some(isListFix)).length
  const modBugs = diagnoses.filter((d) => d.severity === 'mod-bug').length
  const noise = diagnoses.filter((d) => d.severity === 'noise').length
  const info = diagnoses.filter((d) => d.severity === 'info' || (d.severity === 'fixable' && !d.fixes.some(isListFix))).length
  const text = `${fixable} fixable in one click, ${modBugs} inside mods, ${noise} harmless noise`
  return { fixable, modBugs, noise, info, text }
}

// ---- context -------------------------------------------------------------

interface Ctx {
  input: DiagInput
  byUid: Map<string, ModInfo>
  byPkg: Map<string, ModInfo[]>
  activePkgs: Set<string>
}

function makeCtx(input: DiagInput): Ctx {
  const byUid = new Map(input.installed.map((m) => [m.uid, m]))
  const byPkg = new Map<string, ModInfo[]>()
  for (const m of input.installed) byPkg.set(m.packageId, [...(byPkg.get(m.packageId) ?? []), m])
  const activePkgs = new Set(input.active.map((u) => byUid.get(u)?.packageId ?? packageIdOfUid(u)))
  return { input, byUid, byPkg, activePkgs }
}

function nameOf(ctx: Ctx, uid: string): string {
  return ctx.byUid.get(uid)?.name ?? uid
}

function ref(ctx: Ctx, uid: string) {
  return { uid, name: nameOf(ctx, uid) }
}

/** Best installed copy of a package: prefers the one already in the list. */
function pickInstalled(ctx: Ctx, pkg: string): ModInfo | undefined {
  const copies = ctx.byPkg.get(pkg) ?? []
  return copies.find((m) => ctx.input.active.includes(m.uid)) ?? copies[0]
}

function workshopUrlFor(pkg: string, dependent?: ModInfo): string | undefined {
  if (pkg === HARMONY_ID) return HARMONY_WORKSHOP
  const dep = dependent?.modDependencies.find((d) => d.packageId === pkg)
  return dep?.steamWorkshopUrl || undefined
}

/** Enable fix for a missing package, or a Workshop link when it is not installed. */
function depFixes(ctx: Ctx, pkg: string, dependentUid?: string): { fixes: FixAction[]; installed?: ModInfo; label: string } {
  const installed = pickInstalled(ctx, pkg)
  const dependent = dependentUid ? ctx.byUid.get(dependentUid) : undefined
  if (installed) {
    return {
      installed,
      label: installed.name,
      fixes: [{ kind: 'enable', uid: installed.uid, label: `Enable ${installed.name}`, beforeUid: dependentUid }]
    }
  }
  const dep = dependent?.modDependencies.find((d) => d.packageId === pkg)
  const label = pkg === HARMONY_ID ? 'Harmony' : dep?.displayName || pkg
  const url = workshopUrlFor(pkg, dependent)
  return { label, fixes: url ? [{ kind: 'workshop', url, label: `Open ${label} on Workshop` }] : [] }
}

function authorReport(ctx: Ctx, uid: string, what: string, raw: string[]): FixAction {
  const m = ctx.byUid.get(uid)
  const head = [
    `Mod: ${m?.name ?? uid}${m?.packageIdRaw ? ` (${m.packageIdRaw})` : ''}`,
    `Game version: ${ctx.input.gameVersion}`,
    `Problem: ${what}`,
    '',
    ...raw.slice(0, 8).map((r) => `- ${r}`)
  ]
  return { kind: 'report', label: 'Copy report for author', text: head.join('\n') }
}

// ---- rules for the Problems list -----------------------------------------

type Out = Map<string, Diagnosis>

function add(out: Out, d: Diagnosis): Diagnosis {
  const have = out.get(d.id)
  if (!have) {
    out.set(d.id, d)
    return d
  }
  have.covers += d.covers
  have.raw.push(...d.raw)
  for (const m of d.mods) if (!have.mods.some((x) => x.uid === m.uid)) have.mods.push(m)
  for (const f of d.fixes) if (!have.fixes.some((x) => JSON.stringify(x) === JSON.stringify(f))) have.fixes.push(f)
  return have
}

function fromIssues(ctx: Ctx, out: Out): void {
  const { issues } = ctx.input
  const unsupported: Issue[] = []
  for (const is of issues) {
    const subject = ref(ctx, is.uid)
    if (is.kind === 'missing-dependency' && is.related) {
      const { fixes, installed, label } = depFixes(ctx, is.related, is.uid)
      const state = installed ? 'which is off' : 'which is not installed'
      add(out, {
        id: `dep:${is.related}`,
        severity: 'fixable',
        title: `${subject.name} needs ${label}, ${state}`,
        cause: installed
          ? `${label} is installed but not in the active list. Mods that need it will fail to load.`
          : `${label} is not installed. Subscribe to it on the Workshop, then enable it.`,
        mods: [subject],
        covers: 1,
        raw: [is.message],
        fixes
      })
    } else if (is.kind === 'incompatible' && is.related) {
      const other = ref(ctx, is.related)
      add(out, {
        id: `incompat:${[is.uid, is.related].sort().join('|')}`,
        severity: 'fixable',
        title: `${subject.name} and ${other.name} do not work together`,
        cause: 'One of them declares the other as incompatible. Keep one of the two.',
        mods: [subject, other],
        covers: 1,
        raw: [is.message],
        fixes: [
          { kind: 'disable', uid: is.uid, label: `Disable ${subject.name}` },
          { kind: 'disable', uid: is.related, label: `Disable ${other.name}` }
        ]
      })
    } else if (is.kind === 'not-installed') {
      add(out, {
        id: `gone:${is.uid}`,
        severity: 'fixable',
        title: `${is.uid} is in the list but not installed`,
        cause: 'The mod folder is missing, so the game skips it and may warn about it.',
        mods: [subject],
        covers: 1,
        raw: [is.message],
        fixes: [{ kind: 'disable', uid: is.uid, label: 'Remove from list' }]
      })
    } else if (is.kind === 'unsupported-version') {
      unsupported.push(is)
    } else if (is.kind === 'order') {
      orderDiagnosis(ctx, is, out)
    } else if (is.kind === 'cycle') {
      add(out, {
        id: `cycle:${is.uid}`,
        severity: 'info',
        title: 'Load order rules contradict each other',
        cause: 'Mods ask to load before and after each other in a loop, so no order satisfies all of them.',
        mods: [subject, ...(is.related ? [ref(ctx, is.related)] : [])],
        covers: 1,
        raw: [is.message],
        fixes: []
      })
    } else if (is.kind === 'duplicate-package-id') {
      add(out, {
        id: `dup:${packageIdOfUid(is.uid)}`,
        severity: 'info',
        title: `${subject.name} is installed twice`,
        cause: 'Two copies share one packageId (for example a local and a Workshop copy). Only one should be active.',
        mods: [subject],
        covers: 1,
        raw: [is.message],
        fixes: []
      })
    }
  }
  if (unsupported.length > 0) {
    add(out, {
      id: 'version',
      severity: 'info',
      title: `${unsupported.length} mod${unsupported.length === 1 ? ' is' : 's are'} not built for ${ctx.input.gameVersion}`,
      cause: 'Many older mods still work, but if something breaks, start with these. Nothing to fix here.',
      mods: unsupported.map((u) => ref(ctx, u.uid)),
      covers: unsupported.length,
      raw: unsupported.map((u) => `${nameOf(ctx, u.uid)}: ${u.message}`),
      fixes: []
    })
  }
}

function orderDiagnosis(ctx: Ctx, is: Issue, out: Out): void {
  const { active, gameVersion } = ctx.input
  const pos = new Map(active.map((u, i) => [u, i]))
  const edges = buildEdges(active, ctx.byUid, gameVersion)
  const rel = is.related
  const edge = edges.find(
    (e) => ((e.from === is.uid && e.to === rel) || (e.to === is.uid && e.from === rel)) && pos.get(e.from)! > pos.get(e.to)!
  )
  // `from` must load before `to`: the fix moves `to` just after `from`.
  const mover = edge ? edge.to : is.uid
  const anchor = edge ? edge.from : rel
  if (!anchor) return
  const moverName = nameOf(ctx, mover)
  const anchorName = nameOf(ctx, anchor)
  const wantsAbove = !edge && isOfficial(ctx.byUid.get(anchor)?.packageId ?? anchor)
  add(out, {
    id: `order:${mover}`,
    severity: 'fixable',
    title: `${moverName} should load after ${anchorName}`,
    cause: wantsAbove
      ? `${moverName} sits above the base game and expansions without a rule asking for it.`
      : 'A load order rule in the mod files is broken. Patches can then apply in the wrong order.',
    mods: [ref(ctx, mover), ref(ctx, anchor)],
    covers: 1,
    raw: [is.message],
    fixes: [{ kind: 'move', uid: mover, afterUid: anchor, label: `Move ${moverName} after ${anchorName}` }]
  })
}

// ---- rules for Player.log ------------------------------------------------

/** Messages that are normal or harmless. Matched against message and first stack lines. */
export const NOISE_PATTERNS: { id: string; title: string; cause: string; re: RegExp }[] = [
  {
    id: 'atlas',
    title: 'Texture atlas warnings',
    cause: 'The game packs textures into atlases and complains when one is large. It does not affect play.',
    re: /texture atlas|atlas.*(too (large|big)|full)|failed to (pack|create) atlas/i
  },
  {
    id: 'startup',
    title: 'Startup and config chatter',
    cause: 'Steam, audio and settings messages the game prints every launch. Harmless.',
    re: /steam(works)?.*(not (initialized|running)|init)|fallback handler|prefs? (file|load)|config file|audio.*(device|output)|shader.*(not supported|warning)/i
  },
  {
    id: 'optional-def',
    title: 'Optional content not found',
    cause: 'A mod looked for a def from another mod that is not loaded. That content is optional, so the mod skips it.',
    re: /could not find (a )?def(inition)?\b.*optional|optional.*could not find|could not find .* \(optional\)/i
  }
]

const ASSEMBLY_RE = /(?:could not (?:load|resolve) (?:file or )?assembly|assembly-csharp|unable to load assembly)\s*'?"?([\w.\-]+)/i
const TYPELOAD_RE = /TypeLoadException|Could not load type '?([\w.]+)/i
const HARMONY_RE = /0Harmony|HarmonyLib|harmony.*(not found|missing)|(not found|missing).*harmony/i
const XML_RE = /parsing xml|duplicate defname|could not find a type|xml error|config error/i

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Find an installed mod that an assembly or type name most likely belongs to. */
function modForAssembly(ctx: Ctx, asm: string): ModInfo | undefined {
  const a = norm(asm.replace(/\.dll$/i, ''))
  if (!a) return undefined
  if (a === '0harmony' || a === 'harmonylib' || a === 'harmony') return pickInstalled(ctx, HARMONY_ID)
  let best: ModInfo | undefined
  for (const m of ctx.input.installed) {
    const last = norm(m.packageId.split('.').pop() ?? '')
    const full = norm(m.name)
    if (a === full || a === last || (last.length > 4 && a.includes(last)) || (full.length > 5 && a.includes(full))) {
      if (!best || ctx.input.active.includes(m.uid)) best = m
    }
  }
  return best
}

function textOf(i: LogIssue): string {
  return [i.message, ...i.stack.slice(0, 6)].join('\n')
}

function suspectRef(ctx: Ctx, i: LogIssue) {
  return i.suspect ? [ref(ctx, i.suspect.uid)] : []
}

function rawLine(i: LogIssue): string {
  return i.count > 1 ? `${i.message} (x${i.count})` : i.message
}

function fromLog(ctx: Ctx, out: Out): void {
  const report = ctx.input.report
  if (!report) return
  for (const i of report.issues) {
    const text = textOf(i)
    const raw = [rawLine(i)]

    const noise = i.category === 'out-of-memory' ? undefined : NOISE_PATTERNS.find((n) => n.re.test(i.message))
    if (noise) {
      add(out, { id: `noise:${noise.id}`, severity: 'noise', title: noise.title, cause: noise.cause, mods: [], covers: i.count, raw, fixes: [] })
      continue
    }

    if (HARMONY_RE.test(text) && !ctx.activePkgs.has(HARMONY_ID) && /not found|could not|missing|typeload|unable/i.test(text)) {
      const { fixes, installed, label } = depFixes(ctx, HARMONY_ID, i.suspect?.uid)
      const who = i.suspect ? nameOf(ctx, i.suspect.uid) : 'Some mods'
      add(out, {
        id: `dep:${HARMONY_ID}`,
        severity: 'fixable',
        title: `${who} needs ${label}, ${installed ? 'which is off' : 'which is not installed'}`,
        cause: 'Mods that patch the game with Harmony cannot load without it, and each one logs several errors.',
        mods: suspectRef(ctx, i),
        covers: i.count,
        raw,
        fixes
      })
      continue
    }

    const asm = ASSEMBLY_RE.exec(text)?.[1] ?? (TYPELOAD_RE.test(text) ? TYPELOAD_RE.exec(text)?.[1] : undefined)
    if (asm) {
      const target = modForAssembly(ctx, asm)
      if (target && !ctx.input.active.includes(target.uid)) {
        const before = i.suspect?.uid
        add(out, {
          id: `dep:${target.packageId}`,
          severity: 'fixable',
          title: `${before ? nameOf(ctx, before) : 'A mod'} needs ${target.name}, which is off`,
          cause: `The log shows a missing assembly (${asm}) that belongs to ${target.name}. Enabling it should clear these errors.`,
          mods: suspectRef(ctx, i),
          covers: i.count,
          raw,
          fixes: [{ kind: 'enable', uid: target.uid, label: `Enable ${target.name}`, beforeUid: before }]
        })
        continue
      }
      if (!target) {
        const owner = i.suspect ? ref(ctx, i.suspect.uid) : undefined
        add(out, {
          id: `asm:${norm(asm)}`,
          severity: 'mod-bug',
          title: `${owner?.name ?? 'A mod'} refers to ${asm}, which is not loaded`,
          cause: 'The mod expects a library or another mod that is not installed. Check its Workshop page for requirements.',
          mods: owner ? [owner] : [],
          covers: i.count,
          raw,
          fixes: owner ? [authorReport(ctx, owner.uid, `Missing assembly ${asm}`, raw)] : []
        })
        continue
      }
    }

    const s = i.suspect
    if (s && (i.category === 'xml-def' || i.category === 'missing-type' || i.category === 'cross-reference' || XML_RE.test(i.message))) {
      const owner = ref(ctx, s.uid)
      add(out, {
        id: `xml:${s.uid}`,
        severity: 'mod-bug',
        title: `${owner.name} has broken definitions`,
        cause: 'Its XML defs failed to load (unknown type, duplicate defName or bad XML). That is a bug in the mod or a clash with another one.',
        mods: [owner],
        covers: i.count,
        raw,
        fixes: [authorReport(ctx, s.uid, 'XML def errors', raw)]
      })
      continue
    }
    if (s && (i.category === 'harmony' || /harmony/i.test(text))) {
      const owner = ref(ctx, s.uid)
      add(out, {
        id: `patch:${s.uid}`,
        severity: 'mod-bug',
        title: `${owner.name} failed to patch the game`,
        cause: 'A Harmony patch from this mod threw an exception. Usually the mod is outdated or clashes with another patch.',
        mods: [owner],
        covers: i.count,
        raw,
        fixes: [authorReport(ctx, s.uid, 'Harmony patch exception', raw)]
      })
      continue
    }
    if (s) {
      const owner = ref(ctx, s.uid)
      add(out, {
        id: `bug:${s.uid}`,
        severity: 'mod-bug',
        title: `${owner.name} logs errors`,
        cause: 'The log traces these errors to this mod.',
        mods: [owner],
        covers: i.count,
        raw,
        fixes: [authorReport(ctx, s.uid, 'Errors in Player.log', raw)]
      })
      continue
    }
    add(out, {
      id: 'other',
      severity: 'info',
      title: 'Errors without a clear source',
      cause: 'No mod could be matched to these. They may come from the base game.',
      mods: [],
      covers: i.count,
      raw,
      fixes: []
    })
  }
}

const ORDER: Record<DiagSeverity, number> = { fixable: 0, 'mod-bug': 1, info: 2, noise: 3 }

export function buildDiagnoses(input: DiagInput): Diagnosis[] {
  const ctx = makeCtx(input)
  const out: Out = new Map()
  fromIssues(ctx, out)
  fromLog(ctx, out)
  return [...out.values()].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.covers - a.covers)
}
