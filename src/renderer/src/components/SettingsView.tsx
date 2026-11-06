import { useEffect, useState } from 'react'
import type { ScanResult, Settings } from '@shared/types.ts'
import { SOURCE_LABEL } from '../format.ts'

interface Props {
  settings: Settings
  scan?: ScanResult
  scanning: boolean
  onSave(s: Settings): Promise<void>
  onDetect(): Promise<Settings>
  onPick(current: string): Promise<string | undefined>
  onRescan(): Promise<void>
}

const PATHS: { key: 'gameDir' | 'workshopDir' | 'defaultDataDir'; label: string; hint: string }[] = [
  { key: 'gameDir', label: 'Game folder', hint: 'Contains RimWorld.exe, Data and Mods.' },
  { key: 'workshopDir', label: 'Workshop folder', hint: 'steamapps/workshop/content/294100' },
  { key: 'defaultDataDir', label: 'Default save data', hint: 'Read only. Used for "Import from current game".' },
]

export function SettingsView(p: Props) {
  const [form, setForm] = useState<Settings>(p.settings)
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm(p.settings), [p.settings])

  const dirty = (Object.keys(form) as (keyof Settings)[]).some((k) => form[k] !== p.settings[k])
  const set = (k: keyof Settings, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const counts = { official: 0, local: 0, workshop: 0 }
  for (const m of p.scan?.mods ?? []) counts[m.source]++

  return (
    <div className="settings">
      <h1>Settings</h1>
      <section className="settings-section">
        <h2>Folders</h2>
        <div className="form">
          {PATHS.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <div className="row gap">
                <input value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} spellCheck={false} />
                <button
                  className="btn"
                  type="button"
                  onClick={async () => {
                    const picked = await p.onPick(form[f.key])
                    if (picked) set(f.key, picked)
                  }}
                >
                  Browse
                </button>
              </div>
              <small className="muted">{f.hint}</small>
            </label>
          ))}
          <label className="field narrow">
            <span>Executable</span>
            <input value={form.exeName} onChange={(e) => set('exeName', e.target.value)} spellCheck={false} />
          </label>
        </div>
        <div className="row gap settings-actions">
          <button className="btn primary" disabled={!dirty || busy} onClick={() => run(() => p.onSave(form))}>
            Save
          </button>
          <button className="btn" disabled={busy} onClick={() => run(async () => setForm(await p.onDetect()))}>
            Detect again
          </button>
          {dirty && (
            <button className="btn ghost" disabled={busy} onClick={() => setForm(p.settings)}>
              Revert
            </button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h2>Mod scan</h2>
        {p.scan ? (
          <>
            <dl className="facts wide">
              <dt>Game version</dt>
              <dd>{p.scan.gameVersion || 'Unknown'}</dd>
              {(Object.keys(counts) as (keyof typeof counts)[]).map((s) => (
                <FactPair key={s} label={SOURCE_LABEL[s]} value={String(counts[s])} />
              ))}
              <dt>Total</dt>
              <dd>{p.scan.mods.length}</dd>
              <dt>Scanned</dt>
              <dd>{new Date(p.scan.scannedAt).toLocaleString()}</dd>
            </dl>
            {p.scan.failures.length > 0 && (
              <div className="block">
                <h3>Folders that could not be read ({p.scan.failures.length})</h3>
                <ul className="plain">
                  {p.scan.failures.map((f) => (
                    <li key={f.path} className="issue-line error">
                      <span className="path">{f.path}</span>: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="muted">{p.scanning ? 'Scanning...' : 'No scan yet.'}</p>
        )}
        <div className="row gap settings-actions">
          <button className="btn" disabled={p.scanning} onClick={() => p.onRescan()}>
            {p.scanning ? 'Scanning...' : 'Rescan mods'}
          </button>
        </div>
      </section>
    </div>
  )
}

function FactPair(props: { label: string; value: string }) {
  return (
    <>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </>
  )
}
