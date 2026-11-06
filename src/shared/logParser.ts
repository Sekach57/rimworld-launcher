/**
 * Pure Player.log analysis. No file access: the caller passes the text and a small
 * description of the loaded mods so issues can be pinned on a suspect.
 */

export type LogCategory =
  | 'missing-type'
  | 'xml-def'
  | 'cross-reference'
  | 'harmony'
  | 'out-of-memory'
  | 'texture'
  | 'exception'
  | 'error'

export interface AttribMod {
  uid: string
  packageId: string
  name: string
  folderName: string
  steamId?: string
  /** File names (without .dll) found in the mod's Assemblies folders. */
  assemblies: string[]
}

export interface Suspect {
  uid: string
  name: string
  reason: 'prefix' | 'package-id' | 'assembly' | 'path'
}

export interface LogIssue {
  id: string
  category: LogCategory
  message: string
  count: number
  /** Stack of the first occurrence. */
  stack: string[]
  suspect?: Suspect
}

export interface LogReport {
  lines: number
  issues: LogIssue[]
  /** Sum of all occurrences. */
  total: number
}

export const CATEGORY_LABEL: Record<LogCategory, string> = {
  'missing-type': 'Missing type or dependency',
  'xml-def': 'XML def error',
  'cross-reference': 'Unresolved cross-reference',
  harmony: 'Harmony patch',
  'out-of-memory': 'Out of memory',
  texture: 'Texture error',
  exception: 'Exception',
  error: 'Error'
}

const FRAME_RE = /^\s*(?:at\s+)?(?:\(wrapper [^)]*\)\s*)?[A-Za-z_<][\w.`<>+$]*(?::|\.)[\w`<>.$]+\s*(?:\(|\[0x)/
const FILE_RE = /^\s*\(Filename:/
const ERROR_RE = /(exception|\berror\b|could not|couldn't|failed|cannot|can't find|missing|out of memory|crash)/i
const NOISE_RE = /^(Loading|Initialized|Unloading|Mono|<RI>|Begin MonoManager|Fallback handler|Platform assembly|Native extension|\s*$)/i
const VANILLA_NS = new Set([
  'verse', 'rimworld', 'unityengine', 'system', 'harmonylib', 'mono', 'unity', 'ludeontk', 'steamworks',
  'microsoft', 'dmd', 'monomod', 'ionic', 'newtonsoft', 'threading', 'collections', 'linq'
])

function category(text: string): LogCategory {
  if (/out of memory|outofmemory/i.test(text)) return 'out-of-memory'
  if (/could not resolve cross-?reference/i.test(text)) return 'cross-reference'
  if (/harmony|patching failed/i.test(text)) return 'harmony'
  if (/could not find type|could not load type|typeloadexception|filenotfoundexception|could not load file or assembly|missing dependency|type .* not found|can't find type/i.test(text)) return 'missing-type'
  if (/xml error|config error in|error in xml|duplicate def|doesn't correspond to any field/i.test(text)) return 'xml-def'
  if (/texture|mesh/i.test(text)) return 'texture'
  if (/exception/i.test(text)) return 'exception'
  return 'error'
}

/** Collapses numbers and addresses so repeats of one problem share a key. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/\d+(\.\d+)*/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

interface Index {
  byPackage: Map<string, AttribMod>
  byName: Map<string, AttribMod>
  byFolder: Map<string, AttribMod>
  byAssembly: Map<string, AttribMod>
}

function buildIndex(mods: AttribMod[]): Index {
  const ix: Index = { byPackage: new Map(), byName: new Map(), byFolder: new Map(), byAssembly: new Map() }
  for (const m of mods) {
    ix.byPackage.set(m.packageId.toLowerCase(), m)
    ix.byPackage.set(m.uid.toLowerCase(), m)
    ix.byName.set(m.name.toLowerCase(), m)
    ix.byFolder.set(m.folderName.toLowerCase(), m)
    if (m.steamId) ix.byFolder.set(m.steamId, m)
    for (const a of m.assemblies) {
      const key = a.toLowerCase()
      if (!VANILLA_NS.has(key) && !ix.byAssembly.has(key)) ix.byAssembly.set(key, m)
    }
  }
  return ix
}

function attribute(headline: string, stack: string[], ix: Index): Suspect | undefined {
  const pick = (m: AttribMod | undefined, reason: Suspect['reason']): Suspect | undefined =>
    m ? { uid: m.uid, name: m.name, reason } : undefined

  for (const m of headline.matchAll(/\[([^\]\r\n]{2,60})\]/g)) {
    const key = m[1].trim().toLowerCase()
    const hit = ix.byName.get(key) ?? ix.byPackage.get(key)
    if (hit) return pick(hit, 'prefix')
  }
  const text = [headline, ...stack].join('\n')
  for (const m of text.matchAll(/(?:Mods|294100)[\\/]+([^\\/\r\n]+)[\\/]/gi)) {
    const hit = ix.byFolder.get(m[1].toLowerCase())
    if (hit) return pick(hit, 'path')
  }
  for (const m of text.matchAll(/[a-z0-9_-]+(?:\.[a-z0-9_-]+)+/gi)) {
    const hit = ix.byPackage.get(m[0].toLowerCase())
    if (hit) return pick(hit, 'package-id')
  }
  for (const line of [headline, ...stack]) {
    const dll = /([\w.-]+)\.dll/i.exec(line)
    if (dll) {
      const hit = ix.byAssembly.get(dll[1].toLowerCase())
      if (hit) return pick(hit, 'assembly')
    }
    const frame = /(?:^|\s)(?:at\s+)?(?:\(wrapper [^)]*\)\s*)?([A-Za-z_][\w`<>+$]*(?:\.[\w`<>+$]+)+)[:(\s]/.exec(line)
    if (!frame) continue
    const parts = frame[1].split('.')
    if (VANILLA_NS.has(parts[0].toLowerCase())) continue
    for (let n = Math.min(parts.length - 1, 3); n >= 1; n--) {
      const hit = ix.byAssembly.get(parts.slice(0, n).join('.').toLowerCase())
      if (hit) return pick(hit, 'assembly')
    }
  }
  return undefined
}

export function parseLog(text: string, mods: AttribMod[] = []): LogReport {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const ix = buildIndex(mods)
  const map = new Map<string, LogIssue>()
  let total = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (NOISE_RE.test(line) || FRAME_RE.test(line) || FILE_RE.test(line) || !ERROR_RE.test(line)) continue
    const stack: string[] = []
    let j = i + 1
    while (j < lines.length && (FRAME_RE.test(lines[j]) || FILE_RE.test(lines[j]))) {
      if (!FILE_RE.test(lines[j]) && stack.length < 40) stack.push(lines[j].trim())
      j++
    }
    const headline = line.trim()
    const key = normalizeMessage(headline)
    const existing = map.get(key)
    total++
    if (existing) existing.count++
    else {
      const full = [headline, ...stack].join('\n')
      map.set(key, {
        id: `i${map.size}`,
        category: category(full),
        message: headline.slice(0, 400),
        count: 1,
        stack,
        suspect: attribute(headline, stack, ix)
      })
    }
    i = j - 1
  }
  const issues = [...map.values()].sort((a, b) => b.count - a.count)
  return { lines: lines.length, issues, total }
}

/** Plain-text report for the clipboard. */
export function formatReport(report: LogReport, instanceName: string): string {
  const out = [`Log report for ${instanceName}: ${report.issues.length} distinct issues, ${report.total} occurrences`, '']
  for (const issue of report.issues) {
    out.push(`[${CATEGORY_LABEL[issue.category]}] x${issue.count} ${issue.message}`)
    if (issue.suspect) out.push(`  Suspect: ${issue.suspect.name} (${issue.suspect.reason})`)
    for (const f of issue.stack.slice(0, 6)) out.push(`    ${f}`)
  }
  return out.join('\n')
}
