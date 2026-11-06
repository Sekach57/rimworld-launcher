import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Archive, Bug, CircleCheck, Copy, FolderOpen, MoreHorizontal, Pencil, Play, ScrollText, Trash2 } from 'lucide-react'
import { previewUrl } from '@shared/api.ts'
import type { Instance, Issue, ModInfo } from '@shared/types.ts'
import { coverPaths, relativeTime } from '../format.ts'

interface Props {
  instance: Instance
  mods: Map<string, ModInfo>
  issues: Issue[]
  onEdit(): void
  onDuplicate(): void
  onDelete(): void
  onOpenFolder(): void
  onLaunch(): void
  onTool(tool: 'log' | 'bisect' | 'backups'): void
}

export function InstanceHeader({ instance, mods, issues, ...on }: Props) {
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.length - errors
  const covers = coverPaths(instance.activeMods, mods, 7)
  return (
    <header className="hero" style={{ ['--inst' as string]: instance.color }}>
      <div className="hero-art" aria-hidden>
        {covers.map((c, i) => (
          <img key={c + i} src={previewUrl(c)} alt="" />
        ))}
      </div>
      <div className="hero-shade" aria-hidden />
      <div className="hero-body">
        <div className="hero-text">
          <span className="hero-eyebrow">
            <span className="hero-letter" style={{ background: instance.color }}>
              {instance.letter}
            </span>
            Instance
          </span>
          <h1>{instance.name}</h1>
          <div className="hero-stats">
            <span className="stat">
              <b>{instance.activeMods.length}</b>
              <span>active mods</span>
            </span>
            <span className="stat">
              <b className="text">{relativeTime(instance.lastPlayedAt)}</b>
              <span>last played</span>
            </span>
            {issues.length === 0 ? (
              <span className="stat ok">
                <CircleCheck size={16} /> No problems
              </span>
            ) : (
              <span className={`stat ${errors ? 'error' : 'warn'}`}>
                <AlertTriangle size={16} />
                {errors > 0 && `${errors} error${errors > 1 ? 's' : ''}`}
                {errors > 0 && warnings > 0 && ', '}
                {warnings > 0 && `${warnings} warning${warnings > 1 ? 's' : ''}`}
              </span>
            )}
          </div>
          {instance.notes && <p className="hero-notes">{instance.notes}</p>}
        </div>
        <div className="hero-actions">
          <OverflowMenu {...on} />
          <button className="play" onClick={on.onLaunch}>
            <Play size={20} fill="currentColor" strokeWidth={0} /> Play
          </button>
        </div>
      </div>
    </header>
  )
}

function OverflowMenu(on: Pick<Props, 'onEdit' | 'onDuplicate' | 'onDelete' | 'onOpenFolder' | 'onTool'>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  const item = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="menu-wrap" ref={ref}>
      <button
        className="icon-btn"
        aria-label="Instance actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={item(on.onEdit)}>
            <Pencil size={15} /> Edit
          </button>
          <button role="menuitem" onClick={item(on.onDuplicate)}>
            <Copy size={15} /> Duplicate
          </button>
          <button role="menuitem" onClick={item(on.onOpenFolder)}>
            <FolderOpen size={15} /> Open folder
          </button>
          <hr />
          <button role="menuitem" onClick={item(() => on.onTool('log'))}>
            <ScrollText size={15} /> Log analysis
          </button>
          <button role="menuitem" onClick={item(() => on.onTool('bisect'))}>
            <Bug size={15} /> Find a bad mod
          </button>
          <button role="menuitem" onClick={item(() => on.onTool('backups'))}>
            <Archive size={15} /> Backups
          </button>
          <hr />
          <button role="menuitem" className="danger" onClick={item(on.onDelete)}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}
