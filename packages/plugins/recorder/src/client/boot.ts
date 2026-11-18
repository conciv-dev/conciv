import {onCleanup} from 'solid-js'
import {createStore} from 'solid-js/store'
import {createKeyed, type Context} from '@conciv/plugin/experimental'
import {Page} from '@conciv/plugin/experimental/page'
import {Recorder} from '../rpc.js'
import {loadCaptureLibrary} from './capture.js'
import {createCaptureSession, type CaptureSession} from './capture-session.js'
import {createFlusher} from './flusher.js'

export type CaptureState = {readonly failed: boolean; flushNow(): Promise<void>}

export function bootCapture(ctx: Context, clientId: string): CaptureState {
  const recorder = ctx.client.rpc(Recorder)
  const page = ctx.use(Page)
  const [state, setState] = createStore({failed: false, live: false})
  createKeyed(
    () => (ctx.servers.get('engine')?.connected ? 'engine' : undefined),
    () => {
      const reading = new AbortController()
      onCleanup(() => reading.abort())
      void recorder.state(undefined, {signal: reading.signal}).then(
        (current) => setState('live', current.live),
        (error: unknown) => {
          if (reading.signal.aborted) return
          console.error('[conciv] the recorder state could not be read', error)
        },
      )
    },
  )
  recorder.events.on(
    'control',
    (event) => {
      if (event.data.live !== undefined) setState('live', event.data.live)
    },
    {signal: ctx.signal},
  )
  const flusher = createFlusher({send: (events) => recorder.flush({clientId, events}).then(() => undefined)})
  onCleanup(() => flusher.dispose())

  const exclude = (): string | undefined => {
    const current = page()
    if (current.status !== 'active' || !state.live) return undefined
    return current.value.capture.exclude
  }

  createKeyed(exclude, (selector) => {
    const run = new AbortController()
    const session: {current: CaptureSession | undefined} = {current: undefined}
    onCleanup(() => {
      run.abort()
      void session.current?.finish()
    })
    const failed = (): void => {
      if (!run.signal.aborted) setState('failed', true)
    }
    void loadCaptureLibrary()
      .then(async (library) => {
        const config = await recorder.config(undefined, {signal: run.signal})
        if (run.signal.aborted) return
        session.current = createCaptureSession({
          library,
          config,
          exclude: selector,
          reloadConfig: () => recorder.config(undefined, {signal: run.signal}),
          flusher,
          onFailed: failed,
        })
        setState('failed', false)
      })
      .catch((error: unknown) => {
        if (run.signal.aborted) return
        console.error('[conciv] the page capture could not start', error)
        failed()
      })
    recorder.events.on(
      'control',
      async (event) => {
        if (event.data.snapshot) session.current?.takeSnapshot()
        if (event.data.flush) await session.current?.flushNow()
      },
      {signal: run.signal},
    )
  })

  return {
    get failed() {
      return state.failed
    },
    flushNow: () => flusher.flushNow(),
  }
}
