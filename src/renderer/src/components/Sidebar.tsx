import type { Instance } from '@shared/types.ts'
import { relativeTime } from '../format.ts'
import { Mark } from './Mark.tsx'

interface Props {
  instances: Instance[]
  selectedId?: string
  settingsOpen: boolean
  canCreate: boolean
  onSelect(id: string): void
  onCreate(): void
  onImport(): void
  onSettings(): void
}

export function Sidebar(p: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-name">RimWorld Launcher</span>
      </div>

      <div className="side-label">Instances</div>
      <nav className="instance-list">
        {p.instances.length === 0 && <p className="side-empty">None yet</p>}
        {p.instances.map((inst) => (
          <button
            key={inst.id}
            className={`instance-card${inst.id === p.selectedId ? ' selected' : ''}`}
            onClick={() => p.onSelect(inst.id)}
          >
            <Mark color={inst.color} letter={inst.letter} size={34} />
            <span className="instance-text">
              <span className="instance-name">{inst.name}</span>
              <span className="instance-meta">
                {inst.activeMods.length} mods · {inst.lastPlayedAt ? relativeTime(inst.lastPlayedAt) : 'not played'}
              </span>
            </span>
          </button>
        ))}
      </nav>

      <div className="side-actions">
        <button className="btn block" onClick={p.onCreate} disabled={!p.canCreate}>
          New instance
        </button>
        <button className="btn block ghost" onClick={p.onImport} disabled={!p.canCreate}>
          Import from game
        </button>
        <button className={`nav-item${p.settingsOpen ? ' active' : ''}`} onClick={p.onSettings}>
          Settings
        </button>
      </div>
    </aside>
  )
}
