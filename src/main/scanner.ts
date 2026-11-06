/**
 * Mod scanner. Reads only; never writes into the game, Workshop or mod folders.
 * Kept free of Electron imports so scripts/scan-real.ts can run it under plain Node.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseAboutXml } from '../shared/about.ts'
import type { ModInfo, ModSource, ScanResult } from '../shared/types.ts'

export interface ScanRoots {
  gameDir: string
  workshopDir: string
  /** Full line from Version.txt, used for the result. */
  gameVersion: string
}

async function dirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/** Find an entry by name, ignoring case (mods ship "about", "About.XML", "preview.PNG"). */
async function findEntry(dir: string, name: string, kind: 'file' | 'dir'): Promise<string | undefined> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
  const want = name.toLowerCase()
  const hit = entries.find((e) => e.name.toLowerCase() === want && (kind === 'dir' ? e.isDirectory() : e.isFile()))
  return hit ? join(dir, hit.name) : undefined
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const HINT_DIRS = ['assemblies', 'defs', 'patches', 'textures', 'sounds', 'languages']

async function subdirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

/** Which content folders a mod ships, looking at the root and at version folders like 1.6/ or Common/. */
async function contentHints(folder: string): Promise<string[]> {
  const found = new Set<string>()
  const top = await subdirs(folder)
  const nested = top.filter((n) => /^(v?\d+(\.\d+)*|common)$/i.test(n))
  for (const names of [top, ...(await Promise.all(nested.map((n) => subdirs(join(folder, n)))))]) {
    for (const n of names) if (HINT_DIRS.includes(n.toLowerCase())) found.add(n.toLowerCase())
  }
  return HINT_DIRS.filter((h) => found.has(h))
}

interface RawMod {
  mod: Omit<ModInfo, 'uid'>
}

async function readMod(folder: string, folderName: string, source: ModSource, failures: ScanResult['failures']): Promise<RawMod | undefined> {
  const aboutDir = await findEntry(folder, 'About', 'dir')
  const aboutFile = aboutDir && (await findEntry(aboutDir, 'About.xml', 'file'))
  if (!aboutDir || !aboutFile) {
    failures.push({ path: folder, reason: 'No About/About.xml' })
    return undefined
  }
  let raw: string
  try {
    raw = await readFile(aboutFile, 'utf8')
  } catch (e) {
    failures.push({ path: aboutFile, reason: `Unreadable: ${(e as Error).message}` })
    return undefined
  }
  const parsed = parseAboutXml(raw)
  const data = parsed.data
  if (!data.packageId) {
    failures.push({ path: aboutFile, reason: parsed.issue ? `${parsed.issue}; no packageId found` : 'No packageId' })
    return undefined
  }
  if (parsed.issue) failures.push({ path: aboutFile, reason: `${parsed.issue} (read with fallback)` })
  const previewPath = await findEntry(aboutDir, 'Preview.png', 'file')
  return {
    mod: {
      ...data,
      name: data.name || folderName,
      source,
      path: folder,
      folderName,
      steamId: source === 'workshop' && /^\d+$/.test(folderName) ? folderName : undefined,
      previewPath,
      parseIssue: parsed.issue,
      contentHints: await contentHints(folder)
    }
  }
}

async function scanFolder(root: string, source: ModSource, failures: ScanResult['failures']): Promise<RawMod[]> {
  const names = await dirs(root)
  const out: RawMod[] = []
  // Bounded parallelism keeps the Workshop folder (hundreds of mods) quick without flooding the disk.
  const queue = [...names]
  async function worker(): Promise<void> {
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      const r = await readMod(join(root, name), name, source, failures)
      if (r) out.push(r)
    }
  }
  await Promise.all(Array.from({ length: 16 }, worker))
  return out.sort((a, b) => a.mod.folderName.localeCompare(b.mod.folderName))
}

/**
 * Assign the id the game writes into ModsConfig.xml. The first copy of a packageId keeps it;
 * a Workshop copy of an id that is already taken gets "_steam", as RimWorld does.
 */
export function assignUids(raw: Omit<ModInfo, 'uid'>[]): ModInfo[] {
  const taken = new Set<string>()
  const out: ModInfo[] = []
  for (const m of raw) {
    let uid = m.packageId
    if (taken.has(uid)) {
      uid = m.source === 'workshop' ? `${m.packageId}_steam` : `${m.packageId}_${m.folderName.toLowerCase()}`
      let n = 2
      const base = uid
      while (taken.has(uid)) uid = `${base}${n++}`
    }
    taken.add(uid)
    out.push({ ...m, uid })
  }
  return out
}

export async function scanMods(roots: ScanRoots): Promise<ScanResult> {
  const failures: ScanResult['failures'] = []
  const official = roots.gameDir ? await scanFolder(join(roots.gameDir, 'Data'), 'official', failures) : []
  const local = roots.gameDir ? await scanFolder(join(roots.gameDir, 'Mods'), 'local', failures) : []
  const workshop = roots.workshopDir ? await scanFolder(roots.workshopDir, 'workshop', failures) : []
  const mods = assignUids([...official, ...local, ...workshop].map((r) => r.mod))
  failures.sort((a, b) => a.path.localeCompare(b.path))
  return { mods, gameVersion: roots.gameVersion, failures, scannedAt: new Date().toISOString() }
}
