import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import type {ChatEnv} from './chat-env.js'
import {type ResolveDeps} from './session.js'
import turn from './turn.js'

export async function ensureAgentRecord(deps: ResolveDeps, harnessId: string): Promise<SessionRecord> {
  const existing = await deps.store.findByHarnessId(harnessId)
  if (existing) return existing
  const mint = deps.mintId ?? (() => `conciv_${randomUUID()}`)
  return deps.store.create({
    id: mint(),
    harnessSessionId: harnessId,
    harnessKind: deps.harnessKind,
    origin: 'agent',
    title: null,
    model: null,
    usage: null,
    cwd: deps.cwd,
  })
}

const app = new Hono<ChatEnv>().route('/', turn)

export default app
export type ChatAppType = typeof app
