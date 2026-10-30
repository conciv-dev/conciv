import type {ToolRequest} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {DeltaKindName, DiffReport} from './defs.js'

export type {DeltaKindName, DiffReport}

export type Box = {x: number; y: number; w: number; h: number}
export type Raster = {width: number; height: number; data: Uint8Array}
export type SourceLoc = {file: string; line: number; column: number}

export type TargetNode = {
  id: string
  box: Box
  kind?: 'frame' | 'text' | 'image' | 'vector' | 'component' | 'unknown'
  name?: string
  text?: string
  fills?: {background?: string; foreground?: string}
  typography?: {family?: string; size?: number; weight?: number; lineHeight?: number}
  layout?: {direction?: 'row' | 'column'; gap?: number; padding?: number[]}
  confidence: number
  children: TargetNode[]
}
export type TargetModel = {
  id: string
  source: {kind: string; ref: string}
  viewport: {width: number; height: number}
  raster: Raster
  root: TargetNode
  scale: number
}
export type TargetAdapter = {
  kind: string
  accepts(ref: string): boolean
  load(input: {ref: string; width?: number; cwd: string}): Promise<TargetModel>
}
export type Enricher = {
  name: string
  applies(node: TargetNode): boolean
  run(input: {node: TargetNode; raster: Raster}): Promise<Partial<TargetNode>>
}

export type LiveStyles = {
  background: string
  color: string
  fontSize: number
  lineHeight: number
  fontWeight: number
  radius: number
}
export type LiveComponent = {
  source: SourceLoc | null
  tag: string
  text: string
  box: Box
  textBox: Box | null
  axis: 'row' | 'column' | null
  styles: LiveStyles
  children: LiveComponent[]
}
export type LiveCapture = {
  raster: Raster
  viewport: {width: number; height: number}
  route: string
  components: LiveComponent[]
}
export type Capture = {
  name: string
  capture(input: {route: string; width: number; height: number; page: ServerToolPageAccess}): Promise<LiveCapture>
  clear(input: {page: ServerToolPageAccess}): Promise<void>
}

export type PixelRegion = {box: Box; kind: 'changed' | 'shift'; shift?: {dx: number; dy: number}}
export type PixelComparator = {
  name: string
  compare(input: {a: Raster; b: Raster}): {mismatch: number; mask: Uint8Array; regions: PixelRegion[]; score?: number}
}
export type GeometryEstimator = {
  name: string
  estimate(input: {live: Raster; target: Raster; liveBox: Box}): {targetBox: Box | null}
}
export type ColorMetric = {name: string; distance(input: {a: string; b: string}): number}
export type TextReader = {name: string; read(input: {raster: Raster}): Promise<{text: string; boxes: Box[]}>}
export type Comparators = {
  pixel: PixelComparator
  geometry: GeometryEstimator
  color: ColorMetric
  text: TextReader | null
}
export type Pair = {
  live: LiveComponent
  selector: string
  liveBox: Box
  targetBox: Box | null
  mismatch: number
  depth: number
  parent: Pair | null
  prev: Pair | null
  next: Pair | null
}
export type Matcher = {
  name: string
  match(input: {live: LiveCapture; target: TargetModel; comparators: Comparators; depth: number}): {
    mismatch: number
    mask: Uint8Array
    pairs: Pair[]
    matchedTargetBoxes: Box[]
  }
}
export type Side = {
  box: Box
  parent: Box | null
  prev: Box | null
  next: Box | null
  axis: 'row' | 'column' | null
  textBox: Box | null
  styles: Partial<LiveStyles>
}
export type Delta = {
  kind: DeltaKindName
  side?: 'left' | 'right' | 'top' | 'bottom' | 'x' | 'y'
  live: number | string
  target: number | string
  breakpoint?: boolean
} & Partial<Provenance>
export type DeltaKind = {kind: DeltaKindName; measure(input: {live: Side; target: Side; color: ColorMetric}): Delta[]}
export type Unmatched = {kind: 'missing' | 'extra'; target?: Box; live?: Box; source?: SourceLoc}

export type Winner = {
  selector: string | null
  declaration: string
  value: string
  important: boolean
  inline: boolean
  inherited: boolean
  sheet: {href: string | null; viteDevId: string | null; emotion: boolean; styled: boolean; adopted: boolean}
  conditions: string[]
  rulePath: string
}
export type Provenance = {
  via: 'sx' | 'style' | 'className' | 'css' | 'emotion' | 'styled' | 'library' | 'unknown'
  file?: string
  line?: number
  column?: number
  declaration?: string
  selector?: string
  suggest?: string
}
export type CssMap = {
  find(input: {
    selector: string
    property: string
  }): {file: string; line: number; column: number; declaration: string} | null
}
export type ProvenanceMapper = {
  via: Provenance['via']
  applies(input: {winner: Winner; component: LiveComponent}): boolean
  map(input: {
    winner: Winner
    component: LiveComponent
    property: string
    target: number | string
    cwd: string
    cssMap: CssMap
  }): Promise<Provenance>
}

export type TargetRecord = {
  id: string
  route: string
  width: number
  height: number
  name?: string
  scale: number
  createdAt: number
}
export type TargetStore = {
  put(input: {model: TargetModel; route: string; width: number; name?: string}): Promise<TargetRecord>
  find(input: {id?: string; route?: string; width?: number}): Promise<TargetRecord | null>
  list(input: {route?: string}): Promise<TargetRecord[]>
  remove(input: {id?: string; route?: string}): Promise<number>
  model(id: string): Promise<TargetModel>
  writeCapture(input: {png: Uint8Array}): Promise<string>
  writeRun(input: {
    id: string
    live: Raster
    diff: Raster
    result: DiffReport
  }): Promise<{livePath: string; diffPath: string; resultPath: string}>
  lastResult(id: string): Promise<DiffReport | null>
  reportPath(path: string): string
}
export type Registries = {
  adapters: TargetAdapter[]
  enrichers: Enricher[]
  captures: Record<string, Capture>
  pixel: Record<string, PixelComparator>
  geometry: Record<string, GeometryEstimator>
  color: Record<string, ColorMetric>
  matchers: Record<string, Matcher>
  deltaKinds: DeltaKind[]
  mappers: ProvenanceMapper[]
}
export type DesignRuntime = {
  cwd: string
  store: TargetStore
  capture: Capture
  comparators: Comparators
  matcher: Matcher
  adapters: TargetAdapter[]
  enrichers: Enricher[]
  deltaKinds: DeltaKind[]
  mappers: ProvenanceMapper[]
  cssMap: () => Promise<CssMap>
}

export type DesignContext = {design: DesignRuntime}

export type ServerStep<Input, Output> = (
  input: Input,
  ctx: DesignContext,
  request: ToolRequest,
  page: ServerToolPageAccess,
) => Promise<Output>
