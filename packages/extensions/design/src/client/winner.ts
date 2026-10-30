import {toolError} from '@conciv/extension'
import type {WinnerInput, WinnerResult} from '../shared/defs.js'

export function winnerStep(_input: WinnerInput): WinnerResult {
  throw toolError('not-implemented')
}
