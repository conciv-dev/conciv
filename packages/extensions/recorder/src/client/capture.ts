import {record} from 'rrweb'
import {getRecordConsolePlugin} from '@rrweb/rrweb-plugin-console-record'
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

export function startCapture(config: RecorderConfig, emit: (event: RrwebEvent) => void): () => void {
  const stop = record({
    emit: (event: eventWithTime) => emit(event),
    checkoutEveryNms: CHECKOUT_MS,
    blockSelector: CONCIV_UI_SELECTOR,
    sampling: {mousemove: 50, scroll: 150, media: 800, input: 'last'},
    ...maskingOptions(config.masking),
    plugins: config.console
      ? [
          getRecordConsolePlugin({
            level: ['error'],
            lengthThreshold: 200,
            stringifyOptions: {stringLengthLimit: 5000, numOfKeysLimit: 50, depthOfLimit: 4},
          }),
        ]
      : [],
  })
  return () => stop?.()
}

export function takeFreshSnapshot(): void {
  record.takeFullSnapshot(true)
}
