import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { FolderCog, Library } from 'lucide-react'
import type { InstanceInput } from '@shared/api.ts'
import { checkMods, issuesByUid } from '@shared/checks.ts'
import { sortMods } from '@shared/sort.ts'
import type { Instance, ModInfo, ScanResult, Settings } from '@shared/types.ts'
import { InstanceHeader } from './components/InstanceHeader.tsx'
import { ModEditor } from './components/ModEditor.tsx'
import { Sidebar } from './components/Sidebar.tsx'

const SettingsView = lazy(() => import('./components/SettingsView.tsx').then((m) => ({ default: m.SettingsView })))
const DetailsPanel = lazy(() => import('./components/DetailsPanel.tsx').then((m) => ({ default: m.DetailsPanel })))
const InstanceDialog = lazy(() => import('./components/Dialogs.tsx').then((m) => ({ default: m.InstanceDialog })))
const ConfirmDialog = lazy(() => import('./components/Dialogs.tsx').then((m) => ({ default: m.ConfirmDialog })))

type Dialog =
  | { kind: 'create' }
  | { kind: 'import' }
  | { kind: 'edit'; instance: Instance }
  | { kind: 'delete'; instance: Instance }
  | { kind: 'launch'; instance: Instance; errors: number }
  | null

interface Notice {
  text: string
  tone: 'info' | 'error'
}

function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  // ipcRenderer.invoke wraps main-process errors in a long prefix.
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function App() {
  const api = window.api
  const [settings, setSettings] = useState<Settings>()
  const [scan, setScan] = useState<ScanResult>()
  const [scanning, setScanning] = useState(false)
  const [instances, setInstances] = useState<Instance[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [view, setView] = useState<'instance' | 'settings'>('instance')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<Notice>()
  const [selectedMod, setSelectedMod] = useState<string>()

  const say = useCallback((text: string, tone: Notice['tone'] = 'info') => setNotice({ text, tone }), [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(undefined), notice.tone === 'error' ? 9000 : 5000)
    return () => clearTimeout(t)
  }, [notice])

  const runScan = useCallback(async () => {
    setScanning(true)
    try {
      setScan(await api.scan())
    } catch (e) {
      say(`Scan failed: ${errorText(e)}`, 'error')
    } finally {
      setScanning(false)
    }
  }, [api, say])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [s, list] = await Promise.all([api.getSettings(), api.listInstances()])
      if (cancelled) return
      setSettings(s)
      setInstances(list)
      setSelectedId(list[0]?.id)
      if (!s.gameDir) setView('settings')
      else await runScan()
    })().catch((e) => say(errorText(e), 'error'))
    return () => {
      cancelled = true
    }
  }, [api, runScan, say])

  const mods = useMemo(() => new Map<string, ModInfo>((scan?.mods ?? []).map((m) => [m.uid, m])), [scan])
  const current = instances.find((i) => i.id === selectedId)
  const gameVersion = scan?.gameVersion ?? ''
  const issues = useMemo(
    () => (current && scan ? checkMods(current.activeMods, scan.mods, scan.gameVersion) : []),
    [current, scan]
  )
  const byUid = useMemo(() => issuesByUid(issues), [issues])

  const replaceInstance = (next: Instance) => setInstances((list) => list.map((i) => (i.id === next.id ? next : i)))

  const setActive = (mods: string[]) => {
    if (!current) return
    const before = current
    replaceInstance({ ...current, activeMods: mods })
    api.setActiveMods(current.id, mods).catch((e) => {
      replaceInstance(before)
      say(`Could not save the mod list: ${errorText(e)}`, 'error')
    })
  }

  const autoSort = () => {
    if (!current || !scan) return
    const result = sortMods(current.activeMods, mods, scan.gameVersion)
    const moved = result.order.filter((uid, i) => uid !== current.activeMods[i]).length
    if (moved > 0) setActive(result.order)
    const loops = result.cycles.length
    const loopText = loops ? ` ${loops} dependency loop${loops > 1 ? 's' : ''} could not be fully resolved.` : ''
    say(moved ? `Auto-sort moved ${moved} mod${moved > 1 ? 's' : ''}.${loopText}` : `Already in order.${loopText}`, loops ? 'error' : 'info')
  }

  const doLaunch = async (instance: Instance) => {
    try {
      const r = await api.launch(instance.id)
      if (!r.ok) return say(r.error ?? 'Launch failed', 'error')
      say(`Started ${instance.name}`)
      setInstances(await api.listInstances())
    } catch (e) {
      say(errorText(e), 'error')
    }
  }

  const launch = () => {
    if (!current) return
    const errors = issues.filter((i) => i.severity === 'error').length
    if (errors > 0) setDialog({ kind: 'launch', instance: current, errors })
    else void doLaunch(current)
  }

  const addInstance = (inst: Instance) => {
    setInstances((list) => [...list, inst])
    setSelectedId(inst.id)
    setSelectedMod(undefined)
    setView('instance')
  }

  const submitInstance = async (input: InstanceInput) => {
    if (!dialog) return
    try {
      if (dialog.kind === 'create') addInstance(await api.createInstance(input))
      else if (dialog.kind === 'import') {
        const inst = await api.importCurrent(input)
        addInstance(inst)
        say(`Imported ${inst.activeMods.length} active mods from the game's current list.`)
      } else if (dialog.kind === 'edit') replaceInstance(await api.updateInstance(dialog.instance.id, input))
      setDialog(null)
    } catch (e) {
      say(errorText(e), 'error')
    }
  }

  const duplicate = async () => {
    if (!current) return
    try {
      addInstance(await api.duplicateInstance(current.id))
    } catch (e) {
      say(errorText(e), 'error')
    }
  }

  const remove = async (instance: Instance) => {
    setDialog(null)
    try {
      await api.deleteInstance(instance.id)
      const rest = instances.filter((i) => i.id !== instance.id)
      setInstances(rest)
      if (selectedId === instance.id) setSelectedId(rest[0]?.id)
      say(`${instance.name} moved to the Recycle Bin.`)
    } catch (e) {
      say(errorText(e), 'error')
    }
  }

  const saveSettings = async (next: Settings) => {
    try {
      setSettings(await api.saveSettings(next))
      say('Settings saved.')
      await runScan()
    } catch (e) {
      say(errorText(e), 'error')
    }
  }

  return (
    <div className="app">
      <Suspense fallback={null}>
      <Sidebar
        instances={instances}
        mods={mods}
        selectedId={view === 'instance' ? selectedId : undefined}
        settingsOpen={view === 'settings'}
        onSelect={(id) => {
          setSelectedId(id)
          setSelectedMod(undefined)
          setView('instance')
        }}
        onCreate={() => setDialog({ kind: 'create' })}
        onImport={() => setDialog({ kind: 'import' })}
        onSettings={() => setView('settings')}
        canCreate={Boolean(settings?.gameDir)}
      />

      <main className="main">
        {view === 'settings' && settings ? (
          <SettingsView
            settings={settings}
            scan={scan}
            scanning={scanning}
            onSave={saveSettings}
            onDetect={() => api.detectSettings()}
            onPick={(current) => api.pickFolder(current)}
            onRescan={runScan}
          />
        ) : current ? (
          <>
            <InstanceHeader
              instance={current}
              mods={mods}
              issues={issues}
              onEdit={() => setDialog({ kind: 'edit', instance: current })}
              onDuplicate={duplicate}
              onDelete={() => setDialog({ kind: 'delete', instance: current })}
              onOpenFolder={() => api.openInstanceFolder(current.id).catch((e) => say(errorText(e), 'error'))}
              onLaunch={launch}
            />
            <div className="workspace">
              <ModEditor
                active={current.activeMods}
                installed={scan?.mods ?? []}
                mods={mods}
                issues={byUid}
                selected={selectedMod}
                onSelect={setSelectedMod}
                onChange={setActive}
                onSort={autoSort}
                canSort={Boolean(scan)}
                loading={!scan}
              />
              <DetailsPanel
                uid={selectedMod}
                mods={mods}
                active={current.activeMods}
                issues={issues}
                gameVersion={gameVersion}
                onSelect={setSelectedMod}
              />
            </div>
          </>
        ) : (
          <EmptyState
            hasGame={Boolean(settings?.gameDir)}
            onCreate={() => setDialog({ kind: 'create' })}
            onImport={() => setDialog({ kind: 'import' })}
            onSettings={() => setView('settings')}
          />
        )}
      </main>

      {notice && (
        <div className={`notice notice-${notice.tone}`} role="status" onClick={() => setNotice(undefined)}>
          {notice.text}
        </div>
      )}

      {(dialog?.kind === 'create' || dialog?.kind === 'import' || dialog?.kind === 'edit') && (
        <InstanceDialog
          title={dialog.kind === 'edit' ? 'Edit instance' : dialog.kind === 'import' ? 'Import from current game' : 'New instance'}
          hint={
            dialog.kind === 'import'
              ? "Copies the game's active mod list into a new instance. The game's own files are only read."
              : dialog.kind === 'create'
                ? 'Starts with Core and the installed DLC.'
                : undefined
          }
          initial={dialog.kind === 'edit' ? dialog.instance : undefined}
          submitLabel={dialog.kind === 'edit' ? 'Save' : dialog.kind === 'import' ? 'Import' : 'Create'}
          onSubmit={submitInstance}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete ${dialog.instance.name}?`}
          body="The instance folder, with its saves and config, goes to the Recycle Bin. You can restore it from there."
          confirmLabel="Move to Recycle Bin"
          danger
          onConfirm={() => remove(dialog.instance)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'launch' && (
        <ConfirmDialog
          title="Launch with errors?"
          body={`${dialog.errors} error${dialog.errors > 1 ? 's' : ''} in this mod list. The game may fail to load or drop mods.`}
          confirmLabel="Launch anyway"
          onConfirm={() => {
            const inst = dialog.instance
            setDialog(null)
            void doLaunch(inst)
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      </Suspense>
    </div>
  )
}

function EmptyState(props: { hasGame: boolean; onCreate(): void; onImport(): void; onSettings(): void }) {
  return (
    <div className="empty">
      {props.hasGame ? (
        <>
          <Library className="empty-icon" size={44} strokeWidth={1.4} />
          <h1>No instances yet</h1>
          <p>
            An instance is a separate save folder with its own mod list. Start from your current game setup, or from
            Core and DLC only.
          </p>
          <div className="row gap">
            <button className="btn primary" onClick={props.onImport}>
              Import from current game
            </button>
            <button className="btn" onClick={props.onCreate}>
              New instance
            </button>
          </div>
        </>
      ) : (
        <>
          <FolderCog className="empty-icon" size={44} strokeWidth={1.4} />
          <h1>Game folder not set</h1>
          <p>Point the launcher at your RimWorld install to scan mods.</p>
          <button className="btn primary" onClick={props.onSettings}>
            Open settings
          </button>
        </>
      )}
    </div>
  )
}
