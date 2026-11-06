import { useState } from 'react'
import { ChevronRight, ExternalLink, ClipboardCopy, Power, PowerOff, ArrowUpDown, Wand2 } from 'lucide-react'
import { applyAllSafe, applyFix, isListFix, summarize, type Diagnosis, type FixAction } from '@shared/diagnosis.ts'

interface Props {
  diagnoses: Diagnosis[]
  active: string[]
  onApply(mods: string[]): void
  onSelectMod(uid: string): void
  say(text: string, tone?: 'info' | 'error'): void
}

const SEVERITY_LABEL = { fixable: 'Fixable', 'mod-bug': 'Mod bug', noise: 'Harmless', info: 'Info' } as const

function FixIcon({ kind }: { kind: FixAction['kind'] }) {
  if (kind === 'enable') return <Power size={13} />
  if (kind === 'disable') return <PowerOff size={13} />
  if (kind === 'move') return <ArrowUpDown size={13} />
  if (kind === 'workshop') return <ExternalLink size={13} />
  return <ClipboardCopy size={13} />
}

export function DiagnosisSection({ diagnoses, active, onApply, onSelectMod, say }: Props) {
  const [open, setOpen] = useState<string>()
  if (diagnoses.length === 0) return null
  const summary = summarize(diagnoses)
  const safe = applyAllSafe(active, diagnoses)
  const canFixAll = safe.join('\n') !== active.join('\n')

  const run = async (fix: FixAction) => {
    try {
      if (isListFix(fix)) {
        onApply(applyFix(active, fix))
        say('Fix applied. Undo it from Backups.')
      } else if (fix.kind === 'workshop') {
        await window.api.openUrl(fix.url)
      } else if (fix.kind === 'report') {
        await navigator.clipboard.writeText(fix.text)
        say('Report copied. Send it to the mod author.')
      }
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <section className="diag" aria-label="Error breakdown">
      <div className="diag-head">
        <b>{summary.text}</b>
        {canFixAll && (
          <button className="btn primary" onClick={() => { onApply(safe); say('Applied all safe fixes. Undo it from Backups.') }}>
            <Wand2 size={14} /> Fix all safe
          </button>
        )}
      </div>
      <ul className="diag-list">
        {diagnoses.map((d) => (
          <li key={d.id} className={`diag-card sev-${d.severity}`}>
            <div className="diag-top">
              <span className="issue-kind">{SEVERITY_LABEL[d.severity]}</span>
              <b className="diag-title">{d.title}</b>
            </div>
            <p className="diag-cause">{d.cause}</p>
            {d.mods.length > 0 && (
              <div className="diag-mods">
                {d.mods.slice(0, 6).map((m) => (
                  <button key={m.uid} className="chip" onClick={() => onSelectMod(m.uid)}>{m.name}</button>
                ))}
                {d.mods.length > 6 && <span className="muted">+{d.mods.length - 6} more</span>}
              </div>
            )}
            {d.fixes.length > 0 && (
              <div className="diag-fixes">
                {d.fixes.map((f, i) => (
                  <button key={i} className={`btn${i === 0 && d.severity === 'fixable' ? ' primary' : ''}`} onClick={() => void run(f)}>
                    <FixIcon kind={f.kind} /> {f.label}
                  </button>
                ))}
              </div>
            )}
            {d.raw.length > 0 && (
              <>
                <button className="link log-toggle" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? undefined : d.id)}>
                  <ChevronRight size={13} className={open === d.id ? 'turn' : ''} /> Covers {d.covers} error{d.covers === 1 ? '' : 's'}
                </button>
                {open === d.id && <pre className="mono log-stack">{d.raw.slice(0, 30).join('\n')}</pre>}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
