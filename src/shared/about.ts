import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { AboutData, ModDependency } from './types.ts'

type Node = unknown
type Obj = Record<string, Node>

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => name === 'li'
})

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function isObj(n: Node): n is Obj {
  return typeof n === 'object' && n !== null && !Array.isArray(n)
}

/** Case-insensitive child lookup: mods write packageId, packageID, PackageId... */
function child(obj: Node, name: string): Node {
  if (!isObj(obj)) return undefined
  if (name in obj) return obj[name]
  const lower = name.toLowerCase()
  for (const key of Object.keys(obj)) if (key.toLowerCase() === lower) return obj[key]
  return undefined
}

function text(n: Node): string {
  if (n === undefined || n === null) return ''
  if (typeof n === 'string') return n.trim()
  if (typeof n === 'number' || typeof n === 'boolean') return String(n)
  if (Array.isArray(n)) return n.map(text).filter(Boolean).join('\n')
  if (isObj(n)) {
    if ('#text' in n) return text(n['#text'])
    return Object.values(n).map(text).filter(Boolean).join(' ')
  }
  return ''
}

function items(n: Node): Node[] {
  if (!isObj(n)) return []
  const li = child(n, 'li')
  return Array.isArray(li) ? li : li === undefined ? [] : [li]
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)]
}

const lowerList = (n: Node): string[] => dedupe(items(n).map((v) => text(v).toLowerCase()).filter(Boolean))

function deps(n: Node): ModDependency[] {
  const out: ModDependency[] = []
  const seen = new Set<string>()
  for (const li of items(n)) {
    const packageId = text(child(li, 'packageId')).toLowerCase()
    if (!packageId || seen.has(packageId)) continue
    seen.add(packageId)
    const dep: ModDependency = { packageId }
    const displayName = text(child(li, 'displayName'))
    const url = text(child(li, 'steamWorkshopUrl'))
    if (displayName) dep.displayName = displayName
    if (url) dep.steamWorkshopUrl = url
    out.push(dep)
  }
  return out
}

function byVersion<T>(n: Node, read: (v: Node) => T): Record<string, T> {
  const out: Record<string, T> = {}
  if (!isObj(n)) return out
  for (const [key, value] of Object.entries(n)) out[key.toLowerCase()] = read(value)
  return out
}

export function emptyAbout(): AboutData {
  return {
    packageId: '',
    packageIdRaw: '',
    name: '',
    author: '',
    description: '',
    supportedVersions: [],
    modDependencies: [],
    modDependenciesByVersion: {},
    loadAfter: [],
    loadAfterByVersion: {},
    loadBefore: [],
    loadBeforeByVersion: {},
    forceLoadAfter: [],
    forceLoadBefore: [],
    incompatibleWith: [],
    incompatibleWithByVersion: {}
  }
}

export interface ParsedAbout {
  data: AboutData
  /** Set when the XML was malformed and the regex fallback was used. */
  issue?: string
}

/** Parse About.xml text. Never throws; malformed files go through a regex fallback. */
export function parseAboutXml(raw: string): ParsedAbout {
  const xml = stripBom(raw)
  const valid = XMLValidator.validate(xml)
  if (valid !== true) {
    return { data: fallbackParse(xml), issue: `Malformed XML (line ${valid.err.line}): ${valid.err.msg}` }
  }
  let doc: Node
  try {
    doc = parser.parse(xml)
  } catch (e) {
    return { data: fallbackParse(xml), issue: `XML parse error: ${(e as Error).message}` }
  }
  const root = child(doc, 'ModMetaData')
  if (!isObj(root)) return { data: fallbackParse(xml), issue: 'No <ModMetaData> root' }

  const data = emptyAbout()
  data.packageIdRaw = text(child(root, 'packageId'))
  data.packageId = data.packageIdRaw.toLowerCase()
  data.name = text(child(root, 'name'))
  data.author = text(child(root, 'author')) || items(child(root, 'authors')).map(text).join(', ')
  data.description = text(child(root, 'description'))
  data.supportedVersions = dedupe(items(child(root, 'supportedVersions')).map(text).filter(Boolean))
  if (data.supportedVersions.length === 0) {
    const target = text(child(root, 'targetVersion'))
    if (target) data.supportedVersions = [majorMinor(target)]
  }
  data.modDependencies = deps(child(root, 'modDependencies'))
  data.modDependenciesByVersion = byVersion(child(root, 'modDependenciesByVersion'), deps)
  data.loadAfter = lowerList(child(root, 'loadAfter'))
  data.loadAfterByVersion = byVersion(child(root, 'loadAfterByVersion'), lowerList)
  data.loadBefore = lowerList(child(root, 'loadBefore'))
  data.loadBeforeByVersion = byVersion(child(root, 'loadBeforeByVersion'), lowerList)
  data.forceLoadAfter = lowerList(child(root, 'forceLoadAfter'))
  data.forceLoadBefore = lowerList(child(root, 'forceLoadBefore'))
  data.incompatibleWith = lowerList(child(root, 'incompatibleWith'))
  data.incompatibleWithByVersion = byVersion(child(root, 'incompatibleWithByVersion'), lowerList)
  return { data }
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function tagBlock(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, 'i').exec(xml)
  return m ? m[1] : undefined
}

function liValues(block: string | undefined): string[] {
  if (!block) return []
  return [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)].map((m) => decode(m[1]))
}

/** Best-effort extraction for broken files. Tolerates unclosed tags elsewhere in the file. */
function fallbackParse(xml: string): AboutData {
  const data = emptyAbout()
  const noComments = xml.replace(/<!--[\s\S]*?-->/g, '')
  const outside = noComments.replace(/<modDependencies(ByVersion)?\b[\s\S]*?<\/modDependencies(ByVersion)?\s*>/gi, '')
  const lower = (b: string | undefined) => dedupe(liValues(b).map((v) => v.toLowerCase()).filter(Boolean))
  data.packageIdRaw = decode(tagBlock(outside, 'packageId') ?? '')
  data.packageId = data.packageIdRaw.toLowerCase()
  data.name = decode(tagBlock(outside, 'name') ?? '')
  data.author = decode(tagBlock(outside, 'author') ?? '')
  data.description = decode(tagBlock(outside, 'description') ?? '')
  data.supportedVersions = liValues(tagBlock(outside, 'supportedVersions'))
  const depBlock = tagBlock(noComments, 'modDependencies')
  if (depBlock) {
    for (const m of depBlock.matchAll(/<packageId\b[^>]*>([\s\S]*?)<\/packageId\s*>/gi)) {
      const packageId = decode(m[1]).toLowerCase()
      if (packageId && !data.modDependencies.some((d) => d.packageId === packageId)) data.modDependencies.push({ packageId })
    }
  }
  data.loadAfter = lower(tagBlock(outside, 'loadAfter'))
  data.loadBefore = lower(tagBlock(outside, 'loadBefore'))
  data.forceLoadAfter = lower(tagBlock(outside, 'forceLoadAfter'))
  data.forceLoadBefore = lower(tagBlock(outside, 'forceLoadBefore'))
  data.incompatibleWith = lower(tagBlock(outside, 'incompatibleWith'))
  return data
}

/** "1.6.4633 rev1261" -> "1.6" */
export function majorMinor(version: string): string {
  const m = /(\d+)\.(\d+)/.exec(version)
  return m ? `${m[1]}.${m[2]}` : version.trim()
}

/** RimWorld rule: a ByVersion entry for the running version replaces the base list. */
export function forVersion<T>(base: T[], byVer: Record<string, T[]>, gameVersion: string): T[] {
  const key = `v${majorMinor(gameVersion)}`
  return byVer[key] ?? base
}
