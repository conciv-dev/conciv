import {makeExtRpcClient} from '@conciv/extension'
import {RECORDER_NAME, type RecorderControl, type RrwebEvent} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {startCapture, takeFreshSnapshot} from './capture.js'
import {createFlusher, type Flusher} from './flusher.js'
import {createVisibilityPauser} from './visibility-pauser.js'
import type {RecorderStore} from './recorder-store.js'

const RECONNECT_MS = 1000

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function bootRecorder(apiBase: string, store: RecorderStore): () => void {
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const clientId = crypto.randomUUID()
  store.setClientId(clientId)
  const abort = new AbortController()
  let stopRecord: (() => void) | undefined
  let flusher: Flusher | undefined

  const offListeners: (() => void)[] = []
  const listenFlush = (target: Window | Document, name: string): void => {
    const handler = (): void => void flusher?.flushNow()
    target.addEventListener(name, handler)
    offListeners.push(() => target.removeEventListener(name, handler))
  }

  const handleControl = async (message: RecorderControl): Promise<void> => {
    if (message.snapshot) takeFreshSnapshot()
    if (message.flush) await flusher?.flushNow()
    if (message.live !== undefined) {
      flusher?.setLive(message.live)
      store.setLive(message.live)
    }
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

  const begin = async (): Promise<void> => {
    try {
      const config = await rpc.config(undefined)
      flusher = createFlusher({send: (events: RrwebEvent[]) => rpc.flush({clientId, events}).then(() => undefined)})
      stopRecord = startCapture(config, (event) => flusher?.push(event))
      listenFlush(window, 'error')
      listenFlush(window, 'unhandledrejection')
      listenFlush(window, 'beforeunload')
      listenFlush(document, 'visibilitychange')
      const pauser = createVisibilityPauser({
        isHidden: () => document.visibilityState === 'hidden',
        pause: () => {
          stopRecord?.()
          stopRecord = undefined
          void flusher?.flushNow()
        },
        resume: () => {
          void rpc
            .config(undefined)
            .then((resumedConfig) => {
              stopRecord = startCapture(resumedConfig, (event) => flusher?.push(event))
            })
            .catch(() => store.setStatus('failed'))
        },
      })
      document.addEventListener('visibilitychange', pauser.onVisibilityChange)
      offListeners.push(() => {
        pauser.dispose()
        document.removeEventListener('visibilitychange', pauser.onVisibilityChange)
      })
      store.setStatus('recording')
      void controlLoop()
    } catch {
      store.setStatus('failed')
    }
  }

  void begin()

  return () => {
    abort.abort()
    stopRecord?.()
    for (const off of offListeners) off()
    flusher?.dispose()
  }
}
