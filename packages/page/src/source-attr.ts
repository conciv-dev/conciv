import type {SourceLoc} from '@conciv/protocol/page-introspect-types'

export function sourceFromAttr(el: Element): SourceLoc | null {
  const raw = el.closest('[data-tsd-source]')?.getAttribute('data-tsd-source')
  if (!raw) return null
  const parts = raw.split(':')
  const column = Number(parts.pop())
  const line = Number(parts.pop())
  const file = parts.join(':')
  return file && Number.isFinite(line) && Number.isFinite(column) ? {file, line, column} : null
}
