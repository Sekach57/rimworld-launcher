import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Settings } from '../shared/types.ts'
import { detectSettings } from './detect.ts'

const KEYS: (keyof Settings)[] = ['gameDir', 'workshopDir', 'defaultDataDir', 'exeName']

export function sanitizeSettings(raw: unknown): Settings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = {} as Settings
  for (const k of KEYS) out[k] = typeof src[k] === 'string' ? (src[k] as string).trim() : ''
  return out
}

export async function saveSettings(file: string, settings: Settings): Promise<Settings> {
  const clean = sanitizeSettings(settings)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(clean, null, 2), 'utf8')
  return clean
}

/** Saved values win; empty fields are filled from autodetection and written back. */
export async function loadSettings(file: string, detect: () => Promise<Settings> = detectSettings): Promise<Settings> {
  let saved: Settings
  let existed = true
  try {
    saved = sanitizeSettings(JSON.parse(await readFile(file, 'utf8')))
  } catch {
    saved = sanitizeSettings({})
    existed = false
  }
  if (existed && KEYS.every((k) => saved[k])) return saved
  const found = await detect()
  const merged = {} as Settings
  for (const k of KEYS) merged[k] = saved[k] || found[k]
  return saveSettings(file, merged)
}
