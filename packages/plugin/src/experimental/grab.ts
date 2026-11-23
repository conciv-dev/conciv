import {Registry} from './core.js'

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

export type GrabFrame = {
  fileName: string
  line: number
  column?: number
}

export type Grab = {
  preview: GrabPreview
  source: ElementSource | null
  rect: ElementRect | null
  snippet?: string
  frames?: GrabFrame[]
  text: string
}

export interface GrabPicker {
  pick(): Promise<Grab | null>
  comment(): Promise<Grab | null>
  cancel(): void
  isActive(): boolean
  grabbable?(): boolean
}

export const GrabPicker = Registry.define<GrabPicker>('grab.picker')
