import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import {
  chat,
  DISCOVERY_TOOL_NAME,
  EventType,
  toolDefinition,
  type AnyTool,
  type ModelMessage,
  type StreamChunk,
  type TextOptions,
} from '@tanstack/ai'
import {makeTextAdapter} from '@conciv/harness'
import {toChatTool} from '../../src/chat/runtime.js'

type Round = {tools: readonly AnyTool[]; messages: readonly ModelMessage[]}
type Reply = (round: number, options: TextOptions<Record<string, never>>) => readonly StreamChunk[]

function recordingAdapter(reply: Reply): {adapter: ReturnType<typeof makeTextAdapter>; rounds: Round[]} {
  const rounds: Round[] = []
  async function* stream(options: TextOptions<Record<string, never>>): AsyncGenerator<StreamChunk> {
    const index = rounds.length
    rounds.push({tools: options.tools ?? [], messages: options.messages})
    yield* reply(index, options)
  }
  return {adapter: makeTextAdapter('recording', stream), rounds}
}

function discoveryCallChunks(name: string): readonly StreamChunk[] {
  const toolCallId = 'disc-1'
  return [
    {type: EventType.RUN_STARTED, threadId: 'rec', runId: 'rec'},
    {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: DISCOVERY_TOOL_NAME, toolName: DISCOVERY_TOOL_NAME},
    {type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify({toolNames: [name]})},
    {type: EventType.TOOL_CALL_END, toolCallId},
    {type: EventType.RUN_FINISHED, threadId: 'rec', runId: 'rec', finishReason: 'tool_calls'},
  ]
}

function answerChunks(text: string): readonly StreamChunk[] {
  return [
    {type: EventType.RUN_STARTED, threadId: 'rec', runId: 'rec'},
    {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'rec', delta: text},
    {type: EventType.RUN_FINISHED, threadId: 'rec', runId: 'rec', finishReason: 'stop'},
  ]
}

const DiscoveryResultSchema = z.object({
  tools: z.array(z.object({name: z.string(), description: z.string().optional(), inputSchema: z.unknown().optional()})),
})

function discoveryResultIn(messages: readonly ModelMessage[]): z.infer<typeof DiscoveryResultSchema> | null {
  for (const message of messages) {
    if (message.role !== 'tool') continue
    const raw = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    const parsed = DiscoveryResultSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  }
  return null
}

function toolNames(round: Round): string[] {
  return round.tools.map((tool) => tool.name)
}

const eagerTool = toChatTool(
  {name: 'demo_status', description: 'Report the demo status.', inputSchema: z.object({})},
  async () => ({ok: true}),
)

const lazyTool = toolDefinition({
  name: 'demo_search',
  description: 'Search the demo index for matches. Returns the top hits.',
  inputSchema: z.object({query: z.string()}),
  lazy: true,
}).server(async () => ({hits: []}))

const tools: AnyTool[] = [eagerTool, lazyTool]

async function drain(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

async function discoveryTurn(userText: string): Promise<Round[]> {
  const {adapter, rounds} = recordingAdapter((round, _options) =>
    round === 0 ? discoveryCallChunks('demo_search') : answerChunks('done'),
  )
  await drain(
    chat({
      adapter,
      messages: [{role: 'user', content: userText}],
      threadId: 'turn-1',
      tools,
      lazyToolsConfig: {includeDescription: 'first-sentence'},
    }),
  )
  return rounds
}

describe('lazy extension-tool path through chat()', () => {
  test('initial model call sees eager tool + discovery, never the undiscovered lazy tool', async () => {
    const rounds = await discoveryTurn('do the thing')

    const first = rounds[0]
    if (!first) throw new Error('adapter was never called')
    expect(toolNames(first)).toContain('demo_status')
    expect(toolNames(first)).toContain(DISCOVERY_TOOL_NAME)
    expect(toolNames(first)).not.toContain('demo_search')
  })

  test('discovery catalog reflects lazyToolsConfig first-sentence only', async () => {
    const rounds = await discoveryTurn('do the thing')

    const discovery = rounds[0]?.tools.find((tool) => tool.name === DISCOVERY_TOOL_NAME)
    expect(discovery?.description).toContain('Search the demo index for matches.')
    expect(discovery?.description).not.toContain('Returns the top hits.')
  })

  test('discovery returns the lazy tool schema and it becomes offered on the next model call', async () => {
    const rounds = await discoveryTurn('search please')

    expect(rounds.length).toBe(2)
    const second = rounds[1]
    if (!second) throw new Error('discovery did not trigger a second model call')

    const result = discoveryResultIn(second.messages)
    expect(result?.tools.map((tool) => tool.name)).toContain('demo_search')
    const discovered = result?.tools.find((tool) => tool.name === 'demo_search')
    expect(discovered?.inputSchema).toBeDefined()

    expect(toolNames(second)).toContain('demo_search')
    expect(toolNames(second)).not.toContain(DISCOVERY_TOOL_NAME)
  })

  test('a fully-discovered lazy tool stays offered across turns without re-discovery', async () => {
    const turnOne = recordingAdapter((round, _options) =>
      round === 0 ? discoveryCallChunks('demo_search') : answerChunks('done'),
    )
    await drain(
      chat({
        adapter: turnOne.adapter,
        messages: [{role: 'user', content: 'search please'}],
        threadId: 'turn-1',
        tools,
        lazyToolsConfig: {includeDescription: 'first-sentence'},
      }),
    )
    const history = turnOne.rounds[1]?.messages
    if (!history) throw new Error('turn one produced no discovery history')

    const turnTwo = recordingAdapter((_round, _options) => answerChunks('again'))
    await drain(
      chat({
        adapter: turnTwo.adapter,
        messages: [...history, {role: 'user', content: 'search again'}],
        threadId: 'turn-2',
        tools,
        lazyToolsConfig: {includeDescription: 'first-sentence'},
      }),
    )

    expect(turnTwo.rounds.length).toBe(1)
    const reopened = turnTwo.rounds[0]
    if (!reopened) throw new Error('turn two never called the adapter')
    expect(toolNames(reopened)).toContain('demo_search')
    expect(toolNames(reopened)).not.toContain(DISCOVERY_TOOL_NAME)
  })
})
