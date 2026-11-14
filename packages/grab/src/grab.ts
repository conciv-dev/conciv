import type {ElementSource, Grab} from '@conciv/plugin/experimental/grab'

export type {
  DomPreview,
  ElementRect,
  ElementSource,
  Grab,
  GrabFrame,
  GrabPreview,
  ImagePreview,
} from '@conciv/plugin/experimental/grab'

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

export type StagedGrab = Omit<Grab, 'text'>

export function composeGrabText(snippet: string, source: GrabSourceLoc | null, fallback: string): string {
  if (!source || !snippet) return fallback
  return `${snippet} at ${source.file}:${source.line}:${source.column}`
}

export type GrabApi = {
  pick: () => Promise<Grab | null>
  comment: () => Promise<Grab | null>
  cancel: () => void
  isActive: () => boolean
  grabbable?: () => boolean
  stage: (grab: Grab) => void
  staged: () => readonly Grab[]
  clear: () => void
}

export type GrabActions = Pick<GrabApi, 'pick' | 'comment' | 'cancel' | 'isActive' | 'grabbable'>

export type GrabProvider = () => GrabActions
