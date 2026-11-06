/**
 * Instance store. Each instance lives in <root>/<id>/:
 *   meta.json                    name, colour, letter, dates, notes
 *   data/                        passed to the game as -savedatafolder
 *   data/Config/ModsConfig.xml   the source of truth for the active mod list
 * Kept free of Electron imports so it can be unit-tested under plain Node.
 */
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InstanceInput } from '../shared/api.ts'
import { parseModsConfig, writeModsConfig, type ModsConfigData } from '../shared/modsConfig.ts'
import type { Instance } from '../shared/types.ts'

type Meta = Omit<Instance, 'activeMods'>

const ID_RE = /^[a-z0-9]{6,32}$/

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function cleanInput(input: Partial<InstanceInput>): Partial<InstanceInput> {
  const out: Partial<InstanceInput> = {}
  if (typeof input.name === 'string') out.name = input.name.trim().slice(0, 80) || 'Untitled'
  if (typeof input.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color)) out.color = input.color.toLowerCase()
  if (typeof input.letter === 'string') out.letter = input.letter.trim().slice(0, 2).toUpperCase()
  if (typeof input.notes === 'string') out.notes = input.notes.slice(0, 2000)
  return out
}

export class InstanceStore {
  constructor(
    readonly root: string,
    private readonly trash: (path: string) => Promise<void>
  ) {}

  dir(id: string): string {
    if (!ID_RE.test(id)) throw new Error(`Bad instance id: ${id}`)
    return join(this.root, id)
  }

  dataDir(id: string): string {
    return join(this.dir(id), 'data')
  }

  private configPath(id: string): string {
    return join(this.dataDir(id), 'Config', 'ModsConfig.xml')
  }

  private async readConfig(id: string): Promise<ModsConfigData> {
    try {
      return parseModsConfig(await readFile(this.configPath(id), 'utf8'))
    } catch {
      return { version: '', activeMods: [], knownExpansions: [] }
    }
  }

  private async writeConfig(id: string, data: ModsConfigData): Promise<void> {
    await mkdir(join(this.dataDir(id), 'Config'), { recursive: true })
    await writeFile(this.configPath(id), writeModsConfig(data), 'utf8')
  }

  private async writeMeta(meta: Meta): Promise<void> {
    await writeFile(join(this.dir(meta.id), 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  }

  async get(id: string): Promise<Instance> {
    const meta = JSON.parse(await readFile(join(this.dir(id), 'meta.json'), 'utf8')) as Meta
    const config = await this.readConfig(id)
    return {
      id,
      name: meta.name || 'Untitled',
      color: meta.color || '#5fb3a1',
      letter: meta.letter || (meta.name || '?').slice(0, 1).toUpperCase(),
      createdAt: meta.createdAt,
      lastPlayedAt: meta.lastPlayedAt,
      notes: meta.notes ?? '',
      activeMods: config.activeMods
    }
  }

  /** All readable instances, most recently played (or created) first. Broken folders are skipped. */
  async list(): Promise<Instance[]> {
    let names: string[]
    try {
      names = (await readdir(this.root, { withFileTypes: true })).filter((e) => e.isDirectory() && ID_RE.test(e.name)).map((e) => e.name)
    } catch {
      return []
    }
    const out: Instance[] = []
    for (const id of names) {
      try {
        out.push(await this.get(id))
      } catch {
        // No meta.json: not an instance, or half-deleted. Leave it alone.
      }
    }
    const key = (i: Instance) => i.lastPlayedAt ?? i.createdAt ?? ''
    return out.sort((a, b) => key(b).localeCompare(key(a)))
  }

  async create(input: InstanceInput, activeMods: string[], knownExpansions: string[], version: string): Promise<Instance> {
    const id = newId()
    const clean = cleanInput(input)
    const name = clean.name ?? 'Untitled'
    const meta: Meta = {
      id,
      name,
      color: clean.color ?? '#5fb3a1',
      letter: clean.letter || name.slice(0, 1).toUpperCase(),
      createdAt: new Date().toISOString(),
      notes: clean.notes ?? ''
    }
    await mkdir(join(this.dataDir(id), 'Config'), { recursive: true })
    await this.writeMeta(meta)
    await this.writeConfig(id, { version, activeMods: [...new Set(activeMods)], knownExpansions })
    return this.get(id)
  }

  async update(id: string, patch: Partial<InstanceInput>): Promise<Instance> {
    const current = await this.get(id)
    const { activeMods: _unused, ...meta } = current
    await this.writeMeta({ ...meta, ...cleanInput(patch) })
    return this.get(id)
  }

  /** Copies the whole folder, saves included, under a new id. */
  async duplicate(id: string): Promise<Instance> {
    const source = await this.get(id)
    const copy = newId()
    await cp(this.dir(id), this.dir(copy), { recursive: true, errorOnExist: true, force: false })
    const { activeMods: _unused, ...meta } = source
    await this.writeMeta({ ...meta, id: copy, name: `${source.name} copy`.slice(0, 80), createdAt: new Date().toISOString(), lastPlayedAt: undefined })
    return this.get(copy)
  }

  /** Moves the folder to the trash, so saves can still be recovered. */
  async remove(id: string): Promise<void> {
    await this.trash(this.dir(id))
  }

  async setActiveMods(id: string, mods: string[], gameVersion: string, defaultExpansions: string[]): Promise<Instance> {
    const config = await this.readConfig(id)
    await this.writeConfig(id, {
      version: gameVersion || config.version,
      activeMods: [...new Set(mods.map((m) => m.toLowerCase()))],
      knownExpansions: config.knownExpansions.length ? config.knownExpansions : defaultExpansions
    })
    return this.get(id)
  }

  async markPlayed(id: string): Promise<Instance> {
    const current = await this.get(id)
    const { activeMods: _unused, ...meta } = current
    await this.writeMeta({ ...meta, lastPlayedAt: new Date().toISOString() })
    return this.get(id)
  }
}

/** Read the game's own ModsConfig.xml. Never writes. */
export async function readDefaultModsConfig(defaultDataDir: string): Promise<ModsConfigData | undefined> {
  try {
    return parseModsConfig(await readFile(join(defaultDataDir, 'Config', 'ModsConfig.xml'), 'utf8'))
  } catch {
    return undefined
  }
}
