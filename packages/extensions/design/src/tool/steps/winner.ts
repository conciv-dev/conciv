import {toolError} from '@conciv/extension'
import type {WinnerInput, WinnerResult} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export const winnerStep: ServerStep<WinnerInput, WinnerResult> = () => Promise.reject(toolError('not-implemented'))
