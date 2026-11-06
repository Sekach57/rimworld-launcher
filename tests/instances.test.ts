import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { InstanceStore, readDefaultModsConfig } from '../src/main/instances.ts'
import { writeModsConfig } from '../src/shared/modsConfig.ts'
import { mkdir, writeFile } from 'node:fs/promises'

let root: string
let store: InstanceStore
const trashed: string[] = []

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rwl-inst-'))
  trashed.length = 0
  store = new InstanceStore(join(root, 'instances'), async (p) => {
    trashed.push(p)
    await rm(p, { recursive: true, force: true })
  })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const input = { name: 'Vanilla run', color: '#d9a441', letter: 'v', notes: 'first' }

describe('InstanceStore', () => {
  it('creates an instance with meta and a game-format ModsConfig.xml', async () => {
    const inst = await store.create(input, ['ludeon.rimworld', 'a.b', 'a.b'], ['ludeon.rimworld.royalty'], '1.6.4633 rev1261')
    expect(inst.name).toBe('Vanilla run')
    expect(inst.letter).toBe('V')
    expect(inst.activeMods).toEqual(['ludeon.rimworld', 'a.b'])
    const raw = await readFile(join(store.dataDir(inst.id), 'Config', 'ModsConfig.xml'), 'utf8')
    expect(raw).toBe(writeModsConfig({ version: '1.6.4633 rev1261', activeMods: ['ludeon.rimworld', 'a.b'], knownExpansions: ['ludeon.rimworld.royalty'] }))
  })

  it('lists, renames and keeps the mod list', async () => {
    const a = await store.create(input, ['ludeon.rimworld'], [], '1.6')
    await store.update(a.id, { name: '  Renamed  ', color: 'not a colour' })
    const [only] = await store.list()
    expect(only.name).toBe('Renamed')
    expect(only.color).toBe('#d9a441')
    expect(only.activeMods).toEqual(['ludeon.rimworld'])
  })

  it('duplicates the whole folder under a new id', async () => {
    const a = await store.create(input, ['ludeon.rimworld', 'x.y'], [], '1.6')
    await writeFile(join(store.dataDir(a.id), 'save.txt'), 'colony')
    const b = await store.duplicate(a.id)
    expect(b.id).not.toBe(a.id)
    expect(b.name).toBe('Vanilla run copy')
    expect(b.activeMods).toEqual(a.activeMods)
    expect(await readFile(join(store.dataDir(b.id), 'save.txt'), 'utf8')).toBe('colony')
    expect(await store.list()).toHaveLength(2)
  })

  it('sets active mods, keeping known expansions', async () => {
    const a = await store.create(input, [], ['ludeon.rimworld.royalty'], '1.5')
    const b = await store.setActiveMods(a.id, ['Ludeon.RimWorld', 'x.y'], '1.6.1 rev1', ['other'])
    expect(b.activeMods).toEqual(['ludeon.rimworld', 'x.y'])
    const raw = await readFile(join(store.dataDir(a.id), 'Config', 'ModsConfig.xml'), 'utf8')
    expect(raw).toContain('<version>1.6.1 rev1</version>')
    expect(raw).toContain('<li>ludeon.rimworld.royalty</li>')
  })

  it('marks played and removes through the trash callback', async () => {
    const a = await store.create(input, [], [], '1.6')
    expect((await store.markPlayed(a.id)).lastPlayedAt).toBeTruthy()
    await store.remove(a.id)
    expect(trashed).toEqual([store.dir(a.id)])
    expect(await store.list()).toEqual([])
  })

  it('rejects ids that could escape the root', () => {
    expect(() => store.dir('..\\..\\windows')).toThrow()
    expect(() => store.dir('abc')).toThrow()
  })

  it('reads the default ModsConfig.xml without touching it', async () => {
    const dataDir = join(root, 'default')
    await mkdir(join(dataDir, 'Config'), { recursive: true })
    const file = join(dataDir, 'Config', 'ModsConfig.xml')
    const text = writeModsConfig({ version: '1.6', activeMods: ['ludeon.rimworld'], knownExpansions: [] })
    await writeFile(file, text, 'utf8')
    const before = (await stat(file)).mtimeMs
    const cfg = await readDefaultModsConfig(dataDir)
    expect(cfg?.activeMods).toEqual(['ludeon.rimworld'])
    expect((await stat(file)).mtimeMs).toBe(before)
    expect(await readDefaultModsConfig(join(root, 'missing'))).toBeUndefined()
  })
})
