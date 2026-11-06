/**
 * Scan the real install found on this machine and print counts. Read-only.
 * Run with: npm run scan
 */
import { detectSettings, readGameVersion } from '../src/main/detect.ts'
import { scanMods } from '../src/main/scanner.ts'
import { checkMods } from '../src/shared/checks.ts'
import { parseModsConfig } from '../src/shared/modsConfig.ts'
import { sortMods } from '../src/shared/sort.ts'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const settings = await detectSettings()
console.log('Detected settings')
console.log(`  game:      ${settings.gameDir || '(not found)'}`)
console.log(`  exe:       ${settings.exeName}`)
console.log(`  workshop:  ${settings.workshopDir || '(not found)'}`)
console.log(`  user data: ${settings.defaultDataDir}`)

const version = readGameVersion(settings.gameDir)
const started = performance.now()
const result = await scanMods({ gameDir: settings.gameDir, workshopDir: settings.workshopDir, gameVersion: version })
const ms = Math.round(performance.now() - started)

const by = (s: string) => result.mods.filter((m) => m.source === s).length
console.log(`\nGame version: ${version || '(Version.txt missing)'}`)
console.log(`Scanned in ${ms} ms: ${result.mods.length} mods (official ${by('official')}, local ${by('local')}, workshop ${by('workshop')})`)
console.log(`With preview: ${result.mods.filter((m) => m.previewPath).length}`)
console.log(`Duplicate uids (_steam etc.): ${result.mods.filter((m) => m.uid !== m.packageId).length}`)
const fallback = result.failures.filter((f) => f.reason.includes('fallback'))
const skipped = result.failures.length - fallback.length
console.log(`Problems: ${result.failures.length} (${fallback.length} read with fallback, ${skipped} skipped)`)
for (const f of result.failures) console.log(`  - ${f.path}\n      ${f.reason}`)

const cfg = join(settings.defaultDataDir, 'Config', 'ModsConfig.xml')
if (existsSync(cfg)) {
  const active = parseModsConfig(readFileSync(cfg, 'utf8')).activeMods
  const mods = new Map(result.mods.map((m) => [m.uid, m]))
  const issues = checkMods(active, result.mods, version)
  const sorted = sortMods(active, mods, version)
  const kinds = new Map<string, number>()
  for (const i of issues) kinds.set(i.kind, (kinds.get(i.kind) ?? 0) + 1)
  console.log(`\nCurrent game list (read-only): ${active.length} active`)
  console.log(`  issues: ${issues.length} ${JSON.stringify(Object.fromEntries(kinds))}`)
  console.log(`  auto-sort moves: ${sorted.order.filter((u, i) => active[i] !== u).length}, cycles: ${sorted.cycles.length}`)
}
