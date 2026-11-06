import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Keep tests away from the real Steam install on this machine.
vi.mock('../src/main/detect.ts', () => ({
  RIMWORLD_APP_ID: '294100',
  detectSteamPath: async () => undefined
}))

import { SteamLink, type Crypto, type Fetch } from '../src/main/steam.ts'
import {
  isValidKey,
  parseLoginUsers,
  parsePlayerSummary,
  parsePublishedDetails,
  parseWorkshopAcf,
  pickUser,
  steamRootFromWorkshop
} from '../src/main/steamParse.ts'

const LOGIN = `"users"
{
  "76561190000000001"
  {
    "AccountName"  "old"
    "PersonaName"  "Old Name"
    "MostRecent"   "0"
    "Timestamp"    "1700000000"
  }
  "76561190000000002"
  {
    "AccountName"  "main"
    "PersonaName"  "Colonist"
    "MostRecent"   "1"
    "Timestamp"    "1600000000"
  }
  "bad" { "PersonaName" "x" }
}`

const ACF = `"AppWorkshop"
{
  "appid" "294100"
  "WorkshopItemsInstalled"
  {
    "111" { "size" "2048" "timeupdated" "1700000000" "manifest" "5" }
    "222" { "size" "10" "timeupdated" "1700000000" "manifest" "7" }
  }
  "WorkshopItemDetails"
  {
    "111" { "manifest" "5" "timeupdated" "1700000000" "latest_timeupdated" "1700000000" "latest_manifest" "5" }
    "222" { "manifest" "7" "timeupdated" "1700000000" "latest_timeupdated" "1700009999" "latest_manifest" "8" }
  }
}`

const KEY = '0123456789ABCDEF0123456789ABCDEF'

describe('steam parsers', () => {
  it('reads accounts and picks the most recent one', () => {
    const users = parseLoginUsers(LOGIN)
    expect(users.map((u) => u.id)).toEqual(['76561190000000001', '76561190000000002'])
    expect(pickUser(users)?.name).toBe('Colonist')
    expect(pickUser(users.map((u) => ({ ...u, mostRecent: false })))?.name).toBe('Old Name')
    expect(parseLoginUsers('garbage')).toEqual([])
  })

  it('reads the workshop install record and spots pending updates', () => {
    const w = parseWorkshopAcf(ACF)
    expect(w['111']).toEqual({ id: '111', size: 2048, updatedAt: 1700000000000 })
    expect(w['222'].needsUpdate).toBe(true)
    expect(parseWorkshopAcf('')).toEqual({})
  })

  it('reads published details and skips missing items', () => {
    const d = parsePublishedDetails({
      response: {
        publishedfiledetails: [
          { publishedfileid: '111', result: 1, title: 'Hats', lifetime_subscriptions: 42, time_updated: 1700000500, tags: [{ tag: 'Mod' }, { tag: '1.6' }] },
          { publishedfileid: '333', result: 9 }
        ]
      }
    })
    expect(d).toEqual({ '111': { title: 'Hats', subscriptions: 42, webUpdatedAt: 1700000500000, tags: ['Mod', '1.6'] } })
    expect(parsePublishedDetails(null)).toEqual({})
  })

  it('reads the player summary', () => {
    expect(parsePlayerSummary({ response: { players: [{ personaname: 'C', personastate: 3, gameextrainfo: 'RimWorld' }] } })).toEqual({
      name: 'C',
      state: 'Away',
      game: 'RimWorld'
    })
    expect(parsePlayerSummary({ response: { players: [] } })).toBeUndefined()
  })

  it('validates keys and finds the steam root', () => {
    expect(isValidKey(KEY)).toBe(true)
    expect(isValidKey(KEY.slice(1))).toBe(false)
    expect(isValidKey('Z'.repeat(32))).toBe(false)
    expect(steamRootFromWorkshop('D:\\Steam\\steamapps\\workshop\\content\\294100\\')).toBe('D:/Steam')
    expect(steamRootFromWorkshop('C:/mods')).toBeUndefined()
  })
})

/** Reversible stand-in for safeStorage: the stored bytes never contain the key as written. */
const crypto: Crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (t) => Buffer.from(Buffer.from([...t].reverse().join(''), 'utf8').map((b) => b ^ 0x5a)),
  decryptString: (b) => [...Buffer.from(b.map((x) => x ^ 0x5a)).toString('utf8')].reverse().join('')
}

describe('SteamLink', () => {
  let root: string
  let userData: string
  let calls: string[]
  let profileStatus: number

  const fetcher: Fetch = async (url) => {
    calls.push(url)
    if (url.includes('GetPublishedFileDetails')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: { publishedfiledetails: [{ publishedfileid: '111', result: 1, title: 'Hats' }] } })
      }
    }
    return {
      ok: profileStatus === 200,
      status: profileStatus,
      json: async () => ({ response: { players: [{ personaname: 'Colonist', personastate: 1 }] } })
    }
  }

  const link = (c: Crypto = crypto): SteamLink =>
    new SteamLink(userData, c, fetcher, async () => join(root, 'steamapps', 'workshop', 'content', '294100'))

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rwl-steam-'))
    userData = join(root, 'userData')
    calls = []
    profileStatus = 200
    await mkdir(join(root, 'config', 'avatarcache'), { recursive: true })
    await mkdir(join(root, 'steamapps', 'workshop', 'content', '294100'), { recursive: true })
    await mkdir(userData)
    await writeFile(join(root, 'config', 'loginusers.vdf'), LOGIN)
    await writeFile(join(root, 'config', 'avatarcache', '76561190000000002.png'), Buffer.from([137, 80, 78, 71]))
    await writeFile(join(root, 'steamapps', 'workshop', 'appworkshop_294100.acf'), ACF)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads the account, avatar and workshop counts without a key', async () => {
    const s = await link().status()
    expect(s.user?.name).toBe('Colonist')
    expect(s.avatar).toMatch(/^data:image\/png;base64,/)
    expect(s).toMatchObject({ hasKey: false, canStoreKey: true, workshopItems: 2, pendingUpdates: 1 })
  })

  it('rejects bad keys and refuses to store without encryption', async () => {
    await expect(link().setKey('nope')).rejects.toThrow('32 characters')
    const noCrypto = { ...crypto, isEncryptionAvailable: () => false }
    await expect(link(noCrypto).setKey(KEY)).rejects.toThrow('cannot encrypt')
  })

  it('stores the key encrypted and only exposes a hint', async () => {
    const s = await link().setKey(`  ${KEY}  `)
    expect(s.hasKey).toBe(true)
    expect(s.keyHint).toBe('CDEF')
    expect(JSON.stringify(s)).not.toContain(KEY)
    const onDisk = await readFile(join(userData, 'steam.json'), 'utf8')
    expect(onDisk).not.toContain(KEY)
    expect(Buffer.from(onDisk, 'utf8').toString('base64')).not.toContain(KEY)
  })

  it('refreshes details and profile, then merges details into workshop data', async () => {
    await link().setKey(KEY)
    const s = await link().refresh()
    expect(s.online).toEqual({ name: 'Colonist', state: 'Online', game: undefined })
    expect(s.error).toBeUndefined()
    expect(calls[0]).toContain('GetPublishedFileDetails')
    expect(calls[1]).toContain('steamids=76561190000000002')
    const w = await link().workshop()
    expect(w['111']).toMatchObject({ size: 2048, title: 'Hats' })
    expect(w['222'].needsUpdate).toBe(true)
    expect(await readFile(join(userData, 'steam-cache.json'), 'utf8')).not.toContain(KEY)
  })

  it('skips the profile call without a key', async () => {
    await link().refresh()
    expect(calls).toHaveLength(1)
  })

  it('reports a refused key without leaking it', async () => {
    await link().setKey(KEY)
    profileStatus = 403
    const s = await link().refresh()
    expect(s.error).toContain('the key was refused')
    expect(s.error).not.toContain(KEY)
  })

  it('redacts the key if a fetch error echoes the URL', async () => {
    await link().setKey(KEY)
    const leaky: Fetch = async (url) => {
      if (url.includes('GetPublishedFileDetails')) return fetcher(url)
      throw new Error(`request to ${url} failed`)
    }
    const s = await new SteamLink(userData, crypto, leaky, async () => join(root, 'steamapps', 'workshop', 'content', '294100')).refresh()
    expect(s.error).toContain('key=***')
    expect(s.error).not.toContain(KEY)
  })

  it('removing the key clears the online state', async () => {
    await link().setKey(KEY)
    await link().refresh()
    const s = await link().setKey(null)
    expect(s.hasKey).toBe(false)
    expect(s.online).toBeUndefined()
    expect(await readFile(join(userData, 'steam-cache.json'), 'utf8')).not.toContain('online')
  })
})
