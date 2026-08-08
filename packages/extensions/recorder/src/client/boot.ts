import {makeExtRpcClient} from '@conciv/extension'
import {RECORDER_NAME, type RecorderControl} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {createCaptureSession, type CaptureSession} from './capture-session.js'
import type {RecorderStore} from './recorder-store.js'

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
    try {
      const control = await rpc.control(undefined, {
        signal: abort.signal,
        context: {retry: Number.POSITIVE_INFINITY},
      })
      for await (const message of control) await handleControl(message)
    } catch {}
  }

  void controlLoop()

  return () => {
    abort.abort()
    const active = session
    session = undefined
    void active?.finish()
  }
}
