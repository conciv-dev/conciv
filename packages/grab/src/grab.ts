export type ElementSnapshot = {
  node: HTMLElement
  width: number
  height: number
}

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

export type StagedGrab = {
  snapshot: ElementSnapshot
  source: ElementSource | null
  rect: ElementRect | null
}

export type Grab = StagedGrab & {text: string}

export type GrabApi = {
  pick: () => Promise<Grab | null>
  comment: () => Promise<Grab | null>
  cancel: () => void
  isActive: () => boolean
  stage: (grab: Grab) => void
}
