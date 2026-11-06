import type { Instance, Issue } from '@shared/types.ts'
import { relativeTime } from '../format.ts'
import { Mark } from './Mark.tsx'

interface Props {
  instance: Instance
  issues: Issue[]
  canSort: boolean
  onEdit(): void
  onDuplicate(): void
  onDelete(): void
  onOpenFolder(): void
  onSort(): void
  onLaunch(): void
}

export function InstanceHeader({ instance, issues, canSort, ...on }: Props) {
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.length - errors
  return (
    <header className="instance-header">
      <Mark color={instance.color} letter={instance.letter} size={44} />
      <div className="header-text">
        <h1>{instance.name}</h1>
        <div className="header-meta">
          <span>{instance.activeMods.length} active</span>
          <span>Created {new Date(instance.createdAt).toLocaleDateString()}</span>
          <span>Played {relativeTime(instance.lastPlayedAt)}</span>
          {errors > 0 && <span className="pill error">{errors} error{errors > 1 ? 's' : ''}</span>}
          {warnings > 0 && <span className="pill warn">{warnings} warning{warnings > 1 ? 's' : ''}</span>}
          {issues.length === 0 && <span className="pill ok">No problems</span>}
        </div>
        {instance.notes && <p className="header-notes">{instance.notes}</p>}
      </div>
      <div className="header-actions">
        <div className="btn-group">
          <button className="btn small" onClick={on.onEdit}>
            Edit
          </button>
          <button className="btn small" onClick={on.onDuplicate}>
            Duplicate
          </button>
          <button className="btn small" onClick={on.onOpenFolder}>
            Open folder
          </button>
          <button className="btn small danger-text" onClick={on.onDelete}>
            Delete
          </button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={on.onSort} disabled={!canSort}>
            Auto-sort
          </button>
          <button className="btn primary launch" onClick={on.onLaunch}>
            Launch
          </button>
        </div>
      </div>
    </header>
  )
}
