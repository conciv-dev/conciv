import {z} from 'zod'

export const BoxSchema = z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()})

export const ReflowTagSchema = z.object({
  kind: z.enum(['stack', 'wrap', 'scroll']),
  minChildWidth: z.number().optional(),
  breakpoint: z.number().optional().describe('the row width under which a child would go below minChildWidth'),
})

export type Box = z.output<typeof BoxSchema>

export type Reflow = z.output<typeof ReflowTagSchema>

type Gap = {px: number; uniform: boolean}

type Align = 'start' | 'center' | 'end' | 'stretch'

type Padding = {top: number; right: number; bottom: number; left: number}

type RowRun = {direction: 'row'; children: string[]; gap: Gap; align: Align; wrap: boolean}

export type ContainerLayout = {
  direction: 'row' | 'column' | 'grid' | 'stack'
  gap: Gap
  align: Align
  wrap: boolean
  padding: Padding
  runs: RowRun[]
}

export type NodeLayout = Partial<ContainerLayout> & {size?: 'fill' | 'fit' | 'fixed'; index?: number}

export type FigmaFacts = {
  type: string
  name: string
  absolute: boolean
  mode: string | null
  box: Box
  fields: Record<string, unknown>
  component?: string
}

export type GateFacts = {kind: string; leaf: boolean; parent: string | null; direction?: 'row' | 'column'}

type Typography = {
  size: number
  lineHeight: number
  weight: number
  confidence: number
  font: string
  family: string | null
}

type NodeBase = {
  id: string
  box: Box
  hash: string
  layout?: NodeLayout
  figma?: FigmaFacts
  gate?: GateFacts
  implied?: boolean
  reflow?: Reflow
  children: DesignNode[]
}

export type TextNode = NodeBase & {
  kind: 'text'
  text: string
  lines: {box: Box; text: string; confidence: number}[]
  confidence: number
  role?: 'placeholder' | 'data' | 'unknown'
  typography?: Typography
}

export type BoxNode = NodeBase & {
  kind: 'box'
  paint?: {background: string; gradient?: {from: string; to: string; axis: 'vertical' | 'horizontal'}}
  border: {width: number; color: string} | null
  radius: number
}

export type ImageNode = NodeBase & {kind: 'image'; holds: number}

export type DesignNode = TextNode | BoxNode | ImageNode

export type Design = {
  id: string
  source: {kind: 'figma'; ref: string}
  viewport: {width: number; height: number}
  scale: number
  root: DesignNode
}
