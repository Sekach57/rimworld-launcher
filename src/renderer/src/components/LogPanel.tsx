import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, ClipboardCopy, CircleCheck, FileSearch, FolderOpen, RefreshCw } from 'lucide-react'
import type { LogResult } from '@shared/api.ts'
import { CATEGORY_LABEL, formatReport, type LogIssue } from '@shared/logParser.ts'
import type { Instance, Issue, ModInfo } from '@shared/types.ts'
import { buildDiagnoses } from '@shared/diagnosis.ts'
import { relativeTime } from '../format.ts'
import { DiagnosisSection } from './DiagnosisSection.tsx'
import { ToolPanel } from './ToolPanel.tsx'

interface Props {
  instance: Instance
  mods: Map<string, ModInfo>
  issues: Issue[]
  gameVersion: string
  onApply(mods: string[]): void
  /** Bumps when the renderer learns the game just exited, so the panel reloads. */
  refreshKey: number
  onClose(): void
  onSelectMod(uid: string): void
  say(text: string, tone?: 'info' | 'error'): void
}

export function LogPanel({ instance, mods, issues, gameVersion, onApply, refreshKey, onClose, onSelectMod, say }: Props) {
  const [result, setResult] = useState<LogResult>()
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string>()

  const load = useCallback(() => {
    setLoading(true)
    window.api
      .analyzeLog(instance.id)
      .then(setResult)
      .catch((e) => say(`Could not read the log: ${e instanceof Error ? e.message : String(e)}`, 'error'))
      .finally(() => setLoading(false))
  }, [instance.id, say])

  useEffect(load, [load, refreshKey])

  const report = result?.report
  const diagnoses = useMemo(
    () => buildDiagnoses({ report: report ?? null, issues, installed: [...mods.values()], active: instance.activeMods, gameVersion }),
    [report, issues, mods, instance.activeMods, gameVersion]
  )
  const copy = async () => {
    if (!report) return
    await navigator.clipboard.writeText(formatReport(report, instance.name))
    say('Report copied.')
  }

  return (
    <ToolPanel title="Log" sub={result?.path ? `${result.source === 'game' ? "Game's Player.log" : 'Instance Player.log'}, ${relativeTime(result.modifiedAt)}` : 'Player.log analysis'} onClose={onClose}>
      <div className="tool-actions">
        <button className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Reload
        </button>
        <button className="btn" onClick={() => window.api.openLogFile(instance.id).catch((e) => say(String(e.message ?? e), 'error'))} disabled={!result?.found}>
          <FolderOpen size={14} /> Open log file
        </button>
        <button className="btn" onClick={copy} disabled={!report?.issues.length}>
          <ClipboardCopy size={14} /> Copy report
        </button>
      </div>

      <DiagnosisSection diagnoses={diagnoses} active={instance.activeMods} onApply={onApply} onSelectMod={onSelectMod} say={say} />

      {loading && !result ? (
        <p className="muted">Reading the log...</p>
      ) : !result?.found ? (
        <div className="panel-empty muted-empty">
          <FileSearch size={30} strokeWidth={1.5} />
          <b>No Player.log yet</b>
          <span>Start the game once and come back. The launcher reads the log, it never changes it.</span>
        </div>
      ) : report && report.issues.length === 0 ? (
        <div className="panel-empty">
          <CircleCheck size={30} strokeWidth={1.5} />
          <b>No errors in the log</b>
          <span>{report.lines.toLocaleString()} lines checked.</span>
        </div>
      ) : report ? (
        <>
          <p className="muted">
            {report.issues.length} distinct issue{report.issues.length > 1 ? 's' : ''}, {report.total.toLocaleString()} occurrences in{' '}
            {report.lines.toLocaleString()} lines.
          </p>
          <ul className="log-list">
            {report.issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                mods={mods}
                open={open === issue.id}
                onToggle={() => setOpen(open === issue.id ? undefined : issue.id)}
                onSelectMod={onSelectMod}
              />
            ))}
          </ul>
        </>
      ) : null}
    </ToolPanel>
  )
}

function IssueRow(props: { issue: LogIssue; mods: Map<string, ModInfo>; open: boolean; onToggle(): void; onSelectMod(uid: string): void }) {
  const { issue } = props
  return (
    <li className={`log-item cat-${issue.category}`}>
      <div className="log-top">
        <span className="issue-kind">{CATEGORY_LABEL[issue.category]}</span>
        {issue.count > 1 && <span className="count log-count">x{issue.count}</span>}
        {issue.suspect && (
          <button className="chip suspect" title={`Matched by ${issue.suspect.reason}`} onClick={() => props.onSelectMod(issue.suspect!.uid)}>
            {props.mods.get(issue.suspect.uid)?.name ?? issue.suspect.name}
          </button>
        )}
      </div>
      <p className="log-msg">{issue.message}</p>
      {issue.stack.length > 0 && (
        <>
          <button className="link log-toggle" aria-expanded={props.open} onClick={props.onToggle}>
            <ChevronRight size={13} className={props.open ? 'turn' : ''} /> Stack trace ({issue.stack.length})
          </button>
          {props.open && <pre className="mono log-stack">{issue.stack.join('\n')}</pre>}
        </>
      )}
    </li>
  )
}
