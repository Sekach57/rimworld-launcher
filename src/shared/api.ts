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
}

export const PREVIEW_SCHEME = 'modpreview'

export function previewUrl(path: string): string {
  return `${PREVIEW_SCHEME}://preview/?p=${encodeURIComponent(path)}`
}
