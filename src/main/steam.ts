/** Steam link: local files plus an optional Web API key. The key stays in the main process, encrypted at rest. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SteamStatus, WorkshopInfo } from '../shared/api.ts'
import { detectSteamPath, RIMWORLD_APP_ID } from './detect.ts'
import {
  isValidKey,
  parseLoginUsers,
  parsePlayerSummary,
  parsePublishedDetails,
  parseWorkshopAcf,
  pickUser,
  steamRootFromWorkshop,
  type PlayerSummary,
  type WebDetails
} from './steamParse.ts'

export interface Crypto {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(data: Buffer): string
}

export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

interface Stored {
  key?: string
}

interface Cache {
  refreshedAt?: number
  online?: PlayerSummary
  details?: Record<string, WebDetails>
  error?: string
}

const API = 'https://api.steampowered.com'
const CHUNK = 100

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return undefined
  }
}

export class SteamLink {
  constructor(
    private readonly dir: string,
    private readonly crypto: Crypto,
    private readonly fetcher: Fetch,
    private readonly workshopDir: () => Promise<string>
  ) {}

  private get keyFile(): string {
    return join(this.dir, 'steam.json')
  }

  private get cacheFile(): string {
    return join(this.dir, 'steam-cache.json')
  }

  private async key(): Promise<string | undefined> {
    const stored = await readJson<Stored>(this.keyFile, {})
    if (!stored.key || !this.crypto.isEncryptionAvailable()) return undefined
    try {
      const key = this.crypto.decryptString(Buffer.from(stored.key, 'base64'))
      return isValidKey(key) ? key : undefined
    } catch {
      return undefined
    }
  }

  /** Main Steam folder for loginusers.vdf and the avatar cache. */
  private async steamPath(): Promise<string | undefined> {
    return (await detectSteamPath()) ?? steamRootFromWorkshop(await this.workshopDir())
  }

  /** The library that holds the Workshop folder has the install record. */
  private async localWorkshop(): Promise<Record<string, WorkshopInfo>> {
    const root = steamRootFromWorkshop(await this.workshopDir()) ?? (await this.steamPath())
    if (!root) return {}
    const text = await readText(join(root, 'steamapps', 'workshop', `appworkshop_${RIMWORLD_APP_ID}.acf`))
    return text ? parseWorkshopAcf(text) : {}
  }

  async workshop(): Promise<Record<string, WorkshopInfo>> {
    const local = await this.localWorkshop()
    const { details = {} } = await readJson<Cache>(this.cacheFile, {})
    const out: Record<string, WorkshopInfo> = {}
    for (const id of Object.keys(local)) out[id] = { ...local[id], ...details[id] }
    return out
  }

  async status(): Promise<SteamStatus> {
    const steamPath = await this.steamPath()
    const key = await this.key()
    const cache = await readJson<Cache>(this.cacheFile, {})
    const local = await this.localWorkshop()
    const status: SteamStatus = {
      steamPath,
      hasKey: !!key,
      keyHint: key ? key.slice(-4) : undefined,
      canStoreKey: this.crypto.isEncryptionAvailable(),
      workshopItems: Object.keys(local).length,
      pendingUpdates: Object.values(local).filter((w) => w.needsUpdate).length,
      refreshedAt: cache.refreshedAt,
      online: key ? cache.online : undefined,
      error: cache.error
    }
    if (steamPath) {
      const text = await readText(join(steamPath, 'config', 'loginusers.vdf'))
      const user = text ? pickUser(parseLoginUsers(text)) : undefined
      if (user) {
        status.user = { id: user.id, name: user.name }
        try {
          const png = await readFile(join(steamPath, 'config', 'avatarcache', `${user.id}.png`))
          if (png.length < 512 * 1024) status.avatar = `data:image/png;base64,${png.toString('base64')}`
        } catch {
          // No cached avatar; the UI shows a letter instead.
        }
      }
    }
    return status
  }

  async setKey(key: string | null): Promise<SteamStatus> {
    if (key === null) {
      await writeFile(this.keyFile, JSON.stringify({}), 'utf8')
      const cache = await readJson<Cache>(this.cacheFile, {})
      delete cache.online
      await writeFile(this.cacheFile, JSON.stringify(cache), 'utf8')
      return this.status()
    }
    const trimmed = typeof key === 'string' ? key.trim() : ''
    if (!isValidKey(trimmed)) throw new Error('A Steam Web API key is 32 characters of 0-9 and A-F.')
    if (!this.crypto.isEncryptionAvailable()) throw new Error('This system cannot encrypt the key, so it is not saved.')
    const stored: Stored = { key: this.crypto.encryptString(trimmed).toString('base64') }
    await writeFile(this.keyFile, JSON.stringify(stored), 'utf8')
    return this.status()
  }

  /** Workshop details need no key; the profile does. Errors are kept in the cache for the UI. */
  async refresh(): Promise<SteamStatus> {
    const old = await readJson<Cache>(this.cacheFile, {})
    const cache: Cache = { details: old.details ?? {}, online: old.online, refreshedAt: Date.now() }
    const errors: string[] = []
    const ids = Object.keys(await this.localWorkshop())
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK)
      const body = new URLSearchParams({ itemcount: String(part.length) })
      part.forEach((id, n) => body.set(`publishedfileids[${n}]`, id))
      try {
        const res = await this.fetcher(`${API}/ISteamRemoteStorage/GetPublishedFileDetails/v1/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        Object.assign(cache.details!, parsePublishedDetails(await res.json()))
      } catch (e) {
        errors.push(`Workshop: ${(e as Error).message}`)
        break
      }
    }
    const key = await this.key()
    const user = (await this.status()).user
    if (key && user) {
      try {
        const url = `${API}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${user.id}`
        const res = await this.fetcher(url)
        if (res.status === 401 || res.status === 403) throw new Error('the key was refused')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        cache.online = parsePlayerSummary(await res.json())
      } catch (e) {
        // Never echo the URL: it holds the key.
        errors.push(`Profile: ${(e as Error).message.replace(/key=[^&\s]+/g, 'key=***')}`)
      }
    }
    if (errors.length) cache.error = errors.join('; ')
    await writeFile(this.cacheFile, JSON.stringify(cache), 'utf8')
    return this.status()
  }
}
