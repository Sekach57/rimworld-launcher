import { useCallback, useEffect, useState } from 'react'
import { Download, History, Save, Trash2, Upload } from 'lucide-react'
import type { ImportPreview } from '@shared/api.ts'
import { diffLists, isEmptyDiff, type Snapshot } from '@shared/snapshots.ts'
import type { Instance, ModInfo } from '@shared/types.ts'
import { relativeTime } from '../format.ts'
import { ToolPanel } from './ToolPanel.tsx'

interface Props {
  instance: Instance
  mods: Map<string, ModInfo>
  onClose(): void
  /** The instance's list changed on disk. */
  onListChanged(): void
  say(text: string, tone?: 'info' | 'error'): void
}

/** A list waiting for the user to confirm, with its diff shown first. */
interface Pending {
  title: string
  list: string[]
  missing: string[]
  apply(): Promise<void>
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function preview(names: string[]): string {
  return names.length > 4 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.join(', ')
}

export function BackupsPanel({ instance, mods, onClose, onListChanged, say }: Props) {
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const [name, setName] = useState('')
  const [pending, setPending] = useState<Pending>()

  const load = useCallback(() => {
    window.api
      .snapshotList(instance.id)
      .then(setSnaps)
      .catch((e) => say(errText(e), 'error'))
  }, [instance.id, say])
  useEffect(() => {
    setPending(undefined)
    load()
  }, [load, instance.activeMods])

  const nameOf = (uid: string) => mods.get(uid)?.name ?? uid
  const guard = async (job: () => Promise<void>) => {
    try {
      await job()
    } catch (e) {
      say(errText(e), 'error')
    }
  }
  const label = (s: Snapshot) => (s.kind === 'named' ? (s.name ?? 'Snapshot') : `Automatic, ${s.reason ?? 'earlier'}`)

  const save = () =>
    guard(async () => {
      setSnaps(await window.api.snapshotSave(instance.id, name))
      setName('')
      say('Snapshot saved.')
    })

  const askRestore = (s: Snapshot) =>
    setPending({
      title: label(s),
      list: s.activeMods,
      missing: s.activeMods.filter((u) => !mods.has(u)),
      apply: async () => {
        await window.api.snapshotRestore(instance.id, s.id)
        say('List restored. The previous one was saved as a snapshot.')
      }
    })

  const doImport = () =>
    guard(async () => {
      const found: ImportPreview | undefined = await window.api.importList()
      if (!found) return
      setPending({
        title: found.name ? `Import: ${found.name}` : 'Import from file',
        list: found.activeMods,
        missing: found.missing,
        apply: async () => {
          await window.api.setActiveMods(instance.id, found.activeMods)
          say('List imported. The previous one was saved as a snapshot.')
        }
      })
    })

  const doExport = (format: 'xml' | 'json') =>
    guard(async () => {
      const path = await window.api.exportList(instance.id, format)
      if (path) say(`Exported to ${path}`)
    })

  const confirm = () =>
    guard(async () => {
      await pending?.apply()
      setPending(undefined)
      onListChanged()
      load()
    })

  const diff = pending ? diffLists(instance.activeMods, pending.list) : undefined

  return (
    <ToolPanel title="Backups" sub="Mod list snapshots" onClose={onClose}>
      <p className="tool-note">
        A snapshot is taken before every saved change and every launch. The last 30 are kept, plus any you name.
      </p>
      <div className="tool-row">
        <input
          className="input"
          value={name}
          placeholder="Name this list"
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <button className="btn" onClick={save}>
          <Save size={14} /> Save snapshot
        </button>
      </div>
      <div className="tool-actions">
        <button className="btn" onClick={doImport}>
          <Upload size={14} /> Import list
        </button>
        <button className="btn" onClick={() => doExport('xml')}>
          <Download size={14} /> Export ModsConfig.xml
        </button>
        <button className="btn" onClick={() => doExport('json')}>
          <Download size={14} /> Export JSON
        </button>
      </div>

      {pending && diff && (
        <div className="tool-section">
          <b>{pending.title}</b>
          {isEmptyDiff(diff) ? (
            <p className="tool-note">Same as the current list.</p>
          ) : (
            <ul className="diff-list">
              {diff.added.length > 0 && (
                <li className="diff-add">
                  {diff.added.length} added: {preview(diff.added.map(nameOf))}
                </li>
              )}
              {diff.removed.length > 0 && (
                <li className="diff-rem">
                  {diff.removed.length} removed: {preview(diff.removed.map(nameOf))}
                </li>
              )}
              {diff.moved.length > 0 && (
                <li className="diff-mov">
                  {diff.moved.length} moved: {preview(diff.moved.map(nameOf))}
                </li>
              )}
            </ul>
          )}
          {pending.missing.length > 0 && (
            <p className="tool-note">
              {pending.missing.length} not installed here: {preview(pending.missing)}. They stay in the list and show
              up as problems.
            </p>
          )}
          <div className="tool-actions">
            <button className="btn primary" onClick={confirm} disabled={isEmptyDiff(diff)}>
              Apply
            </button>
            <button className="btn" onClick={() => setPending(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {snaps.length === 0 ? (
        <div className="tool-note">
          <History size={18} strokeWidth={1.5} /> No snapshots yet. The first one appears when you change the list or
          launch.
        </div>
      ) : (
        <ul className="snap-list">
          {snaps.map((s) => (
            <li key={s.id}>
              <span className="snap-name">
                {label(s)}
                <span className="snap-meta">
                  {' '}
                  {s.activeMods.length} mods, {relativeTime(s.createdAt)}
                </span>
              </span>
              <button className="link" onClick={() => askRestore(s)}>
                Restore
              </button>
              {s.kind === 'named' && (
                <button
                  className="icon-btn flat"
                  title="Delete snapshot"
                  aria-label="Delete snapshot"
                  onClick={() => guard(async () => setSnaps(await window.api.snapshotDelete(instance.id, s.id)))}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </ToolPanel>
  )
}
