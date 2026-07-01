import {createSignal, Show, type JSX} from 'solid-js'
import {defineExtension} from '@conciv/extension'

function Component(): JSX.Element {
  const grab = ping.useContext((context) => context.grab)
  const [pinged, setPinged] = createSignal(false)
  const [picked, setPicked] = createSignal<string | null>(null)
  const pick = async () => {
    const result = await grab.pick()
    setPicked(result?.source?.filePath ?? 'nothing')
  }
  return (
    <div>
      <button type="button" aria-label="Ping" onClick={() => setPinged(true)}>
        Ping
      </button>
      <button type="button" aria-label="Pick an element" onClick={pick}>
        Pick
      </button>
      <Show when={pinged()}>
        <p>Pinged</p>
      </Show>
      <Show when={picked()}>
        <p>Picked: {picked()}</p>
      </Show>
    </div>
  )
}

const ping = defineExtension({name: 'ping', Component})

export default ping
