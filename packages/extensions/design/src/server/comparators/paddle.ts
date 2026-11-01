import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as ort from 'onnxruntime-web'
import type {InferenceSession} from 'onnxruntime-web'
import {Canvas, Contours, cv, ImageProcessor} from 'ppu-ocv'
import type {CanvasLike} from 'ppu-ocv'
import {CanvasProcessor, CanvasToolkit} from 'ppu-ocv/canvas'
import {z} from 'zod'
import type {OcrLine, Raster, TextReader} from '../../shared/types.js'
import {encodePng} from '../raster.js'

export {differs, trimToInk} from '../raster.js'

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
