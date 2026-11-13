import type {Source} from './schema/permission.js'

export type AssertInput = {
  sessionId: string
  agent?: string | undefined
  action: string
  resources: string[]
  save?: string[] | undefined
  metadata?: Record<string, unknown> | undefined
  source?: Source | undefined
}
