import type {record} from 'rrweb'
import type {getRecordConsolePlugin} from '@rrweb/rrweb-plugin-console-record'
import type {eventWithTime} from '@rrweb/types'
import type {RecorderConfig, RrwebEvent} from '../shared/protocol.js'

const CHECKOUT_MS = 60_000

const CONCIV_UI_SELECTOR =
  '[data-conciv-root], [data-conciv-effects], [data-conciv-cursor], [data-conciv-fonts], [data-conciv-properties]'

function maskingOptions(masking: RecorderConfig['masking']): {
  maskAllInputs: boolean
  maskInputOptions: {password: boolean; email?: boolean; tel?: boolean}
} {
  if (masking === 'inputs') return {maskAllInputs: true, maskInputOptions: {password: true}}
  if (masking === 'sensitive') return {maskAllInputs: false, maskInputOptions: {password: true, email: true, tel: true}}
  return {maskAllInputs: false, maskInputOptions: {password: true}}
}

export type CaptureLibrary = {record: typeof record; getRecordConsolePlugin: typeof getRecordConsolePlugin}

let captureLibrary: Promise<CaptureLibrary> | undefined

export function loadCaptureLibrary(): Promise<CaptureLibrary> {
  captureLibrary ??= Promise.all([import('rrweb'), import('@rrweb/rrweb-plugin-console-record')]).then(
    ([rrweb, consoleRecord]) => ({record: rrweb.record, getRecordConsolePlugin: consoleRecord.getRecordConsolePlugin}),
  )
  return captureLibrary
}

export function startCapture(
  library: CaptureLibrary,
  config: RecorderConfig,
  emit: (event: RrwebEvent) => void,
): () => void {
  const stop = library.record({
    emit: (event: eventWithTime) => emit(event),
    checkoutEveryNms: CHECKOUT_MS,
    blockSelector: CONCIV_UI_SELECTOR,
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

export function takeFreshSnapshot(library: CaptureLibrary): void {
  library.record.takeFullSnapshot(true)
}
