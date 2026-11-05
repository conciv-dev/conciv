import * as ort from 'onnxruntime-web'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import type {InferenceSession} from 'onnxruntime-web'
import {Canvas, Contours, cv, ImageProcessor, type CanvasLike} from 'ppu-ocv'
import {CanvasProcessor, CanvasToolkit} from 'ppu-ocv/canvas'
import {z} from 'zod'
import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {median, partition, range} from 'es-toolkit'
import type {Box, DesignNode, Raster} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'
import {box as geometry} from '../../shared/box.js'

export function createReader(input: {config: DesignConfig}): Reader {
  const {config} = input
  const engine = ENGINES[config.text]()
  return {
    read: async (raster) => {
      const {tolerances} = designConfig
      const read = await Promise.all(
        tiles({raster, tolerances}).map((tile) => readTile({raster, tile, engine, tolerances})),
      )
      const lines = read
        .flat()
        .filter((line) => line.confidence >= tolerances.ocrConfidenceFloor && line.text.trim() !== '')
      const latin = latinDesign(lines)
      const kept = lines
        .flatMap((line) => lineParts({line, raster, latin, tolerances}))
        .reduce<Part[]>(
          (found, part) =>
            found.some((other) => geometry.overlaps({a: other.line.box, b: part.line.box})) ? found : [...found, part],
          [],
        )
      const [glyphs, words] = partition(kept, (part) => part.glyph)
      return [
        ...rows(words.map((part) => part.line)).map(textItem),
        ...glyphs.map((part): Item => ({kind: 'image', box: part.line.box, holds: 0})),
      ]
    },
    dispose: () => engine.dispose(),
  }
}

type DesignConfig = z.output<typeof designConfig>
type Tolerances = typeof designConfig.tolerances
type TextNode = Extract<DesignNode, {kind: 'text'}>
type OcrLine = TextNode['lines'][number]
type Bare<Node> = Node extends unknown ? Omit<Node, 'id' | 'hash' | 'children' | 'layout'> : never
type Item = Bare<DesignNode>
type Reader = {read(raster: Raster): Promise<Item[]>; dispose(): Promise<void>}
type Engine = {read(raster: Raster): Promise<OcrLine[]>; dispose(): Promise<void>}
type Part = {line: OcrLine; glyph: boolean}

const UPSAMPLE = 2

async function readTile(input: {
  raster: Raster
  tile: Box
  engine: Engine
  tolerances: Tolerances
}): Promise<OcrLine[]> {
  const {raster, tile, engine, tolerances} = input
  const part = raster.crop({box: tile})
  const lines = await engine.read(part)
  const small = lines.length > 0 && median(lines.map((line) => line.box.h)) < tolerances.ocrUpsampleBelowPx
  const read = small
    ? (await engine.read(part.scaled(1 / UPSAMPLE))).map((line) => scaledLine({line, by: UPSAMPLE, dy: tile.y}))
    : lines.map((line) => scaledLine({line, by: 1, dy: tile.y}))
  return read.filter((line) => !onSeam({line, tile, raster}))
}

function tiles(input: {raster: Raster; tolerances: Tolerances}): Box[] {
  const {raster, tolerances} = input
  const height = Math.min(raster.height, tolerances.ocrTileHeight)
  const stride = height - tolerances.ocrTileOverlap
  const count = raster.height <= height ? 1 : Math.ceil((raster.height - height) / stride) + 1
  return range(count).map((index) => {
    const y = Math.min(index * stride, raster.height - height)
    return {x: 0, y, w: raster.width, h: height}
  })
}

function scaledLine(input: {line: OcrLine; by: number; dy: number}): OcrLine {
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

function trimToInk(input: {raster: Raster; box: Box; threshold: number}): Box {
  const {raster, box, threshold} = input
  const x = Math.max(0, Math.floor(box.x))
  const y = Math.max(0, Math.floor(box.y))
  const w = Math.min(raster.width - x, Math.ceil(box.w))
  const h = Math.min(raster.height - y, Math.ceil(box.h))
  if (w < MINIMUM_TRIM_SIDE || h < MINIMUM_TRIM_SIDE) return box
  const data = raster.pixels()
  const at = (index: number): number => ((y + Math.floor(index / w)) * raster.width + x + (index % w)) * 4
  const origin = at(0)
  const marked = range(w * h).filter((index) =>
    range(4).some((channel) => Math.abs((data[at(index) + channel] ?? 0) - (data[origin + channel] ?? 0)) > threshold),
  )
  if (marked.length === 0) return box
  const edges = marked.reduce(
    (found, index) => ({
      left: Math.min(found.left, index % w),
      top: Math.min(found.top, Math.floor(index / w)),
      right: Math.max(found.right, (index % w) + 1),
      bottom: Math.max(found.bottom, Math.floor(index / w) + 1),
    }),
    {left: w, top: h, right: 0, bottom: 0},
  )
  return {x: x + edges.left, y: y + edges.top, w: edges.right - edges.left, h: edges.bottom - edges.top}
}

const MINIMUM_TRIM_SIDE = 2

function joinsRow(input: {row: OcrLine[]; line: OcrLine}): boolean {
  const last = input.row.at(-1)
  if (last === undefined) return false
  const {box} = input.line
  const gap = box.x - (last.box.x + last.box.w)
  const shared = Math.max(0, Math.min(last.box.y + last.box.h, box.y + box.h) - Math.max(last.box.y, box.y))
  return shared >= Math.min(last.box.h, box.h) / 2 && gap < Math.max(last.box.h, box.h)
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

function textItem(row: OcrLine[]): Item {
  const text = row.map((line) => line.text.trim()).join(' ')
  return {
    kind: 'text',
    box: geometry.union(row.map((line) => line.box)),
    text,
    lines: row,
    confidence: Math.min(...row.map((line) => line.confidence)),
  }
}

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

function lineParts(input: {line: OcrLine; raster: Raster; latin: boolean; tolerances: Tolerances}): Part[] {
  const {line, raster, latin, tolerances} = input
  const characters = Array.from(line.text)
  const first = characters.findIndex(inked)
  const last = characters.findLastIndex(inked) + 1
  const piece = (span: {from: number; to: number}): OcrLine => ({
    text: characters.slice(span.from, span.to).join('').trim(),
    confidence: line.confidence,
    box: trimToInk({
      raster,
      box: shareBox({box: line.box, ...span, count: characters.length}),
      threshold: tolerances.inkTrimThreshold,
    }),
  })
  const glyph = (run: OcrLine): boolean => isGlyph({run, whole: line, latin, tolerances})
  const whole = piece({from: 0, to: characters.length})
  const blanks = range(first, last).filter((index) => !inked(characters[index] ?? ''))
  const firstBlank = blanks[0]
  const lastBlank = blanks.at(-1)
  if (firstBlank === undefined || lastBlank === undefined) return [{line: whole, glyph: glyph(whole)}]
  const lead = piece({from: 0, to: firstBlank + 1})
  const trail = piece({from: lastBlank, to: characters.length})
  const leading = glyph(lead)
  const trailing = glyph(trail)
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

function isGlyph(input: {run: OcrLine; whole: OcrLine; latin: boolean; tolerances: Tolerances}): boolean {
  const {run, whole, latin, tolerances} = input
  const characters = Array.from(run.text)
  if (characters.length > GLYPH_LENGTH || characters.every(isSign)) return false
  const foreign = latin && characters.some(isForeign)
  const small = characters.length === 1 && run.box.w < tolerances.iconSide && run.box.h < tolerances.iconSide
  const unsure = Array.from(whole.text).length < UNSURE_LENGTH && whole.confidence < tolerances.iconTextFloor
  return foreign || small || unsure
}

function isForeign(character: string): boolean {
  const point = codePoint(character)
  return point > LATIN_END && (point < PUNCTUATION_START || point > PUNCTUATION_END)
}

function isSign(character: string): boolean {
  return character === PERCENT || isCurrency(character)
}

const CURRENCY_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x24, 0x24],
  [0xa2, 0xa5],
  [0x20a0, 0x20cf],
]
const PERCENT = '%'

function codePoint(character: string): number {
  return character.codePointAt(0) ?? 0
}

function isCurrency(character: string): boolean {
  const point = codePoint(character)
  return CURRENCY_RANGES.some(([low, high]) => point >= low && point <= high)
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
type PaddleState = {service: Promise<OcrService> | null; queue: Promise<unknown>; disposing: boolean}

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

function createPaddle(): Engine {
  const state: PaddleState = {service: null, queue: Promise.resolve(), disposing: false}
  const serialized = <Result>(task: () => Promise<Result>): Promise<Result> => {
    const run = state.queue.then(task)
    state.queue = run.catch(() => undefined)
    return run
  }
  const service = (): Promise<OcrService> => {
    state.service ??= createService().catch((error: unknown) => {
      state.service = null
      throw error
    })
    return state.service
  }
  return {
    read: (raster) => {
      if (state.disposing) return Promise.reject(new Error('the OCR reader is shutting down'))
      return serialized(() => recognize({raster, service}))
    },
    dispose: async () => {
      state.disposing = true
      await serialized(async () => {
        const pending = state.service
        state.service = null
        const running = await pending?.catch(() => null)
        await running?.destroy()
      }).finally(() => {
        state.disposing = false
      })
    },
  }
}

const ENGINES = {paddle: createPaddle} as const satisfies Record<DesignConfig['text'], () => Engine>

async function recognize(input: {raster: Raster; service: () => Promise<OcrService>}): Promise<OcrLine[]> {
  const ocr = await input.service()
  const png = Uint8Array.from(input.raster.png()).buffer
  const {results} = RecognizedSchema.parse(await ocr.recognize(png, {flatten: true, noCache: true}))
  return results.map((result) => ({
    text: result.text,
    confidence: result.confidence,
    box: {x: result.box.x, y: result.box.y, w: result.box.width, h: result.box.height},
  }))
}

async function createService(): Promise<OcrService> {
  const [service, detection, recognition, session, utils] = await Promise.all(
    [
      'core/base-paddle-ocr.service.js',
      'core/base-detection.service.js',
      'core/base-recognition.service.js',
      'core/session-factory.js',
      'utils.js',
    ].map((file) => ppuModule(file)),
  )
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

async function ppuModule(file: string): Promise<unknown> {
  return import(new URL(file, pathToFileURL(nodeRequire.resolve('ppu-paddle-ocr'))).href)
}

async function readModels(): Promise<{detection: Uint8Array; recognition: Uint8Array; dictionary: Uint8Array}> {
  const directory = new URL('models/', pathToFileURL(nodeRequire.resolve('@conciv/extension-design/package.json')))
  const models = createStorage({driver: fsDriver({base: fileURLToPath(directory), readOnly: true})})
  const [detection, recognition, dictionary] = await Promise.all(
    MODEL_FILES.map((name) => readModel({storage: models, key: name})),
  )
  if (detection === undefined || recognition === undefined || dictionary === undefined) {
    throw new Error('the OCR model files could not be read')
  }
  return {detection, recognition, dictionary}
}

async function readModel(input: {storage: Storage; key: string}): Promise<Uint8Array> {
  const bytes = await readRaw(input)
  if (bytes === null) throw new Error('the OCR model files could not be read')
  return bytes
}

async function readRaw(input: {storage: Storage; key: string}): Promise<Uint8Array | null> {
  const raw: unknown = await input.storage.getItemRaw(input.key).catch(() => null)
  return raw instanceof Uint8Array ? new Uint8Array(raw) : null
}

function wasmHost() {
  return {
    pathSeparator: '/',
    ort,
    createCanvas: (width: number, height: number) => new Canvas(width, height),
    isCanvas: (image: unknown): image is Canvas => image instanceof Canvas,
    loadResource: async (source: string | ArrayBuffer | undefined, defaultUrl: string): Promise<ArrayBuffer> => {
      if (source instanceof ArrayBuffer) return source
      const url = pathToFileURL(source ?? defaultUrl)
      const storage = createStorage({driver: fsDriver({base: fileURLToPath(new URL('.', url)), readOnly: true})})
      const bytes = await readRaw({storage, key: decodeURIComponent(url.pathname.split('/').at(-1) ?? '')})
      if (bytes === null) throw new Error(`the OCR resource ${fileURLToPath(url)} could not be read`)
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
