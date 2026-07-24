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
  node: HTMLElement
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

export type StagedGrab = {
  preview: GrabPreview
  source: ElementSource | null
  rect: ElementRect | null
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
