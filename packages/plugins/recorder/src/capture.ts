import {Effect, type Scope} from 'effect'
import type {EvlogError} from 'evlog'
import type {record} from 'rrweb'
import type {getRecordConsolePlugin} from '@rrweb/rrweb-plugin-console-record'
import type {eventWithTime} from '@rrweb/types'
import type {RecorderConfig, RrwebEvent} from './rpc.js'
import {causeFrom, recorderErrors} from './errors/errors.js'

const CHECKOUT_MS = 60_000

function maskingOptions(masking: RecorderConfig['masking']): {
  maskAllInputs: boolean
  maskInputOptions: {password: boolean; email?: boolean; tel?: boolean}
} {
  if (masking === 'inputs') return {maskAllInputs: true, maskInputOptions: {password: true}}
  if (masking === 'sensitive') return {maskAllInputs: false, maskInputOptions: {password: true, email: true, tel: true}}
  return {maskAllInputs: false, maskInputOptions: {password: true}}
}

type CaptureLibrary = {record: typeof record; getRecordConsolePlugin: typeof getRecordConsolePlugin}

export const loadCaptureLibrary: Effect.Effect<CaptureLibrary, EvlogError> = Effect.tryPromise({
  try: () => Promise.all([import('rrweb'), import('@rrweb/rrweb-plugin-console-record')]),
  catch: (cause) => recorderErrors.CAPTURE_LIBRARY_LOAD_FAILED(causeFrom(cause)),
}).pipe(
  Effect.map(([rrweb, consoleRecord]) => ({
    record: rrweb.record,
    getRecordConsolePlugin: consoleRecord.getRecordConsolePlugin,
  })),
)

function startCapture(
  library: CaptureLibrary,
  config: RecorderConfig,
  exclude: string,
  emit: (event: RrwebEvent) => void,
): () => void {
  const stop = library.record({
    emit: (event: eventWithTime) => emit(event),
    checkoutEveryNms: CHECKOUT_MS,
    blockSelector: exclude,
    userTriggeredOnInput: true,
    sampling: {mousemove: 50, scroll: 150, media: 800, input: 'last'},
    ...maskingOptions(config.masking),
    plugins: config.console
      ? [
          library.getRecordConsolePlugin({
            level: ['error'],
            lengthThreshold: 200,
            stringifyOptions: {stringLengthLimit: 5000, numOfKeysLimit: 50, depthOfLimit: 4},
          }),
        ]
      : [],
  })
  return () => stop?.()
}

export function recordPage(
  library: CaptureLibrary,
  exclude: string,
  emit: (event: RrwebEvent) => void,
): (config: RecorderConfig) => Effect.Effect<void, never, Scope.Scope> {
  return (config) =>
    Effect.acquireRelease(
      Effect.sync(() => startCapture(library, config, exclude, emit)),
      (stop) => Effect.sync(stop),
    )
}

export function takeFreshSnapshot(library: CaptureLibrary): Effect.Effect<void> {
  return Effect.sync(() => library.record.takeFullSnapshot(true))
}
