/** Pure parsers for Steam files and Web API replies. No IO here so they can be tested with fixtures. */
import type { WorkshopInfo } from '../shared/api.ts'
import { parseVdf, type VdfNode } from './vdf.ts'

export interface LoginUser {
  id: string
  name: string
  mostRecent: boolean
  timestamp: number
}

const node = (v: unknown): VdfNode | undefined => (v && typeof v === 'object' ? (v as VdfNode) : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** Accounts from Steam/config/loginusers.vdf. */
export function parseLoginUsers(text: string): LoginUser[] {
  const users = node(parseVdf(text).users)
  if (!users) return []
  const out: LoginUser[] = []
  for (const [id, raw] of Object.entries(users)) {
    const u = node(raw)
    if (!u || !/^\d{17}$/.test(id)) continue
    out.push({
      id,
      name: str(u.PersonaName) ?? str(u.AccountName) ?? '',
      mostRecent: u.MostRecent === '1' || u.mostrecent === '1',
      timestamp: num(u.Timestamp ?? u.timestamp) ?? 0
    })
  }
  return out
}

/** The account Steam last signed in with. */
export function pickUser(users: LoginUser[]): LoginUser | undefined {
  return users.find((u) => u.mostRecent) ?? [...users].sort((a, b) => b.timestamp - a.timestamp)[0]
}

/** Per-item install data from steamapps/workshop/appworkshop_<app>.acf. */
export function parseWorkshopAcf(text: string): Record<string, WorkshopInfo> {
  const root = node(parseVdf(text).AppWorkshop)
  if (!root) return {}
  const installed = node(root.WorkshopItemsInstalled) ?? {}
  const details = node(root.WorkshopItemDetails) ?? {}
  const out: Record<string, WorkshopInfo> = {}
  for (const id of new Set([...Object.keys(installed), ...Object.keys(details)])) {
    if (!/^\d+$/.test(id)) continue
    const inst = node(installed[id]) ?? {}
    const det = node(details[id]) ?? {}
    const info: WorkshopInfo = { id }
    const size = num(inst.size)
    if (size !== undefined) info.size = size
    const updated = num(inst.timeupdated ?? det.timeupdated)
    if (updated) info.updatedAt = updated * 1000
    const manifest = str(det.manifest ?? inst.manifest)
    const latestManifest = str(det.latest_manifest)
    const latestTime = num(det.latest_timeupdated)
    if ((manifest && latestManifest && manifest !== latestManifest) || (updated && latestTime && latestTime > updated)) {
      info.needsUpdate = true
    }
    out[id] = info
  }
  return out
}

export type WebDetails = Pick<WorkshopInfo, 'title' | 'subscriptions' | 'tags' | 'webUpdatedAt'>

/** Reply of ISteamRemoteStorage/GetPublishedFileDetails/v1. Items Steam could not find are skipped. */
export function parsePublishedDetails(json: unknown): Record<string, WebDetails> {
  const list = (json as { response?: { publishedfiledetails?: unknown } })?.response?.publishedfiledetails
  const out: Record<string, WebDetails> = {}
  if (!Array.isArray(list)) return out
  for (const raw of list) {
    const d = raw as Record<string, unknown>
    const id = str(d?.publishedfileid)
    if (!id || d.result !== 1) continue
    const item: WebDetails = {}
    const title = str(d.title)
    if (title) item.title = title.slice(0, 200)
    const subs = num(d.lifetime_subscriptions ?? d.subscriptions)
    if (subs !== undefined) item.subscriptions = subs
    const updated = num(d.time_updated)
    if (updated) item.webUpdatedAt = updated * 1000
    if (Array.isArray(d.tags)) {
      const tags = d.tags.map((t) => str((t as { tag?: unknown })?.tag)).filter((t): t is string => !!t)
      if (tags.length) item.tags = tags.slice(0, 12)
    }
    out[id] = item
  }
  return out
}

export interface PlayerSummary {
  name?: string
  state?: string
  game?: string
}

const STATES = ['Offline', 'Online', 'Busy', 'Away', 'Snooze', 'Looking to trade', 'Looking to play']

/** First player in ISteamUser/GetPlayerSummaries/v2. */
export function parsePlayerSummary(json: unknown): PlayerSummary | undefined {
  const p = (json as { response?: { players?: unknown[] } })?.response?.players?.[0] as Record<string, unknown> | undefined
  if (!p) return undefined
  const state = num(p.personastate)
  return {
    name: str(p.personaname),
    state: state !== undefined ? (STATES[state] ?? 'Online') : undefined,
    game: str(p.gameextrainfo)
  }
}

/** Steam Web API keys are 32 hex characters. */
export function isValidKey(key: unknown): key is string {
  return typeof key === 'string' && /^[0-9A-Fa-f]{32}$/.test(key)
}

/** Steam root from a workshop content folder: <root>/steamapps/workshop/content/294100. */
export function steamRootFromWorkshop(workshopDir: string): string | undefined {
  const parts = workshopDir.replace(/[\\/]+$/, '').split(/[\\/]/)
  const i = parts.map((p) => p.toLowerCase()).lastIndexOf('steamapps')
  return i > 0 ? parts.slice(0, i).join('/') : undefined
}
