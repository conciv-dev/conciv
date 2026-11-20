import {execFileSync, spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {Hono} from 'hono'
import {implement} from '@orpc/server'
import {contract} from '@conciv/contract'
import {upgradeWebSocket} from '@conciv/serve'
import {rpcWebsocketRoute} from '@conciv/serve/rpc'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {Config, ConfigProvider, Effect} from 'effect'
import {describe, expect} from 'vitest'
import type {BootApp} from './create-testkit.js'
import {test} from './node.js'

const engine = new Hono().route(
  '/t/journey-token',
  new Hono().get(
    RPC_WS_PATH,
    rpcWebsocketRoute(
      {sessions: {resolve: implement(contract).sessions.resolve.handler(() => ({sessionId: 'conciv_journey'}))}},
      {upgrade: upgradeWebSocket},
    ),
  ),
)

const boot: BootApp = async () => ({agentToken: 'journey-token', fetch: engine.fetch, dispose: async () => {}})

const deps = (): HarnessChatDeps => ({
  cwd: '.',
  sessionId: SessionId.parse('conciv_journey'),
  askPermission: async () => ({allowed: false, message: 'nobody answers an ask in this journey'}),
  resumeSessionId: null,
  env: {},
  kind: 'chat',
})

type Drained = {events: ChatEvent[]; done: Promise<ChatEvent[]>}

function drain(stream: AsyncIterable<ChatEvent>): Drained {
  const events: ChatEvent[] = []
  const read = async (): Promise<ChatEvent[]> => {
    for await (const event of stream) events.push(event)
    return events
  }
  return {events, done: read()}
}

function eventTypes(events: ChatEvent[]): string[] {
  return events.map((event) => event.type)
}

function replyText(events: ChatEvent[]): string {
  return events.map((event) => (event.type === ChatEventType.TEXT_MESSAGE_CONTENT ? event.delta : '')).join('')
}

function readConfig(configProvider: ConfigProvider.ConfigProvider, name: string): string {
  return Effect.runSync(Effect.provide(Config.String(name), ConfigProvider.layer(configProvider)))
}

const leftBehind = {turn: Promise.resolve<ChatEvent[]>([]), tmp: '', bin: '', stateRoot: ''}

describe('a harness test on the kit fixtures', () => {
  test.override({env: {CONCIV_KIT_JOURNEY: 'on'}})
  test.override('boot', () => boot)

  test('a scripted turn waits for release, a fake CLI on the config PATH records each run, and the kit boots', async ({
    chat,
    harness,
    fakeCli,
    configProvider,
    kit,
    tmp,
  }) => {
    expect(readConfig(configProvider, 'CONCIV_KIT_JOURNEY')).toBe('on')
    expect(process.env.CONCIV_KIT_JOURNEY).toBeUndefined()
    const cliEnv = {PATH: readConfig(configProvider, 'PATH')}

    chat.reply('held reply')
    chat.hold()
    const turn = drain(harness.script.chatStream(deps()))
    await expect.poll(() => eventTypes(turn.events)).toContain(ChatEventType.TEXT_MESSAGE_CONTENT)
    expect(eventTypes(turn.events)).not.toContain(ChatEventType.RUN_FINISHED)
    chat.release()
    const finished = await turn.done
    expect(replyText(finished)).toBe('held reply')
    expect(finished.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)

    const claude = await fakeCli.add('claude', {stdout: ['{"type":"result","result":"ok"}']})
    expect(execFileSync('claude', ['--print', 'two words'], {encoding: 'utf8', env: cliEnv})).toBe(
      '{"type":"result","result":"ok"}\n',
    )
    const codex = await fakeCli.add('codex', {stderr: ["it's broken"], exitCode: 2})
    const failed = spawnSync('codex', ['exec'], {encoding: 'utf8', env: cliEnv})
    expect({status: failed.status, stderr: failed.stderr}).toEqual({status: 2, stderr: "it's broken\n"})
    execFileSync('claude', [], {encoding: 'utf8', env: cliEnv})
    expect(await claude.calls()).toEqual([['--print', 'two words'], []])
    expect(await codex.calls()).toEqual([['exec']])

    expect(await kit.session()).toBe('conciv_journey')
    expect(existsSync(kit.stateRoot)).toBe(true)

    chat.hold()
    leftBehind.turn = drain(harness.script.chatStream(deps())).done
    leftBehind.tmp = tmp
    leftBehind.bin = fakeCli.bin
    leftBehind.stateRoot = kit.stateRoot
  })
})

test('teardown released the held turn and removed every folder it made', async () => {
  expect((await leftBehind.turn).at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
  expect([leftBehind.tmp, leftBehind.bin, leftBehind.stateRoot].filter((folder) => existsSync(folder))).toEqual([])
})
