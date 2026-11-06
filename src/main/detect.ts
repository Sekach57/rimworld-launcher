import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, normalize } from 'node:path'
import type { Settings } from '../shared/types.ts'
import { libraryPaths } from './vdf.ts'

export const RIMWORLD_APP_ID = '294100'
export const EXE_CANDIDATES = ['RimWorldWin64.exe', 'RimWorld.exe']

function regQuery(key: string, value: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(undefined)
    execFile('reg', ['query', key, '/v', value], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(undefined)
      const m = new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`, 'i').exec(stdout)
      resolve(m ? m[1].trim() : undefined)
    })
  })
}

export async function detectSteamPath(): Promise<string | undefined> {
  const fromReg = (await regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath')) ?? (await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'))
  if (fromReg && existsSync(fromReg)) return normalize(fromReg)
  for (const guess of ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']) {
    if (existsSync(guess)) return guess
  }
  return undefined
}

export function steamLibraries(steamPath: string): string[] {
  const libs = [normalize(steamPath)]
  const vdf = join(steamPath, 'steamapps', 'libraryfolders.vdf')
  if (existsSync(vdf)) {
    try {
      for (const p of libraryPaths(readFileSync(vdf, 'utf8'))) {
        const n = normalize(p)
        if (!libs.some((l) => l.toLowerCase() === n.toLowerCase())) libs.push(n)
      }
    } catch {
      // Unreadable library file: fall back to the Steam folder alone.
    }
  }
  return libs
}

export function detectExe(gameDir: string): string {
  return EXE_CANDIDATES.find((name) => existsSync(join(gameDir, name))) ?? EXE_CANDIDATES[0]
}

/** Full version line from Version.txt, for example "1.6.4633 rev1261". Empty when missing. */
export function readGameVersion(gameDir: string): string {
  try {
    return readFileSync(join(gameDir, 'Version.txt'), 'utf8').replace(/^\uFEFF/, '').trim()
  } catch {
    return ''
  }
}

export function defaultDataDir(): string {
  return join(homedir(), 'AppData', 'LocalLow', 'Ludeon Studios', 'RimWorld by Ludeon Studios')
}

/** Best guess for every path. Fields stay empty when nothing is found. */
export async function detectSettings(): Promise<Settings> {
  const steam = await detectSteamPath()
  let gameDir = ''
  let workshopDir = ''
  if (steam) {
    for (const lib of steamLibraries(steam)) {
      const game = join(lib, 'steamapps', 'common', 'RimWorld')
      if (existsSync(game)) {
        gameDir = game
        workshopDir = join(lib, 'steamapps', 'workshop', 'content', RIMWORLD_APP_ID)
        break
      }
    }
  }
  return {
    gameDir,
    workshopDir,
    defaultDataDir: defaultDataDir(),
    exeName: gameDir ? detectExe(gameDir) : EXE_CANDIDATES[0]
  }
}
