import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronRight, CircleAlert, CircleCheck, Info, ImageOff, MousePointerClick } from 'lucide-react'
import { forVersion, majorMinor } from '@shared/about.ts'
import { previewUrl } from '@shared/api.ts'
import type { Issue, ModInfo } from '@shared/types.ts'
import { ISSUE_LABEL, SOURCE_LABEL, cleanDescription } from '../format.ts'

interface Props {
  uid?: string
  mods: Map<string, ModInfo>
  active: string[]
  issues: Issue[]
  gameVersion: string
  onSelect(uid: string | undefined): void
  onOpenLog?(): void
}

export function DetailsPanel(p: Props) {
  const mod = p.uid ? p.mods.get(p.uid) : undefined
  return (
    <aside className="details">
      {!p.uid ? (
        <IssueList issues={p.issues} mods={p.mods} gameVersion={p.gameVersion} onSelect={p.onSelect} onOpenLog={p.onOpenLog} />
      ) : mod ? (
        <ModDetails key={mod.uid} mod={mod} {...p} />
      ) : (
        <div className="details-body">
          <BackLink onClick={() => p.onSelect(undefined)} />
          <h2>{p.uid}</h2>
          <p className="muted">This mod is in the list but was not found in Data, Mods or the Workshop folder.</p>
          <IssuesFor uid={p.uid} issues={p.issues} />
        </div>
      )}
    </aside>
  )
}

function BackLink(props: { onClick(): void }) {
  return (
    <button className="link back" onClick={props.onClick}>
      <ArrowLeft size={14} /> All problems
    </button>
  )
}

function IssueGroup(props: {
  title: string
  tone: 'error' | 'warn' | 'info'
  issues: Issue[]
  mods: Map<string, ModInfo>
  onSelect(uid: string): void
}) {
  const [open, setOpen] = useState(props.tone !== 'info')
  if (props.issues.length === 0) return null
  if (!open) {
    return (
      <button className="issue-fold" onClick={() => setOpen(true)}>
        <ChevronRight size={14} />
        <Info size={14} />
        {props.title}
      </button>
    )
  }
  return (
    <section className={`issue-group ${props.tone}`}>
      <h3>
        {props.tone === 'error' ? <CircleAlert size={15} /> : props.tone === 'info' ? <Info size={15} /> : <AlertTriangle size={15} />}
        {props.title}
        <span className="count">{props.issues.length}</span>
        {props.tone === 'info' && (
          <button className="link" onClick={() => setOpen(false)}>
            Hide
          </button>
        )}
      </h3>
      <ul className="issue-list">
        {props.issues.map((i, n) => (
          <li key={`${i.uid}-${i.kind}-${n}`}>
            <button className="issue-item" onClick={() => props.onSelect(i.uid)}>
              <span className="issue-kind">{ISSUE_LABEL[i.kind]}</span>
              <span className="issue-mod">{props.mods.get(i.uid)?.name ?? i.uid}</span>
              <span className="issue-msg">{i.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function IssueList(props: { issues: Issue[]; mods: Map<string, ModInfo>; gameVersion: string; onSelect(uid: string): void; onOpenLog?(): void }) {
  const errors = props.issues.filter((i) => i.severity === 'error')
  const rest = props.issues.filter((i) => i.severity !== 'error')
  // Mods that simply do not list the current game version are common and
  // usually fine, so they get their own quiet, collapsed group.
  const unlisted = rest.filter((i) => i.kind === 'unsupported-version')
  const warnings = rest.filter((i) => i.kind !== 'unsupported-version')
  const ver = majorMinor(props.gameVersion) || props.gameVersion
  const foldTitle = `${unlisted.length} mod${unlisted.length === 1 ? '' : 's'} ${unlisted.length === 1 ? "doesn't" : "don't"} list ${ver} in supportedVersions`
  return (
    <div className="details-body">
      <h2>Problems</h2>
      {props.issues.length === 0 ? (
        <div className="panel-empty">
          <CircleCheck size={30} strokeWidth={1.5} />
          <b>Load order looks clean</b>
          <span>Select a mod in either list to see its details.</span>
        </div>
      ) : (
        <>
          <p className="muted">Select an entry to jump to the mod.</p>
          {props.onOpenLog && (
            <button className="link" onClick={props.onOpenLog}>
              Open the error breakdown with one-click fixes
            </button>
          )}
          <IssueGroup title="Errors" tone="error" issues={errors} mods={props.mods} onSelect={props.onSelect} />
          <IssueGroup title="Warnings" tone="warn" issues={warnings} mods={props.mods} onSelect={props.onSelect} />
          <IssueGroup title={foldTitle} tone="info" issues={unlisted} mods={props.mods} onSelect={props.onSelect} />
          <p className="hint">
            <MousePointerClick size={14} /> Select a mod to see its details.
          </p>
        </>
      )}
    </div>
  )
}

function IssuesFor(props: { uid: string; issues: Issue[] }) {
  const mine = props.issues.filter((i) => i.uid === props.uid)
  if (mine.length === 0) return null
  return (
    <div className="block">
      <h3>Problems</h3>
      <ul className="plain">
        {mine.map((i, n) => (
          <li key={n} className={`issue-line ${i.severity === 'error' ? 'error' : 'warn'}`}>
            {i.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ModDetails({ mod, mods, active, issues, gameVersion, onSelect }: Props & { mod: ModInfo }) {
  const [broken, setBroken] = useState(false)
  const activeSet = useMemo(() => new Set(active), [active])
  const byPackage = useMemo(() => {
    const map = new Map<string, ModInfo>()
    for (const m of mods.values()) if (!map.has(m.packageId)) map.set(m.packageId, m)
    return map
  }, [mods])
  const deps = forVersion(mod.modDependencies, mod.modDependenciesByVersion, gameVersion)
  const version = majorMinor(gameVersion)
  const description = useMemo(() => cleanDescription(mod.description), [mod.description])
  const showImage = mod.previewPath && !broken

  return (
    <div className="details-body flush">
      <div className="preview">
        {showImage && <img className="preview-bg" src={previewUrl(mod.previewPath!)} alt="" aria-hidden />}
        {showImage ? (
          <img className="preview-main" src={previewUrl(mod.previewPath!)} alt="" onError={() => setBroken(true)} />
        ) : (
          <span className="preview-blank">
            <ImageOff size={26} strokeWidth={1.5} />
            No preview
          </span>
        )}
        <button className="link back over" onClick={() => onSelect(undefined)}>
          <ArrowLeft size={14} /> All problems
        </button>
      </div>

      <div className="details-inner">
        <h2>{mod.name}</h2>
        <p className="byline">
          {mod.author || 'Unknown author'}
          <span className={`src src-${mod.source}`}>{SOURCE_LABEL[mod.source]}</span>
        </p>

        <IssuesFor uid={mod.uid} issues={issues} />
        {mod.parseIssue && <p className="issue-line warn">About.xml: {mod.parseIssue}</p>}

        <dl className="facts">
          <dt>Package</dt>
          <dd className="mono">{mod.packageIdRaw}</dd>
          {mod.steamId && (
            <>
              <dt>Steam id</dt>
              <dd className="mono">{mod.steamId}</dd>
            </>
          )}
          <dt>Versions</dt>
          <dd className="versions">
            {mod.supportedVersions.length === 0 && <span className="muted">Not listed</span>}
            {mod.supportedVersions.map((v) => (
              <span key={v} className={`ver${majorMinor(v) === version ? ' current' : ''}`}>
                {v}
              </span>
            ))}
          </dd>
          <dt>Folder</dt>
          <dd className="path" title={mod.path}>
            {mod.path}
          </dd>
        </dl>

        {deps.length > 0 && (
          <div className="block">
            <h3>Dependencies</h3>
            <ul className="chips">
              {deps.map((d) => {
                const target = byPackage.get(d.packageId)
                const on = target && activeSet.has(target.uid)
                const state = on ? 'ok' : target ? 'warn' : 'error'
                const label = target?.name ?? (d.displayName || d.packageId)
                return (
                  <li key={d.packageId}>
                    <button
                      className={`chip ${state}`}
                      disabled={!target}
                      onClick={() => target && onSelect(target.uid)}
                      title={on ? 'Active' : target ? 'Installed but inactive' : 'Not installed'}
                    >
                      <i />
                      <span>{label}</span>
                      <em>{on ? 'Active' : target ? 'Inactive' : 'Missing'}</em>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {description && (
          <div className="block">
            <h3>Description</h3>
            <p className="description">{description}</p>
          </div>
        )}
      </div>
    </div>
  )
}
