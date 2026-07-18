import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, describe, expect, it, vi} from 'vitest'
import {createFakeHarness} from '@conciv/harness-testkit'
import {defineAttachment, defineExtension} from '@conciv/extension'
import {imageHistoryFor, openDb, statusOf} from '@conciv/db'
import {makeApp, type MadeApp} from '../src/app.js'

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

    const db = openDb(stateRoot)
    await vi.waitFor(
      () => {
        expect(fake.__turnMessages.length).toBeGreaterThan(0)
        expect(statusOf(db, sessionId)).toBe('idle')
      },
      {timeout: 15_000},
    )

    const harnessUser = fake.__turnMessages[0]?.findLast((message) => message.role === 'user')
    const harnessContent = harnessUser?.content
    if (!Array.isArray(harnessContent)) throw new Error('expected rich harness user content')
    expect(harnessContent.map((part) => part.type)).not.toContain('document')
    expect(harnessContent.some((part) => part.type === 'text' && part.content.includes('fixture-expanded'))).toBe(true)

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
  }, 30_000)
})
