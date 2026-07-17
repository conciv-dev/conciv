import {createSignal} from 'solid-js'

export type RecorderStatus = 'starting' | 'recording' | 'failed'

export type RecorderStore = {
  status: () => RecorderStatus
  setStatus: (status: RecorderStatus) => void
  live: () => boolean
  setLive: (live: boolean) => void
}

export function createRecorderStore(): RecorderStore {
  const [status, setStatus] = createSignal<RecorderStatus>('starting')
  const [live, setLive] = createSignal(false)
  return {status, setStatus, live, setLive}
}
