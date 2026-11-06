import { contextBridge, ipcRenderer } from 'electron'
import type { GameExit, LauncherApi } from '../shared/api.ts'

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
  launch: call('launch'),
  analyzeLog: call('analyzeLog'),
  openLogFile: call('openLogFile'),
  bisectGet: call('bisectGet'),
  bisectStart: call('bisectStart'),
  bisectAnswer: call('bisectAnswer'),
  bisectCancel: call('bisectCancel'),
  snapshotList: call('snapshotList'),
  snapshotSave: call('snapshotSave'),
  snapshotDelete: call('snapshotDelete'),
  snapshotRestore: call('snapshotRestore'),
  exportList: call('exportList'),
  importList: call('importList'),
  onGameExit: (cb: (e: GameExit) => void) => {
    const fn = (_: unknown, e: GameExit) => cb(e)
    ipcRenderer.on('game-exit', fn)
    return () => ipcRenderer.removeListener('game-exit', fn)
  }
} satisfies Record<keyof LauncherApi, unknown>

contextBridge.exposeInMainWorld('api', api as unknown as LauncherApi)
