import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {approvalIds, type Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'

const wipe = defineTool({
  name: 'acme.wipe',
  description: 'Erase the whole canvas.',
  inputSchema: z.object({}),
  outputSchema: z.object({wiped: z.boolean()}),
  meta: {summary: 'erase the whole canvas', mutating: true},
}).server(() => ({wiped: true}))

const acme = defineExtension({name: 'acme', tools: [wipe]})

const purge = defineTool({
  name: 'askme.purge',
  description: 'Purge the archive.',
  inputSchema: z.object({}),
  approval: 'ask',
}).server(() => ({purged: true}))

const shred = defineTool({
  name: 'askme.shred',
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
  stream: Awaited<ReturnType<Kit['attach']>>,
  approved: boolean,
): Promise<void> {
  const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 10_000})
  const approvalId = approvalIds(asked)[0]
  if (approvalId === undefined) throw new Error('no approval id on the stream')
  await kit.rpc.chat.permissionDecision({approvalId, approved})
}

describe('/api/mcp gate decisions come from registry metadata', () => {
  it('a mutating BUILT-IN prompts, and a denial arrives as an exception where the code called it', async () => {
    const kit = await bootKit()
    try {
      const session = await kit.session()
      const stream = await kit.attach(session)
      const pending = callViaSandbox(kit, session, 'page.eval', {code: '1 + 1'})
      const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 10_000})
      const approvalId = approvalIds(asked)[0]
      if (approvalId === undefined) throw new Error('no approval id for the built-in mutation')
      await kit.rpc.chat.permissionDecision({approvalId, approved: false})
      const outcome = await pending
      expect(outcome.ok).toBe(false)
      expect(outcome.message).toContain('denied')
    } finally {
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

  it('an EXTENSION capability declared mutating prompts even without an approval flag', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const session = await kit.session()
      const stream = await kit.attach(session)
      const pending = callViaSandbox(kit, session, 'acme.wipe', {})
      const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 10_000})
      const approvalId = approvalIds(asked)[0]
      if (approvalId === undefined) throw new Error('no approval id for the extension mutation')
      await kit.rpc.chat.permissionDecision({approvalId, approved: true})
      const outcome = await pending
      expect(outcome.ok).toBe(true)
      expect(outcome.message).toContain('wiped')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('an EXTENSION tool with approval ask and no meta flag prompts', async () => {
    const kit = await bootKit({extensions: [askme]})
    try {
      const session = await kit.session()
      const stream = await kit.attach(session)
      const pending = callViaSandbox(kit, session, 'askme.purge', {})
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
      const stream = await kit.attach(session)
      const pending = callViaSandbox(kit, session, 'askme.shred', {})
      await decideNextApproval(kit, stream, false)
      const outcome = await pending
      expect(outcome.ok).toBe(false)
      expect(outcome.message).toContain('denied')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('a mutating call with no session to ask in is refused', async () => {
    const kit = await bootKit()
    try {
      const outcome = await callViaSandbox(kit, '', 'page.eval', {code: '1'})
      expect(outcome.ok).toBe(false)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
