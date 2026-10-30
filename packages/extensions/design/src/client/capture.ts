import {toolError} from '@conciv/extension'
import type {CaptureInput, ViewportResult} from '../shared/defs.js'
import type {LiveComponent} from '../shared/types.js'

export type ClientCapture = {image: string; width: number; height: number; route: string; components: LiveComponent[]}

export function captureStep(_input: CaptureInput): Promise<ClientCapture | ViewportResult> {
  return Promise.reject(toolError('not-implemented'))
}
