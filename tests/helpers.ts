import { emptyAbout } from '../src/shared/about.ts'
import type { ModInfo } from '../src/shared/types.ts'

export function mod(packageId: string, extra: Partial<ModInfo> = {}): ModInfo {
  const official = packageId.startsWith('ludeon.')
  return {
    ...emptyAbout(),
    packageId,
    packageIdRaw: packageId,
    name: packageId,
    uid: packageId,
    source: official ? 'official' : 'workshop',
    path: `C:/mods/${packageId}`,
    folderName: packageId,
    supportedVersions: official ? [] : ['1.6'],
    ...extra
  }
}

export function index(mods: ModInfo[]): Map<string, ModInfo> {
  return new Map(mods.map((m) => [m.uid, m]))
}
