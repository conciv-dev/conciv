import {describe, expect} from 'vitest'
import {Effect} from 'effect'
import type {ImagePreview} from '@conciv/plugin/experimental/grab'
import {test} from '../test/ios-test.js'
import {IosBridgeMachine} from './bridge-machine.js'

describe('the native app talks to the widget', () => {
  test('the native peer shakes hands, opens and closes the panel and answers a grab; an incompatible version is refused', async ({
    nativePeer,
  }) => {
    const apiBase = 'http://127.0.0.1:4111'
    const peer = await nativePeer({clientId: 'page', apiBase})

    expect(await peer.receive('bridge.ready')).toEqual({v: 1, type: 'bridge.ready'})
    expect(await peer.receive('handshake.hello')).toEqual({
      v: 1,
      type: 'handshake.hello',
      minV: 1,
      maxV: 1,
      clientId: 'page',
      bundleReady: true,
    })
    await peer.send({v: 1, seq: 1, type: 'handshake', apiBase})
    expect(await peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 1})
    expect(IosBridgeMachine.readIncompatible(await peer.state())).toBeNull()

    await peer.send({v: 1, seq: 2, type: 'open'})
    expect(await peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 2})
    expect(await peer.signal()).toEqual({type: 'open'})

    await peer.send({v: 1, seq: 3, type: 'close'})
    expect(await peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 3})
    expect(await peer.signal()).toEqual({type: 'close'})

    const preview: ImagePreview = {kind: 'image', dataUrl: 'data:image/png;base64,AAAA', width: 120, height: 44}
    const rect = {x: 16, y: 600, width: 120, height: 44}
    const answered = Effect.runPromise(peer.client.pick('activate'))
    expect(await peer.receive('grab.pick')).toEqual({
      v: 1,
      type: 'grab.pick',
      requestId: 'page-pick-1',
      mode: 'activate',
    })
    await peer.send({
      v: 1,
      seq: 4,
      type: 'grabResult',
      requestId: 'page-pick-1',
      grab: {text: 'Pay button', preview, rect, source: null},
      reason: null,
    })
    expect(await peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 4})
    expect(await answered).toEqual({text: 'Pay button', preview, rect, source: null})

    const cancelledByNative = Effect.runPromise(peer.client.pick('comment'))
    expect(await peer.receive('grab.pick')).toEqual({
      v: 1,
      type: 'grab.pick',
      requestId: 'page-pick-2',
      mode: 'comment',
    })
    await peer.send({v: 1, seq: 5, type: 'grabResult', requestId: 'page-pick-2', grab: null, reason: 'cancelled'})
    expect(await peer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 5})
    expect(await cancelledByNative).toBeNull()

    const cancelledByPage = Effect.runPromise(peer.client.pick('activate'))
    expect(await peer.receive('grab.pick')).toEqual({
      v: 1,
      type: 'grab.pick',
      requestId: 'page-pick-3',
      mode: 'activate',
    })
    await Effect.runPromise(peer.client.cancel)
    expect(await peer.receive('grab.cancel')).toEqual({v: 1, type: 'grab.cancel', requestId: 'page-pick-3'})
    expect(await cancelledByPage).toBeNull()

    await Effect.runPromise(peer.client.panelToggled({open: true, connected: true, mascotRect: rect}))
    expect(await peer.receive('host.panelToggled')).toEqual({
      v: 1,
      type: 'host.panelToggled',
      open: true,
      connected: true,
      mascotRect: rect,
    })

    const newer = await nativePeer({clientId: 'newer', apiBase})
    expect(await newer.receive('handshake.hello')).toEqual({
      v: 1,
      type: 'handshake.hello',
      minV: 1,
      maxV: 1,
      clientId: 'newer',
      bundleReady: true,
    })
    await newer.send({v: 2, seq: 1, type: 'handshake', apiBase})
    expect(await newer.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 1})
    expect(IosBridgeMachine.readIncompatible(await newer.state())).toEqual({nativeMinV: 2, nativeMaxV: 2})

    const older = await nativePeer({clientId: 'older', apiBase})
    await older.send({v: 0, seq: 1, type: 'handshake', apiBase})
    expect(await older.receive('bridge.ack')).toEqual({v: 1, type: 'bridge.ack', seq: 1})
    expect(IosBridgeMachine.readIncompatible(await older.state())).toEqual({nativeMinV: 0, nativeMaxV: 0})
  })
})
