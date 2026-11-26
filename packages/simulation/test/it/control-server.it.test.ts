import {Effect, Fiber, Stream} from 'effect'
import {describe, expect, it} from 'vitest'
import {BACKEND_CAPABILITIES, UI_CAPABILITIES, type HandshakeParams} from '@conciv/protocol/simulation'
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

  const backend: SimulationControlServer.HandshakeAction = {
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
      outcome: {type: 'refused', refusal: {code: 'ROLE_MISMATCH', data: {expected: 'ui', actual: 'backend'}}},
    },
    {
      name: 'rejects unsupported protocol versions',
      given: {...params, offeredVersions: [2]},
      outcome: {type: 'refused', refusal: {code: 'UNSUPPORTED_PROTOCOL', data: {offered: [2], supported: [1]}}},
    },
    {
      name: 'rejects a missing required capability',
      given: {...params, requiredCapabilities: ['llm.subscribe', 'llm.future']},
      outcome: {type: 'refused', refusal: {code: 'MISSING_CAPABILITY', data: {missing: ['llm.future']}}},
    },
    {
      name: 'ignores a missing optional capability',
      given: {...params, requiredCapabilities: [], optionalCapabilities: ['llm.future']},
      outcome: {type: 'accepted', response: {capabilities: BACKEND_CAPABILITIES}},
    },
  ])('$name', ({given, outcome}) => {
    expect(SimulationControlServer.dispatchHandshake(backend, given)).toMatchObject(outcome)
  })
})

describe('simulation ui protocol', () => {
  const ui: SimulationControlServer.HandshakeAction = {
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

    expect(SimulationControlServer.dispatchHandshake(ui, params)).toMatchObject({
      type: 'accepted',
      response: {role: 'ui', capabilities: UI_CAPABILITIES},
    })
    expect(SimulationControlServer.dispatchHandshake({...ui, role: 'backend'}, params)).toMatchObject({
      type: 'refused',
      refusal: {code: 'ROLE_MISMATCH'},
    })
  })
})
