import {makeExtRpcClient} from '@conciv/extension'
import {RECORDER_NAME, type RecorderControl} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {loadCaptureLibrary, type CaptureLibrary} from './capture.js'
import {createCaptureSession, type CaptureSession} from './capture-session.js'
import {createFlusher} from './flusher.js'
import type {RecorderStore} from './recorder-store.js'

export function bootRecorder(apiBase: string, store: RecorderStore): () => void {
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const clientId = store.clientId()
  const abort = new AbortController()
  const flusher = createFlusher({send: (events) => rpc.flush({clientId, events}).then(() => undefined)})
  let session: CaptureSession | undefined

  const sessionBlocked = (): boolean => session !== undefined || abort.signal.aborted || !store.live()

  const startCaptureSession = async (library: CaptureLibrary): Promise<void> => {
    try {
      const config = await rpc.config(undefined)
      if (sessionBlocked()) return
      session = createCaptureSession({
        library,
        config,
        reloadConfig: () => rpc.config(undefined),
        flusher,
        onFailed: () => store.setStatus('failed'),
      })
      store.setStatus('recording')
    } catch {
      if (!sessionBlocked()) store.setStatus('failed')
    }
  }

  const startSession = async (): Promise<void> => {
    if (sessionBlocked()) return
    const library = await loadCaptureLibrary().catch(() => undefined)
    if (sessionBlocked()) return
    if (library) return startCaptureSession(library)
    store.setStatus('blocked')
  }

  const stopSession = async (): Promise<void> => {
    const active = session
    if (!active) return
    session = undefined
    store.setStatus('idle')
    await active.finish()
  }

  const applySessionSignals = async (message: RecorderControl): Promise<void> => {
    if (message.snapshot) session?.takeSnapshot()
    if (message.flush) await session?.flushNow()
  }

  const handleControl = async (message: RecorderControl): Promise<void> => {
    if (message.live === true) await startSession()
    await applySessionSignals(message)
    if (message.live === false) await stopSession()
  }

  const applying = {tail: Promise.resolve()}

  const consumeControl = (message: RecorderControl): void => {
    if (message.live !== undefined) store.setLive(message.live)
    applying.tail = applying.tail
      .then(() => handleControl(message))
      .catch((error: unknown) => console.error('[conciv] recorder control failed', error))
  }

  const controlLoop = async (): Promise<void> => {
    try {
      const control = await rpc.control(undefined, {
        signal: abort.signal,
        context: {retry: Number.POSITIVE_INFINITY},
      })
      for await (const message of control) consumeControl(message)
    } catch {}
  }

  void controlLoop()

  return () => {
    abort.abort()
    const active = session
    session = undefined
    void active?.finish()
    flusher.dispose()
  }
}
