import { forVersion, majorMinor } from './about.ts'
import { buildEdges, isOfficial, packageIdOfUid, precedesOfficial, sortMods } from './sort.ts'
import type { Issue, ModInfo } from './types.ts'

const REASON_TEXT: Record<string, string> = {
  loadAfter: 'asks to load after',
  loadBefore: 'asks to load before',
  forceLoadAfter: 'must load after',
  forceLoadBefore: 'must load before',
  dependency: 'needs',
  official: 'loads after'
}

function label(uid: string, mods: Map<string, ModInfo>): string {
  const m = mods.get(uid)
  return m?.name || m?.packageIdRaw || uid
}

/**
 * Pre-launch checks for one active list.
 * `installed` is every scanned mod (used for "installed but not active" hints and duplicates).
 */
export function checkMods(active: string[], installed: ModInfo[], gameVersion: string): Issue[] {
  const mods = new Map(installed.map((m) => [m.uid, m]))
  const issues: Issue[] = []
  const version = majorMinor(gameVersion)

  const seenUid = new Set<string>()
  for (const uid of active) {
    if (seenUid.has(uid)) {
      issues.push({ kind: 'duplicate-package-id', severity: 'error', uid, message: `${label(uid, mods)} is in the list twice` })
    }
    seenUid.add(uid)
  }
  const list = [...seenUid]
  const activePkgs = new Map<string, string>()
  for (const uid of list) {
    const pkg = mods.get(uid)?.packageId ?? packageIdOfUid(uid)
    if (!activePkgs.has(pkg)) activePkgs.set(pkg, uid)
  }
  const installedByPkg = new Map<string, ModInfo[]>()
  for (const m of installed) installedByPkg.set(m.packageId, [...(installedByPkg.get(m.packageId) ?? []), m])

  const incompatSeen = new Set<string>()
  for (const uid of list) {
    const mod = mods.get(uid)
    if (!mod) {
      issues.push({ kind: 'not-installed', severity: 'error', uid, message: `${uid} is active but not installed` })
      continue
    }

    for (const dep of forVersion(mod.modDependencies, mod.modDependenciesByVersion, gameVersion)) {
      if (activePkgs.has(dep.packageId)) continue
      const name = dep.displayName || installedByPkg.get(dep.packageId)?.[0]?.name || dep.packageId
      const isInstalled = installedByPkg.has(dep.packageId)
      issues.push({
        kind: 'missing-dependency',
        severity: 'error',
        uid,
        related: dep.packageId,
        message: isInstalled ? `Needs ${name}, which is installed but not active` : `Needs ${name}, which is not installed`
      })
    }

    for (const other of forVersion(mod.incompatibleWith, mod.incompatibleWithByVersion, gameVersion)) {
      const otherUid = activePkgs.get(other)
      if (!otherUid || otherUid === uid) continue
      const key = [uid, otherUid].sort().join('\u0000')
      if (incompatSeen.has(key)) continue
      incompatSeen.add(key)
      issues.push({
        kind: 'incompatible',
        severity: 'error',
        uid,
        related: otherUid,
        message: `Incompatible with ${label(otherUid, mods)}`
      })
    }

    if (mod.source !== 'official' && mod.supportedVersions.length > 0) {
      const supported = mod.supportedVersions.map(majorMinor)
      if (!supported.includes(version)) {
        issues.push({
          kind: 'unsupported-version',
          severity: 'warning',
          uid,
          message: `Built for ${supported.join(', ')}, game is ${version}`
        })
      }
    }

    const copies = installedByPkg.get(mod.packageId) ?? []
    if (mod.packageId && copies.length > 1) {
      const others = copies.filter((c) => c.uid !== uid).map((c) => `${c.source} copy ${c.folderName}`)
      issues.push({
        kind: 'duplicate-package-id',
        severity: 'warning',
        uid,
        message: `Same packageId as ${others.join(', ')}`
      })
    }
  }

  const pos = new Map(list.map((uid, i) => [uid, i]))
  const edges = buildEdges(list, mods, gameVersion)
  const pkgOf = (uid: string) => mods.get(uid)?.packageId ?? packageIdOfUid(uid)
  const firstOfficial = list.findIndex((uid) => isOfficial(pkgOf(uid)))
  if (firstOfficial > 0) {
    const allowed = precedesOfficial(list, edges, pkgOf)
    for (const uid of list.slice(0, firstOfficial)) {
      if (allowed.has(uid) || !mods.has(uid)) continue
      issues.push({
        kind: 'order',
        severity: 'warning',
        uid,
        related: list[firstOfficial],
        message: `Wrong order: ${label(uid, mods)} sits above ${label(list[firstOfficial], mods)} without a rule asking for it`
      })
    }
  }
  const orderSeen = new Set<string>()
  for (const e of edges) {
    if (pos.get(e.from)! < pos.get(e.to)!) continue
    const key = `${e.from}\u0000${e.to}`
    if (orderSeen.has(key)) continue
    orderSeen.add(key)
    const subject = e.declaredBy
    const other = subject === e.to ? e.from : e.to
    const verb = REASON_TEXT[e.reason] ?? 'loads after'
    const message =
      e.reason === 'loadBefore' || e.reason === 'forceLoadBefore'
        ? `${label(subject, mods)} ${verb} ${label(other, mods)}`
        : `${label(e.to, mods)} ${verb} ${label(e.from, mods)}`
    const flagged = pos.has(subject) ? subject : e.to
    issues.push({ kind: 'order', severity: 'warning', uid: flagged, related: flagged === e.to ? e.from : e.to, message: `Wrong order: ${message}` })
  }

  for (const cycle of sortMods(list, mods, gameVersion).cycles) {
    issues.push({
      kind: 'cycle',
      severity: 'warning',
      uid: cycle[0],
      related: cycle[1],
      message: `Load order loop: ${cycle.map((u) => label(u, mods)).join(', ')}`
    })
  }
  return issues
}

/** Order problems that involve `moved` right after a drag, phrased like the order checks above. */
export function moveWarnings(active: string[], mods: Map<string, ModInfo>, gameVersion: string, moved: string): string[] {
  const list = [...new Set(active)]
  const pos = new Map(list.map((uid, i) => [uid, i]))
  if (!pos.has(moved)) return []
  const out = new Set<string>()
  const edges = buildEdges(list, mods, gameVersion)
  const pkgOf = (uid: string) => mods.get(uid)?.packageId ?? packageIdOfUid(uid)
  const firstOfficial = list.findIndex((uid) => isOfficial(pkgOf(uid)))
  if (firstOfficial > 0) {
    const allowed = precedesOfficial(list, edges, pkgOf)
    const core = list[firstOfficial]
    for (const uid of list.slice(0, firstOfficial)) {
      if (allowed.has(uid) || !mods.has(uid)) continue
      if (uid === moved || core === moved) out.add(`${label(uid, mods)} loads after ${label(core, mods)}`)
    }
  }
  for (const e of edges) {
    if (e.from !== moved && e.to !== moved) continue
    if (pos.get(e.from)! < pos.get(e.to)!) continue
    const subject = e.declaredBy
    const other = subject === e.to ? e.from : e.to
    const verb = REASON_TEXT[e.reason] ?? 'loads after'
    out.add(
      e.reason === 'loadBefore' || e.reason === 'forceLoadBefore'
        ? `${label(subject, mods)} ${verb} ${label(other, mods)}`
        : `${label(e.to, mods)} ${verb} ${label(e.from, mods)}`
    )
  }
  return [...out]
}

export function issuesByUid(issues: Issue[]): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>()
  for (const i of issues) out.set(i.uid, [...(out.get(i.uid) ?? []), i])
  return out
}
