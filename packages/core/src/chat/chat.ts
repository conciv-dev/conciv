import {randomUUID} from 'node:crypto'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {type ResolveDeps} from './session.js'

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
