import { useCallback, useEffect, useState } from 'react'
import { Play, RotateCcw, Split, X } from 'lucide-react'
import type { BisectState } from '@shared/bisect.ts'
import type { Instance, ModInfo } from '@shared/types.ts'
import { ToolPanel } from './ToolPanel.tsx'

interface Props {
  instance: Instance
  mods: Map<string, ModInfo>
  onClose(): void
  onSelectMod(uid: string): void
  /** Normal launch path. Resolves after the game process was started. */
  onLaunch(instance: Instance): Promise<void>
  /** The instance's mod list changed on disk (test list written or original restored). */
  onListChanged(): void
  say(text: string, tone?: 'info' | 'error'): void
}

const nameOf = (mods: Map<string, ModInfo>, uid: string) => mods.get(uid)?.name ?? uid

export function BisectPanel({ instance, mods, onClose, onSelectMod, onLaunch, onListChanged, say }: Props) {
  const [state, setState] = useState<BisectState>()
  const [loaded, setLoaded] = useState(false)
  const [launched, setLaunched] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setLaunched(false)
    window.api
      .bisectGet(instance.id)
      .then(setState)
      .catch(() => setState(undefined))
      .finally(() => setLoaded(true))
  }, [instance.id])

  const run = useCallback(
    async (job: () => Promise<void>) => {
      setBusy(true)
      try {
        await job()
      } catch (e) {
        say(e instanceof Error ? e.message : String(e), 'error')
      } finally {
        setBusy(false)
      }
    },
    [say]
  )

  const start = () =>
    run(async () => {
      setState(await window.api.bisectStart(instance.id))
      setLaunched(false)
    })
  const answer = (remains: boolean) =>
    run(async () => {
      const next = await window.api.bisectAnswer(instance.id, remains)
      setState(next)
      setLaunched(false)
      if (next.done) onListChanged()
    })
  const cancel = () =>
    run(async () => {
      await window.api.bisectCancel(instance.id)
      setState(undefined)
      setLaunched(false)
      onListChanged()
      say('Original mod list restored.')
    })
  const launchHalf = () =>
    run(async () => {
      await onLaunch(instance)
      setLaunched(true)
    })

  const inProgress = state && !state.done
  const pct = state ? Math.min(100, Math.round((state.step / Math.max(1, state.totalSteps)) * 100)) : 0

  return (
    <ToolPanel title="Find a bad mod" sub="Bisect the mod list" onClose={onClose}>
      {!loaded ? (
        <p className="muted">Loading...</p>
      ) : !state ? (
        <>
          <p className="muted">
            Splits your mods in halves and has you test each one, until the mod behind a problem is left. Core, DLC and mods that others
            depend on stay enabled in every step.
          </p>
          <p className="tool-note">Your current list is saved first and put back when you finish or cancel. Only this instance changes.</p>
          <div className="tool-actions">
            <button className="btn primary" onClick={start} disabled={busy || instance.activeMods.length === 0}>
              <Split size={14} /> Start
            </button>
          </div>
        </>
      ) : state.done ? (
        <>
          <b>{state.culprits.length ? 'Suspects' : 'No single mod found'}</b>
          {state.culprits.length ? (
            <ul className="suspect-list">
              {state.culprits.map((uid) => (
                <li key={uid}>
                  <span>{nameOf(mods, uid)}</span>
                  <button className="link" onClick={() => onSelectMod(uid)}>
                    Show
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">The problem may need two mods together, or come from a mod that others depend on.</p>
          )}
          <p className="tool-note">Your original mod list is back in place.</p>
          <div className="tool-actions">
            <button className="btn" onClick={cancel} disabled={busy}>
              <X size={14} /> Done
            </button>
            <button className="btn" onClick={start} disabled={busy}>
              <Split size={14} /> Run again
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Step {state.step + 1} of about {state.totalSteps}, {state.suspects.length} suspect{state.suspects.length === 1 ? '' : 's'} left.
          </p>
          <div className="progress" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="muted">
            This half has {state.testing.length} suspect{state.testing.length === 1 ? '' : 's'}, plus {state.fixed.length} that always stay on.
          </p>
          <div className="tool-actions">
            <button className="btn primary" onClick={launchHalf} disabled={busy}>
              <Play size={14} /> Launch this half
            </button>
          </div>
          <div className="tool-section">
            <b>After testing, what happened?</b>
            <div className="tool-actions">
              <button className="btn" onClick={() => answer(true)} disabled={busy || !launched}>
                Problem still there
              </button>
              <button className="btn" onClick={() => answer(false)} disabled={busy || !launched}>
                Problem gone
              </button>
            </div>
            {!launched && <p className="tool-note">Launch the half first, then answer.</p>}
          </div>
          <p className="tool-note">While this runs, the instance list shows the test list.</p>
        </>
      )}
      {inProgress && (
        <div className="tool-actions">
          <button className="btn" onClick={cancel} disabled={busy}>
            <RotateCcw size={14} /> Restore original list
          </button>
        </div>
      )}
    </ToolPanel>
  )
}
