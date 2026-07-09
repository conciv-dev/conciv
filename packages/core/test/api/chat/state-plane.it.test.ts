import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {CONCIV_SESSION_HEADER, ResolveResponseSchema} from '@conciv/protocol/chat-types'
import {SessionRowSchema, type SessionRow} from '@conciv/state'
import {startTestEngine} from '../../helpers/state-plane.js'
import type {Engine} from '../../../src/engine.js'

const RecordsPageSchema = z.object({records: z.array(z.unknown())})

async function resolveSession(engine: Engine): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/chat/session/resolve`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({}),
  })
  return ResolveResponseSchema.parse(await response.json()).sessionId
}

async function postChat(engine: Engine, sessionId: string, text: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${engine.port}/api/chat`, {
    method: 'POST',
    headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: sessionId},
    body: JSON.stringify({messages: [{role: 'user', content: text}]}),
  })
}

async function fetchRecords(engine: Engine, api: string, filter: Record<string, string>): Promise<unknown[]> {
  const query = Object.entries(filter)
    .map(([field, value]) => `filter[${field}]=${encodeURIComponent(value)}`)
    .join('&')
  const response = await fetch(`http://127.0.0.1:${engine.statePort}/api/records/v1/${api}?${query}`)
  return RecordsPageSchema.parse(await response.json()).records
}

async function fetchSessionRow(engine: Engine, sessionId: string): Promise<SessionRow | null> {
  const records = await fetchRecords(engine, 'sessions', {session_id: sessionId})
  const first = records[0]
  return first === undefined ? null : SessionRowSchema.parse(first)
}

async function waitForIdleRow(engine: Engine, sessionId: string, timeoutMs: number): Promise<SessionRow> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const row = await fetchSessionRow(engine, sessionId)
    if (row?.status === 'idle') return row
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`session ${sessionId} not idle after ${timeoutMs}ms`)
}

describe('engine state plane', () => {
  it('starts trailbase and serves the sessions record api', async () => {
    const engine = await startTestEngine()
    const response = await fetch(`http://127.0.0.1:${engine.statePort}/api/records/v1/sessions`)
    expect(response.status).toBe(200)
    await engine.stop()
  }, 120000)

  it('walks status thinking -> idle across a turn', async () => {
    const engine = await startTestEngine()
    const sessionId = await resolveSession(engine)
    const seen = new Set<string>()
    const collector = (async () => {
      while (true) {
        const row = await fetchSessionRow(engine, sessionId)
        if (row) seen.add(row.status)
        if (row?.status === 'idle' && seen.has('thinking')) return
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    })()
    await postChat(engine, sessionId, 'say hi')
    await collector
    expect(seen.has('thinking')).toBe(true)
    expect((await fetchSessionRow(engine, sessionId))?.status).toBe('idle')
    await engine.stop()
  }, 30000)

  it('compacts server-side: marker written, status walks compacting -> idle', async () => {
    const engine = await startTestEngine()
    const sessionId = await resolveSession(engine)
    await postChat(engine, sessionId, 'hello')
    await waitForIdleRow(engine, sessionId, 30000)
    const response = await fetch(`http://127.0.0.1:${engine.port}/api/chat/compact`, {
      method: 'POST',
      headers: {[CONCIV_SESSION_HEADER]: sessionId},
    })
    expect(response.status).toBe(200)
    await waitForIdleRow(engine, sessionId, 30000)
    const markers = await fetchRecords(engine, 'markers', {session_id: sessionId})
    expect(markers).toHaveLength(1)
    const marker = z.object({kind: z.string(), pending: z.number()}).parse(markers[0])
    expect(marker.kind).toBe('compact')
    expect(marker.pending).toBe(0)
    await engine.stop()
  }, 60000)
})
