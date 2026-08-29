import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {makeCallTool, type Kit} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'

const shredder = defineTool({
  name: 'vault_shred',
  description: 'Shred a document in the vault.',
  inputSchema: z.object({documentId: z.string()}),
  outputSchema: z.object({shredded: z.string()}),
  approval: 'ask',
  meta: {summary: 'shred a document in the vault', category: 'vault', mutating: true},
}).server((input) => ({shredded: input.documentId}))

const stall = {controller: new AbortController()}

const forever = defineTool({
  name: 'vault_stall',
  description: 'A handler that settles only when the test releases it.',
  inputSchema: z.object({}),
  outputSchema: z.object({released: z.literal(true)}),
  meta: {summary: 'settle only when the test releases it', category: 'vault', mutating: false},
}).server(
  () =>
    new Promise<{released: true}>((resolve) => {
      const signal = stall.controller.signal
      if (signal.aborted) return resolve({released: true})
      signal.addEventListener('abort', () => resolve({released: true}), {once: true})
    }),
)

const vault = defineExtension({name: 'vault', tools: [shredder, forever]})

type Outcome = {ok: true; value: unknown} | {ok: false; message: string}

function settle(pending: Promise<unknown>): Promise<Outcome> {
  return pending.then(
    (value) => ({ok: true as const, value}),
    (error: unknown) => ({ok: false as const, message: String(error)}),
  )
}

async function bootVault(askTimeoutMs: number): Promise<{kit: Kit; session: string}> {
  const kit = await bootKit({extensions: [vault], askTimeoutMs})
  const session = await kit.session()
  return {kit, session}
}

describe('the MCP ask path is bounded', () => {
  it('honors the configured askTimeoutMs when a subscriber never decides', async () => {
    const askTimeoutMs = 4_000
    const {kit, session} = await bootVault(askTimeoutMs)
    try {
      const stream = await kit.attach(session)
      await stream.waitFor(() => true, {hangGuardMs: 10_000})
      const started = performance.now()
      const outcome = await settle(kit.callTool('vault_shred', {documentId: 'd1'}, session))
      const elapsed = performance.now() - started
      expect(outcome.ok).toBe(false)
      expect(outcome.ok ? '' : outcome.message).toContain('no approval decision')
      expect(elapsed).toBeLessThan(20_000)
    } finally {
      await kit.cleanup()
    }
  }, 45_000)

  it('refuses immediately when nothing is attached to answer the ask', async () => {
    const askTimeoutMs = 8_000
    const {kit, session} = await bootVault(askTimeoutMs)
    try {
      const started = performance.now()
      const outcome = await settle(kit.callTool('vault_shred', {documentId: 'd2'}, session))
      const elapsed = performance.now() - started
      const message = outcome.ok ? '' : outcome.message
      expect(outcome.ok).toBe(false)
      expect(message).toContain('vault_shred')
      expect(message).toContain('nothing is attached')
      expect(elapsed).toBeLessThan(3_000)
    } finally {
      await kit.cleanup()
    }
  }, 45_000)

  it('rejects a stalled testkit call with a deadline error naming the tool and the client-only scope', async () => {
    stall.controller = new AbortController()
    const {kit, session} = await bootVault(30_000)
    try {
      const call = makeCallTool(kit.base, session, {deadlineMs: 3_000})
      const started = performance.now()
      const failure = await call('vault_stall', {}).then(
        () => null,
        (error: unknown) => error,
      )
      const elapsed = performance.now() - started
      if (!(failure instanceof Error)) throw new Error(`expected a deadline Error, got ${String(failure)}`)
      expect(failure.message).toBe(
        'runTypescript(vault_stall) exceeded 3000ms waiting on the MCP execute; the server-side run continues until its own timeout',
      )
      expect(failure.cause).toBeInstanceOf(Error)
      expect(String(failure.cause)).toMatch(/abort/i)
      expect(elapsed).toBeLessThan(10_000)
    } finally {
      stall.controller.abort()
      await kit.cleanup()
    }
  }, 45_000)
})
