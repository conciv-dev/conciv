import {toolError} from '@conciv/extension'
import type {StatusInput, StatusReport} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'

export const statusStep: ServerStep<StatusInput, StatusReport> = () => Promise.reject(toolError('not-implemented'))
