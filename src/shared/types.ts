export type ModSource = 'official' | 'local' | 'workshop'

export interface ModDependency {
  packageId: string
  displayName?: string
  steamWorkshopUrl?: string
}

/** Fields read from About/About.xml. Package ids are lowercased. */
export interface AboutData {
  packageId: string
  /** packageId as written in the file, for display. */
  packageIdRaw: string
  name: string
  author: string
  description: string
  supportedVersions: string[]
  modDependencies: ModDependency[]
  modDependenciesByVersion: Record<string, ModDependency[]>
  loadAfter: string[]
  loadAfterByVersion: Record<string, string[]>
  loadBefore: string[]
  loadBeforeByVersion: Record<string, string[]>
  forceLoadAfter: string[]
  forceLoadBefore: string[]
  incompatibleWith: string[]
  incompatibleWithByVersion: Record<string, string[]>
}

export interface ModInfo extends AboutData {
  /** Id written to ModsConfig.xml: packageId, or packageId + "_steam" for a duplicate Workshop copy. */
  uid: string
  source: ModSource
  path: string
  folderName: string
  steamId?: string
  previewPath?: string
  /** Set when About.xml was missing or could not be parsed cleanly. */
  parseIssue?: string
}

export interface ScanResult {
  mods: ModInfo[]
  gameVersion: string
  failures: { path: string; reason: string }[]
  scannedAt: string
}

export interface Settings {
  gameDir: string
  workshopDir: string
  defaultDataDir: string
  exeName: string
}

export interface Instance {
  id: string
  name: string
  color: string
  letter: string
  createdAt: string
  lastPlayedAt?: string
  notes: string
  /** Active mod uids in load order, mirrored from data/Config/ModsConfig.xml. */
  activeMods: string[]
}

export type IssueKind =
  | 'not-installed'
  | 'missing-dependency'
  | 'incompatible'
  | 'unsupported-version'
  | 'duplicate-package-id'
  | 'order'
  | 'cycle'

export interface Issue {
  kind: IssueKind
  severity: 'error' | 'warning'
  uid: string
  related?: string
  message: string
}

export interface LaunchCommand {
  file: string
  args: string[]
  cwd: string
}
