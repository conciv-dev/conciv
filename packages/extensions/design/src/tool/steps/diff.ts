import {toolError} from '@conciv/extension'
import type {DiffInput, DiffReport} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export const diffStep: ServerStep<DiffInput, DiffReport> = () => Promise.reject(toolError('not-implemented'))
