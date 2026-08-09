import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {tmpdir} from 'node:os'
import {makeApprovingCallTool, type Kit} from '@conciv/harness-testkit'
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

type Annotate = (message: string) => Promise<unknown>

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

  async function bootPageKit(annotate: Annotate, answerFor: Parameters<typeof connectWidget>[1]): Promise<Kit> {
    await annotate('stage: booting the app under test')
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    await annotate('stage: attaching the fake widget')
    state.widget = await connectWidget(kit, answerFor)
    return kit
  }

  async function agentPageTool(
    kit: Kit,
    annotate: Annotate,
  ): Promise<(input: {verb: string} & Record<string, unknown>) => Promise<unknown>> {
    await annotate('stage: resolving the session')
    const session = await kit.session()
    const call = makeApprovingCallTool(kit.base, session)
    return async ({verb, ...input}) => {
      await annotate(`stage: the agent page.${verb} call`)
      return call(`page.${verb}`, input)
    }
  }

  it('journals an agent-driven mutation exactly as the CLI path journals it', async ({annotate, signal}) => {
    const kit = await bootPageKit(annotate, () => ({ok: true, result: {ok: true, value: 'a@b.c'}}))
    const execute = await agentPageTool(kit, annotate)

    await execute({verb: 'fill', selector: '#email', value: 'a@b.c'})
    await annotate('stage: the page.changes rpc call')
    const afterAgent = ChangesSchema.parse(await kit.rpc.page.changes(undefined, {signal}))
    expect(afterAgent).toMatchObject([{verb: 'page.fill', selector: '#email', args: {value: 'a@b.c'}}])

    await annotate('stage: the page.clearChanges rpc call')
    await kit.rpc.page.clearChanges(undefined, {signal})
    await annotate('stage: the cli page.fill rpc call')
    await kit.rpc.registry.call({name: 'page.fill', input: {selector: '#email', value: 'a@b.c'}}, {signal})
    await annotate('stage: the page.changes rpc call')
    const afterCli = ChangesSchema.parse(await kit.rpc.page.changes(undefined, {signal}))
    expect(afterAgent).toEqual(afterCli)
  }, 30_000)

  it('journals one entry per mutation and no more, whichever surface drove it', async ({annotate, signal}) => {
    const kit = await bootPageKit(annotate, () => ({ok: true, result: {ok: true, value: 'a@b.c'}}))
    const execute = await agentPageTool(kit, annotate)

    await execute({verb: 'fill', selector: '#email', value: 'a@b.c'})
    await annotate('stage: the cli page.setattr rpc call')
    await kit.rpc.registry.call(
      {name: 'page.setattr', input: {selector: '#a', attribute: 'data-state', value: 'open'}},
      {signal},
    )

    await annotate('stage: the page.changes rpc call')
    const changes = ChangesSchema.parse(await kit.rpc.page.changes(undefined, {signal}))
    expect(changes.map((entry) => entry.verb)).toEqual(['page.fill', 'page.setattr'])
  }, 30_000)

  it('never journals an agent-driven read', async ({annotate, signal}) => {
    const kit = await bootPageKit(annotate, () => ({ok: true, result: {text: 'Checkout'}}))
    const execute = await agentPageTool(kit, annotate)
    await execute({verb: 'text', selector: 'h1'})
    await annotate('stage: the page.changes rpc call')
    expect(await kit.rpc.page.changes(undefined, {signal})).toEqual([])
  }, 30_000)

  it('symbolicates an agent-driven locate the way the CLI path does', async ({annotate, signal}) => {
    await annotate('stage: writing the source-mapped chunk')
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const kit = await bootPageKit(annotate, () => ({
      ok: true,
      result: {component: 'Home', stack: ['Home'], frames: [{fileName: `file://${chunk}`, line: 2, column: 1}]},
    }))
    const execute = await agentPageTool(kit, annotate)
    const agentResult = SourceSchema.parse(agentPageResult(await execute({verb: 'locate', selector: 'h1'})))
    await annotate('stage: the cli page.locate rpc call')
    const cliResult = SourceSchema.parse(
      agentPageResult(await kit.rpc.registry.call({name: 'page.locate', input: {selector: 'h1'}}, {signal})),
    )
    expect(agentResult.source).toEqual({file: 'app/page.tsx', line: 17, column: 4})
    expect(agentResult.source).toEqual(cliResult.source)
  }, 30_000)
})
