import { memo, useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { previewUrl } from '@shared/api.ts'
import type { Issue, ModInfo } from '@shared/types.ts'
import { ISSUE_LABEL, SOURCE_LABEL } from '../format.ts'

interface Props {
  active: string[]
  installed: ModInfo[]
  mods: Map<string, ModInfo>
  issues: Map<string, Issue[]>
  selected?: string
  loading: boolean
  onSelect(uid: string | undefined): void
  onChange(mods: string[]): void
}

function matches(mod: ModInfo | undefined, uid: string, q: string): boolean {
  if (!q) return true
  const hay = mod ? `${mod.name} ${mod.author} ${mod.packageIdRaw} ${mod.steamId ?? ''}` : uid
  return hay.toLowerCase().includes(q)
}

export function ModEditor(p: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const activeSet = useMemo(() => new Set(p.active), [p.active])

  const inactive = useMemo(
    () =>
      p.installed
        .filter((m) => !activeSet.has(m.uid))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [p.installed, activeSet]
  )
  const shownInactive = inactive.filter((m) => matches(m, m.uid, q))
  const shownActive = p.active.filter((uid) => matches(p.mods.get(uid), uid, q))
  const filtering = q.length > 0

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = p.active.indexOf(String(active.id))
    const to = p.active.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    p.onChange(arrayMove(p.active, from, to))
  }

  const enable = (uid: string) => p.onChange([...p.active, uid])
  const disable = (uid: string) => p.onChange(p.active.filter((u) => u !== uid))

  return (
    <section className="editor">
      <div className="editor-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search by name, author, package id or Steam id"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="lists">
        <div className="list-col">
          <div className="list-head">
            <span>Inactive</span>
            <span className="count">{filtering ? `${shownInactive.length} / ${inactive.length}` : inactive.length}</span>
          </div>
          <div className="list-body">
            {p.loading && <p className="list-empty">Scanning mods…</p>}
            {!p.loading && shownInactive.length === 0 && (
              <p className="list-empty">{filtering ? 'No matches' : 'Every installed mod is active'}</p>
            )}
            {shownInactive.map((m) => (
              <ModRow
                key={m.uid}
                uid={m.uid}
                mod={m}
                selected={p.selected === m.uid}
                onSelect={p.onSelect}
                onToggle={enable}
                toggleLabel="Enable"
              />
            ))}
          </div>
        </div>

        <div className="list-col">
          <div className="list-head">
            <span>Active, in load order</span>
            <span className="count">{filtering ? `${shownActive.length} / ${p.active.length}` : p.active.length}</span>
          </div>
          <div className="list-body">
            {p.active.length === 0 && <p className="list-empty">No active mods. Enable Core at least.</p>}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={shownActive} strategy={verticalListSortingStrategy}>
                {shownActive.map((uid) => (
                  <SortableRow
                    key={uid}
                    uid={uid}
                    index={p.active.indexOf(uid)}
                    mod={p.mods.get(uid)}
                    issues={p.issues.get(uid)}
                    selected={p.selected === uid}
                    disabled={filtering}
                    onSelect={p.onSelect}
                    onToggle={disable}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
          {filtering && <div className="list-foot">Clear the search to reorder</div>}
        </div>
      </div>
    </section>
  )
}

interface RowProps {
  uid: string
  mod?: ModInfo
  issues?: Issue[]
  index?: number
  selected: boolean
  toggleLabel: 'Enable' | 'Disable'
  onSelect(uid: string): void
  onToggle(uid: string): void
}

function SortableRow(props: Omit<RowProps, 'toggleLabel'> & { disabled: boolean }) {
  const { disabled, ...row } = props
  const s = useSortable({ id: props.uid, disabled })
  const style = { transform: CSS.Transform.toString(s.transform), transition: s.transition }
  return (
    <div ref={s.setNodeRef} style={style} className={s.isDragging ? 'dragging' : undefined} {...s.attributes} {...s.listeners}>
      <ModRow {...row} toggleLabel="Disable" />
    </div>
  )
}

const ModRow = memo(function ModRow({ uid, mod, issues, index, selected, toggleLabel, onSelect, onToggle }: RowProps) {
  const [broken, setBroken] = useState(false)
  const worst = issues?.some((i) => i.severity === 'error') ? 'error' : issues?.length ? 'warn' : undefined
  const first = issues?.[0]
  return (
    <div
      className={`mod-row${selected ? ' selected' : ''}${mod ? '' : ' missing'}`}
      onClick={() => onSelect(uid)}
      onDoubleClick={() => onToggle(uid)}
    >
      {index !== undefined && <span className="mod-index">{index + 1}</span>}
      <span className="thumb">
        {mod?.previewPath && !broken ? (
          <img src={previewUrl(mod.previewPath)} loading="lazy" decoding="async" alt="" onError={() => setBroken(true)} />
        ) : (
          <span className="thumb-blank">{(mod?.name ?? uid).charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="mod-text">
        <span className="mod-name">{mod?.name ?? uid}</span>
        <span className="mod-sub">
          {mod ? (
            <>
              <span className={`src src-${mod.source}`}>{SOURCE_LABEL[mod.source]}</span>
              {mod.author && <span className="mod-author">{mod.author}</span>}
            </>
          ) : (
            <span className="mod-author">Not installed</span>
          )}
        </span>
      </span>
      {first && worst && (
        <span className={`badge ${worst}`} title={issues!.map((i) => i.message).join('\n')}>
          {ISSUE_LABEL[first.kind]}
          {issues!.length > 1 && ` +${issues!.length - 1}`}
        </span>
      )}
      <button
        className="toggle"
        title={toggleLabel}
        aria-label={`${toggleLabel} ${mod?.name ?? uid}`}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(uid)
        }}
      >
        {toggleLabel === 'Enable' ? '+' : '−'}
      </button>
    </div>
  )
})
