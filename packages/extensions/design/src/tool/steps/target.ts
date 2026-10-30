import {toolError} from '@conciv/extension'
import type {TargetInput, TargetResult} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export const targetStep: ServerStep<TargetInput, TargetResult> = () => Promise.reject(toolError('not-implemented'))
