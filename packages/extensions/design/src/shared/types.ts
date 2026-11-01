import type {ServerApi, ToolRequest} from '@conciv/extension'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {DesignConfig} from './config.js'
import type {DeltaKindName, DiffInput, DiffReport, StatusReport, TargetInput, TargetResult} from './defs.js'
import type {Role} from './roles.js'

export type {DeltaKindName, DiffReport}

export type Box = {x: number; y: number; w: number; h: number}
export type Raster = {width: number; height: number; data: Uint8Array}
export type SourceLoc = {file: string; line: number; column: number}

export type OcrLine = {box: Box; text: string; confidence: number}
export type Border = {width: number; color: string}
export type Typography = {size: number; lineHeight: number; weight: number; confidence: number}
type NodeBase = {id: string; box: Box; within?: string}
export type TextNode = NodeBase & {
  kind: 'text'
  text: string
  lines: OcrLine[]
  confidence: number
  role?: Role
  roleConfidence?: number
  typography?: Typography
}
export type BoxNode = NodeBase & {kind: 'box'; paint?: {background: string}; border: Border | null; radius: number}
export type ImageNode = NodeBase & {kind: 'image'}
export type TargetNode = TextNode | BoxNode | ImageNode
export type TargetRoot = {id: string; box: Box}
export type TargetModel = {
  id: string
  source: {kind: string; ref: string}
  viewport: {width: number; height: number}
  raster: Raster
  root: TargetRoot
  nodes: TargetNode[]
  scale: number
}
export type TargetAdapter = {
  kind: string
  accepts(input: {ref: string; cwd: string}): boolean
  load(input: {ref: string; scale: number; cwd: string}): Promise<TargetModel>
}
export type Enricher = {
  name: string
  run(input: {model: TargetModel; raster: Raster; runtime: DesignRuntime}): Promise<TargetNode[]>
}
export type Segmenter = {name: string; segment(input: {raster: Raster; nodes: TargetNode[]}): Promise<TargetNode[]>}
export type RoleRules = (input: {text: string; neighbours: string[]}) => {role: Role; confidence: number}

export type Glyph = {text: string; boxes: Box[]}

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
  glyphs: Glyph[]
  axis: 'row' | 'column' | null
  styles: LiveStyles
  index: number
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
  capture(input: {width: number; height: number; page: ServerToolPageAccess}): Promise<LiveCapture>
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
export type TextRun = {box: Box; text: string}
export type TextGroup = {
  live: Box[]
  target: Box[]
  liveText: string
  targetText: string
  agrees: boolean
  owner: LiveComponent
}
export type TextReader = {name: string; read(input: {raster: Raster}): Promise<OcrLine[]>}
export type Comparators = {
  pixel: PixelComparator
  geometry: GeometryEstimator
  color: ColorMetric
  text: TextReader
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
  warning?: 'sample-data'
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
  via: 'sx' | 'style' | 'className' | 'css' | 'emotion' | 'styled' | 'library' | 'source' | 'unknown'
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
  session: string
  route?: string
  width: number
  height: number
  name?: string
  scale: number
  createdAt: number
  acceptedRun?: string
}
export type DecisionKind = 'pin' | 'excluded' | 'image-slot' | 'accept-delta' | 'tolerance'
export type Decision = {id: string; kind: DecisionKind; anchor: string; value: string | number | null; at: number}
export type StoredRun = {run: string; report: DiffReport}
export type TargetStore = {
  put(input: {model: TargetModel; session: string; route?: string; name?: string}): Promise<TargetRecord>
  find(input: {id: string}): Promise<TargetRecord | null>
  current(input: {session: string}): Promise<TargetRecord | null>
  list(input: {route?: string}): Promise<TargetRecord[]>
  remove(input: {id?: string; all?: boolean}): Promise<number>
  model(id: string): Promise<TargetModel>
  decisions(id: string): Promise<Decision[]>
  decide(input: {id: string; kind: DecisionKind; anchor: string; value: Decision['value']}): Promise<Decision>
  revoke(input: {id: string; decision: string}): Promise<boolean>
  accept(input: {id: string; run: string}): Promise<TargetRecord>
  latestRun(id: string): Promise<StoredRun | null>
  writeCapture(input: {png: Uint8Array}): Promise<string>
  writeRun(input: {
    id: string
    live: Raster
    diff: Raster
    result: Omit<DiffReport, 'diffImage' | 'livePath'>
  }): Promise<DiffReport>
  lastResult(id: string): Promise<DiffReport | null>
  reportPath(path: string): string
}
export type Registries = {
  adapters: TargetAdapter[]
  enrichers: Enricher[]
  captures: Record<DesignConfig['capture'], Capture>
  pixel: Record<DesignConfig['comparator'], PixelComparator>
  geometry: Record<DesignConfig['geometry'], GeometryEstimator>
  color: Record<DesignConfig['color'], ColorMetric>
  matchers: Record<DesignConfig['matcher'], Matcher>
  text: Record<DesignConfig['text'], TextReader>
  segmenters: Record<DesignConfig['segmenter'], Segmenter>
  roles: Record<DesignConfig['roles'], RoleRules>
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
  segmenter: Segmenter
  roles: RoleRules
  deltaKinds: DeltaKind[]
  mappers: ProvenanceMapper[]
  cssMap: () => Promise<CssMap>
  xrayUrl: (input: {id: string; session: string}) => XrayLink
}

export type XrayLink = {url: string; absolute: boolean}

export type Differ = {
  register(input: {input: TargetInput; session: SessionId}): Promise<TargetResult>
  run(input: {input: DiffInput; session: SessionId}): Promise<DiffReport>
  status(input: {session: SessionId}): Promise<StatusReport>
}

export type DesignPage = ServerApi<DesignConfig>['page']

export type DesignContext = {design: DesignRuntime; differ: Differ}

export type ServerStep<Input, Output> = (
  input: Input,
  ctx: DesignContext,
  request: ToolRequest,
  page: ServerToolPageAccess,
) => Promise<Output>
