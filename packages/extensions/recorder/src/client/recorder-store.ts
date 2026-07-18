import {createSignal} from 'solid-js'

export type RecorderStatus = 'starting' | 'recording' | 'failed'

export type RecorderStore = {
  status: () => RecorderStatus
  setStatus: (status: RecorderStatus) => void
  live: () => boolean
  setLive: (live: boolean) => void
  clientId: () => string | null
  setClientId: (clientId: string) => void
}

export function createRecorderStore(): RecorderStore {
  const [status, setStatus] = createSignal<RecorderStatus>('starting')
  const [live, setLive] = createSignal(false)
  const [clientId, setClientId] = createSignal<string | null>(null)
  return {status, setStatus, live, setLive, clientId, setClientId}
}
