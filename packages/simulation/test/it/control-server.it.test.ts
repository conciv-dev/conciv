import {Effect, Fiber, Stream} from 'effect'
import {describe, expect, it} from 'vitest'
import {
  BACKEND_CAPABILITIES,
  dispatchHandshake,
  UI_CAPABILITIES,
  uiContract,
  type HandshakeAction,
  type HandshakeParams,
  type SemanticNode,
  type UiState,
} from '@conciv/protocol/simulation'
import {implement, ORPCError} from '@orpc/server'
import {contractCode} from '@conciv/protocol'
import {byRole, clickByRole, connectUi, typeInto} from '../../src/frontend.js'
import * as SimulationControlServer from '../../src/control-server.js'
import {connectDriver, text} from '../../src/driver.js'
import {request} from '../utils/model-request.js'
import {availableEndpoint, connect, driven} from '../utils/websocket.js'

describe('simulation control server', () => {
  it('lets go of attached drivers and frees its port before the server scope closes', async () => {
    const endpoint = await availableEndpoint()
    const attached = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* driven(endpoint)
          const driver = yield* Effect.promise(() => connect(endpoint))
          yield* Effect.promise(() => driver.client.llm.subscribe())
          return driver
        }),
      ),
    )

    await attached.closed
    await Effect.runPromise(Effect.scoped(driven(endpoint)))
  })

  it('keeps a turn waiting after its driver leaves and lets the next driver serve it', async () => {
    const endpoint = await availableEndpoint()
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const {provider} = yield* driven(endpoint)
          const leaving = yield* Effect.promise(() => connect(endpoint))
          const turns = yield* Effect.promise(() => leaving.client.llm.subscribe())
          const answer = yield* provider.stream(request).pipe(Stream.runCollect, Effect.forkScoped)
          yield* Effect.promise(() => turns.next())

          leaving.websocket.close()
          yield* Effect.promise(() => leaving.closed)

          const driver = yield* Effect.acquireRelease(
            Effect.promise(() => connectDriver(endpoint)),
            (connected) => Effect.promise(connected.close),
          )
          const served: unknown[] = []
          driver.serve((given) => {
            served.push(given)
            return text('ok')
          })
          expect(Array.from(yield* Fiber.join(answer))).toEqual([
            {type: 'textDelta', text: 'ok'},
            {type: 'finish', reason: 'stop'},
          ])
          expect(served).toEqual([request])
        }),
      ),
    )
  })

  it('closes the socket when an outbound turn exceeds the byte bound', async () => {
    const endpoint = await availableEndpoint()
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const {provider} = yield* driven(endpoint)
          const driver = yield* Effect.promise(() => connect(endpoint))
          const turns = yield* Effect.promise(() => driver.client.llm.subscribe())
          const pending = turns.next().catch(() => undefined)
          const oversized = {...request, system: ['x'.repeat(64 * 1024 * 1024 + 1)]}

          const answer = yield* provider.stream(oversized).pipe(Stream.runDrain, Effect.forkScoped)

          yield* Effect.promise(() => driver.closed)
          yield* Effect.promise(() => pending)
          yield* Fiber.interrupt(answer)
        }),
      ),
    )
  })
})

describe('simulation handshake', () => {
  const params: HandshakeParams = {
    client: {name: 'conciv-drive', version: 'test'},
    expectedRole: 'backend',
    offeredVersions: [1],
    requiredCapabilities: ['llm.subscribe'],
    optionalCapabilities: ['tool.register', 'future.capability'],
  }

  const expectingUi: HandshakeParams = {...params, expectedRole: 'ui'}

  const backend: HandshakeAction = {
    role: 'backend',
    server: {name: 'conciv', version: 'test'},
    capabilities: BACKEND_CAPABILITIES,
  }

  it.each([
    {
      name: 'selects the protocol and advertises only installed capabilities',
      given: params,
      outcome: {
        type: 'accepted',
        response: {protocolVersion: 1, role: 'backend', server: backend.server, capabilities: BACKEND_CAPABILITIES},
      },
    },
    {
      name: 'rejects a client that expects the other role',
      given: expectingUi,
      outcome: {
        type: 'refused',
        refusal: {code: 'simulation.ROLE_MISMATCH', message: 'Expected simulation endpoint role ui, received backend'},
      },
    },
    {
      name: 'rejects unsupported protocol versions',
      given: {...params, offeredVersions: [2]},
      outcome: {type: 'refused', refusal: {code: 'simulation.UNSUPPORTED_PROTOCOL', status: 400}},
    },
    {
      name: 'rejects a missing required capability',
      given: {...params, requiredCapabilities: ['llm.subscribe', 'llm.future']},
      outcome: {
        type: 'refused',
        refusal: {
          code: 'simulation.MISSING_CAPABILITY',
          message: 'Simulation endpoint is missing required capabilities: llm.future',
        },
      },
    },
    {
      name: 'ignores a missing optional capability',
      given: {...params, requiredCapabilities: [], optionalCapabilities: ['llm.future']},
      outcome: {type: 'accepted', response: {capabilities: BACKEND_CAPABILITIES}},
    },
  ])('$name', ({given, outcome}) => {
    expect(dispatchHandshake(backend, given)).toMatchObject(outcome)
  })
})

describe('simulation ui protocol', () => {
  const ui: HandshakeAction = {
    role: 'ui',
    server: {name: 'conciv', version: 'test'},
    capabilities: UI_CAPABILITIES,
  }

  it('accepts a ui client on the ui role and refuses it on the backend role', () => {
    const params: HandshakeParams = {
      client: {name: 'conciv-drive', version: 'test'},
      expectedRole: 'ui',
      offeredVersions: [1],
      requiredCapabilities: ['ui.type', 'ui.snapshot'],
      optionalCapabilities: [],
    }

    expect(dispatchHandshake(ui, params)).toMatchObject({
      type: 'accepted',
      response: {role: 'ui', capabilities: UI_CAPABILITIES},
    })
    expect(dispatchHandshake({...ui, role: 'backend'}, params)).toMatchObject({
      type: 'refused',
      refusal: {code: 'simulation.ROLE_MISMATCH'},
    })
  })
})

describe('the driver on the engine ui endpoint', () => {
  const button: SemanticNode = {id: 'node-7', role: 'button', label: 'Send message', element: 7}
  const textbox: SemanticNode = {id: 'node-3', role: 'textbox', label: 'Message the conciv agent', element: 3}

  function fakeUiEndpoint(endpoint: string, capabilities: readonly string[]) {
    const typed: string[] = []
    const focus = {target: 0}
    const shown = (): UiState => ({focused: {renderable: focus.target, editor: focus.target === 3}, elements: []})
    const os = implement(uiContract)
    const refuse = (): never => {
      throw new Error('the fake widget does not do that')
    }
    const router = os.router({
      handshake: os.handshake.handler(({input}) => {
        const outcome = dispatchHandshake(
          {role: 'ui', server: {name: 'fake-widget', version: 'test'}, capabilities},
          input,
        )
        if (outcome.type === 'accepted') return outcome.response
        throw new ORPCError(contractCode(outcome.refusal), {message: outcome.refusal.message})
      }),
      ui: {
        state: os.ui.state.handler(shown),
        snapshot: os.ui.snapshot.handler(() => ({format: 'conciv-ui-snapshot-v1' as const, nodes: [textbox, button]})),
        matches: os.ui.matches.handler(({input}) => typed.join('').includes(input.text)),
        type: os.ui.type.handler(({input}) => {
          typed.push(input.text)
          return shown()
        }),
        focus: os.ui.focus.handler(({input}) => {
          focus.target = input.target
          return shown()
        }),
        click: os.ui.click.handler(({input}) => {
          focus.target = input.semantic?.element ?? 0
          return shown()
        }),
        press: os.ui.press.handler(refuse),
        enter: os.ui.enter.handler(refuse),
        arrow: os.ui.arrow.handler(refuse),
        capture: os.ui.capture.handler(refuse),
        recording: {finish: os.ui.recording.finish.handler(refuse)},
        mouse: os.ui.mouse.handler(refuse),
        resize: os.ui.resize.handler(refuse),
      },
    })
    return SimulationControlServer.start({
      endpoint: new URL(endpoint),
      label: 'fake ui endpoint',
      router,
      close: () => Effect.void,
    })
  }

  function whileServed(endpoint: string, capabilities: readonly string[], drive: () => Promise<void>) {
    return Effect.runPromise(
      Effect.scoped(fakeUiEndpoint(endpoint, capabilities).pipe(Effect.andThen(Effect.promise(drive)))),
    )
  }

  it('dials the ui endpoint, types into the composer by its label and clicks send by its role, then refuses an endpoint without the ui actions', async () => {
    const endpoint = await availableEndpoint()
    await whileServed(endpoint, UI_CAPABILITIES, async () => {
      const driver = await connectUi(endpoint)
      const snapshot = await driver.client.ui.snapshot()
      expect(byRole(snapshot, 'button', 'Send message')).toEqual(button)
      expect(() => byRole(snapshot, 'button', 'Stop generating')).toThrow(
        'the widget shows no button named Stop generating',
      )
      expect(await typeInto(driver.client, 'textbox', 'Message the conciv agent', 'Hello')).toMatchObject({
        focused: {renderable: 3, editor: true},
      })
      expect(await driver.client.ui.matches({text: 'Hello'})).toBe(true)
      expect(await clickByRole(driver.client, 'button', 'Send message')).toMatchObject({focused: {renderable: 7}})
      driver.close()
    })

    await whileServed(endpoint, ['ui.state', 'ui.snapshot'], async () => {
      await expect(connectUi(endpoint)).rejects.toMatchObject({
        code: 'MISSING_CAPABILITY',
        message: 'Simulation endpoint is missing required capabilities: ui.click.semantic, ui.focus, ui.type, ui.press',
      })
    })
  })
})
