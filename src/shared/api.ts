import type { BisectState } from './bisect.ts'
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
  /** Current bisect for the instance, if one is in progress or just finished. */
  bisectGet(id: string): Promise<BisectState | undefined>
  bisectStart(id: string): Promise<BisectState>
  /** problemRemains: the problem is still there with the current half enabled. Restores the list when it finishes. */
  bisectAnswer(id: string, problemRemains: boolean): Promise<BisectState>
  /** Puts the original list back and forgets the bisect. */
  bisectCancel(id: string): Promise<void>
  /** Subscribes to game exit events. Returns an unsubscribe function. */
  onGameExit(cb: (e: GameExit) => void): () => void
}

export const PREVIEW_SCHEME = 'modpreview'

export function previewUrl(path: string): string {
  return `${PREVIEW_SCHEME}://preview/?p=${encodeURIComponent(path)}`
}
