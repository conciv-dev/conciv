import {createSignal, onMount, Show, type JSX} from 'solid-js'
import {defineExtension, getExtensionApi, makeExtRpcClient} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'
import type {PingRouter} from './router.js'

const PING_NAME = 'ping'

function Component(): JSX.Element {
  const host = getExtensionApi(PING_NAME)
  const grab = host.useGrab()
  const apiBase = host.useApiBase()
  const [pinged, setPinged] = createSignal(false)
  const [picked, setPicked] = createSignal<string | null>(null)
  const [pong, setPong] = createSignal<string | null>(null)
  const [composerAction, setComposerAction] = createSignal<string | null>(null)
  const rpc = (): ReturnType<typeof makeExtRpcClient<PingRouter>> => makeExtRpcClient<PingRouter>(apiBase(), PING_NAME)
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
      <ComposerActions.Action priority={10}>
        <ComposerActions.ActionButton tooltip="Echo from the composer" onClick={() => setComposerAction('button')}>
          <span aria-hidden="true" class="size-5 block" />
        </ComposerActions.ActionButton>
        <ComposerActions.ActionMenuItem label="Insert an echo" onSelect={() => setComposerAction('insert')} />
        <ComposerActions.ActionMenuItem label="Clear the echo" onSelect={() => setComposerAction('clear')} />
      </ComposerActions.Action>
      <Show when={composerAction()}>
        <p>Composer action: {composerAction()}</p>
      </Show>
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

const ping = defineExtension({name: PING_NAME, Component})

export default ping
