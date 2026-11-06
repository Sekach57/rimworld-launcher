import type { IssueKind, ModSource } from '@shared/types.ts'

export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 'never'
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 30) return d === 1 ? 'yesterday' : `${d} days ago`
  return new Date(then).toLocaleDateString()
}

/** Strips Unity rich-text tags and BBCode that mod authors put in descriptions. */
export function cleanDescription(text: string): string {
  return text
    .replace(/<\/?(color|b|i|size|u|s|material|quad)(=[^>]*)?>/gi, '')
    .replace(/\[\/?(b|i|u|s|h\d|list|olist|\*|quote|code|table|tr|td|th|hr|noparse|spoiler|strike|img)[^\]]*\]/gi, '')
    .replace(/\[url=[^\]]*\]([^[]*)\[\/url\]/gi, '$1')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const SOURCE_LABEL: Record<ModSource, string> = {
  official: 'Official',
  local: 'Local',
  workshop: 'Workshop'
}

export const ISSUE_LABEL: Record<IssueKind, string> = {
  'not-installed': 'Not installed',
  'missing-dependency': 'Missing dependency',
  incompatible: 'Incompatible',
  'unsupported-version': 'Old version',
  'duplicate-package-id': 'Duplicate',
  order: 'Order',
  cycle: 'Cycle'
}

export const SWATCHES = ['#5fb3a1', '#6c9ee0', '#d9a441', '#e5534b', '#b48ead', '#7fb069', '#e07a5f', '#8f99a8']
