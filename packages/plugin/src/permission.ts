import {z} from 'zod'
import {SessionId} from '@conciv/protocol/chat-types'
import {Source} from './schema/permission.js'

const AssertInput = z.object({
  sessionId: SessionId,
  agent: z.string().optional(),
  action: z.string(),
  resources: z.array(z.string()),
  save: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  source: Source.optional(),
})

export type AssertInput = z.input<typeof AssertInput>
