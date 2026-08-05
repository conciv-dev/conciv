import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {tmpdir} from 'node:os'
import {createMCPClient} from '@tanstack/ai-mcp'
import type {PageOutcome} from '@conciv/protocol/page-types'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'
import {chunkWithInlineMap, cleanupChunks} from '../../editor/fixtures.js'

const ChangesSchema = z.array(
  z.object({verb: z.string(), selector: z.string().optional(), args: z.record(z.string(), z.unknown())}),
)

type AgentTool = {execute?: (input: unknown) => Promise<unknown>}

async function connectWidget(kit: Kit, answerFor: (kind: string) => PageOutcome): Promise<{end: () => void}> {
  const ctrl = new AbortController()
  const iterator = await kit.rpc.page.queries(undefined, {signal: ctrl.signal})
  void (async () => {
    try {
      for await (const {requestId, query} of iterator) {
        const kind =
          typeof query === 'object' && query !== null && 'kind' in query && typeof query.kind === 'string'
            ? query.kind
            : ''
        void kit.rpc.page.reply({requestId, outcome: answerFor(kind)}).catch(() => {})
      }
    } catch {}
  })()
  return {end: () => ctrl.abort()}
}

const SourceSchema = z.object({source: z.object({file: z.string(), line: z.number(), column: z.number()})})

function agentPageResult(result: unknown): unknown {
  if (typeof result === 'string') return JSON.parse(result)
  return result
}

describe('the agent reaches the page through the same implementation the CLI uses', () => {
  const state = {
    kit: undefined as Kit | undefined,
    widget: undefined as {end: () => void} | undefined,
    close: undefined as (() => Promise<void>) | undefined,
  }

  afterEach(async () => {
    state.widget?.end()
    if (state.close) await state.close()
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    state.widget = undefined
    state.close = undefined
    await cleanupChunks()
  })

  async function agentPageTool(kit: Kit): Promise<(input: unknown) => Promise<unknown>> {
    const mcp = await createMCPClient({transport: {type: 'http', url: `${kit.base}/api/mcp`}})
    state.close = () => mcp.close()
    const tools: AgentTool[] = await mcp.tools()
    const page = tools.find((tool) => 'name' in tool && tool.name === 'conciv_page')
    if (!page?.execute) throw new Error('conciv_page is not registered on /api/mcp')
    return page.execute
  }

  it('journals an agent-driven mutation exactly as the CLI path journals it', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    state.widget = await connectWidget(kit, () => ({ok: true, result: {ok: true, value: 'a@b.c'}}))
    const execute = await agentPageTool(kit)

    await execute({verb: 'fill', selector: '#email', value: 'a@b.c'})
    const afterAgent = ChangesSchema.parse(await kit.rpc.page.changes(undefined))
    expect(afterAgent).toMatchObject([{verb: 'fill', selector: '#email', args: {value: 'a@b.c'}}])

    await kit.rpc.page.clearChanges(undefined)
    await kit.rpc.page.run({verb: 'fill', selector: '#email', value: 'a@b.c'})
    const afterCli = ChangesSchema.parse(await kit.rpc.page.changes(undefined))
    expect(afterAgent).toEqual(afterCli)
  }, 30_000)

  it('never journals an agent-driven read', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    state.widget = await connectWidget(kit, () => ({ok: true, result: {text: 'Checkout'}}))
    const execute = await agentPageTool(kit)
    await execute({verb: 'text', selector: 'h1'})
    expect(await kit.rpc.page.changes(undefined)).toEqual([])
  }, 30_000)

  it('symbolicates an agent-driven locate the way the CLI path does', async () => {
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    state.widget = await connectWidget(kit, () => ({
      ok: true,
      result: {component: 'Home', stack: ['Home'], frames: [{fileName: `file://${chunk}`, line: 2, column: 1}]},
    }))
    const execute = await agentPageTool(kit)
    const agentResult = SourceSchema.parse(agentPageResult(await execute({verb: 'locate', selector: 'h1'})))
    const cliResult = await kit.rpc.page.run({verb: 'locate', selector: 'h1'})
    expect(agentResult.source).toEqual({file: 'app/page.tsx', line: 17, column: 4})
    expect(agentResult.source).toEqual(cliResult.source)
  }, 30_000)
})
