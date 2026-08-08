import {createSignal, onMount, Show, type JSX} from 'solid-js'
import {defineExtension, getHostApi, makeExtRpcClient} from '@conciv/extension'
import type {PingRouter} from './router.js'

function Component(): JSX.Element {
  const host = getHostApi()
  const grab = host.useGrab()
  const apiBase = host.useApiBase()
  const [pinged, setPinged] = createSignal(false)
  const [picked, setPicked] = createSignal<string | null>(null)
  const [pong, setPong] = createSignal<string | null>(null)
  const rpc = (): ReturnType<typeof makeExtRpcClient<PingRouter>> => makeExtRpcClient<PingRouter>(apiBase(), 'ping')
  const callPing = async (value: string): Promise<void> => {
    const result = await rpc().ping({value})
    setPong(result.pong)
  }
  const pick = async () => {
    const result = await grab.pick()
    setPicked(result?.source?.filePath ?? 'nothing')
  }
  onMount(() => void callPing('boot'))
  return (
    <div>
      <button type="button" aria-label="Ping" onClick={() => setPinged(true)}>
        Ping
      </button>
      <button type="button" aria-label="Pick an element" onClick={pick}>
        Pick
      </button>
      <button type="button" aria-label="Roundtrip over rpc" onClick={() => void callPing('again')}>
        Roundtrip over rpc
      </button>
      <Show when={pinged()}>
        <p>Pinged</p>
      </Show>
      <Show when={picked()}>
        <p>Picked: {picked()}</p>
      </Show>
      <Show when={pong()}>
        <p>pong: {pong()}</p>
      </Show>
    </div>
  )
}

const ping = defineExtension({name: 'ping', Component})

export default ping
