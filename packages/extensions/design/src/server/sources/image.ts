import * as ort from 'onnxruntime-web'
import {createHash} from 'node:crypto'
import {basename, dirname, join} from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import type {InferenceSession} from 'onnxruntime-web'
import {Canvas, Contours, cv, ImageProcessor, type CanvasLike} from 'ppu-ocv'
import {CanvasProcessor, CanvasToolkit} from 'ppu-ocv/canvas'
import {z} from 'zod'
import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {clamp, countBy, groupBy, partition, range} from 'es-toolkit'
import {
  type Border,
  type Box,
  type ColorMetric,
  type DesignNode,
  type OcrLine,
  type Paint,
  type Raster,
  type RoleRules,
  type TargetAdapter,
  type TextReader,
} from '../../shared/defs.js'
import {iconSized, TOLERANCES} from '../../shared/tolerances.js'
import {
  boxMask,
  crop,
  decodePng,
  encodePng,
  hex,
  labelRegions,
  pngBase64,
  readPng,
  rgbAt,
  rgbDistance,
  trimToInk,
  type Rgb,
  COLOR_METRICS,
  sampledFills,
  fnv,
} from '../raster.js'
import {encloses, expand, overlapping, sameLine, union} from '../../shared/box.js'
import {isFigmaUrl} from './figma.js'
import {inferLayout} from './layout.js'

export {trimToInk} from '../raster.js'

export function createImageAdapter(input: ImageTools): TargetAdapter {
  return {
    kind: 'image',
    accepts: ({ref}) => !isFigmaUrl(ref),
    load: async ({ref, scale, project, attachments}) => {
      const image = attachments.image ?? (await readPng({ref, project}))
      const raster = decodePng(image)
      const {nodes, warnings} = await enrich({nodes: [], raster, scale, tools: input})
      const viewport = {width: Math.round(raster.width / scale), height: Math.round(raster.height / scale)}
      const root = inferLayout({
        id: 'root',
        box: {x: 0, y: 0, w: raster.width, h: raster.height},
        kind: 'box',
        border: null,
        radius: 0,
        children: nest({nodes}),
      })
      return {
        design: {
          id: createHash('sha256').update(image).digest('hex').slice(0, 12),
          source: {kind: 'image', ref: pngBase64(ref) === null ? ref : 'base64'},
          viewport,
          scale,
          root,
        },
        image,
        warnings,
      }
    },
  }
}

function nest(input: {nodes: Flat[]}): DesignNode[] {
  const {nodes} = input
  const parents = nodes.map((node) => {
    const holders = nodes.flatMap((other, index) => (holds({outer: other, inner: node}) ? [index] : []))
    return holders.reduce<number>((best, index) => {
      const current = nodes[best]
      const candidate = nodes[index]
      if (current === undefined || candidate === undefined) return index
      return surface(candidate.box) < surface(current.box) ? index : best
    }, -1)
  })
  const build = (index: number): DesignNode[] => {
    const node = nodes[index]
    if (node === undefined) return []
    return [designNode({node, children: parents.flatMap((parent, child) => (parent === index ? build(child) : []))})]
  }
  return parents.flatMap((parent, index) => (parent === -1 ? build(index) : []))
}

type ImageTools = {reader: TextReader; segmenter: Segmenter; roles: RoleRules}

type Flat = DesignNode & {within?: string}
type FlatBox = Extract<Flat, {kind: 'box'}>
type FlatImage = Extract<Flat, {kind: 'image'}>
type FlatText = Extract<Flat, {kind: 'text'}>

type Enricher = {
  name: string
  run(input: {nodes: Flat[]; raster: Raster; scale: number; tools: ImageTools}): Promise<Flat[]>
}

function holds(input: {outer: Flat; inner: Flat}): boolean {
  const {outer, inner} = input
  return (
    outer.kind === 'box' &&
    outer !== inner &&
    surface(outer.box) > surface(inner.box) &&
    encloses({outer: outer.box, inner: inner.box})
  )
}

function designNode(input: {node: Flat; children: DesignNode[]}): DesignNode {
  const {within: _within, ...node} = input.node
  return {...node, children: input.children}
}

async function enrich(input: {
  nodes: Flat[]
  raster: Raster
  scale: number
  tools: ImageTools
}): Promise<{nodes: Flat[]; warnings: string[]}> {
  return ENRICHERS.reduce<Promise<{nodes: Flat[]; warnings: string[]}>>(
    async (pending, enricher) => {
      const {nodes, warnings} = await pending
      return enricher.run({...input, nodes}).then(
        (enriched) => ({nodes: enriched, warnings}),
        (error: unknown) => ({nodes, warnings: [...warnings, `${enricher.name} failed: ${errorMessage(error)}`]}),
      )
    },
    Promise.resolve({nodes: input.nodes, warnings: []}),
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function nodeId(input: {kind: Flat['kind']; box: Box; text?: string}): string {
  const {kind, box} = input
  const rounded = [box.x, box.y, box.w, box.h].map(Math.round).join(',')
  return fnv(`${kind}|${rounded}|${input.text ?? ''}`)
}

const MODEL_FILES = ['PP-OCRv6_tiny_det.ort', 'PP-OCRv6_tiny_rec.ort', 'ppocrv6_tiny_dict.txt'] as const
const SESSION = {executionProviders: ['wasm'], graphOptimizationLevel: 'all'} as const
const RECOGNITION = {strategy: 'per-box', minimumConfidence: 0} as const

type OcrService = {
  options: {session: object; detection: object; recognition: {charactersDictionary: string[]}; debugging: object}
  detectionSession: InferenceSession | null
  recognitionSession: InferenceSession | null
  detector: unknown
  recognitor: unknown
  recognize(image: ArrayBuffer, options: {flatten: true; noCache: true}): Promise<unknown>
  destroy(): Promise<void>
}
type ServiceConstructor = new (host: unknown, options: object) => OcrService
type StageConstructor = new (
  host: unknown,
  session: InferenceSession,
  options: object,
  debugging: object,
  engine: 'opencv',
) => unknown
type CreateSession = (
  runtime: typeof ort,
  model: Uint8Array,
  options: object,
  logger: () => undefined,
  fallback: () => undefined,
) => Promise<InferenceSession>
type ParseDictionary = (source: Uint8Array) => string[]

const isFunction = (value: unknown): boolean => typeof value === 'function'
const ServiceModuleSchema = z.object({BasePaddleOcrService: z.custom<ServiceConstructor>(isFunction)})
const DetectionModuleSchema = z.object({BaseDetectionService: z.custom<StageConstructor>(isFunction)})
const RecognitionModuleSchema = z.object({BaseRecognitionService: z.custom<StageConstructor>(isFunction)})
const SessionModuleSchema = z.object({createSessionWithFallback: z.custom<CreateSession>(isFunction)})
const UtilsModuleSchema = z.object({parseDictionary: z.custom<ParseDictionary>(isFunction)})
const RecognizedSchema = z.object({
  results: z.array(
    z.object({
      text: z.string(),
      confidence: z.number(),
      box: z.object({x: z.number(), y: z.number(), width: z.number(), height: z.number()}),
    }),
  ),
})

const nodeRequire = createRequire(import.meta.url)

async function ppuModule(input: {directory: string; file: string}): Promise<unknown> {
  return import(pathToFileURL(join(input.directory, input.file)).href)
}

function wasmHost() {
  return {
    pathSeparator: '/',
    ort,
    createCanvas: (width: number, height: number) => new Canvas(width, height),
    isCanvas: (image: unknown): image is Canvas => image instanceof Canvas,
    loadResource: async (source: string | ArrayBuffer | undefined, defaultUrl: string): Promise<ArrayBuffer> => {
      if (source instanceof ArrayBuffer) return source
      const path = source ?? defaultUrl
      const storage = createStorage({driver: fsDriver({base: dirname(path), readOnly: true})})
      const bytes = await readRaw({storage, key: basename(path)})
      if (bytes === null) throw new Error(`the OCR resource ${path} could not be read`)
      return Uint8Array.from(bytes).buffer
    },
    saveDebugImage: async () => undefined,
    canvas: {
      prepareCanvas: (image: ArrayBuffer | string | CanvasLike) => CanvasProcessor.prepareCanvas(image),
      createProcessor: (canvas: CanvasLike) => new CanvasProcessor(canvas),
      getToolkit: () => CanvasToolkit.getInstance(),
    },
    imageProcessor: {
      prepareCanvas: async (image: ArrayBuffer | string | CanvasLike) => CanvasProcessor.prepareCanvas(image),
      ImageProcessor,
      Contours,
      cv,
    },
  }
}

async function readModels(): Promise<{detection: Uint8Array; recognition: Uint8Array; dictionary: Uint8Array}> {
  const directory = join(dirname(nodeRequire.resolve('@conciv/extension-design/package.json')), 'models')
  const models = createStorage({driver: fsDriver({base: directory, readOnly: true})})
  const [detection, recognition, dictionary] = await Promise.all(
    MODEL_FILES.map((name) => readModel({storage: models, key: name})),
  )
  if (detection === undefined || recognition === undefined || dictionary === undefined) {
    throw new Error('the OCR model files could not be read')
  }
  return {detection, recognition, dictionary}
}

async function createService(): Promise<OcrService> {
  const directory = dirname(nodeRequire.resolve('ppu-paddle-ocr'))
  const [service, detection, recognition, session, utils] = await Promise.all([
    ppuModule({directory, file: 'core/base-paddle-ocr.service.js'}),
    ppuModule({directory, file: 'core/base-detection.service.js'}),
    ppuModule({directory, file: 'core/base-recognition.service.js'}),
    ppuModule({directory, file: 'core/session-factory.js'}),
    ppuModule({directory, file: 'utils.js'}),
  ])
  const {BasePaddleOcrService} = ServiceModuleSchema.parse(service)
  const {BaseDetectionService} = DetectionModuleSchema.parse(detection)
  const {BaseRecognitionService} = RecognitionModuleSchema.parse(recognition)
  const {createSessionWithFallback} = SessionModuleSchema.parse(session)
  const {parseDictionary} = UtilsModuleSchema.parse(utils)
  const models = await readModels()
  ort.env.wasm.numThreads = 1
  const host = wasmHost()
  const ocr = new BasePaddleOcrService(host, {recognition: RECOGNITION, session: SESSION})
  const open = (model: Uint8Array) =>
    createSessionWithFallback(
      ort,
      model,
      ocr.options.session,
      () => undefined,
      () => undefined,
    )
  const [detectionSession, recognitionSession] = await Promise.all([
    open(models.detection),
    open(models.recognition),
    ImageProcessor.initRuntime(),
  ])
  ocr.detectionSession = detectionSession
  ocr.recognitionSession = recognitionSession
  ocr.options.recognition.charactersDictionary = parseDictionary(models.dictionary)
  ocr.detector = new BaseDetectionService(
    host,
    detectionSession,
    ocr.options.detection,
    ocr.options.debugging,
    'opencv',
  )
  ocr.recognitor = new BaseRecognitionService(
    host,
    recognitionSession,
    ocr.options.recognition,
    ocr.options.debugging,
    'opencv',
  )
  return ocr
}

const state: {service: Promise<OcrService> | null; queue: Promise<unknown>; disposing: boolean} = {
  service: null,
  queue: Promise.resolve(),
  disposing: false,
}

function paddleService(): Promise<OcrService> {
  state.service ??= createService().catch((error: unknown) => {
    state.service = null
    throw error
  })
  return state.service
}

function serialized<Result>(task: () => Promise<Result>): Promise<Result> {
  const run = state.queue.then(task)
  state.queue = run.catch(() => undefined)
  return run
}

async function recognize(input: {raster: Raster}): Promise<OcrLine[]> {
  const {raster} = input
  const service = await paddleService()
  const png = Uint8Array.from(encodePng(raster)).buffer
  const {results} = RecognizedSchema.parse(await service.recognize(png, {flatten: true, noCache: true}))
  return results.map((result) => ({
    text: result.text,
    confidence: result.confidence,
    box: {x: result.box.x, y: result.box.y, w: result.box.width, h: result.box.height},
  }))
}

export const paddleReader: TextReader = {
  name: 'paddle',
  read: ({raster}) => {
    if (state.disposing) return Promise.reject(new Error('the OCR reader is shutting down'))
    return serialized(() => recognize({raster}))
  },
}

async function destroyService(): Promise<void> {
  const pending = state.service
  state.service = null
  const service = await pending?.catch(() => null)
  await service?.destroy()
}

export async function destroyPaddle(): Promise<void> {
  state.disposing = true
  await serialized(destroyService).finally(() => {
    state.disposing = false
  })
}

const WRAPPERS: Record<string, string> = {'[': ']', '{': '}'}
const LOREM = 'lorem ipsum'
const GROUPING = new Set([',', '.', ' ', ' ', ' ', "'"])
const SIGNS = new Set(['+', '-', '−'])
const DATE_SEPARATORS = new Set(['/', '-', '.'])
const IDENTIFIER_JOINS = new Set(['-', '_', '#', '/'])
const CURRENCY_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x24, 0x24],
  [0xa2, 0xa5],
  [0x20a0, 0x20cf],
]
const DATE_PARTS = 3
const PERCENT = '%'

function codePoint(character: string): number {
  return character.codePointAt(0) ?? 0
}

function isDigit(character: string): boolean {
  const point = codePoint(character)
  return point >= 0x30 && point <= 0x39
}

function isLetter(character: string): boolean {
  return character.toLowerCase() !== character.toUpperCase()
}

function isCurrency(character: string): boolean {
  const point = codePoint(character)
  return CURRENCY_RANGES.some(([low, high]) => point >= low && point <= high)
}

function unsigned(text: string): string {
  const [first = ''] = text
  return SIGNS.has(first) ? text.slice(1) : text
}

function isNumber(text: string): boolean {
  const characters = [...unsigned(text)]
  const [first = '', ...rest] = characters
  const last = characters.at(-1) ?? ''
  return isDigit(first) && isDigit(last) && rest.every((character) => isDigit(character) || GROUPING.has(character))
}

function isCurrencyAmount(text: string): boolean {
  const characters = [...unsigned(text)]
  const [first = ''] = characters
  const last = characters.at(-1) ?? ''
  if (isCurrency(first)) return isNumber(characters.slice(1).join('').trim())
  if (isCurrency(last)) return isNumber(characters.slice(0, -1).join('').trim())
  return false
}

function isPercentage(text: string): boolean {
  return text.endsWith(PERCENT) && isNumber(text.slice(0, -1).trim())
}

function isDate(text: string): boolean {
  const characters = [...text]
  const separator = characters.find((character) => DATE_SEPARATORS.has(character))
  if (separator === undefined) return false
  const fields = text.split(separator)
  return fields.length === DATE_PARTS && fields.every((field) => field !== '' && [...field].every(isDigit))
}

function isIdentifier(text: string): boolean {
  const characters = [...text]
  const allowed = characters.every(
    (character) => isDigit(character) || isLetter(character) || IDENTIFIER_JOINS.has(character),
  )
  return allowed && characters.some(isDigit) && characters.some((character) => !isDigit(character))
}

function isPlaceholder(text: string): boolean {
  const [first = ''] = text
  const closing = WRAPPERS[first]
  if (closing !== undefined && text.length > 2 && text.endsWith(closing)) return true
  return text.toLowerCase().includes(LOREM)
}

function isData(text: string): boolean {
  return isCurrencyAmount(text) || isPercentage(text) || isDate(text) || isNumber(text) || isIdentifier(text)
}

const roleRules: RoleRules = ({text}) => {
  const trimmed = text.trim()
  if (isPlaceholder(trimmed)) return {role: 'placeholder', confidence: 1}
  if (isData(trimmed)) return {role: 'data', confidence: 1}
  return {role: 'unknown', confidence: 0}
}

const RECTANGULAR = 0.85
const FILLED = 0.6
const DOMINANT = 0.5
const OUTLINE_DOMINANT = 0.9
const LARGE_SIDE = 64
const CHILD_INSET = 2
const MAX_DEPTH = 6
const MAX_BORDER = 4

type Found = FlatBox | FlatImage
type Level = {raster: Raster; region: Box; background: Rgb; depth: number; text: Box[]; marks: Box[]}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function medianRgb(input: {raster: Raster; indices: number[]}): Rgb {
  const {raster, indices} = input
  const channel = (offset: number) => median(indices.map((index) => raster.data[index * 4 + offset] ?? 0))
  return [channel(0), channel(1), channel(2)]
}

function boxIndices(input: {raster: Raster; box: Box}): number[] {
  const {raster, box} = input
  const indices: number[] = []
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) indices.push(y * raster.width + x)
  }
  return indices
}

function rowIndices(input: {width: number; y: number; x0: number; x1: number}): number[] {
  const {width, y, x0, x1} = input
  return Array.from({length: Math.max(0, x1 - x0)}, (_, offset) => y * width + x0 + offset)
}

function columnIndices(input: {width: number; x: number; y0: number; y1: number}): number[] {
  const {width, x, y0, y1} = input
  return Array.from({length: Math.max(0, y1 - y0)}, (_, offset) => (y0 + offset) * width + x)
}

function borderIndices(input: {width: number; box: Box}): number[] {
  const {width, box} = input
  const right = box.x + box.w
  const bottom = box.y + box.h
  return [
    ...rowIndices({width, y: box.y, x0: box.x, x1: right}),
    ...rowIndices({width, y: bottom - 1, x0: box.x, x1: right}),
    ...columnIndices({width, x: box.x, y0: box.y, y1: bottom}),
    ...columnIndices({width, x: right - 1, y0: box.y, y1: bottom}),
  ]
}

function inset(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x + by, y: box.y + by, w: Math.max(0, box.w - 2 * by), h: Math.max(0, box.h - 2 * by)}
}

function share(input: {raster: Raster; indices: number[]; color: Rgb}): number {
  const {raster, indices, color} = input
  if (indices.length === 0) return 0
  const close = indices.filter(
    (index) => rgbDistance({a: rgbAt({raster, index}), b: color}) <= TOLERANCES.segmentDistance,
  ).length
  return close / indices.length
}

function intersect(input: {box: Box; region: Box}): Box | null {
  const {box, region} = input
  const x = Math.max(box.x, region.x)
  const y = Math.max(box.y, region.y)
  const w = Math.min(box.x + box.w, region.x + region.w) - x
  const h = Math.min(box.y + box.h, region.y + region.h) - y
  return w > 0 && h > 0 ? {x, y, w, h} : null
}

function threshold(level: Level): Uint8Array {
  const {raster, region, background} = level
  const mask = new Uint8Array(region.w * region.h)
  for (let y = 0; y < region.h; y += 1) {
    for (let x = 0; x < region.w; x += 1) {
      const pixel = rgbAt({raster, index: (region.y + y) * raster.width + region.x + x})
      mask[y * region.w + x] = rgbDistance({a: pixel, b: background}) > TOLERANCES.segmentDistance ? 1 : 0
    }
  }
  level.marks.forEach((glyphs) => {
    const area = intersect({box: glyphs, region})
    if (area === null) return
    const local = {x: area.x - region.x, y: area.y - region.y, w: area.w, h: area.h}
    const ring = borderIndices({width: region.w, box: local})
    const on = ring.filter((index) => mask[index] === 1).length
    const value = on * 2 >= ring.length ? 1 : 0
    for (let y = local.y; y < local.y + local.h; y += 1)
      mask.fill(value, y * region.w + local.x, y * region.w + local.x + local.w)
  })
  return mask
}

function spans(input: {region: Box; candidate: Box}): boolean {
  const {region, candidate} = input
  return candidate.w >= region.w - 2 && candidate.h >= region.h - 2
}

function large(box: Box): boolean {
  return box.w >= TOLERANCES.unmatchedMinimum && box.h >= TOLERANCES.unmatchedMinimum
}

function solidity(input: {labels: Int32Array; width: number; region: Region}): number {
  const {labels, width, region} = input
  const {box, label} = region
  let filled = 0
  for (let y = box.y; y < box.y + box.h; y += 1) {
    let first = -1
    let last = -1
    for (let x = box.x; x < box.x + box.w; x += 1) {
      if (labels[y * width + x] !== label) continue
      if (first < 0) first = x
      last = x
    }
    if (first >= 0) filled += last - first + 1
  }
  return filled / (box.w * box.h)
}

function contains(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

function candidates(level: Level): {labels: Int32Array; regions: Region[]} {
  const {region} = level
  const mask = threshold(level)
  const first = labelRegions({mask, width: region.w, height: region.h})
  const spanning = first.regions.some(
    (found) => large(found.box) && spans({region: {...region, x: 0, y: 0}, candidate: found.box}),
  )
  const labelled = spanning
    ? labelRegions({mask: openMask({mask, width: region.w, height: region.h}), width: region.w, height: region.h})
    : first
  const sized = labelled.regions.filter(
    (found) => large(found.box) && !spans({region: {...region, x: 0, y: 0}, candidate: found.box}),
  )
  const outer = sized.filter(
    (found) =>
      !sized.some(
        (other) =>
          other !== found &&
          contains({outer: other.box, inner: found.box}) &&
          other.box.w * other.box.h > found.box.w * found.box.h,
      ),
  )
  return {labels: labelled.labels, regions: outer}
}

type Side = 'left' | 'top' | 'right' | 'bottom'

function reaches(input: {raster: Raster; box: Box; region: Box; side: Side}): boolean {
  const {raster, box, region, side} = input
  switch (side) {
    case 'left':
      return box.x <= region.x && box.x > 0
    case 'top':
      return box.y <= region.y && box.y > 0
    case 'right':
      return box.x + box.w >= region.x + region.w && box.x + box.w < raster.width
    case 'bottom':
      return box.y + box.h >= region.y + region.h && box.y + box.h < raster.height
  }
}

function outside(input: {raster: Raster; box: Box; side: Side}): number[] {
  const {raster, box, side} = input
  const {width} = raster
  switch (side) {
    case 'left':
      return columnIndices({width, x: box.x - 1, y0: box.y, y1: box.y + box.h})
    case 'top':
      return rowIndices({width, y: box.y - 1, x0: box.x, x1: box.x + box.w})
    case 'right':
      return columnIndices({width, x: box.x + box.w, y0: box.y, y1: box.y + box.h})
    case 'bottom':
      return rowIndices({width, y: box.y + box.h, x0: box.x, x1: box.x + box.w})
  }
}

function widened(input: {box: Box; side: Side}): Box {
  const {box, side} = input
  switch (side) {
    case 'left':
      return {...box, x: box.x - 1, w: box.w + 1}
    case 'top':
      return {...box, y: box.y - 1, h: box.h + 1}
    case 'right':
      return {...box, w: box.w + 1}
    case 'bottom':
      return {...box, h: box.h + 1}
  }
}

const SIDES: Side[] = ['left', 'top', 'right', 'bottom']

function grow(input: {raster: Raster; box: Box; region: Box; fill: Rgb}): Box {
  const {raster, region, fill} = input
  const steps = Array.from({length: CHILD_INSET}, () => SIDES).flat()
  return steps.reduce((box, side) => {
    if (!reaches({raster, box, region, side})) return box
    const fits = share({raster, indices: outside({raster, box, side}), color: fill}) >= DOMINANT
    return fits ? widened({box, side}) : box
  }, input.box)
}

function edgeColor(input: {raster: Raster; box: Box; depth: number}): Rgb[] {
  const {raster, box, depth} = input
  const right = box.x + box.w
  const bottom = box.y + box.h
  return [
    rowIndices({width: raster.width, y: box.y + depth, x0: box.x, x1: right}),
    rowIndices({width: raster.width, y: bottom - 1 - depth, x0: box.x, x1: right}),
    columnIndices({width: raster.width, x: box.x + depth, y0: box.y, y1: bottom}),
    columnIndices({width: raster.width, x: right - 1 - depth, y0: box.y, y1: bottom}),
  ].map((indices) => medianRgb({raster, indices}))
}

function stepsOut(input: {raster: Raster; box: Box; fill: Rgb; depth: number}): Rgb | null {
  const sides = edgeColor(input)
  const stepped = sides.every((color) => rgbDistance({a: color, b: input.fill}) > TOLERANCES.segmentDistance)
  return stepped ? (sides[0] ?? null) : null
}

function border(input: {raster: Raster; box: Box; fill: Rgb}): Border | null {
  const {raster, box, fill} = input
  const color = stepsOut({raster, box, fill, depth: 0})
  if (color === null) return null
  const width = Array.from({length: MAX_BORDER - 1}, (_, index) => index + 1).find(
    (depth) => stepsOut({raster, box, fill, depth}) === null,
  )
  return {width: width ?? MAX_BORDER, color: hex(color)}
}

function imageNode(box: Box): FlatImage {
  return {id: nodeId({kind: 'image', box}), kind: 'image', box, holds: 0, children: []}
}

type Measured = {fill: Rgb; dominant: number; cover: number; plain: boolean}

function measure(input: {level: Level; raw: Box}): Measured {
  const {level, raw} = input
  const {raster, background} = level
  const interior = boxIndices({raster, box: inset({box: raw, by: TOLERANCES.interiorInset})})
  const fill = medianRgb({raster, indices: interior})
  return {
    fill,
    dominant: share({raster, indices: interior, color: fill}),
    cover: inkCoverage({raster, box: raw, background, threshold: TOLERANCES.segmentDistance}),
    plain: rgbDistance({a: fill, b: background}) <= TOLERANCES.segmentDistance,
  }
}

function tooSparse(measured: Measured): boolean {
  const outline = measured.dominant >= OUTLINE_DOMINANT && measured.plain
  return measured.cover < FILLED && !outline
}

function boxNode(input: {level: Level; raw: Box; fill: Rgb; edge: Border | null; gradient: boolean}): Found[] {
  const {level, raw, fill, edge, gradient} = input
  const {raster, region, background, depth} = level
  const box = depth > 1 ? grow({raster, box: raw, region, fill}) : raw
  const node: FlatBox = {
    id: nodeId({kind: 'box', box}),
    kind: 'box',
    box,
    border: edge,
    radius: cornerRadius({raster, box, inside: fill, outside: background}),
    children: [],
  }
  const inner = inset({box, by: CHILD_INSET})
  const found = gradient
    ? []
    : children({raster, region: inner, background: fill, depth: depth + 1, text: level.text, marks: level.marks})
  const empty =
    !found.some((child) => child.kind === 'box') && !level.text.some((text) => overlapping({a: box, b: text}))
  if (empty && iconSized(box)) return [imageNode(box), ...found]
  return [node, ...found]
}

function classify(input: {level: Level; raw: Box; rectangular: boolean}): Found[] {
  const {level, raw, rectangular} = input
  const wide = raw.w >= LARGE_SIDE && raw.h >= LARGE_SIDE
  if (!rectangular) return wide ? [imageNode(raw)] : []
  const measured = measure({level, raw})
  if (tooSparse(measured)) return wide && measured.dominant < DOMINANT ? [imageNode(raw)] : []
  const edge = border({raster: level.raster, box: raw, fill: measured.fill})
  const gradient = measured.dominant < DOMINANT && gradientFill({level, raw})
  if (measured.dominant < DOMINANT && edge === null && !gradient) return [imageNode(raw)]
  return boxNode({level, raw, fill: measured.fill, edge, gradient})
}

function gradientFill(input: {level: Level; raw: Box}): boolean {
  const {level, raw} = input
  const holes = level.text.filter((box) => overlapping({a: box, b: raw}))
  const box = inset({box: raw, by: TOLERANCES.interiorInset})
  return fillShape({raster: level.raster, box, holes, color: COLOR_METRICS.ciede2000}).kind === 'gradient'
}

function children(level: Level): Found[] {
  const {region, depth} = level
  if (depth > MAX_DEPTH || !large(region)) return []
  const {labels, regions} = candidates(level)
  return regions.flatMap((found) => {
    const raw = {x: found.box.x + region.x, y: found.box.y + region.y, w: found.box.w, h: found.box.h}
    const rectangular = solidity({labels, width: region.w, region: found}) >= RECTANGULAR
    return classify({level, raw, rectangular})
  })
}

const thresholdSegmenter: Segmenter = {
  name: 'threshold',
  segment: ({raster, nodes}) => {
    const page = {x: 0, y: 0, w: raster.width, h: raster.height}
    const background = medianRgb({raster, indices: borderIndices({width: raster.width, box: page})})
    const haloed = (node: DesignNode): Box => expand({box: node.box, by: TOLERANCES.glyphHalo})
    const text = nodes.filter((node) => node.kind === 'text').map(haloed)
    const marks = nodes.filter((node) => node.kind !== 'box').map(haloed)
    return Promise.resolve(children({raster, region: page, background, depth: 1, text, marks}))
  },
}

const TEXT_ENRICHER = 'text'

const UPSAMPLE = 2

function upsampled(raster: Raster): Raster {
  const width = raster.width * UPSAMPLE
  const height = raster.height * UPSAMPLE
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (Math.floor(y / UPSAMPLE) * raster.width + Math.floor(x / UPSAMPLE)) * 4
      data.set(raster.data.subarray(from, from + 4), (y * width + x) * 4)
    }
  }
  return {width, height, data}
}

function scaled(input: {line: OcrLine; by: number; dy: number}): OcrLine {
  const {line, by, dy} = input
  const {box} = line
  return {...line, box: {x: box.x / by, y: box.y / by + dy, w: box.w / by, h: box.h / by}}
}

function onSeam(input: {line: OcrLine; tile: Box; raster: Raster}): boolean {
  const {line, tile, raster} = input
  const top = tile.y > 0 && line.box.y <= tile.y + 1
  const bottom = tile.y + tile.h < raster.height && line.box.y + line.box.h >= tile.y + tile.h - 1
  return top || bottom
}

async function readTile(input: {raster: Raster; tile: Box; reader: TextReader}): Promise<OcrLine[]> {
  const {raster, tile, reader} = input
  const part = crop({raster, box: tile}).raster
  const lines = await reader.read({raster: part})
  const small = lines.length > 0 && median(lines.map((line) => line.box.h)) < TOLERANCES.ocrUpsampleBelowPx
  const read = small
    ? (await reader.read({raster: upsampled(part)})).map((line) => scaled({line, by: UPSAMPLE, dy: tile.y}))
    : lines.map((line) => scaled({line, by: 1, dy: tile.y}))
  return read.filter((line) => !onSeam({line, tile, raster}))
}

function tiles(raster: Raster): Box[] {
  const height = Math.min(raster.height, TOLERANCES.ocrTileHeight)
  const stride = height - TOLERANCES.ocrTileOverlap
  const count = raster.height <= height ? 1 : Math.ceil((raster.height - height) / stride) + 1
  return range(count).map((index) => {
    const y = Math.min(index * stride, raster.height - height)
    return {x: 0, y, w: raster.width, h: height}
  })
}

function joinsRow(input: {row: OcrLine[]; line: OcrLine}): boolean {
  const last = input.row.at(-1)
  if (last === undefined) return false
  const {box} = input.line
  const gap = box.x - (last.box.x + last.box.w)
  return sameLine({a: last.box, b: box}) && gap < Math.max(last.box.h, box.h)
}

function rows(lines: OcrLine[]): OcrLine[][] {
  return lines
    .toSorted((a, b) => a.box.x - b.box.x)
    .reduce<OcrLine[][]>((found, line) => {
      const row = found.find((candidate) => joinsRow({row: candidate, line}))
      if (row === undefined) return [...found, [line]]
      row.push(line)
      return found
    }, [])
}

function textNode(row: OcrLine[]): FlatText {
  const text = row.map((line) => line.text.trim()).join(' ')
  const box = union(row.map((line) => line.box))
  return {
    id: nodeId({kind: 'text', box, text}),
    kind: 'text',
    box,
    text,
    lines: row,
    confidence: Math.min(...row.map((line) => line.confidence)),
    children: [],
  }
}

const textEnricher: Enricher = {
  name: TEXT_ENRICHER,
  run: async ({nodes, raster, tools}) => {
    const read = await Promise.all(tiles(raster).map((tile) => readTile({raster, tile, reader: tools.reader})))
    const lines = read
      .flat()
      .filter((line) => line.confidence >= TOLERANCES.ocrConfidenceFloor && line.text.trim() !== '')
    const latin = latinDesign(lines)
    const kept = lines
      .flatMap((line) => lineParts({line, raster, latin}))
      .reduce<Part[]>(
        (found, part) =>
          found.some((other) => overlapping({a: other.line.box, b: part.line.box})) ? found : [...found, part],
        [],
      )
    const [glyphs, words] = partition(kept, (part) => part.glyph)
    return [
      ...nodes,
      ...rows(words.map((part) => part.line)).map(textNode),
      ...glyphs.map((part) => imageNode(part.line.box)),
    ]
  },
}

type Part = {line: OcrLine; glyph: boolean}

const LATIN_END = 0x24f
const LATIN_SHARE = 0.9
const PUNCTUATION_START = 0x2000
const PUNCTUATION_END = 0x206f
const GLYPH_LENGTH = 2
const UNSURE_LENGTH = 3

function inked(character: string): boolean {
  return character.trim() !== ''
}

function latinDesign(lines: OcrLine[]): boolean {
  const characters = lines.flatMap((line) => Array.from(line.text)).filter(inked)
  const latin = characters.filter((character) => !isForeign(character)).length
  return characters.length > 0 && latin >= characters.length * LATIN_SHARE
}

function lineParts(input: {line: OcrLine; raster: Raster; latin: boolean}): Part[] {
  const {line, raster, latin} = input
  const characters = Array.from(line.text)
  const first = characters.findIndex(inked)
  const last = characters.findLastIndex(inked) + 1
  const piece = (span: {from: number; to: number}): OcrLine => ({
    text: characters.slice(span.from, span.to).join('').trim(),
    confidence: line.confidence,
    box: trimToInk({raster, box: shareBox({box: line.box, ...span, count: characters.length})}),
  })
  const whole = piece({from: 0, to: characters.length})
  const blanks = range(first, last).filter((index) => !inked(characters[index] ?? ''))
  const firstBlank = blanks[0]
  const lastBlank = blanks.at(-1)
  if (firstBlank === undefined || lastBlank === undefined)
    return [{line: whole, glyph: isGlyph({run: whole, whole, latin})}]
  const lead = piece({from: 0, to: firstBlank + 1})
  const trail = piece({from: lastBlank, to: characters.length})
  const leading = isGlyph({run: lead, whole, latin})
  const trailing = isGlyph({run: trail, whole, latin})
  const rest = piece({from: leading ? firstBlank + 1 : 0, to: trailing ? lastBlank : characters.length})
  if (rest.text === '') return [{line: whole, glyph: true}]
  return [
    ...(leading ? [{line: lead, glyph: true}] : []),
    {line: rest, glyph: false},
    ...(trailing ? [{line: trail, glyph: true}] : []),
  ]
}

function shareBox(input: {box: Box; from: number; to: number; count: number}): Box {
  const {box, from, to, count} = input
  return {x: box.x + (box.w * from) / count, y: box.y, w: (box.w * (to - from)) / count, h: box.h}
}

function isGlyph(input: {run: OcrLine; whole: OcrLine; latin: boolean}): boolean {
  const {run, whole, latin} = input
  const characters = Array.from(run.text)
  if (characters.length > GLYPH_LENGTH || characters.every(isSign)) return false
  const foreign = latin && characters.some(isForeign)
  const small = characters.length === 1 && run.box.w < TOLERANCES.iconSide && run.box.h < TOLERANCES.iconSide
  const unsure = Array.from(whole.text).length < UNSURE_LENGTH && whole.confidence < TOLERANCES.iconTextFloor
  return foreign || small || unsure
}

function isForeign(character: string): boolean {
  const point = codePoint(character)
  return point > LATIN_END && (point < PUNCTUATION_START || point > PUNCTUATION_END)
}

function isSign(character: string): boolean {
  return character === PERCENT || isCurrency(character)
}

function surface(box: Box): number {
  return box.w * box.h
}

function within(input: {node: Flat; nodes: Flat[]}): Flat {
  const {node, nodes} = input
  const [smallest] = nodes
    .filter(
      (other) =>
        other.kind === 'box' &&
        other.id !== node.id &&
        surface(other.box) > surface(node.box) &&
        encloses({outer: other.box, inner: node.box}),
    )
    .toSorted((a, b) => surface(a.box) - surface(b.box))
  return smallest === undefined ? node : {...node, within: smallest.id}
}

const segmentEnricher: Enricher = {
  name: 'segment',
  run: async ({nodes, raster, tools}) => {
    const found = await tools.segmenter.segment({raster, nodes})
    const kept = pictured({nodes: [...nodes, ...found].filter((node) => !glyphNoise(node)), raster})
    return kept.map((node) => within({node, nodes: kept}))
  },
}

function glyphNoise(node: Flat): boolean {
  return node.kind === 'image' && node.box.w < TOLERANCES.glyphNoise && node.box.h < TOLERANCES.glyphNoise
}

function isPicture(node: Flat): boolean {
  return node.kind === 'image' && node.box.w >= TOLERANCES.iconSlotSide && node.box.h >= TOLERANCES.iconSlotSide
}

function pictured(input: {nodes: Flat[]; raster: Raster}): Flat[] {
  const {nodes, raster} = input
  const pictures = nodes.filter(isPicture).toSorted((a, b) => surface(a.box) - surface(b.box))
  const ownerOf = (node: Flat): string => {
    if (node.kind !== 'text') return ''
    const image = pictures.find((candidate) => encloses({outer: candidate.box, inner: node.box}))
    if (image === undefined || flatHalo({node, nodes, raster})) return ''
    return image.id
  }
  const owners = nodes.map((node) => ({node, owner: ownerOf(node)}))
  const held = countBy(owners, ({owner}) => owner)
  return owners.flatMap(({node, owner}): Flat[] => {
    if (owner !== '') return []
    if (node.kind !== 'image') return [node]
    return [{...node, holds: held[node.id] ?? 0}]
  })
}

function flatHalo(input: {node: Flat; nodes: Flat[]; raster: Raster}): boolean {
  const {node, nodes, raster} = input
  const band = expand({box: node.box, by: TOLERANCES.glyphHalo})
  const others = nodes.filter(
    (other) =>
      other.id !== node.id && overlapping({a: other.box, b: band}) && !encloses({outer: other.box, inner: node.box}),
  )
  const indices = haloIndices({raster, box: node.box, others: others.map((other) => other.box)})
  if (indices.length === 0) return false
  return share({raster, indices, color: medianRgb({raster, indices})}) >= OUTLINE_DOMINANT
}

function haloIndices(input: {raster: Raster; box: Box; others: Box[]}): number[] {
  const {raster, box, others} = input
  const band = crop({raster, box, margin: TOLERANCES.glyphHalo}).box
  const covered = [box, ...others].map((other) => crop({raster, box: other}).box)
  return range(band.y, band.y + band.h).flatMap((y) =>
    range(band.x, band.x + band.w).flatMap((x) =>
      covered.some((area) => covers({area, x, y})) ? [] : [y * raster.width + x],
    ),
  )
}

function covers(input: {area: Box; x: number; y: number}): boolean {
  const {area, x, y} = input
  return x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h
}

const rolesEnricher: Enricher = {
  name: 'roles',
  run: ({nodes, tools}) =>
    Promise.resolve(
      nodes.map((node) => {
        if (node.kind !== 'text' || node.role !== undefined) return node
        const neighbours = nodes.flatMap((other) =>
          other.kind === 'text' && other.id !== node.id && other.within === node.within ? [other.text] : [],
        )
        return {...node, role: tools.roles({text: node.text, neighbours}).role}
      }),
    ),
}

const colorEnricher: Enricher = {
  name: 'color',
  run: ({nodes, raster}) =>
    Promise.resolve(
      nodes.map((node) => {
        if (node.kind !== 'box' || node.paint !== undefined) return node
        const color = COLOR_METRICS.ciede2000
        const {background} = sampledFills({raster, box: node.box, glyphs: [node.box], color})
        const holes = nodes
          .filter((other) => other.within === node.id)
          .map((other) => expand({box: other.box, by: TOLERANCES.glyphHalo}))
        const shape = fillShape({
          raster,
          box: inset({box: node.box, by: TOLERANCES.geometryPx + node.radius}),
          holes,
          color,
        })
        if (shape.kind === 'picture' && holes.length === 0) return imageNode(node.box)
        if (shape.kind === 'gradient') return {...node, paint: {background, gradient: shape.gradient}}
        return {...node, paint: {background}}
      }),
    ),
}

const regionsEnricher: Enricher = {
  name: 'regions',
  run: (input) => {
    const {scale} = input
    const nodes = withoutTwins(input.nodes)
    const [pictures, members] = partition(
      nodes.filter((node) => node.within === undefined),
      (node) => node.kind === 'image',
    )
    const {seats, regions} = carve({
      members,
      parent: undefined,
      along: 'y',
      depth: 1,
      scale,
    })
    const placed = pictures.map((shown) => ({id: shown.id, within: holder({box: shown.box, regions})}))
    const holding = new Set(placed.map((seat) => seat.within))
    const flanked = regions
      .filter((region) => holding.has(region.id))
      .reduce<Carving>((carving, region) => beside({carving, region, nodes, scale}), {
        seats: [...seats, ...placed],
        regions,
      })
    const parents = new Map(flanked.seats.map((seat) => [seat.id, seat.within]))
    return Promise.resolve([
      ...nodes.map((node) => {
        const parent = parents.get(node.id)
        return parent === undefined ? node : {...node, within: parent}
      }),
      ...grown({carving: flanked, nodes}),
    ])
  },
}

export function withoutTwins(nodes: Flat[]): Flat[] {
  const folded = nodes.reduce<{kept: Flat[]; into: Record<string, string>}>(
    (found, node) => {
      const twin = found.kept.find((other) => twins({a: other, b: node}))
      if (twin === undefined) return {...found, kept: [...found.kept, node]}
      return {kept: found.kept, into: {...found.into, [node.id]: twin.id}}
    },
    {kept: [], into: {}},
  )
  return folded.kept.map((node) => {
    const parent = node.within === undefined ? undefined : folded.into[node.within]
    return parent === undefined ? node : {...node, within: parent}
  })
}

function twins(input: {a: Flat; b: Flat}): boolean {
  const {a, b} = input
  if (a.kind !== b.kind || a.within !== b.within) return false
  if (a.kind === 'text' && b.kind === 'text' && a.text.trim() !== b.text.trim()) return false
  const near = (edge: (box: Box) => number): boolean => Math.abs(edge(a.box) - edge(b.box)) <= TOLERANCES.geometryPx
  return [(box: Box) => box.x, (box: Box) => box.y, (box: Box) => box.x + box.w, (box: Box) => box.y + box.h].every(
    near,
  )
}

type Along = 'x' | 'y'
type Seat = {id: string; within: string | undefined}
type Carving = {seats: Seat[]; regions: FlatBox[]}

const REGION_DEPTH = 3

function carve(input: {
  members: Flat[]
  parent: string | undefined
  along: Along
  depth: number
  scale: number
}): Carving {
  const {members, parent, along, depth, scale} = input
  const gap = (parent === undefined ? TOLERANCES.sectionGap : TOLERANCES.regionGap) * scale
  const seated: Carving = {seats: members.map((node) => ({id: node.id, within: parent})), regions: []}
  if (depth > REGION_DEPTH || members.length < 2) return seated
  const groups = absorbed({groups: bands({members, along, gap}), along})
  const next: Along = along === 'y' ? 'x' : 'y'
  if (groups.length < 2) return carve({...input, along: next, depth: depth + 1})
  const carvings = groups.map((group): Carving => {
    if (group.length < 2) return {seats: group.map((node) => ({id: node.id, within: parent})), regions: []}
    const region = regionNode({members: group, parent})
    const inner = carve({members: group, parent: region.id, along: next, depth: depth + 1, scale})
    return {seats: inner.seats, regions: [region, ...inner.regions]}
  })
  return {
    seats: carvings.flatMap((carving) => carving.seats),
    regions: carvings.flatMap((carving) => carving.regions),
  }
}

function beside(input: {carving: Carving; region: FlatBox; nodes: Flat[]; scale: number}): Carving {
  const {carving, region} = input
  const seated = new Set(carving.seats.filter((seat) => seat.within === region.id).map((seat) => seat.id))
  const direct = [
    ...input.nodes.filter((node) => seated.has(node.id)),
    ...carving.regions.filter((child) => child.within === region.id),
  ]
  const groups = bands({members: direct, along: 'x', gap: TOLERANCES.regionGap * input.scale})
  if (groups.length < 2) return carving
  const known = new Set([...input.nodes, ...carving.regions].map((node) => node.id))
  const wraps = groups
    .filter((group) => group.length > 1)
    .map((group) => {
      const wrap = regionNode({members: group, parent: region.id})
      return {group, wrap: {...wrap, id: nodeId({kind: 'box', box: wrap.box, text: region.id})}}
    })
    .filter(({wrap}) => !known.has(wrap.id))
  const moved = new Map(wraps.flatMap(({group, wrap}) => group.map((node) => [node.id, wrap.id])))
  return {
    seats: carving.seats.map((seat) => ({id: seat.id, within: moved.get(seat.id) ?? seat.within})),
    regions: [
      ...carving.regions.map((child) => {
        const parent = moved.get(child.id)
        return parent === undefined ? child : {...child, within: parent}
      }),
      ...wraps.map(({wrap}) => wrap),
    ],
  }
}

function grown(input: {carving: Carving; nodes: Flat[]}): FlatBox[] {
  const {carving} = input
  const boxes = new Map(input.nodes.map((node) => [node.id, node.box]))
  const members = groupBy(carving.seats, (seat) => seat.within ?? '')
  const nested = groupBy(carving.regions, (region) => region.within ?? '')
  const span = (visit: {region: FlatBox; seen: Set<string>}): Box => {
    const {region} = visit
    const seen = new Set([...visit.seen, region.id])
    return union([
      region.box,
      ...(members[region.id] ?? []).flatMap((seat) => {
        const box = boxes.get(seat.id)
        return box === undefined ? [] : [box]
      }),
      ...(nested[region.id] ?? []).filter((child) => !seen.has(child.id)).map((child) => span({region: child, seen})),
    ])
  }
  return carving.regions.map((region) => ({...region, box: span({region, seen: new Set()})}))
}

function bandStart(input: {box: Box; along: Along}): number {
  return input.along === 'y' ? input.box.y : input.box.x
}

function bandEnd(input: {box: Box; along: Along}): number {
  return input.along === 'y' ? input.box.y + input.box.h : input.box.x + input.box.w
}

function bands(input: {members: Flat[]; along: Along; gap: number}): Flat[][] {
  const {along, gap} = input
  return input.members
    .toSorted((a, b) => bandStart({box: a.box, along}) - bandStart({box: b.box, along}))
    .reduce<{groups: Flat[][]; end: number}>(
      (sweep, node) => {
        const last = sweep.groups.at(-1)
        if (last === undefined || bandStart({box: node.box, along}) - sweep.end >= gap) {
          return {groups: [...sweep.groups, [node]], end: bandEnd({box: node.box, along})}
        }
        last.push(node)
        return {groups: sweep.groups, end: Math.max(sweep.end, bandEnd({box: node.box, along}))}
      },
      {groups: [], end: 0},
    ).groups
}

function absorbed(input: {groups: Flat[][]; along: Along}): Flat[][] {
  const {groups, along} = input
  const index = groups.findIndex((group) => group.length === 1 && group[0]?.kind !== 'box')
  const lone = groups[index]
  if (groups.length < 2 || lone === undefined) return groups
  const span = union(lone.map((node) => node.box))
  const before = groups[index - 1]
  const after = groups[index + 1]
  const gapBefore =
    before === undefined
      ? Infinity
      : bandStart({box: span, along}) - bandEnd({box: union(before.map((node) => node.box)), along})
  const gapAfter =
    after === undefined
      ? Infinity
      : bandStart({box: union(after.map((node) => node.box)), along}) - bandEnd({box: span, along})
  const into = gapBefore <= gapAfter ? index - 1 : index + 1
  const merged = groups.flatMap((group, position) => {
    if (position === index) return []
    if (position === into) return [[...group, ...lone]]
    return [group]
  })
  return absorbed({groups: merged, along})
}

function holder(input: {box: Box; regions: FlatBox[]}): string | undefined {
  const [best] = input.regions
    .map((region) => {
      const shared = intersect({box: input.box, region: region.box})
      return {
        region,
        area: shared === null ? 0 : surface(shared),
        distance: edgeDistance({a: input.box, b: region.box}),
      }
    })
    .toSorted((a, b) => b.area - a.area || a.distance - b.distance || surface(a.region.box) - surface(b.region.box))
  return best?.region.id
}

function edgeDistance(input: {a: Box; b: Box}): number {
  const {a, b} = input
  const across = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w))
  const down = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h))
  return Math.hypot(across, down)
}

function regionNode(input: {members: Flat[]; parent: string | undefined}): FlatBox {
  const box = union(input.members.map((node) => node.box))
  const node: FlatBox = {id: nodeId({kind: 'box', box}), kind: 'box', box, border: null, radius: 0, children: []}
  return input.parent === undefined ? node : {...node, within: input.parent}
}

type FillShape = {kind: 'solid'} | {kind: 'picture'} | {kind: 'gradient'; gradient: DesignGradient}
type Axis = DesignGradient['axis']

const SOLID: FillShape = {kind: 'solid'}
const PICTURE: FillShape = {kind: 'picture'}
const MIN_LINES = 2

function fillShape(input: {raster: Raster; box: Box; holes: Box[]; color: ColorMetric}): FillShape {
  const {raster, box, holes, color} = input
  if (box.w < MIN_LINES || box.h < MIN_LINES) return SOLID
  const mask = boxMask({boxes: holes, area: box})
  const rowMeans = lineMeans({raster, area: box, mask, axis: 'vertical'})
  const columnMeans = lineMeans({raster, area: box, mask, axis: 'horizontal'})
  const vertical = varies({means: rowMeans, color})
  const horizontal = varies({means: columnMeans, color})
  if (!vertical && !horizontal) return SOLID
  if (vertical && horizontal) return PICTURE
  const axis: Axis = vertical ? 'vertical' : 'horizontal'
  const means = vertical ? rowMeans : columnMeans
  const from = means[0]
  const to = means.at(-1)
  if (from === undefined || to === undefined || !smooth({means, color})) return PICTURE
  return {kind: 'gradient', gradient: {from, to, axis}}
}

function lineMeans(input: {raster: Raster; area: Box; mask: Uint8Array; axis: Axis}): string[] {
  const {raster, area, mask, axis} = input
  const lines = axis === 'vertical' ? area.h : area.w
  const across = axis === 'vertical' ? area.w : area.h
  return range(lines).flatMap((line) => {
    const total = range(across).reduce(
      (sums, step) => {
        const x = axis === 'vertical' ? step : line
        const y = axis === 'vertical' ? line : step
        if (mask[y * area.w + x] === 1) return sums
        const index = ((area.y + y) * raster.width + area.x + x) * 4
        sums.red += raster.data[index] ?? 0
        sums.green += raster.data[index + 1] ?? 0
        sums.blue += raster.data[index + 2] ?? 0
        sums.count += 1
        return sums
      },
      {red: 0, green: 0, blue: 0, count: 0},
    )
    if (total.count === 0) return []
    return [hex([total.red, total.green, total.blue].map((channel) => Math.round(channel / total.count)))]
  })
}

function varies(input: {means: string[]; color: ColorMetric}): boolean {
  const {means, color} = input
  const first = means[0]
  const last = means.at(-1)
  if (first === undefined || last === undefined) return false
  return color.distance({a: first, b: last}) > TOLERANCES.colorDeltaE
}

function smooth(input: {means: string[]; color: ColorMetric}): boolean {
  const {means, color} = input
  return means.every((mean, index) => {
    const next = means[index + 1]
    return next === undefined || color.distance({a: mean, b: next}) <= TOLERANCES.colorDeltaE
  })
}

const ENRICHERS: Enricher[] = [textEnricher, segmentEnricher, rolesEnricher, colorEnricher, regionsEnricher]

export const TEXT_READERS = {paddle: paddleReader} as const satisfies Record<string, TextReader>

export const SEGMENTERS = {threshold: thresholdSegmenter} as const satisfies Record<string, Segmenter>

export const ROLE_RULES = {rules: roleRules} as const satisfies Record<string, RoleRules>

async function readRaw(input: {storage: Storage; key: string}): Promise<Uint8Array | null> {
  const raw: unknown = await input.storage.getItemRaw(input.key).catch(() => null)
  return raw instanceof Uint8Array ? new Uint8Array(raw) : null
}

async function readModel(input: {storage: Storage; key: string}): Promise<Uint8Array> {
  const bytes = await readRaw(input)
  if (bytes === null) throw new Error('the OCR model files could not be read')
  return bytes
}

type Region = ReturnType<typeof labelRegions>['regions'][number]

function inkCoverage(input: {raster: Raster; box: Box; background: Rgb; threshold: number}): number {
  const {raster, box, background, threshold} = input
  const area = box.w * box.h
  if (area <= 0) return 0
  let covered = 0
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      if (rgbDistance({a: rgbAt({raster, index: y * raster.width + x}), b: background}) > threshold) covered += 1
    }
  }
  return covered / area
}

function cornerRadius(input: {raster: Raster; box: Box; inside: Rgb; outside: Rgb}): number {
  const {raster, box, inside, outside} = input
  const limit = Math.floor(Math.min(box.w, box.h) / 2)
  const right = box.x + box.w - 1
  const bottom = box.y + box.h - 1
  const corners = [
    {corner: {x: box.x, y: box.y}, step: {x: 1, y: 1}},
    {corner: {x: right, y: box.y}, step: {x: -1, y: 1}},
    {corner: {x: box.x, y: bottom}, step: {x: 1, y: -1}},
    {corner: {x: right, y: bottom}, step: {x: -1, y: -1}},
  ]
  const depths = corners
    .map(({corner, step}) => cornerDepth({raster, box, corner, step, inside, outside, limit}))
    .toSorted((a, b) => a - b)
  const median = ((depths[1] ?? 0) + (depths[2] ?? 0)) / 2
  return Math.round(median / DIAGONAL_SHARE)
}

const DIAGONAL_SHARE = 1 - Math.SQRT1_2

function cornerDepth(input: {
  raster: Raster
  box: Box
  corner: {x: number; y: number}
  step: {x: number; y: number}
  inside: Rgb
  outside: Rgb
  limit: number
}): number {
  const {raster, box, corner, step, inside, outside, limit} = input
  let depth = 0
  for (let i = 0; i < limit; i += 1) {
    const x = corner.x + step.x * i
    const y = corner.y + step.y * i
    const fill = fillAt({raster, box, x, y, inside})
    const span = rgbDistance({a: fill, b: outside})
    if (span === 0) return depth
    const covered = Math.min(1, rgbDistance({a: rgbAt({raster, index: y * raster.width + x}), b: outside}) / span)
    depth += 1 - covered
    if (covered >= 1) break
  }
  return depth
}

function fillAt(input: {raster: Raster; box: Box; x: number; y: number; inside: Rgb}): Rgb {
  const {raster, box, x, y, inside} = input
  const inset = TOLERANCES.interiorInset
  if (box.w <= inset * 2 || box.h <= inset * 2) return inside
  const rows = range(box.y + inset, box.y + box.h - inset)
  const columns = range(box.x + inset, box.x + box.w - inset)
  const at = {
    x: clamp(x, box.x + inset, box.x + box.w - inset - 1),
    y: clamp(y, box.y + inset, box.y + box.h - inset - 1),
  }
  const column = lineMedian({raster, indices: rows.map((row) => row * raster.width + at.x)})
  const row = lineMedian({raster, indices: columns.map((across) => at.y * raster.width + across)})
  const channel = (c: 0 | 1 | 2): number => Math.min(255, Math.max(0, column[c] + row[c] - inside[c]))
  return [channel(0), channel(1), channel(2)]
}

function lineMedian(input: {raster: Raster; indices: number[]}): Rgb {
  const {raster, indices} = input
  const channel = (c: number): number => {
    const sorted = indices.map((index) => raster.data[index * 4 + c] ?? 0).toSorted((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
  }
  return [channel(0), channel(1), channel(2)]
}

function openMask(input: {mask: Uint8Array; width: number; height: number}): Uint8Array {
  const {mask, width, height} = input
  const pass = (source: Uint8Array, keep: (count: number) => boolean): Uint8Array => {
    const out = new Uint8Array(source.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let count = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = Math.min(width - 1, Math.max(0, x + dx))
            const ny = Math.min(height - 1, Math.max(0, y + dy))
            count += source[ny * width + nx] ?? 0
          }
        }
        out[y * width + x] = keep(count) ? 1 : 0
      }
    }
    return out
  }
  return pass(
    pass(mask, (count) => count === 9),
    (count) => count > 0,
  )
}

type DesignGradient = NonNullable<Paint['gradient']>

type Segmenter = {name: string; segment(input: {raster: Raster; nodes: DesignNode[]}): Promise<DesignNode[]>}
