import { parseModsConfig, writeModsConfig } from './modsConfig.ts'

export const LIST_FORMAT = 'rimworld-launcher-modlist'

export interface ExportInput {
  name: string
  activeMods: string[]
  gameVersion: string
  knownExpansions: string[]
}

export type ExportFormat = 'xml' | 'json'

/** File text for an export: a ModsConfig.xml-style file or the launcher's own JSON. */
export function serializeList(input: ExportInput, format: ExportFormat): string {
  if (format === 'xml') {
    return writeModsConfig({ version: input.gameVersion, activeMods: input.activeMods, knownExpansions: input.knownExpansions })
  }
  return JSON.stringify({ format: LIST_FORMAT, version: 1, name: input.name, gameVersion: input.gameVersion, activeMods: input.activeMods }, null, 2)
}

export interface ImportedList {
  name?: string
  activeMods: string[]
}

/** Reads either format. Throws a readable error when the file is neither. */
export function parseList(text: string): ImportedList {
  const trimmed = text.replace(/^﻿/, '').trim()
  if (trimmed.startsWith('{')) {
    let data: { format?: unknown; name?: unknown; activeMods?: unknown }
    try {
      data = JSON.parse(trimmed)
    } catch {
      throw new Error('This file is not valid JSON.')
    }
    if (data.format !== LIST_FORMAT || !Array.isArray(data.activeMods)) throw new Error('This JSON file is not a launcher mod list.')
    const ids = data.activeMods.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase())
    return { name: typeof data.name === 'string' ? data.name : undefined, activeMods: dedupe(ids) }
  }
  if (!/<ModsConfigData[\s>]/i.test(trimmed)) throw new Error('This file is neither a ModsConfig.xml nor a launcher mod list.')
  return { activeMods: dedupe(parseModsConfig(trimmed).activeMods) }
}

const dedupe = (ids: string[]) => [...new Set(ids.filter(Boolean))]

/** Imported ids that no installed mod provides. `installed` holds uids and package ids, lowercase. */
export function missingMods(list: string[], installed: Set<string>): string[] {
  return list.filter((id) => !installed.has(id))
}
