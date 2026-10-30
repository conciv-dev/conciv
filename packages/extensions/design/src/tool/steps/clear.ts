import {toolError} from '@conciv/extension'
import type {ClearInput, ClearResult} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export const clearStep: ServerStep<ClearInput, ClearResult> = () => Promise.reject(toolError('not-implemented'))
