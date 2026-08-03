import type {ElementSource} from '@conciv/grab'

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
