import { Download, Plus, Settings as SettingsIcon, Swords, Trophy } from 'lucide-react'
import { previewUrl } from '@shared/api.ts'
import type { Instance, ModInfo } from '@shared/types.ts'
import { coverPaths, relativeTime } from '../format.ts'
import { Mark } from './Mark.tsx'

interface Props {
  instances: Instance[]
  mods: Map<string, ModInfo>
  selectedId?: string
  settingsOpen: boolean
  profileOpen: boolean
  canCreate: boolean
  onSelect(id: string): void
  onCreate(): void
  onImport(): void
  onSettings(): void
  onProfile(): void
}

export function Sidebar(p: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-glyph">
          <Swords size={16} strokeWidth={2} />
        </span>
        <span className="brand-name">Rim Launcher</span>
      </div>

      <div className="side-label">
        <span>Library</span>
        <span className="side-count">{p.instances.length}</span>
      </div>
      <nav className="instance-list">
        {p.instances.length === 0 && <p className="side-empty">No instances yet.</p>}
        {p.instances.map((inst) => {
          const cover = coverPaths(inst.activeMods, p.mods, 1)[0]
          return (
            <button
              key={inst.id}
              className={`instance-card${inst.id === p.selectedId && !p.settingsOpen && !p.profileOpen ? ' selected' : ''}`}
              style={{ ['--inst' as string]: inst.color }}
              onClick={() => p.onSelect(inst.id)}
            >
              <span className="cover">
                {cover ? (
                  <img src={previewUrl(cover)} alt="" loading="lazy" />
                ) : (
                  <Mark color={inst.color} letter={inst.letter} size={48} />
                )}
                {cover && (
                  <span className="cover-tag" style={{ background: inst.color }}>
                    {inst.letter}
                  </span>
                )}
              </span>
              <span className="instance-text">
                <span className="instance-name">{inst.name}</span>
                <span className="instance-meta">
                  {inst.activeMods.length} mods
                  <i />
                  {inst.lastPlayedAt ? relativeTime(inst.lastPlayedAt) : 'not played'}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="side-actions">
        <div className="side-pair">
          <button className="quiet" onClick={p.onCreate} disabled={!p.canCreate}>
            <Plus size={15} /> New
          </button>
          <button className="quiet" onClick={p.onImport} disabled={!p.canCreate}>
            <Download size={15} /> Import
          </button>
        </div>
        <button className={`nav-item${p.profileOpen ? ' active' : ''}`} onClick={p.onProfile}>
          <Trophy size={16} /> Profile
        </button>
        <button className={`nav-item${p.settingsOpen ? ' active' : ''}`} onClick={p.onSettings}>
          <SettingsIcon size={16} /> Settings
        </button>
      </div>
    </aside>
  )
}
