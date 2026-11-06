import { useMemo, useState } from 'react'
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
}

export function DetailsPanel(p: Props) {
  const mod = p.uid ? p.mods.get(p.uid) : undefined
  return (
    <aside className="details">
      {!p.uid ? (
        <IssueList issues={p.issues} mods={p.mods} onSelect={p.onSelect} />
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
      All problems
    </button>
  )
}

function IssueList(props: { issues: Issue[]; mods: Map<string, ModInfo>; onSelect(uid: string): void }) {
  const errors = props.issues.filter((i) => i.severity === 'error')
  const warnings = props.issues.filter((i) => i.severity === 'warning')
  return (
    <div className="details-body">
      <h2>Problems</h2>
      {props.issues.length === 0 ? (
        <p className="muted">No problems found in this list. Select a mod to see its details.</p>
      ) : (
        <p className="muted">
          {errors.length} error{errors.length === 1 ? '' : 's'}, {warnings.length} warning{warnings.length === 1 ? '' : 's'}.
          Select one to jump to the mod.
        </p>
      )}
      <ul className="issue-list">
        {[...errors, ...warnings].map((i, n) => (
          <li key={`${i.uid}-${i.kind}-${n}`}>
            <button className="issue-item" onClick={() => props.onSelect(i.uid)}>
              <span className={`dot ${i.severity === 'error' ? 'error' : 'warn'}`} />
              <span className="issue-text">
                <span className="issue-kind">{ISSUE_LABEL[i.kind]}</span>
                <span className="issue-msg">{i.message}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
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

  return (
    <div className="details-body">
      <BackLink onClick={() => onSelect(undefined)} />
      <div className="preview">
        {mod.previewPath && !broken ? (
          <img src={previewUrl(mod.previewPath)} alt="" onError={() => setBroken(true)} />
        ) : (
          <span className="preview-blank">No preview</span>
        )}
      </div>
      <h2>{mod.name}</h2>
      <p className="byline">{mod.author || 'Unknown author'}</p>

      <dl className="facts">
        <dt>Package</dt>
        <dd className="mono">{mod.packageIdRaw}</dd>
        <dt>Source</dt>
        <dd>
          {SOURCE_LABEL[mod.source]}
          {mod.steamId && <span className="muted"> · {mod.steamId}</span>}
        </dd>
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

      {mod.parseIssue && <p className="issue-line warn">About.xml: {mod.parseIssue}</p>}
      <IssuesFor uid={mod.uid} issues={issues} />

      {deps.length > 0 && (
        <div className="block">
          <h3>Dependencies</h3>
          <ul className="plain deps">
            {deps.map((d) => {
              const target = byPackage.get(d.packageId)
              const on = target && activeSet.has(target.uid)
              return (
                <li key={d.packageId}>
                  {target ? (
                    <button className="link" onClick={() => onSelect(target.uid)}>
                      {target.name}
                    </button>
                  ) : (
                    <span>{d.displayName || d.packageId}</span>
                  )}
                  <span className={`dep-state ${on ? 'ok' : target ? 'warn' : 'error'}`}>
                    {on ? 'Active' : target ? 'Inactive' : 'Not installed'}
                  </span>
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
  )
}
