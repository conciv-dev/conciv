import type {ElementSource} from '@conciv/plugin/experimental/grab'

function whereLabel(source: ElementSource): string {
  if (source.filePath === '') return ''
  if (source.lineNumber === null) return source.filePath
  return `${source.filePath}:${source.lineNumber}`
}

export function sourceLabel(source: ElementSource): string {
  const where = whereLabel(source)
  if (!source.componentName) return where
  if (where === '') return source.componentName
  return `${source.componentName} at ${where}`
}

export type GrabSourceLoc = {
  file: string
  line: number
  column: number
}

export function composeGrabText(snippet: string, source: GrabSourceLoc | null, fallback: string): string {
  if (!source || !snippet) return fallback
  return `${snippet} at ${source.file}:${source.line}:${source.column}`
}
