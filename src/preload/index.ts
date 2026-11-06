import { contextBridge, ipcRenderer } from 'electron'
import type { LauncherApi } from '../shared/api.ts'

const call =
  (name: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(name, ...args)

const api = {
  getSettings: call('getSettings'),
  saveSettings: call('saveSettings'),
  detectSettings: call('detectSettings'),
  pickFolder: call('pickFolder'),
  scan: call('scan'),
  listInstances: call('listInstances'),
  createInstance: call('createInstance'),
  importCurrent: call('importCurrent'),
  updateInstance: call('updateInstance'),
  duplicateInstance: call('duplicateInstance'),
  deleteInstance: call('deleteInstance'),
  setActiveMods: call('setActiveMods'),
  openInstanceFolder: call('openInstanceFolder'),
  launch: call('launch')
} satisfies Record<keyof LauncherApi, unknown>

contextBridge.exposeInMainWorld('api', api as unknown as LauncherApi)
