import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import type {ChatEnv} from './chat-env.js'
import launch from './launch.js'
import permission from './permission.js'
import session, {type ResolveDeps} from './session.js'
import turn from './turn.js'
import attach from './attach.js'

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

const app = new Hono<ChatEnv>()
  .route('/', permission)
  .route('/', session)
  .route('/', launch)
  .route('/', turn)
  .route('/', attach)

export default app
export type ChatAppType = typeof app
