import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isCategory, sanitizeOverrides, type Category } from '../shared/categories.ts'

/** Manual category choices, keyed by lowercase packageId. A broken file reads as empty. */
export async function loadCategories(file: string): Promise<Record<string, Category>> {
  try {
    return sanitizeOverrides(JSON.parse(await readFile(file, 'utf8')))
  } catch {
    return {}
  }
}

/** Set or clear (null) one mod's category and return the stored map. */
export async function setCategory(file: string, packageId: unknown, category: unknown): Promise<Record<string, Category>> {
  const all = await loadCategories(file)
  if (typeof packageId !== 'string' || !packageId || packageId.length >= 300) return all
  const key = packageId.toLowerCase()
  if (isCategory(category)) all[key] = category
  else delete all[key]
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(all, null, 2), 'utf8')
  return all
}
