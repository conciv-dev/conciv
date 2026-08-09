import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {tmpdir} from 'node:os'
import {makeApprovingCallTool, withDeadline, type Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'
import {connectWidget} from '../../helpers/fake-widget.js'
import {chunkWithInlineMap, cleanupChunks} from '../../editor/fixtures.js'

const ChangesSchema = z.array(
  z.object({verb: z.string(), selector: z.string().optional(), args: z.record(z.string(), z.unknown())}),
)

const SourceSchema = z.object({source: z.object({file: z.string(), line: z.number(), column: z.number()})})

function agentPageResult(result: unknown): unknown {
  if (typeof result === 'string') return JSON.parse(result)
  return result
}

const RPC_DEADLINE_MS = 10_000

function rpcStage<Result>(stage: string, run: () => Promise<Result>): Promise<Result> {
  return withDeadline(RPC_DEADLINE_MS, `the ${stage} rpc call exceeded ${RPC_DEADLINE_MS}ms`, run)
}

describe('the agent reaches the page through the same implementation the CLI uses', () => {
  const state: {kit: Kit | undefined; widget: {end: () => void} | undefined; close: (() => Promise<void>) | undefined} =
    {
      kit: undefined,
      widget: undefined,
      close: undefined,
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

  async function agentPageTool(
    kit: Kit,
  ): Promise<(input: {verb: string} & Record<string, unknown>) => Promise<unknown>> {
    const session = await kit.session()
    const call = makeApprovingCallTool(kit.base, session)
    return async ({verb, ...input}) => call(`page.${verb}`, input)
  }

  it('journals an agent-driven mutation exactly as the CLI path journals it', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    state.widget = await connectWidget(kit, () => ({ok: true, result: {ok: true, value: 'a@b.c'}}))
    const execute = await agentPageTool(kit)

    await execute({verb: 'fill', selector: '#email', value: 'a@b.c'})
    const afterAgent = ChangesSchema.parse(await rpcStage('page.changes', () => kit.rpc.page.changes(undefined)))
    expect(afterAgent).toMatchObject([{verb: 'page.fill', selector: '#email', args: {value: 'a@b.c'}}])

    await rpcStage('page.clearChanges', () => kit.rpc.page.clearChanges(undefined))
    await rpcStage('cli page.fill', () =>
      kit.rpc.registry.call({name: 'page.fill', input: {selector: '#email', value: 'a@b.c'}}),
    )
    const afterCli = ChangesSchema.parse(await rpcStage('page.changes', () => kit.rpc.page.changes(undefined)))
    expect(afterAgent).toEqual(afterCli)
  }, 30_000)

  it('journals one entry per mutation and no more, whichever surface drove it', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    state.widget = await connectWidget(kit, () => ({ok: true, result: {ok: true, value: 'a@b.c'}}))
    const execute = await agentPageTool(kit)

    await execute({verb: 'fill', selector: '#email', value: 'a@b.c'})
    await rpcStage('cli page.setattr', () =>
      kit.rpc.registry.call({name: 'page.setattr', input: {selector: '#a', attribute: 'data-state', value: 'open'}}),
    )

    const changes = ChangesSchema.parse(await rpcStage('page.changes', () => kit.rpc.page.changes(undefined)))
    expect(changes.map((entry) => entry.verb)).toEqual(['page.fill', 'page.setattr'])
  }, 30_000)

  it('never journals an agent-driven read', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    state.widget = await connectWidget(kit, () => ({ok: true, result: {text: 'Checkout'}}))
    const execute = await agentPageTool(kit)
    await execute({verb: 'text', selector: 'h1'})
    expect(await rpcStage('page.changes', () => kit.rpc.page.changes(undefined))).toEqual([])
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
    const cliResult = SourceSchema.parse(
      agentPageResult(
        await rpcStage('cli page.locate', () => kit.rpc.registry.call({name: 'page.locate', input: {selector: 'h1'}})),
      ),
    )
    expect(agentResult.source).toEqual({file: 'app/page.tsx', line: 17, column: 4})
    expect(agentResult.source).toEqual(cliResult.source)
  }, 30_000)
})
