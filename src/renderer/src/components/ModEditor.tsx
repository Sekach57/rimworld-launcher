import { memo, useCallback, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'
import { AlertTriangle, ArrowDownAZ, GripVertical, Minus, PackageOpen, Plus, Rows2, Rows3, Rows4, Search, X } from 'lucide-react'
import { previewUrl } from '@shared/api.ts'
import { moveWarnings } from '@shared/checks.ts'
import type { Issue, ModInfo } from '@shared/types.ts'
import { ISSUE_LABEL, SOURCE_LABEL } from '../format.ts'

interface Props {
  active: string[]
  installed: ModInfo[]
  mods: Map<string, ModInfo>
  issues: Map<string, Issue[]>
  selected?: string
  loading: boolean
  canSort: boolean
  gameVersion: string
  onSelect(uid: string | undefined): void
  onChange(mods: string[]): void
  onSort(): void
}

function matches(mod: ModInfo | undefined, uid: string, q: string): boolean {
  if (!q) return true
  const hay = mod ? `${mod.name} ${mod.author} ${mod.packageIdRaw} ${mod.steamId ?? ''}` : uid
  return hay.toLowerCase().includes(q)
}

type Density = 'strip' | 'medium' | 'large'
const ROW_HEIGHT: Record<Density, number> = { strip: 30, medium: 64, large: 112 }
const DENSITIES: { id: Density; label: string; icon: typeof Rows4 }[] = [
  { id: 'strip', label: 'Thin strips', icon: Rows4 },
  { id: 'medium', label: 'Medium rows', icon: Rows3 },
  { id: 'large', label: 'Large rows with previews', icon: Rows2 }
]

function loadDensity(): Density {
  try {
    const d = localStorage.getItem('rl.density')
    if (d === 'strip' || d === 'medium' || d === 'large') return d
    if (localStorage.getItem('rl.compact') === '1') return 'strip'
  } catch {
    /* storage can be unavailable */
  }
  return 'medium'
}

export function ModEditor(p: Props) {
  const [query, setQuery] = useState('')
  const [density, setDensityState] = useState<Density>(loadDensity)
  const [dragging, setDragging] = useState<string | null>(null)
  const [warning, setWarning] = useState<string[]>([])
  const q = query.trim().toLowerCase()
  const activeSet = useMemo(() => new Set(p.active), [p.active])
  const rowH = ROW_HEIGHT[density]

  const inactive = useMemo(
    () =>
      p.installed
        .filter((m) => !activeSet.has(m.uid))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [p.installed, activeSet]
  )
  const shownInactive = useMemo(() => inactive.filter((m) => matches(m, m.uid, q)).map((m) => m.uid), [inactive, q])
  const shownActive = useMemo(() => p.active.filter((uid) => matches(p.mods.get(uid), uid, q)), [p.active, p.mods, q])
  const indexOf = useMemo(() => new Map(p.active.map((u, i) => [u, i])), [p.active])
  const filtering = q.length > 0

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = p.active.indexOf(String(active.id))
    const to = p.active.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(p.active, from, to)
    setWarning(moveWarnings(next, p.mods, p.gameVersion, String(active.id)))
    p.onChange(next)
  }

  const enable = useCallback((uid: string) => p.onChange([...p.active, uid]), [p])
  const disable = useCallback((uid: string) => p.onChange(p.active.filter((u) => u !== uid)), [p])

  const setDensity = (d: Density) => {
    setDensityState(d)
    try {
      localStorage.setItem('rl.density', d)
    } catch {
      /* storage can be unavailable */
    }
  }

  return (
    <section className="editor">
      <div className="editor-toolbar">
        <label className="search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search name, author, package id or Steam id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </label>
        <button className="btn" onClick={p.onSort} disabled={!p.canSort} title="Order active mods by their declared dependencies">
          <ArrowDownAZ size={16} /> Auto-sort
        </button>
        <div className="seg" role="radiogroup" aria-label="Row size">
          {DENSITIES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="radio"
              aria-checked={density === id}
              aria-label={label}
              title={label}
              className={density === id ? 'on' : ''}
              onClick={() => setDensity(id)}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      </div>

      <div className="lists">
        <div className="list-col">
          <div className="list-head">
            <span>Inactive</span>
            <span className="count">{filtering ? `${shownInactive.length} / ${inactive.length}` : inactive.length}</span>
          </div>
          <VirtualList
            ids={shownInactive}
            key={density}
            rowHeight={rowH}
            empty={
              p.loading ? (
                <Empty title="Scanning mods" text="Reading the Mods and Workshop folders." />
              ) : filtering ? (
                <Empty title="No matches" text="Nothing inactive fits that search." />
              ) : (
                <Empty title="Everything is active" text="Every installed mod is in this instance." />
              )
            }
            render={(uid) => (
              <ModRow
                uid={uid}
                mod={p.mods.get(uid)}
                density={density}
                selected={p.selected === uid}
                onSelect={p.onSelect}
                onToggle={enable}
                toggleLabel="Enable"
              />
            )}
          />
        </div>

        <div className="list-col">
          <div className="list-head">
            <span>Active, in load order</span>
            <span className="count">{filtering ? `${shownActive.length} / ${p.active.length}` : p.active.length}</span>
          </div>
          {warning.length > 0 && (
            <div className="drop-warn" role="alert">
              <AlertTriangle size={16} />
              <div className="drop-warn-text">
                <b>This position breaks the load order</b>
                {warning.slice(0, 3).map((w) => (
                  <span key={w}>{w}</span>
                ))}
                {warning.length > 3 && <span>and {warning.length - 3} more</span>}
              </div>
              <button className="search-clear" aria-label="Dismiss warning" onClick={() => setWarning([])}>
                <X size={14} />
              </button>
            </div>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragging(null)}
          >
            <SortableContext items={shownActive} strategy={verticalListSortingStrategy}>
              <VirtualList
                ids={shownActive}
                key={density}
                rowHeight={rowH}
                pinned={dragging}
                empty={
                  p.active.length === 0 ? (
                    <Empty title="No active mods" text="Enable Core first, then add what you want from the left." />
                  ) : (
                    <Empty title="No matches" text="Nothing active fits that search." />
                  )
                }
                render={(uid) => (
                  <SortableRow
                    uid={uid}
                    index={indexOf.get(uid)}
                    mod={p.mods.get(uid)}
                    density={density}
                    issues={p.issues.get(uid)}
                    selected={p.selected === uid}
                    disabled={filtering}
                    onSelect={p.onSelect}
                    onToggle={disable}
                  />
                )}
              />
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
              {dragging ? (
                <div className="drag-overlay" style={{ height: rowH - 6 }}>
                  <ModRow
                    uid={dragging}
                    mod={p.mods.get(dragging)}
                    issues={p.issues.get(dragging)}
                    index={indexOf.get(dragging)}
                    density={density}
                    selected={false}
                    toggleLabel="Disable"
                    onSelect={noop}
                    onToggle={noop}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {filtering && <div className="list-foot">Clear the search to reorder</div>}
        </div>
      </div>
    </section>
  )
}

const noop = () => {}

/** Descriptions carry RimWorld rich-text tags and BBCode; the row only needs plain text. */
function plain(s: string): string {
  return s.replace(/<[^>]+>|\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240)
}

function Empty(p: { title: string; text: string }) {
  return (
    <div className="list-empty">
      <PackageOpen size={28} strokeWidth={1.5} />
      <b>{p.title}</b>
      <span>{p.text}</span>
    </div>
  )
}

interface VListProps {
  ids: string[]
  rowHeight: number
  /** An id that must stay mounted (the row being dragged). */
  pinned?: string | null
  empty: React.ReactNode
  render(id: string): React.ReactNode
}

function VirtualList({ ids, rowHeight, pinned, empty, render }: VListProps) {
  const ref = useRef<HTMLDivElement>(null)
  const pinnedIndex = pinned ? ids.indexOf(pinned) : -1
  const rangeExtractor = useCallback(
    (range: Range) => {
      const base = defaultRangeExtractor(range)
      if (pinnedIndex >= 0 && !base.includes(pinnedIndex)) return [...base, pinnedIndex].sort((a, b) => a - b)
      return base
    },
    [pinnedIndex]
  )
  const v = useVirtualizer({
    count: ids.length,
    getScrollElement: () => ref.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    rangeExtractor,
    getItemKey: (i) => ids[i]
  })
  return (
    <div className="list-body" ref={ref}>
      {ids.length === 0 ? (
        empty
      ) : (
        <div className="vlist" style={{ height: v.getTotalSize() }}>
          {v.getVirtualItems().map((item) => (
            <div key={item.key} className="vrow" style={{ height: item.size, transform: `translateY(${item.start}px)` }}>
              {render(ids[item.index])}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface RowProps {
  uid: string
  mod?: ModInfo
  issues?: Issue[]
  index?: number
  density: Density
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
    <div
      ref={s.setNodeRef}
      style={style}
      className={`sortable${s.isDragging ? ' is-dragging' : ''}${disabled ? '' : ' can-drag'}`}
      {...s.attributes}
      {...s.listeners}
    >
      <ModRow {...row} toggleLabel="Disable" />
    </div>
  )
}

const ModRow = memo(function ModRow({ uid, mod, issues, index, density, selected, toggleLabel, onSelect, onToggle }: RowProps) {
  const [broken, setBroken] = useState(false)
  const worst = issues?.some((i) => i.severity === 'error') ? 'error' : issues?.length ? 'warn' : undefined
  const first = issues?.[0]
  const version = mod?.supportedVersions?.length ? mod.supportedVersions[mod.supportedVersions.length - 1] : undefined
  return (
    <div
      className={`mod-row ${density}${selected ? ' selected' : ''}${mod ? '' : ' missing'}${worst ? ` has-${worst}` : ''}`}
      onClick={() => onSelect(uid)}
      onDoubleClick={() => onToggle(uid)}
    >
      {index !== undefined && (
        <span className="mod-index">
          <GripVertical size={14} className="grip" />
          <span className="num">{index + 1}</span>
        </span>
      )}
      <span className="thumb">
        {mod?.previewPath && !broken ? (
          <img src={previewUrl(mod.previewPath)} loading="lazy" decoding="async" alt="" onError={() => setBroken(true)} />
        ) : (
          <span className="thumb-blank">{(mod?.name ?? uid).charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="mod-text">
        <span className="mod-name">{mod?.name ?? uid}</span>
        {density !== 'strip' && (
          <span className="mod-sub">
            {mod ? (
              <>
                <span className={`src src-${mod.source}`}>{SOURCE_LABEL[mod.source]}</span>
                {mod.author && <span className="mod-author">{mod.author}</span>}
                {version && <span className="mod-version">{version}</span>}
              </>
            ) : (
              <span className="mod-author">Not installed</span>
            )}
          </span>
        )}
        {density === 'large' && mod?.description && <span className="mod-desc">{plain(mod.description)}</span>}
      </span>
      {first && worst && (
        <span className={`badge ${worst}`} title={issues!.map((i) => i.message).join('\n')}>
          <span className="badge-icon" aria-hidden="true">!</span>
          <span className="badge-label">{ISSUE_LABEL[first.kind]}</span>
          {issues!.length > 1 && <span className="badge-more">+{issues!.length - 1}</span>}
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
        {toggleLabel === 'Enable' ? <Plus size={16} /> : <Minus size={16} />}
      </button>
    </div>
  )
})
