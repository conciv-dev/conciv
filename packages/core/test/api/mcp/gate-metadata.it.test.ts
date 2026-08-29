import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {approvalIds, type Kit, type RunStream} from '@conciv/harness-testkit'
import type {PageOutcome} from '@conciv/protocol/page-types'
import {bootKit} from '../../helpers/boot.js'
import {connectWidget} from '../../helpers/fake-widget.js'

const wipe = defineTool({
  name: 'acme_wipe',
  description: 'Erase the whole canvas.',
  inputSchema: z.object({}),
  outputSchema: z.object({wiped: z.boolean()}),
  meta: {summary: 'erase the whole canvas', mutating: true},
}).server(() => ({wiped: true}))

const acme = defineExtension({name: 'acme', tools: [wipe]})

const purge = defineTool({
  name: 'askme_purge',
  description: 'Purge the archive.',
  inputSchema: z.object({}),
  outputSchema: z.object({purged: z.boolean()}),
  approval: 'ask',
  meta: {summary: 'purge the archive'},
}).server(() => ({purged: true}))

const shred = defineTool({
  name: 'askme_shred',
  description: 'Shred a document.',
  inputSchema: z.object({}),
  outputSchema: z.object({shredded: z.boolean()}),
  approval: 'ask',
  meta: {summary: 'shred a document', mutating: false},
}).server(() => ({shredded: true}))

const askme = defineExtension({name: 'askme', tools: [purge, shred]})

type Outcome = {ok: boolean; message: string}

async function callViaSandbox(kit: Kit, session: string, name: string, input: unknown): Promise<Outcome> {
  return kit.callTool(name, input, session).then(
    (value) => ({ok: true, message: JSON.stringify(value)}),
    (error: unknown) => ({ok: false, message: String(error)}),
  )
}

async function decideNextApproval(
  kit: Kit,
  stream: RunStream,
  approved: boolean,
): Promise<void> {
  const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 10_000})
  const approvalId = approvalIds(asked)[0]
  if (approvalId === undefined) throw new Error('no approval id on the stream')
  await kit.rpc.chat.permissionDecision({approvalId, approved})
}

function pageAnswer(): PageOutcome {
  return {ok: true, result: {ok: true}}
}

describe('/api/mcp gate decisions come from the approval declaration, not mutating', () => {
  it('a mutating BUILT-IN with no approval declaration runs without any prompt', async () => {
    const kit = await bootKit()
    const widget = await connectWidget(kit, pageAnswer)
    try {
      const session = await kit.session()
      const outcome = await callViaSandbox(kit, session, 'page_css', {text: 'body{color:red}'})
      expect(outcome.ok).toBe(true)
      expect(widget.seen()).toEqual(['page_css'])
    } finally {
      widget.end()
      await kit.cleanup()
    }
  }, 30_000)

  it('a read-only BUILT-IN runs with no approval prompt', async () => {
    const opened: string[] = []
    const kit = await bootKit({openInEditor: (file) => opened.push(file)})
    try {
      const session = await kit.session()
      const outcome = await callViaSandbox(kit, session, 'open', {file: 'src/read.ts'})
      expect(outcome.ok).toBe(true)
      expect(opened).toEqual(['src/read.ts'])
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('an EXTENSION capability declared merely mutating runs without any prompt', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const session = await kit.session()
      const outcome = await callViaSandbox(kit, session, 'acme_wipe', {})
      expect(outcome.ok).toBe(true)
      expect(outcome.message).toContain('wiped')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('an EXTENSION tool with approval ask and no mutating flag prompts', async () => {
    const kit = await bootKit({extensions: [askme]})
    try {
      const session = await kit.session()
      const stream = await kit.events(session)
      const pending = callViaSandbox(kit, session, 'askme_purge', {})
      await decideNextApproval(kit, stream, true)
      const outcome = await pending
      expect(outcome.ok).toBe(true)
      expect(outcome.message).toContain('purged')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('an EXTENSION tool with approval ask keeps prompting even when meta declares mutating false', async () => {
    const kit = await bootKit({extensions: [askme]})
    try {
      const session = await kit.session()
      const stream = await kit.events(session)
      const pending = callViaSandbox(kit, session, 'askme_shred', {})
      await decideNextApproval(kit, stream, false)
      const outcome = await pending
      expect(outcome.ok).toBe(false)
      expect(outcome.message).toContain('denied')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('an ask-declared call with no session to ask in is refused', async () => {
    const kit = await bootKit({extensions: [askme]})
    try {
      const outcome = await callViaSandbox(kit, '', 'askme_purge', {})
      expect(outcome.ok).toBe(false)
      expect(outcome.message).toContain('askme_purge')
      expect(outcome.message).toContain('nothing is attached')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
