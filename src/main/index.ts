import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { PREVIEW_SCHEME, type GameExit, type InstanceInput, type LaunchResult, type LogResult } from '../shared/api.ts'
import { buildLaunchCommand } from '../shared/launch.ts'
import { OFFICIAL_ORDER, CORE_ID, isOfficial, packageIdOfUid } from '../shared/sort.ts'
import type { ScanResult, Settings } from '../shared/types.ts'
import { detectSettings, readGameVersion } from './detect.ts'
import { InstanceStore, readDefaultModsConfig } from './instances.ts'
import { exists, scanMods } from './scanner.ts'
import { loadSettings, saveSettings } from './settings.ts'
import { answerBisect, restoreList, startBisect, testList, type BisectState, type DepMap } from '../shared/bisect.ts'
import { missingMods, parseList, serializeList, type ExportFormat } from '../shared/modlistIO.ts'
import { analyzeLogFile, buildAttribMods, clearBisect, deleteSnapshot, findLog, readBisect, readSnapshots, takeSnapshot, writeBisect } from './tools.ts'

// Lets a test run use a throwaway profile instead of the real one.
if (process.env.LAUNCHER_USER_DATA) app.setPath('userData', resolve(process.env.LAUNCHER_USER_DATA))

protocol.registerSchemesAsPrivileged([{ scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const settingsFile = () => join(app.getPath('userData'), 'settings.json')
const store = () => new InstanceStore(join(app.getPath('userData'), 'instances'), (p) => shell.trashItem(p))

let settings: Settings | undefined
let lastScan: ScanResult | undefined

async function getSettings(): Promise<Settings> {
  settings ??= await loadSettings(settingsFile())
  return settings
}

async function runScan(): Promise<ScanResult> {
  const s = await getSettings()
  lastScan = await scanMods({ gameDir: s.gameDir, workshopDir: s.workshopDir, gameVersion: readGameVersion(s.gameDir) })
  return lastScan
}

async function scan(): Promise<ScanResult> {
  return lastScan ?? runScan()
}

/** Installed DLC ids in the game's order, Core excluded. */
async function installedExpansions(): Promise<string[]> {
  const ids = new Set((await scan()).mods.filter((m) => m.source === 'official').map((m) => m.packageId))
  const ordered = OFFICIAL_ORDER.filter((id) => id !== CORE_ID && ids.has(id))
  const extra = [...ids].filter((id) => id !== CORE_ID && !OFFICIAL_ORDER.includes(id)).sort()
  return [...ordered, ...extra]
}

const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

/** Only images inside the configured game and Workshop folders are served. */
async function servePreview(request: Request): Promise<Response> {
  const path = new URL(request.url).searchParams.get('p')
  if (!path || !IMAGE_TYPES.has(extname(path).toLowerCase())) return new Response(null, { status: 404 })
  const s = await getSettings()
  const roots = [s.gameDir && join(s.gameDir, 'Data'), s.gameDir && join(s.gameDir, 'Mods'), s.workshopDir]
    .filter(Boolean)
    .map((r) => resolve(r).toLowerCase() + sep)
  const full = resolve(path)
  if (!roots.some((r) => full.toLowerCase().startsWith(r))) return new Response(null, { status: 404 })
  try {
    return await net.fetch(pathToFileURL(full).toString())
  } catch {
    return new Response(null, { status: 404 })
  }
}

/** Parses the log for one instance against its active mods. */
async function analyzeInstanceLog(id: string, since?: number): Promise<LogResult> {
  const instances = store()
  const inst = await instances.get(id)
  const mods = new Map((await scan()).mods.map((m) => [m.uid, m]))
  const attrib = await buildAttribMods(inst.activeMods, mods)
  const found = await findLog(instances.dataDir(id))
  if (since !== undefined && (!found || Date.parse(found.modifiedAt) < since)) return { found: false }
  return analyzeLogFile(instances.dataDir(id), attrib)
}

/** Active-mod dependency map (uid -> uids), using the dependencies listed for any game version. */
async function activeDeps(active: string[]): Promise<DepMap> {
  const mods = new Map((await scan()).mods.map((m) => [m.uid, m]))
  const byPkg = new Map<string, string[]>()
  for (const uid of active) {
    const pkg = mods.get(uid)?.packageId ?? packageIdOfUid(uid)
    byPkg.set(pkg, [...(byPkg.get(pkg) ?? []), uid])
  }
  const out: DepMap = {}
  for (const uid of active) {
    const m = mods.get(uid)
    if (!m) continue
    const all = [...m.modDependencies, ...Object.values(m.modDependenciesByVersion).flat()]
    out[uid] = [...new Set(all.flatMap((d) => byPkg.get(d.packageId.toLowerCase()) ?? []))].filter((u) => u !== uid)
  }
  return out
}

const isOfficialUid = (uid: string) => isOfficial(packageIdOfUid(uid))

/** Writes a list to the instance's ModsConfig only. No snapshot, no scan side effects. */
async function writeList(id: string, list: string[]): Promise<void> {
  await store().setActiveMods(id, list, (await scan()).gameVersion, await installedExpansions())
}

/** Automatic snapshot of the stored list. Skipped during a bisect, whose test lists are not the user's own. */
async function autoSnapshot(id: string, reason: string): Promise<void> {
  try {
    const bisect = await readBisect(store().dir(id))
    if (bisect && !bisect.done) return
    await takeSnapshot(store().dir(id), (await store().get(id)).activeMods, 'auto', reason)
  } catch {
    // A failed backup must not block saving or launching.
  }
}

async function saveBisect(id: string, state: BisectState): Promise<BisectState> {
  if (state.done) await writeList(id, restoreList(state))
  await writeBisect(store().dir(id), state)
  return state
}

function notifyExit(e: GameExit): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('game-exit', e)
}

function registerIpc(): void {
  const handle = <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R> | R) =>
    ipcMain.handle(name, (_event, ...args) => fn(...(args as A)))

  handle('getSettings', getSettings)
  handle('saveSettings', async (next: Settings) => {
    settings = await saveSettings(settingsFile(), next)
    lastScan = undefined
    return settings
  })
  handle('detectSettings', detectSettings)
  handle('pickFolder', async (current: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory'], defaultPath: current || undefined }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? undefined : result.filePaths[0]
  })
  handle('scan', runScan)
  handle('listInstances', () => store().list())
  handle('createInstance', async (input: InstanceInput) => {
    const official = await installedExpansions()
    const mods = (await scan()).mods.some((m) => m.packageId === CORE_ID) ? [CORE_ID, ...official] : official
    return store().create(input, mods, official, (await scan()).gameVersion)
  })
  handle('importCurrent', async (input: InstanceInput) => {
    const s = await getSettings()
    const current = await readDefaultModsConfig(s.defaultDataDir)
    if (!current) throw new Error(`No ModsConfig.xml found in ${join(s.defaultDataDir, 'Config')}`)
    const known = current.knownExpansions.length ? current.knownExpansions : await installedExpansions()
    return store().create(input, current.activeMods, known, current.version || (await scan()).gameVersion)
  })
  handle('updateInstance', (id: string, patch: Partial<InstanceInput>) => store().update(id, patch))
  handle('duplicateInstance', (id: string) => store().duplicate(id))
  handle('deleteInstance', (id: string) => store().remove(id))
  handle('setActiveMods', async (id: string, mods: string[]) => {
    await autoSnapshot(id, 'before change')
    return store().setActiveMods(id, mods, (await scan()).gameVersion, await installedExpansions())
  })
  handle('openInstanceFolder', async (id: string) => {
    const error = await shell.openPath(store().dataDir(id))
    if (error) throw new Error(error)
  })
  handle('analyzeLog', (id: string) => analyzeInstanceLog(id))
  handle('openLogFile', async (id: string) => {
    const found = await findLog(store().dataDir(id))
    if (!found) throw new Error('No Player.log found yet. Start the game once first.')
    shell.showItemInFolder(found.path)
  })
  handle('bisectGet', (id: string) => readBisect(store().dir(id)))
  handle('bisectStart', async (id: string) => {
    const inst = await store().get(id)
    const state = startBisect(inst.activeMods, await activeDeps(inst.activeMods), isOfficialUid)
    return saveBisect(id, state)
  })
  handle('bisectAnswer', async (id: string, remains: boolean) => {
    const state = await readBisect(store().dir(id))
    if (!state) throw new Error('No bisect in progress.')
    const original = state.original
    return saveBisect(id, answerBisect(state, remains, await activeDeps(original)))
  })
  handle('bisectCancel', async (id: string) => {
    const state = await readBisect(store().dir(id))
    if (state) await writeList(id, restoreList(state))
    await clearBisect(store().dir(id))
  })
  handle('snapshotList', (id: string) => readSnapshots(store().dir(id)))
  handle('snapshotSave', async (id: string, name: string) =>
    takeSnapshot(store().dir(id), (await store().get(id)).activeMods, 'named', name.trim() || 'Snapshot')
  )
  handle('snapshotDelete', (id: string, snapshotId: string) => deleteSnapshot(store().dir(id), snapshotId))
  handle('snapshotRestore', async (id: string, snapshotId: string) => {
    const snap = (await readSnapshots(store().dir(id))).find((s) => s.id === snapshotId)
    if (!snap) throw new Error('That snapshot no longer exists.')
    await autoSnapshot(id, 'before restore')
    return writeList(id, snap.activeMods).then(() => store().get(id))
  })
  handle('exportList', async (id: string, format: ExportFormat) => {
    const inst = await store().get(id)
    const win = BrowserWindow.getFocusedWindow()
    const ext = format === 'xml' ? 'xml' : 'json'
    const options: Electron.SaveDialogOptions = {
      defaultPath: `${inst.name.replace(/[^\w.-]+/g, '_')}-modlist.${ext}`,
      filters: [{ name: format === 'xml' ? 'ModsConfig.xml' : 'Mod list', extensions: [ext] }]
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return undefined
    const scanned = await scan()
    await writeFile(
      result.filePath,
      serializeList({ name: inst.name, activeMods: inst.activeMods, gameVersion: scanned.gameVersion, knownExpansions: await installedExpansions() }, format),
      'utf8'
    )
    return result.filePath
  })
  handle('importList', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'Mod list', extensions: ['xml', 'json'] }] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return undefined
    const parsed = parseList(await readFile(result.filePaths[0], 'utf8'))
    const installed = new Set((await scan()).mods.flatMap((m) => [m.uid, m.packageId]))
    return { file: result.filePaths[0], name: parsed.name, activeMods: parsed.activeMods, missing: missingMods(parsed.activeMods, installed) }
  })
  handle('launch', async (id: string): Promise<LaunchResult> => {
    try {
      const s = await getSettings()
      const instances = store()
      await instances.get(id)
      // During a bisect the test list goes to this instance's ModsConfig only.
      const bisect = await readBisect(instances.dir(id))
      if (bisect && !bisect.done) await writeList(id, testList(bisect))
      else await autoSnapshot(id, 'before launch')
      const cmd = buildLaunchCommand(s.gameDir, s.exeName, instances.dataDir(id))
      if (!(await exists(cmd.file))) return { ok: false, error: `Game executable not found: ${cmd.file}` }
      const child = spawn(cmd.file, cmd.args, { cwd: cmd.cwd, detached: true, stdio: 'ignore', windowsHide: false })
      const startedAt = Date.now() - 2000
      child.on('exit', (code, signal) => {
        analyzeInstanceLog(id, startedAt)
          .then((r) => {
            const errors = r.report?.total ?? 0
            notifyExit({ id, code, signal, errors, abnormal: (code !== null && code !== 0) || signal !== null || errors > 0 })
          })
          .catch(() => notifyExit({ id, code, signal, errors: 0, abnormal: (code !== null && code !== 0) || signal !== null }))
      })
      child.unref()
      await instances.markPlayed(id)
      return { ok: true, command: `"${cmd.file}" ${cmd.args.map((a) => `"${a}"`).join(' ')}` }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: '#14110f',
    autoHideMenuBar: true,
    title: 'RimWorld Launcher',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.once('ready-to-show', () => win.show())

  // Test hook: save a screenshot of the first render, then quit.
  const shot = process.env.LAUNCHER_SCREENSHOT
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage()
        await writeFile(shot, image.toPNG())
        app.quit()
      }, Number(process.env.LAUNCHER_SCREENSHOT_DELAY ?? 3500))
    })
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL
  // Test hook: LAUNCHER_OPEN_VIEW=log|bisect|backups opens that tool for the first instance.
  const query = process.env.LAUNCHER_OPEN_VIEW ? { openView: process.env.LAUNCHER_OPEN_VIEW } : undefined
  if (!app.isPackaged && devUrl) void win.loadURL(query ? `${devUrl}?openView=${query.openView}` : devUrl)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'), { query })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(() => {
    protocol.handle(PREVIEW_SCHEME, servePreview)
    registerIpc()
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
}
