import type { BisectState } from './bisect.ts'
import type { ExportFormat } from './modlistIO.ts'
import type { Snapshot } from './snapshots.ts'
import type { LogReport } from './logParser.ts'
import type { Instance, ScanResult, Settings } from './types.ts'

export interface InstanceInput {
  name: string
  color: string
  letter: string
  notes: string
}

export interface LaunchResult {
  ok: boolean
  error?: string
  /** The command line that was started, for display. */
  command?: string
}

export interface LogResult {
  found: boolean
  /** Full path of the log that was read. */
  path?: string
  source?: 'instance' | 'game'
  modifiedAt?: string
  report?: LogReport
}

/** Sent to the renderer when a game started by the launcher exits. */
export interface ImportPreview {
  file: string
  name?: string
  activeMods: string[]
  /** Ids in the file that no installed mod provides. */
  missing: string[]
}

export interface GameExit {
  id: string
  code: number | null
  signal: string | null
  /** True when the exit code was non-zero or the log holds errors. */
  abnormal: boolean
  errors: number
}

/** Everything the renderer can ask of the main process. Exposed as `window.api` by the preload. */
export interface LauncherApi {
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>
  detectSettings(): Promise<Settings>
  pickFolder(current: string): Promise<string | undefined>
  scan(): Promise<ScanResult>
  listInstances(): Promise<Instance[]>
  createInstance(input: InstanceInput): Promise<Instance>
  importCurrent(input: InstanceInput): Promise<Instance>
  updateInstance(id: string, patch: Partial<InstanceInput>): Promise<Instance>
  duplicateInstance(id: string): Promise<Instance>
  deleteInstance(id: string): Promise<void>
  setActiveMods(id: string, mods: string[]): Promise<Instance>
  openInstanceFolder(id: string): Promise<void>
  launch(id: string): Promise<LaunchResult>
  analyzeLog(id: string): Promise<LogResult>
  openLogFile(id: string): Promise<void>
  /** Opens a Steam Workshop link in the default browser. Other URLs are refused. */
  openUrl(url: string): Promise<void>
  /** Current bisect for the instance, if one is in progress or just finished. */
  bisectGet(id: string): Promise<BisectState | undefined>
  bisectStart(id: string): Promise<BisectState>
  /** problemRemains: the problem is still there with the current half enabled. Restores the list when it finishes. */
  bisectAnswer(id: string, problemRemains: boolean): Promise<BisectState>
  /** Puts the original list back and forgets the bisect. */
  bisectCancel(id: string): Promise<void>
  snapshotList(id: string): Promise<Snapshot[]>
  /** Manual, named snapshot of the current list. */
  snapshotSave(id: string, name: string): Promise<Snapshot[]>
  snapshotDelete(id: string, snapshotId: string): Promise<Snapshot[]>
  /** Takes an automatic snapshot of the current list, then writes the snapshot's list. */
  snapshotRestore(id: string, snapshotId: string): Promise<Instance>
  /** Save dialog, then writes the list there. Resolves to the path, or undefined if cancelled. */
  exportList(id: string, format: ExportFormat): Promise<string | undefined>
  /** Open dialog and parse. Does not change anything; the renderer applies it after a preview. */
  importList(): Promise<ImportPreview | undefined>
  /** Subscribes to game exit events. Returns an unsubscribe function. */
  onGameExit(cb: (e: GameExit) => void): () => void
}

export const PREVIEW_SCHEME = 'modpreview'

export function previewUrl(path: string): string {
  return `${PREVIEW_SCHEME}://preview/?p=${encodeURIComponent(path)}`
}
