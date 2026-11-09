import {z} from 'zod'
import {initContributions} from '@conciv/harness-init/registry'
import {INIT_HARNESS_IDS} from '@conciv/protocol/harness-types'

export const HubAgentSchema = z
  .enum(INIT_HARNESS_IDS)
  .refine((id) => initContributions[id].hub !== undefined, {message: 'this agent has no conciv hub connection'})
