import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } from 'electron'
import { SteamLink } from './steam.ts'
import { verifyReturn } from './steamOpenId.ts'
import { openSteamSignIn } from './steamSignIn.ts'
import { PREVIEW_SCHEME, type GameExit, type InstanceInput, type LaunchResult, type LogResult } from '../shared/api.ts'
import { buildLaunchCommand } from '../shared/launch.ts'
import { OFFICIAL_ORDER, CORE_ID, isOfficial, packageIdOfUid } from '../shared/sort.ts'
import type { ScanResult, Settings } from '../shared/types.ts'
import { detectSettings, readGameVersion } from './detect.ts'
import { InstanceStore, readDefaultModsConfig } from './instances.ts'
import { exists, scanMods } from './scanner.ts'
import { loadSettings, saveSettings } from './settings.ts'
import { loadCategories, setCategory } from './categories.ts'
import { answerBisect, restoreList, startBisect, testList, type BisectState, type DepMap } from '../shared/bisect.ts'
import { missingMods, parseList, serializeList, type ExportFormat } from '../shared/modlistIO.ts'
import { StatsStore } from './stats.ts'
import type { StatKey } from '../shared/achievements.ts'
import { analyzeLogFile, buildAttribMods, clearBisect, deleteSnapshot, findLog, readBisect, readSnapshots, takeSnapshot, writeBisect } from './tools.ts'

// Lets a test run use a throwaway profile instead of the real one.
if (process.env.LAUNCHER_USER_DATA) app.setPath('userData', resolve(process.env.LAUNCHER_USER_DATA))

protocol.registerSchemesAsPrivileged([{ scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const settingsFile = () => join(app.getPath('userData'), 'settings.json')
const categoriesFile = () => join(app.getPath('userData'), 'categories.json')
const store = () => new InstanceStore(join(app.getPath('userData'), 'instances'), (p) => shell.trashItem(p))

let statsStore: StatsStore | undefined
const stats = () => (statsStore ??= new StatsStore(app.getPath('userData')))
/** Counts an event for achievements. Never throws and never delays the caller. */
function track(key: StatKey, n = 1): void {
  try {
    stats().bump(key, n).catch(() => {})
  } catch {
    // stats are best effort
  }
}
function trackMax(key: StatKey, value: number): void {
  try {
    stats().max(key, value).catch(() => {})
  } catch {
    // stats are best effort
  }
}

/** Awaits the result, then counts the event. Failed calls are not counted. */
async function counted<T>(key: StatKey, value: T | Promise<T>): Promise<T> {
  const result = await value
  track(key)
  return result
}

let settings: Settings | undefined
let lastScan: ScanResult | undefined

const steam = () =>
  new SteamLink(app.getPath('userData'), safeStorage, (url, init) => net.fetch(url, init), async () => (await getSettings()).workshopDir)

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
  handle('getProfile', () => stats().profile())
  handle('getCategories', () => loadCategories(categoriesFile()))
  handle('setCategory', (id: unknown, cat: unknown) =>
    cat ? counted('categoriesSet', setCategory(categoriesFile(), id, cat)) : setCategory(categoriesFile(), id, cat)
  )
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
    return counted('instancesCreated', store().create(input, mods, official, (await scan()).gameVersion))
  })
  handle('importCurrent', async (input: InstanceInput) => {
    const s = await getSettings()
    const current = await readDefaultModsConfig(s.defaultDataDir)
    if (!current) throw new Error(`No ModsConfig.xml found in ${join(s.defaultDataDir, 'Config')}`)
    const known = current.knownExpansions.length ? current.knownExpansions : await installedExpansions()
    return counted('imports', store().create(input, current.activeMods, known, current.version || (await scan()).gameVersion))
  })
  handle('updateInstance', (id: string, patch: Partial<InstanceInput>) => store().update(id, patch))
  handle('duplicateInstance', (id: string) => store().duplicate(id))
  handle('deleteInstance', (id: string) => store().remove(id))
  handle('setActiveMods', async (id: string, mods: string[]) => {
    await autoSnapshot(id, 'before change')
    return counted('modListSaves', store().setActiveMods(id, mods, (await scan()).gameVersion, await installedExpansions()))
  })
  handle('openInstanceFolder', async (id: string) => {
    const error = await shell.openPath(store().dataDir(id))
    if (error) throw new Error(error)
  })
  handle('analyzeLog', (id: string) => counted('logsAnalyzed', analyzeInstanceLog(id)))
  handle('openUrl', async (url: string) => {
    if (typeof url !== 'string' || !url.startsWith('https://steamcommunity.com/')) throw new Error('Only Steam Workshop links can be opened')
    await shell.openExternal(url)
  })
  handle('steamStatus', () => steam().status())
  handle('steamSetKey', async (key: string | null) => {
    const status = await steam().setKey(key)
    if (key && status.hasKey) track('steamLinked')
    return status
  })
  handle('steamRefresh', () => steam().refresh())
  handle('steamWorkshop', () => steam().workshop())
  handle('steamSignIn', async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const url = await openSteamSignIn(parent)
    // Steam's reply is checked locally, then confirmed by Steam itself over a direct request.
    const id = url
      ? await verifyReturn(url, (endpoint, body) =>
          net.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
        )
      : undefined
    if (!id) return { status: await steam().status(), cancelled: true }
    const status = await steam().signIn(id)
    track('steamLinked')
    return { status }
  })
  handle('steamSignOut', () => steam().signOut())
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
    const next = await saveBisect(id, answerBisect(state, remains, await activeDeps(original)))
    if (next.done) track('bisectsDone')
    return next
  })
  handle('bisectCancel', async (id: string) => {
    const state = await readBisect(store().dir(id))
    if (state) await writeList(id, restoreList(state))
    await clearBisect(store().dir(id))
  })
  handle('snapshotList', (id: string) => readSnapshots(store().dir(id)))
  handle('snapshotSave', async (id: string, name: string) =>
    counted('snapshotsSaved', takeSnapshot(store().dir(id), (await store().get(id)).activeMods, 'named', name.trim() || 'Snapshot'))
  )
  handle('snapshotDelete', (id: string, snapshotId: string) => deleteSnapshot(store().dir(id), snapshotId))
  handle('snapshotRestore', async (id: string, snapshotId: string) => {
    const snap = (await readSnapshots(store().dir(id))).find((s) => s.id === snapshotId)
    if (!snap) throw new Error('That snapshot no longer exists.')
    await autoSnapshot(id, 'before restore')
    return counted('snapshotsRestored', writeList(id, snap.activeMods).then(() => store().get(id)))
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
    track('listsExported')
    return result.filePath
  })
  handle('importList', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'Mod list', extensions: ['xml', 'json'] }] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return undefined
    const parsed = parseList(await readFile(result.filePaths[0], 'utf8'))
    track('listsImported')
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
        const finish = (e: GameExit) => {
          track(e.abnormal ? 'crashes' : 'cleanExits')
          notifyExit(e)
        }
        analyzeInstanceLog(id, startedAt)
          .then((r) => {
            const errors = r.report?.total ?? 0
            finish({ id, code, signal, errors, abnormal: (code !== null && code !== 0) || signal !== null || errors > 0 })
          })
          .catch(() => finish({ id, code, signal, errors: 0, abnormal: (code !== null && code !== 0) || signal !== null }))
      })
      child.unref()
      await instances.markPlayed(id)
      track('launches')
      trackMax('maxActiveMods', (bisect && !bisect.done ? testList(bisect) : (await instances.get(id)).activeMods).length)
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
        // LAUNCHER_SCREENSHOT_SCROLL=<css selector> scrolls that element into view first.
        const target = process.env.LAUNCHER_SCREENSHOT_SCROLL
        if (target) {
          await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(target)})?.scrollIntoView({ block: 'start' })`)
          await new Promise((r) => setTimeout(r, 300))
        }
        const image = await win.webContents.capturePage()
        await writeFile(shot, image.toPNG())
        app.quit()
      }, Number(process.env.LAUNCHER_SCREENSHOT_DELAY ?? 3500))
    })
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL
  // Test hook: LAUNCHER_OPEN_VIEW=log|bisect|backups opens that tool for the first instance, =profile opens the profile, =settings opens Settings.
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
