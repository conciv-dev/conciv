import {z} from 'zod'
import type {Engine} from '@conciv/backend-test-utils'
import {makeRpcClient, type EngineClient} from '@conciv/client'
import {Command} from '../../src/rpc.js'

export const TAB = 'tab_11111111-1111-4111-8111-111111111111'

export const SHOT = {
  id: 'file_22222222-2222-4222-8222-222222222222',
  name: 'screenshot.webp',
  mime: 'image/webp',
  data: 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
}

const Asked = z.object({requestId: z.string()})

export const REDACTED_URL = 'http://localhost:3000/checkout?plant=fern&token=%5Bredacted%5D#jwt=%5Bredacted%5D'

export function widgetClient(engine: Pick<Engine, 'address'>): EngineClient {
  return makeRpcClient(engine.address.apiBase, {token: engine.address.token})
}

type OpenedTab = {
  readonly session: Engine['session']
  readonly id: string
  readonly url: string
  readonly title: string
  readonly signal?: AbortSignal
}

export async function openPage(engine: Engine, opened?: OpenedTab): Promise<{ended: Promise<string>}> {
  const tab = opened ?? {session: engine.session, id: TAB, url: REDACTED_URL, title: 'Checkout'}
  const granted = await engine.event('rpc.experimental.page.permissions.synced', {
    data: {sessionId: tab.session.id, allow: true},
  })
  const call = widgetClient(engine).tabs.open(
    {
      sessionId: tab.session.id,
      connectionId: `connection-${tab.id}`,
      tab: {id: tab.id, url: tab.url, title: tab.title, focused: true, visible: true},
    },
    {signal: tab.signal},
  )
  const ended = call.then(
    (result) => (result === 'replaced' ? 'replaced' : 'closed'),
    () => 'closed',
  )
  await granted.arrived
  return {ended}
}

type Answered = {value: unknown; files: readonly unknown[]}

type Answer = (command: Command) => Answered | Promise<Answered>

export function nextCommand(engine: Engine) {
  return engine.event('rpc.experimental.page.control', {data: {type: 'command', tabId: TAB}})
}

type Waiting = Awaited<ReturnType<typeof nextCommand>>

export async function answerCommands(engine: Engine, waiting: Waiting, answers: readonly Answer[]): Promise<void> {
  const [answer, ...rest] = answers
  if (answer === undefined) return
  const owner = {sessionId: engine.session.id, tabId: TAB}
  const {requestId} = Asked.parse((await waiting.arrived).data)
  const command = Command.parse(await engine.rpc.call('experimental.page', 'command', {...owner, requestId}))
  const following = rest.length === 0 ? undefined : await nextCommand(engine)
  await engine.rpc.call('experimental.page', 'result', {
    ...owner,
    requestId,
    outcome: {type: 'success', result: await answer(command)},
  })
  if (following !== undefined) await answerCommands(engine, following, rest)
}
