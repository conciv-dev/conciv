export type ElementSource = {
  componentName: string | null
  filePath: string
  lineNumber: number | null
}

export type ElementRect = {
  x: number
  y: number
  width: number
  height: number
}

export type DomPreview = {
  kind: 'dom'
  html: string
  width: number
  height: number
}

export type ImagePreview = {
  kind: 'image'
  dataUrl: string
  width: number
  height: number
}

export type GrabPreview = DomPreview | ImagePreview

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

export type GrabFrame = {
  fileName: string
  line: number
  column?: number
}

export type GrabSourceLoc = {
  file: string
  line: number
  column: number
}

export type StagedGrab = {
  preview: GrabPreview
  source: ElementSource | null
  rect: ElementRect | null
  snippet?: string
  frames?: GrabFrame[]
}

export function composeGrabText(snippet: string, source: GrabSourceLoc | null, fallback: string): string {
  if (!source || !snippet) return fallback
  return `${snippet} at ${source.file}:${source.line}:${source.column}`
}

export type Grab = StagedGrab & {text: string}

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
