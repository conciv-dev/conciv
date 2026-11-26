import {it} from '@effect/vitest'
import {describe, expect} from 'vitest'
import {Effect, Fiber} from 'effect'
import type {ImagePreview} from '@conciv/grab'
import {connectPeer} from '../utils/ios-test.js'
import {IosBridgeMachine} from '../../src/bridge-machine.js'

describe('the native app talks to the widget', () => {
  it.live(
    'the native peer shakes hands, opens and closes the panel and answers a grab; an incompatible version is refused',
    () =>
      Effect.gen(function* () {
        const apiBase = 'http://127.0.0.1:4111'
        const peer = yield* connectPeer({clientId: 'page', apiBase})

        expect(yield* peer.receive('bridge.ready')).toEqual({v: 1, type: 'bridge.ready'})
        expect(yield* peer.receive('handshake.hello')).toEqual({
          v: 1,
          type: 'handshake.hello',
          minV: 1,
          maxV: 1,
          clientId: 'page',
          bundleReady: true,
        })
        yield* peer.send({v: 1, seq: 1, type: 'handshake', apiBase, token: null})
        expect(yield* peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 1})
        expect(IosBridgeMachine.readIncompatible(yield* peer.state)).toBeNull()

        yield* peer.send({v: 1, seq: 2, type: 'open'})
        expect(yield* peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 2})
        expect(yield* peer.signal).toEqual({type: 'open'})

        yield* peer.send({v: 1, seq: 3, type: 'close'})
        expect(yield* peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 3})
        expect(yield* peer.signal).toEqual({type: 'close'})

        const preview: ImagePreview = {kind: 'image', dataUrl: 'data:image/png;base64,AAAA', width: 120, height: 44}
        const rect = {x: 16, y: 600, width: 120, height: 44}
        const answered = yield* Effect.forkChild(peer.client.pick('activate'))
        expect(yield* peer.receive('grab.pick')).toEqual({
          v: 1,
          type: 'grab.pick',
          requestId: 'page-pick-1',
          mode: 'activate',
        })
        yield* peer.send({
          v: 1,
          seq: 4,
          type: 'grabResult',
          requestId: 'page-pick-1',
          grab: {text: 'Pay button', preview, rect, source: null},
          reason: null,
        })
        expect(yield* peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 4})
        expect(yield* Fiber.join(answered)).toEqual({text: 'Pay button', preview, rect, source: null})

        const cancelledByNative = yield* Effect.forkChild(peer.client.pick('comment'))
        expect(yield* peer.receive('grab.pick')).toEqual({
          v: 1,
          type: 'grab.pick',
          requestId: 'page-pick-2',
          mode: 'comment',
        })
        yield* peer.send({v: 1, seq: 5, type: 'grabResult', requestId: 'page-pick-2', grab: null, reason: 'cancelled'})
        expect(yield* peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 5})
        expect(yield* Fiber.join(cancelledByNative)).toBeNull()

        const cancelledByPage = yield* Effect.forkChild(peer.client.pick('activate'))
        expect(yield* peer.receive('grab.pick')).toEqual({
          v: 1,
          type: 'grab.pick',
          requestId: 'page-pick-3',
          mode: 'activate',
        })
        yield* peer.client.cancel
        expect(yield* peer.receive('grab.cancel')).toEqual({v: 1, type: 'grab.cancel', requestId: 'page-pick-3'})
        expect(yield* Fiber.join(cancelledByPage)).toBeNull()

        yield* peer.client.panelToggled({open: true, connected: true, mascotRect: rect})
        expect(yield* peer.receive('host.panelToggled')).toEqual({
          v: 1,
          type: 'host.panelToggled',
          open: true,
          connected: true,
          mascotRect: rect,
        })

        const newer = yield* connectPeer({clientId: 'newer', apiBase})
        expect(yield* newer.receive('handshake.hello')).toEqual({
          v: 1,
          type: 'handshake.hello',
          minV: 1,
          maxV: 1,
          clientId: 'newer',
          bundleReady: true,
        })
        yield* newer.send({v: 2, seq: 1, type: 'handshake', apiBase, token: null})
        expect(yield* newer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 1})
        expect(IosBridgeMachine.readIncompatible(yield* newer.state)).toEqual({nativeMinV: 2, nativeMaxV: 2})

        const older = yield* connectPeer({clientId: 'older', apiBase})
        yield* older.send({v: 0, seq: 1, type: 'handshake', apiBase, token: null})
        expect(yield* older.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 1})
        expect(IosBridgeMachine.readIncompatible(yield* older.state)).toEqual({nativeMinV: 0, nativeMaxV: 0})
      }),
  )
})
