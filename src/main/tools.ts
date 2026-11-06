/** Main-process helpers for the log, bisect and backup tools. No Electron imports. */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LogResult } from '../shared/api.ts'
import { parseLog, type AttribMod } from '../shared/logParser.ts'
import type { BisectState } from '../shared/bisect.ts'
import type { ModInfo } from '../shared/types.ts'

const MAX_LOG_BYTES = 40 * 1024 * 1024

/** Player.log candidates: the instance data folder first, then the game's own location (read only). */
export function logCandidates(dataDir: string, home = homedir()): { path: string; source: 'instance' | 'game' }[] {
  return [
    { path: join(dataDir, 'Player.log'), source: 'instance' },
    { path: join(home, 'AppData', 'LocalLow', 'Ludeon Studios', 'RimWorld by Ludeon Studios', 'Player.log'), source: 'game' }
  ]
}

export async function findLog(dataDir: string, home?: string): Promise<{ path: string; source: 'instance' | 'game'; modifiedAt: string; size: number } | undefined> {
  for (const c of logCandidates(dataDir, home)) {
    try {
      const s = await stat(c.path)
      if (s.isFile()) return { ...c, modifiedAt: s.mtime.toISOString(), size: s.size }
    } catch {
      /* try the next one */
    }
  }
  return undefined
}

async function dllNames(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.dll')).map((f) => f.slice(0, -4))
  } catch {
    return []
  }
}

/** Assembly file names of a mod: <mod>/Assemblies and <mod>/<version or Common>/Assemblies. */
export async function modAssemblies(modPath: string): Promise<string[]> {
  const names = new Set(await dllNames(join(modPath, 'Assemblies')))
  let subs: string[] = []
  try {
    subs = (await readdir(modPath, { withFileTypes: true })).filter((e) => e.isDirectory() && e.name !== 'Assemblies').map((e) => e.name)
  } catch {
    return [...names]
  }
  for (const sub of subs) {
    if (!/^(\d+\.\d+|common|loadfolders)$/i.test(sub)) continue
    for (const n of await dllNames(join(modPath, sub, 'Assemblies'))) names.add(n)
  }
  return [...names]
}

export async function buildAttribMods(uids: string[], mods: Map<string, ModInfo>): Promise<AttribMod[]> {
  const out: AttribMod[] = []
  for (const uid of uids) {
    const m = mods.get(uid)
    if (!m) continue
    out.push({
      uid: m.uid,
      packageId: m.packageId,
      name: m.name,
      folderName: m.folderName,
      steamId: m.steamId,
      assemblies: m.source === 'official' ? [] : await modAssemblies(m.path)
    })
  }
  return out
}

export async function analyzeLogFile(dataDir: string, attrib: AttribMod[], home?: string): Promise<LogResult> {
  const found = await findLog(dataDir, home)
  if (!found) return { found: false }
  let text = await readFile(found.path, 'utf8')
  if (text.length > MAX_LOG_BYTES) text = text.slice(-MAX_LOG_BYTES)
  return { found: true, path: found.path, source: found.source, modifiedAt: found.modifiedAt, report: parseLog(text, attrib) }
}

/** Bisect state lives in <instance dir>/bisect.json. */
export async function readBisect(instDir: string): Promise<BisectState | undefined> {
  try {
    return JSON.parse(await readFile(join(instDir, 'bisect.json'), 'utf8')) as BisectState
  } catch {
    return undefined
  }
}

export async function writeBisect(instDir: string, state: BisectState): Promise<void> {
  await mkdir(instDir, { recursive: true })
  await writeFile(join(instDir, 'bisect.json'), JSON.stringify(state, null, 2), 'utf8')
}

export async function clearBisect(instDir: string): Promise<void> {
  await rm(join(instDir, 'bisect.json'), { force: true })
}
