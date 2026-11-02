import * as ort from 'onnxruntime-web'
import {existsSync, statSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve, dirname, join} from 'node:path'
import {toolError} from '@conciv/extension'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import type {InferenceSession} from 'onnxruntime-web'
import {Canvas, Contours, cv, ImageProcessor, type CanvasLike} from 'ppu-ocv'
import {CanvasProcessor, CanvasToolkit} from 'ppu-ocv/canvas'
import {z} from 'zod'
import {range} from 'es-toolkit'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {DESIGN_GUIDE, type TargetInput, type TargetResult} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'
import type {
  Border,
  Box,
  BoxNode,
  DesignRuntime,
  Enricher,
  ImageNode,
  OcrLine,
  Raster,
  RoleRules,
  Segmenter,
  TargetAdapter,
  TargetModel,
  TargetNode,
  TextNode,
  TextReader,
} from '../shared/types.js'
import {COLOR_METRICS, sampledFills} from './deltas.js'
import {
  cornerRadius,
  crop,
  decodePng,
  encodePng,
  expand,
  hex,
  inkCoverage,
  labelRegions,
  openMask,
  overlapping,
  rgbAt,
  rgbDistance,
  sameLine,
  trimToInk,
  union,
  type Region,
  type Rgb,
} from './raster.js'

export {trimToInk} from './raster.js'

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const ID_LENGTH = 8

function fnv(text: string): string {
  const hash = [...text].reduce(
    (state, character) => Math.imul(state ^ (character.codePointAt(0) ?? 0), FNV_PRIME) >>> 0,
    FNV_OFFSET,
  )
  return hash.toString(16).padStart(ID_LENGTH, '0')
}

function nodeId(input: {kind: TargetNode['kind']; box: Box; text?: string}): string {
  const {kind, box} = input
  const rounded = [box.x, box.y, box.w, box.h].map(Math.round).join(',')
  return fnv(`${kind}|${rounded}|${input.text ?? ''}`)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngBase64(ref: string): Uint8Array | null {
  const bytes = new Uint8Array(Buffer.from(ref, 'base64'))
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ? bytes : null
}

function unreadableMessage(ref: string): string {
  return `image is neither a PNG file nor PNG base64: ${ref.slice(0, 80)}`
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile()
}

async function readImage(input: {ref: string; cwd: string}): Promise<Uint8Array> {
  const path = resolve(input.cwd, input.ref)
  if (isFile(path)) return new Uint8Array(await readFile(path))
  const bytes = pngBase64(input.ref)
  if (bytes !== null) return bytes
  throw toolError('image-unreadable', {message: unreadableMessage(input.ref)})
}

const imageAdapter: TargetAdapter = {
  kind: 'image',
  accepts: ({ref, cwd}) => isFile(resolve(cwd, ref)) || pngBase64(ref) !== null,
  load: async ({ref, scale, cwd}) => {
    const bytes = await readImage({ref, cwd})
    const raster = decodePng(bytes)
    const viewport = {width: Math.round(raster.width / scale), height: Math.round(raster.height / scale)}
    return {
      id: createHash('sha256').update(bytes).digest('hex').slice(0, 12),
      source: {kind: 'image', ref: isFile(resolve(cwd, ref)) ? ref : 'base64'},
      viewport,
      raster,
      scale,
      root: {id: 'root', box: {x: 0, y: 0, w: viewport.width, h: viewport.height}},
      nodes: [],
    }
  },
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
      return Uint8Array.from(await readFile(source ?? defaultUrl)).buffer
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
  const [detection, recognition, dictionary] = await Promise.all(
    MODEL_FILES.map(async (name) => new Uint8Array(await readFile(join(directory, name)))),
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
  return text.endsWith('%') && isNumber(text.slice(0, -1).trim())
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

type Found = BoxNode | ImageNode
type Level = {raster: Raster; region: Box; background: Rgb; depth: number; text: Box[]}

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
  level.text.forEach((glyphs) => {
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

function imageNode(box: Box): ImageNode {
  return {id: nodeId({kind: 'image', box}), kind: 'image', box}
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

function boxNode(input: {level: Level; raw: Box; fill: Rgb; edge: Border | null}): Found[] {
  const {level, raw, fill, edge} = input
  const {raster, region, background, depth} = level
  const box = depth > 1 ? grow({raster, box: raw, region, fill}) : raw
  const node: BoxNode = {
    id: nodeId({kind: 'box', box}),
    kind: 'box',
    box,
    border: edge,
    radius: cornerRadius({raster, box, inside: fill, outside: background}),
  }
  const inner = inset({box, by: CHILD_INSET})
  return [node, ...children({raster, region: inner, background: fill, depth: depth + 1, text: level.text})]
}

function classify(input: {level: Level; raw: Box; rectangular: boolean}): Found[] {
  const {level, raw, rectangular} = input
  const wide = raw.w >= LARGE_SIDE && raw.h >= LARGE_SIDE
  if (!rectangular) return wide ? [imageNode(raw)] : []
  const measured = measure({level, raw})
  if (tooSparse(measured)) return wide && measured.dominant < DOMINANT ? [imageNode(raw)] : []
  const edge = border({raster: level.raster, box: raw, fill: measured.fill})
  if (measured.dominant < DOMINANT && edge === null) return [imageNode(raw)]
  return boxNode({level, raw, fill: measured.fill, edge})
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
    const text = nodes.flatMap((node) =>
      node.kind === 'text' ? [expand({box: node.box, by: TOLERANCES.glyphHalo})] : [],
    )
    return Promise.resolve(children({raster, region: page, background, depth: 1, text}))
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

function textNode(row: OcrLine[]): TextNode {
  const text = row.map((line) => line.text.trim()).join(' ')
  const box = union(row.map((line) => line.box))
  return {
    id: nodeId({kind: 'text', box, text}),
    kind: 'text',
    box,
    text,
    lines: row,
    confidence: Math.min(...row.map((line) => line.confidence)),
  }
}

const textEnricher: Enricher = {
  name: TEXT_ENRICHER,
  run: async ({model, raster, runtime}) => {
    if (model.nodes.some((node) => node.kind === 'text')) return model.nodes
    const read = await Promise.all(
      tiles(raster).map((tile) => readTile({raster, tile, reader: runtime.comparators.text})),
    )
    const lines = read
      .flat()
      .filter((line) => line.confidence >= TOLERANCES.ocrConfidenceFloor && line.text.trim() !== '')
      .map((line) => ({...line, box: trimToInk({raster, box: line.box})}))
      .reduce<OcrLine[]>(
        (kept, line) => (kept.some((other) => overlapping({a: other.box, b: line.box})) ? kept : [...kept, line]),
        [],
      )
    return [...model.nodes, ...rows(lines).map(textNode)]
  },
}

type Segmentation = 'full' | 'partial'

function surface(box: Box): number {
  return box.w * box.h
}

function holds(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  const slack = TOLERANCES.geometryPx
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.w <= outer.x + outer.w + slack &&
    inner.y + inner.h <= outer.y + outer.h + slack
  )
}

function within(input: {node: TargetNode; nodes: TargetNode[]}): TargetNode {
  const {node, nodes} = input
  const [smallest] = nodes
    .filter(
      (other) =>
        other.kind === 'box' &&
        other.id !== node.id &&
        surface(other.box) > surface(node.box) &&
        holds({outer: other.box, inner: node.box}),
    )
    .toSorted((a, b) => surface(a.box) - surface(b.box))
  return smallest === undefined ? node : {...node, within: smallest.id}
}

export function segmentationQuality(model: Pick<TargetModel, 'nodes' | 'viewport'>): Segmentation {
  const page = model.viewport.width * model.viewport.height
  const covered = model.nodes
    .filter((node) => node.kind === 'image' && node.within === undefined)
    .reduce((sum, node) => sum + surface(node.box), 0)
  return page > 0 && covered / page > TOLERANCES.segmentImageShare ? 'partial' : 'full'
}

const segmentEnricher: Enricher = {
  name: 'segment',
  run: async ({model, raster, runtime}) => {
    if (model.nodes.some((node) => node.kind !== 'text')) return model.nodes
    const found = await runtime.segmenter.segment({raster, nodes: model.nodes})
    const nodes = [...model.nodes, ...found]
    return nodes.map((node) => within({node, nodes}))
  },
}

const rolesEnricher: Enricher = {
  name: 'roles',
  run: ({model, runtime}) =>
    Promise.resolve(
      model.nodes.map((node) => {
        if (node.kind !== 'text' || node.role !== undefined) return node
        const neighbours = model.nodes.flatMap((other) =>
          other.kind === 'text' && other.id !== node.id && other.within === node.within ? [other.text] : [],
        )
        const {role, confidence} = runtime.roles({text: node.text, neighbours})
        return {...node, role, roleConfidence: confidence}
      }),
    ),
}

const colorEnricher: Enricher = {
  name: 'color',
  run: ({model, raster}) =>
    Promise.resolve(
      model.nodes.map((node) => {
        if (node.kind !== 'box' || node.paint !== undefined) return node
        const {background} = sampledFills({raster, box: node.box, glyphs: [node.box], color: COLOR_METRICS.ciede2000})
        return {...node, paint: {background}}
      }),
    ),
}

export const ENRICHERS: Enricher[] = [textEnricher, segmentEnricher, rolesEnricher, colorEnricher]

export const ADAPTERS: TargetAdapter[] = [imageAdapter]

export const TEXT_READERS = {paddle: paddleReader} as const satisfies Record<string, TextReader>

export const SEGMENTERS = {threshold: thresholdSegmenter} as const satisfies Record<string, Segmenter>

export const ROLE_RULES = {rules: roleRules} as const satisfies Record<string, RoleRules>

const PageRouteSchema = z.object({pathname: z.string(), search: z.string()})

export async function liveRoute(page: ServerToolPageAccess): Promise<string> {
  const {pathname, search} = PageRouteSchema.parse(await page.call('page_route', {}))
  return `${pathname}${search}`
}

export function pathnameIn(route: string): string {
  return route.split('?')[0] ?? route
}

async function routeLabel(input: {route: string | undefined; page: ServerToolPageAccess}): Promise<string | undefined> {
  if (input.route !== undefined) return input.route
  return liveRoute(input.page).then(pathnameIn, () => undefined)
}

type Enriched = {model: TargetModel; failures: Record<string, string>}

async function enrich(input: {model: TargetModel; design: DesignRuntime}): Promise<Enriched> {
  const {design} = input
  return design.enrichers.reduce<Promise<Enriched>>(
    async (pending, enricher) => {
      const {model, failures} = await pending
      try {
        const nodes = await enricher.run({model, raster: model.raster, runtime: design})
        return {model: {...model, nodes}, failures}
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {model, failures: {...failures, [enricher.name]: message}}
      }
    },
    Promise.resolve({model: input.model, failures: {}}),
  )
}

function textResult(enriched: Enriched): NonNullable<TargetResult['text']> {
  const runs = enriched.model.nodes.filter((node) => node.kind === 'text').length
  const error = enriched.failures[TEXT_ENRICHER]
  return error === undefined ? {runs} : {runs, error}
}

export async function registerTarget(request: {
  input: TargetInput
  session: string
  design: DesignRuntime
  page: ServerToolPageAccess
}): Promise<TargetResult> {
  const {input, session, design, page} = request
  const adapter = design.adapters.find((candidate) => candidate.accepts({ref: input.image, cwd: design.cwd}))
  if (adapter === undefined) {
    throw toolError('image-unreadable', {message: unreadableMessage(input.image)})
  }
  const loaded = await adapter.load({ref: input.image, scale: input.scale ?? 1, cwd: design.cwd})
  const enriched = await enrich({model: loaded, design})
  const route = await routeLabel({route: input.route, page})
  const record = await design.store.put({
    model: enriched.model,
    session,
    ...(route === undefined ? {} : {route}),
    ...(input.name === undefined ? {} : {name: input.name}),
  })
  return {
    id: record.id,
    ...(record.route === undefined ? {} : {route: record.route}),
    width: record.width,
    height: record.height,
    scale: record.scale,
    text: textResult(enriched),
    next: DESIGN_GUIDE,
  }
}
