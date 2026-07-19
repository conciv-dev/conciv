import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, describe, expect, it, vi} from 'vitest'
import {createFakeHarness} from '@conciv/harness-testkit'
import {defineAttachment, defineExtension} from '@conciv/extension'
import {imageHistoryFor, openDb} from '@conciv/db'
import {ChatMessageSchema} from '@conciv/protocol/chat-types'
import {makeApp, type MadeApp} from '../src/app.js'
import {toModelMessages} from '../src/chat/session.js'

const FIXTURE_MIME = 'application/x-conciv-fixture'
const sessionId = 'conciv_expand_e2e'
const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-expand-'))

const cleanups: (() => Promise<void> | void)[] = []
afterAll(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  rmSync(stateRoot, {recursive: true, force: true})
})

function fixtureExtension() {
  const attachment = defineAttachment({mime: FIXTURE_MIME})
  attachment.server(() => [{type: 'text', content: 'fixture-expanded'}])
  return defineExtension({name: 'fixture', attachments: [attachment]}).server(() => ({context: {}}))
}

async function bootApp(fake: ReturnType<typeof createFakeHarness>): Promise<MadeApp> {
  const made = await makeApp({
    cfg: {
      enabled: true,
      widgetUrl: undefined,
      stateRoot,
      harness: fake.id,
      harnessBin: undefined,
      sessionId: '',
      systemPrompt: '',
      extensions: undefined,
    },
    cwd: stateRoot,
    openInEditor: () => {},
    harness: fake,
    extensions: [fixtureExtension()],
  })
  cleanups.push(async () => {
    for (const dispose of made.disposers) await dispose()
    made.closeDb()
  })
  return made
}

type StoredPart = {type?: string; content?: string; metadata?: {modelOnly?: boolean}}
type StoredMessage = {role?: string; parts?: StoredPart[]}

describe('attachment expand end-to-end (real send path, scripted harness)', () => {
  it('stores rich parts while the harness receives the expanded projection', async () => {
    const fake = createFakeHarness({id: 'fake-expand', text: 'ok'})
    const made = await bootApp(fake)
    const content = [
      {type: 'text', content: 'why?'},
      {type: 'document', source: {type: 'data', mimeType: FIXTURE_MIME, value: 'eyJpZCI6MX0='}},
    ]
    const response = await made.app.request('/rpc/chat/send', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({json: {sessionId, content}}),
    })
    expect(response.status).toBe(200)

    const sessionRunning = async (): Promise<boolean> => {
      const list = await made.app.request('/rpc/sessions/list', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({json: null}),
      })
      const payload: unknown = await list.json()
      const rows =
        typeof payload === 'object' && payload !== null && 'json' in payload && Array.isArray(payload.json)
          ? payload.json
          : []
      const row = rows.find(
        (entry): entry is {id: string; running: boolean} =>
          typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === sessionId,
      )
      if (!row) throw new Error('session not listed yet')
      return row.running
    }
    await vi.waitFor(
      async () => {
        expect(await sessionRunning()).toBe(false)
      },
      {timeout: 30_000},
    )

    const db = openDb(stateRoot)
    const stored = imageHistoryFor(db, sessionId)
    if (!stored) throw new Error('expected durable rich history')
    const messages: StoredMessage[] = stored.messages.filter(
      (message): message is StoredMessage => typeof message === 'object' && message !== null,
    )
    const storedUser = messages.find((message) => message.role === 'user')
    const parts = storedUser?.parts ?? []
    expect(parts.some((part) => part.type === 'document')).toBe(true)
    expect(
      parts.some(
        (part) => part.type === 'text' && part.content === 'fixture-expanded' && part.metadata?.modelOnly === true,
      ),
    ).toBe(true)

    const richHistory = stored.messages.map((message) => ChatMessageSchema.parse(message))
    const modelUser = toModelMessages(richHistory).findLast((message) => message.role === 'user')
    if (!modelUser) throw new Error('expected a model user message')
    const modelView = typeof modelUser.content === 'string' ? modelUser.content : JSON.stringify(modelUser.content)
    expect(modelView).toContain('fixture-expanded')
    expect(modelView).not.toContain('document')
  }, 30_000)
})
