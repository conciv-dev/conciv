import {makeExtRpcClient} from '@conciv/extension'
import {RECORDER_NAME, type RecorderConfig, type RecorderControl, type RrwebEvent} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {startCapture, takeFreshSnapshot} from './capture.js'
import {createFlusher} from './flusher.js'
import {createVisibilityPauser} from './visibility-pauser.js'
import type {RecorderStore} from './recorder-store.js'

const RECONNECT_MS = 1000

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

type CaptureSession = {
  takeSnapshot(): void
  flushNow(): Promise<void>
  finish(): Promise<void>
}

function createCaptureSession(opts: {
  config: RecorderConfig
  reloadConfig: () => Promise<RecorderConfig>
  send: (events: RrwebEvent[]) => Promise<void>
  onFailed: () => void
}): CaptureSession {
  const flusher = createFlusher({send: opts.send})
  flusher.setLive(true)
  let stopRecord: (() => void) | undefined = startCapture(opts.config, (event) => flusher.push(event))
  const offListeners: (() => void)[] = []
  const listenFlush = (target: Window | Document, name: string): void => {
    const handler = (): void => void flusher.flushNow()
    target.addEventListener(name, handler)
    offListeners.push(() => target.removeEventListener(name, handler))
  }
  listenFlush(window, 'error')
  listenFlush(window, 'unhandledrejection')
  listenFlush(window, 'beforeunload')
  listenFlush(document, 'visibilitychange')
  const pauser = createVisibilityPauser({
    isHidden: () => document.visibilityState === 'hidden',
    pause: () => {
      stopRecord?.()
      stopRecord = undefined
      void flusher.flushNow()
    },
    resume: () => {
      void opts
        .reloadConfig()
        .then((resumedConfig) => {
          stopRecord = startCapture(resumedConfig, (event) => flusher.push(event))
        })
        .catch(() => opts.onFailed())
    },
  })
  document.addEventListener('visibilitychange', pauser.onVisibilityChange)
  offListeners.push(() => {
    pauser.dispose()
    document.removeEventListener('visibilitychange', pauser.onVisibilityChange)
  })
  return {
    takeSnapshot: () => takeFreshSnapshot(),
    flushNow: () => flusher.flushNow(),
    async finish() {
      stopRecord?.()
      stopRecord = undefined
      for (const off of offListeners) off()
      await flusher.flushNow()
      flusher.dispose()
    },
  }
}

export function bootRecorder(apiBase: string, store: RecorderStore): () => void {
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const clientId = crypto.randomUUID()
  store.setClientId(clientId)
  const abort = new AbortController()
  let session: CaptureSession | undefined

  const sessionBlocked = (): boolean => session !== undefined || abort.signal.aborted

  const startSession = async (): Promise<void> => {
    if (sessionBlocked()) return
    try {
      const config = await rpc.config(undefined)
      if (sessionBlocked()) return
      session = createCaptureSession({
        config,
        reloadConfig: () => rpc.config(undefined),
        send: (events) => rpc.flush({clientId, events}).then(() => undefined),
        onFailed: () => store.setStatus('failed'),
      })
      store.setStatus('recording')
    } catch {
      store.setStatus('failed')
    }
  }

  const stopSession = async (): Promise<void> => {
    const active = session
    if (!active) return
    session = undefined
    store.setStatus('idle')
    await active.finish()
  }

  const beginLive = async (): Promise<void> => {
    store.setLive(true)
    await startSession()
  }

  const endLive = async (): Promise<void> => {
    store.setLive(false)
    await stopSession()
  }

  const applySessionSignals = async (message: RecorderControl): Promise<void> => {
    if (message.snapshot) session?.takeSnapshot()
    if (message.flush) await session?.flushNow()
  }

  const handleControl = async (message: RecorderControl): Promise<void> => {
    if (message.live === true) await beginLive()
    await applySessionSignals(message)
    if (message.live === false) await endLive()
  }

  const controlLoop = async (): Promise<void> => {
    while (!abort.signal.aborted) {
      try {
        const control = await rpc.control(undefined, {signal: abort.signal})
        for await (const message of control) await handleControl(message)
      } catch {
        if (abort.signal.aborted) return
        await wait(RECONNECT_MS)
      }
    }
  }

  void controlLoop()

  return () => {
    abort.abort()
    const active = session
    session = undefined
    void active?.finish()
  }
}
