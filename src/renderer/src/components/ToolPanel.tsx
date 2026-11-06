import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/** Shell shared by the Log, Bisect and Backups views in the right panel. */
export function ToolPanel(props: { title: string; sub?: string; onClose(): void; children: ReactNode }) {
  return (
    <aside className="details tool-panel">
      <div className="details-body">
        <div className="tool-head">
          <div>
            <h2>{props.title}</h2>
            {props.sub && <p className="muted">{props.sub}</p>}
          </div>
          <button className="icon-btn flat" aria-label="Close" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
        {props.children}
      </div>
    </aside>
  )
}
