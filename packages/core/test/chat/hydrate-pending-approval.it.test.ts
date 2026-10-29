import {afterEach, describe, expect, it} from 'vitest'
import {tmpdir} from 'node:os'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {approvalIds, createTestHarness} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const purge = defineTool({
  name: 'vault_purge',
  description: 'Purge the vault.',
  inputSchema: z.object({}),
  outputSchema: z.object({purged: z.boolean()}),
  approval: 'ask',
  meta: {summary: 'purge the vault'},
}).server(() => ({purged: true}))

const vault = defineExtension({name: 'vault', tools: [purge]})

function callThroughCatalog(name: string, input: unknown): string {
  return `
    const found = await external_catalog({name: ${JSON.stringify(name)}})
    const call = globalThis[found.call]
    if (typeof call !== 'function') throw new Error('binding missing: ' + found.call)
    return await call(${JSON.stringify(input)})
  `
}

describe('a reload while an approval is waiting rebuilds the question (IT)', () => {
  it('hydrate carries the pending approval and answering it releases the run', async () => {
    const harness = createTestHarness(requireClaude())
    const kit = await bootKit({cwd: tmpdir(), extensions: [vault]}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {typescriptCode: callThroughCatalog('vault_purge', {})})
    const turn = await kit.turn('purge the vault', {session: sessionId, runId: 'hydrate-pending-approval-1'})

    const asked = await turn.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 20_000})
    const approvalId = approvalIds(asked)[0]
    if (approvalId === undefined) throw new Error('no approval id reached the run stream')

    const reloaded = await kit.hydrate(sessionId)
    expect(reloaded.activeRun).toEqual({runId: 'hydrate-pending-approval-1'})
    expect(reloaded.pendingApprovals).toMatchObject([
      {approvalId, toolName: 'vault_purge', runId: 'hydrate-pending-approval-1'},
    ])

    await kit.rpc.chat.permissionDecision({approvalId, approved: true})
    await turn.done({hangGuardMs: 20_000})

    expect((await kit.hydrate(sessionId)).pendingApprovals).toEqual([])
  }, 60_000)
})
