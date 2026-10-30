import {toolError} from '@conciv/extension'
import type {CaptureInput, CaptureResult, ViewportResult} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export const captureStep: ServerStep<CaptureInput, CaptureResult | ViewportResult> = () =>
  Promise.reject(toolError('not-implemented'))
