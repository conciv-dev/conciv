import {createSignal} from 'solid-js'

export type RecorderStatus = 'idle' | 'recording' | 'failed'

export type RecorderStore = {
  status: () => RecorderStatus
  setStatus: (status: RecorderStatus) => void
  live: () => boolean
  setLive: (live: boolean) => void
  clientId: () => string
}

export function createRecorderStore(): RecorderStore {
  const [status, setStatus] = createSignal<RecorderStatus>('idle')
  const [live, setLive] = createSignal(false)
  const clientId = crypto.randomUUID()
  return {status, setStatus, live, setLive, clientId: () => clientId}
}
