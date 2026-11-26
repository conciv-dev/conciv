import {expect} from 'vitest'
import {z} from 'zod'
import type {Engine} from '@conciv/backend-test-utils'
import {Command} from '../../src/rpc.js'

export const CONNECTION = 'checkout'

export const SHOT = {
  id: 'file_22222222-2222-4222-8222-222222222222',
  name: 'screenshot.webp',
  mime: 'image/webp',
  data: 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
}

const Asked = z.object({requestId: z.string()})

export const REDACTED_URL = 'http://localhost:3000/checkout?plant=fern&token=%5Bredacted%5D#jwt=%5Bredacted%5D'

export async function attachPage(engine: Engine): Promise<{ended: Promise<string>}> {
  const attached = await engine.event('rpc.experimental.page.control', {
    data: {type: 'attached', connectionId: CONNECTION},
  })
  const call = engine.rpc.call('experimental.page', 'attach', {
    sessionId: engine.session.id,
    connectionId: CONNECTION,
    version: 1,
  })
  const refused = call.then((result) => {
    throw new Error(`the page attach answered before it attached: ${JSON.stringify(result)}`)
  })
  await Promise.race([attached.arrived, refused])
  expect((await attached.arrived).data).toEqual({type: 'attached', connectionId: CONNECTION, version: 1})
  const ended = call.then(
    (result) => (result === 'replaced' ? 'replaced' : 'closed'),
    () => 'closed',
  )
  await engine.rpc.call('experimental.page', 'state', {
    sessionId: engine.session.id,
    connectionId: CONNECTION,
    state: {
      id: 'tab_11111111-1111-4111-8111-111111111111',
      url: REDACTED_URL,
      title: 'Checkout',
      focused: true,
      visible: true,
    },
  })
  return {ended}
}

type Answer = (command: Command) => {value: unknown; files: readonly unknown[]}

export function nextCommand(engine: Engine) {
  return engine.event('rpc.experimental.page.control', {data: {type: 'command', connectionId: CONNECTION}})
}

type Waiting = Awaited<ReturnType<typeof nextCommand>>

export async function answerCommands(engine: Engine, waiting: Waiting, answers: readonly Answer[]): Promise<void> {
  const [answer, ...rest] = answers
  if (answer === undefined) return
  const attachment = {sessionId: engine.session.id, connectionId: CONNECTION}
  const {requestId} = Asked.parse((await waiting.arrived).data)
  const command = Command.parse(await engine.rpc.call('experimental.page', 'command', {...attachment, requestId}))
  const following = rest.length === 0 ? undefined : await nextCommand(engine)
  await engine.rpc.call('experimental.page', 'result', {
    ...attachment,
    requestId,
    outcome: {type: 'success', result: answer(command)},
  })
  if (following !== undefined) await answerCommands(engine, following, rest)
}
