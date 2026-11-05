import type {Storage} from 'unstorage'
import type {ServerApi, ToolRequest} from '@conciv/extension'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {DesignConfig} from './tolerances.js'
import type {
  ContainerLayout,
  DeltaKindName,
  DesignNode,
  DiffInput,
  DiffReport,
  NodeLayout,
  OcrLine,
  Pairer,
  Ranker,
  Stage,
  StatusReport,
  Store,
  TargetAdapter,
  TargetInput,
  TargetRecord,
  TargetResult,
  WatchInput,
  WatchReport,
} from './defs.js'

export const ROLES = ['placeholder', 'data', 'unknown'] as const
export type Role = (typeof ROLES)[number]
export type LiveRole = 'literal' | 'expression' | 'mixed'
export const PLACEHOLDER_KINDS = ['icon', 'logo', 'image', 'avatar'] as const
export type PlaceholderKind = (typeof PLACEHOLDER_KINDS)[number]

export type Box = {x: number; y: number; w: number; h: number}
export type Raster = {width: number; height: number; data: Uint8Array}
export type SourceLoc = {file: string; line: number; column: number}

export type Gradient = {from: string; to: string}
export type Segmenter = {name: string; segment(input: {raster: Raster; nodes: DesignNode[]}): Promise<DesignNode[]>}
export type RoleRules = (input: {text: string; neighbours: string[]}) => {role: Role; confidence: number}

export type Glyph = {text: string; boxes: Box[]}

export type LiveBorder = {width: number; style: string; color: string; side: 'top' | 'right' | 'bottom' | 'left'}
export type LiveStyles = {
  background: string
  color: string
  fontSize: number
  lineHeight: number
  fontWeight: number
  fontFamily: string
  textAlign: string
  radius: number
  position: string
  sizing: {width: Sizing; height: Sizing}
  border: LiveBorder
  gradient: Gradient | null
}
type Sizing = 'fixed' | 'auto'
export type LiveComponent = {
  source: SourceLoc | null
  key: string | null
  instance: string | null
  owner: string | null
  tag: string
  text: string
  box: Box
  textBox: Box | null
  glyphs: Glyph[]
  axis: 'row' | 'column' | null
  columns: number | null
  styles: LiveStyles
  role: string | null
  hints: string[]
  index: number
  path: string
  opinion?: Opinion
  drawn: boolean
  placeholder: PlaceholderKind | null
  children: LiveComponent[]
}
export type Opinion = {box: Box; confidence: number}
export type CapturePath = 'region' | 'snapdom-live' | 'snapdom-mirror'
export type MeasureSource = 'dom' | 'mirror' | 'takumi'
export type MirrorLimits = {canvases: number; fonts: string[]; inlineWidths: number}
export type LiveCapture = {
  raster: Raster
  viewport: {width: number; height: number}
  route: string
  components: LiveComponent[]
  capturePath: CapturePath
  source: MeasureSource
  masks: Box[]
  limits?: MirrorLimits
  opinion: boolean
  framework: Framework | null
}
export type Framework = 'react' | 'solid'

export type PixelComparator = {
  name: string
  compare(input: {a: Raster; b: Raster}): {mismatch: number; mask: Uint8Array; score?: number}
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
  color: ColorMetric
  text: TextReader
}
export type Fingerprint = {
  source: SourceLoc | null
  key: string | null
  instance: string | null
  owner: string | null
  tag: string
  textHash: string
  box: Box
}
export type Touched = Set<string> | 'all'
export type TileRecord = {hash: string; mismatch: number; mask?: string}
export type TileCache = {
  side: number
  columns: number
  rows: number
  width: number
  height: number
  tiles: TileRecord[]
}
export type ItemKind = DeltaKindName | 'unbuilt' | 'extra' | 'offset'
export type Item = {
  key: string
  kind: ItemKind
  stage: Stage | null
  size: number
  confidence: number
  box: Box
  depth: number
  value: number | string
  sentence: string
  node?: string
  source?: SourceLoc
}
export type Flow = 'row' | 'column'
export type Side = {
  kind: DesignNode['kind']
  box: Box
  parent: Box | null
  prev: Box | null
  next: Box | null
  axis: 'row' | 'column' | null
  flow: Flow | null
  columns: number | null
  textBox: Box | null
  ink: Box | null
  lines: number | null
  edge: string | null
  radius: number | null
  padding: ContainerLayout['padding'] | null
  size: NodeLayout['size'] | null
  styles: Partial<LiveStyles>
}
export type Delta = {
  kind: DeltaKindName
  side?: 'left' | 'right' | 'top' | 'bottom' | 'x' | 'y'
  live: number | string
  target: number | string
  source?: MeasureSource
  confidence?: number
  width?: number
  lineHeight?: number
  box?: Box
  opinion?: {source: 'takumi'; live: number | string; confidence: number}
  warning?: 'sample-data' | 'typography-skipped' | 'svg-drawn' | 'page-error'
} & Partial<Provenance>
export type DeltaKind = {
  kind: DeltaKindName
  measure(input: {live: Side; target: Side; color: ColorMetric}): Delta[]
  read?(side: Side): number | string | null
}
export type Unmatched = DiffReport['unmatched'][number]

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
    project: Storage
    cssMap: CssMap
  }): Promise<Provenance>
}

export type DesignRuntime = {
  cwd: string
  state: Storage
  project: Storage
  blind: boolean
  store: Store
  comparators: Comparators
  pairer: Pairer
  ranker: Ranker
  adapters: TargetAdapter[]
  deltaKinds: DeltaKind[]
  mappers: ProvenanceMapper[]
  cssMap: () => Promise<CssMap>
  xrayUrl: (input: {id: string; session: string}) => XrayLink
}

export type XrayLink = {url: string; absolute: boolean}

export type Differ = {
  register(input: {input: TargetInput; session: SessionId}): Promise<TargetResult>
  run(input: {input: DiffInput; session: SessionId}): Promise<DiffReport>
  refresh(input: {session: SessionId}): Promise<void>
  touch(input: {file: string}): void
  capture(input: {id: string; session: SessionId}): Promise<DiffReport>
  accept(input: {id: string}): Promise<TargetRecord>
  status(input: {session: SessionId}): Promise<StatusReport>
  watch(input: {input: WatchInput; session: SessionId}): Promise<WatchReport>
  xray(input: {id: string}): Promise<{report: DiffReport | null; outline: string[]}>
}

export type DesignPage = ServerApi<DesignConfig>['page']

export type DesignContext = {design: DesignRuntime; differ: Differ}

export type ServerStep<Input, Output> = (
  input: Input,
  ctx: DesignContext,
  request: ToolRequest,
  page: ServerToolPageAccess,
) => Promise<Output>
