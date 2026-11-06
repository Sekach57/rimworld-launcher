import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { InstanceInput } from '@shared/api.ts'
import { SWATCHES } from '../format.ts'
import { Mark } from './Mark.tsx'

function Modal(props: { title: string; children: ReactNode; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal aria-label={props.title}>
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  )
}

interface InstanceDialogProps {
  title: string
  hint?: string
  initial?: InstanceInput
  submitLabel: string
  onSubmit(input: InstanceInput): Promise<void>
  onCancel(): void
}

export function InstanceDialog(p: InstanceDialogProps) {
  const [name, setName] = useState(p.initial?.name ?? '')
  const [letter, setLetter] = useState(p.initial?.letter ?? '')
  const [color, setColor] = useState(p.initial?.color ?? SWATCHES[Math.floor(Math.random() * SWATCHES.length)])
  const [notes, setNotes] = useState(p.initial?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => nameRef.current?.focus(), [])

  const shownLetter = (letter || name.trim().charAt(0)).toUpperCase()
  const valid = name.trim().length > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    try {
      await p.onSubmit({ name: name.trim(), letter: shownLetter, color, notes: notes.trim() })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={p.title} onClose={p.onCancel}>
      {p.hint && <p className="modal-hint">{p.hint}</p>}
      <form onSubmit={submit} className="form">
        <div className="form-identity">
          <Mark color={color} letter={shownLetter} size={52} />
          <div className="form-fields">
            <label className="field">
              <span>Name</span>
              <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Vanilla Expanded run" />
            </label>
            <label className="field narrow">
              <span>Letter</span>
              <input value={letter} onChange={(e) => setLetter(e.target.value.slice(-2))} maxLength={2} placeholder={shownLetter || 'A'} />
            </label>
          </div>
        </div>
        <div className="field">
          <span>Colour</span>
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch${c === color ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional" />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={p.onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid || busy}>
            {busy ? 'Working…' : p.submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface ConfirmProps {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm(): void
  onCancel(): void
}

export function ConfirmDialog(p: ConfirmProps) {
  return (
    <Modal title={p.title} onClose={p.onCancel}>
      <p className="modal-hint">{p.body}</p>
      <div className="modal-actions">
        <button className="btn ghost" onClick={p.onCancel} autoFocus>
          Cancel
        </button>
        <button className={`btn ${p.danger ? 'danger' : 'primary'}`} onClick={p.onConfirm}>
          {p.confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
