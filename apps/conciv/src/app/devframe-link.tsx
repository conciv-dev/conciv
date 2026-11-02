import {from, onMount, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {render} from 'solid-js/web'
import {browserClient} from '@conciv/extension/devframe-connection'
import {Button, TextField} from '@conciv/ui-kit-system'
import {resolveHubBase} from '../lib/api-base.js'

export type HubConnection = ReturnType<typeof browserClient>
type HubClient = Awaited<ReturnType<HubConnection['ready']>>
export type TrustedLink = {apiBase: string; hub: HubConnection}

const HUB_PATH = '/__conciv/'
const TOKEN_SEGMENT = /\/t\/([^/]+)/
const CODE_LENGTH = 6

function reportFailure(what: string): (error: unknown) => void {
  return (error) => console.error(`conciv: ${what}`, error)
}

function untilTrusted(client: HubClient): Promise<void> {
  return new Promise((resolve) => {
    if (client.isTrusted) {
      resolve()
      return
    }
    const off = client.events.on('rpc:is-trusted:updated', (trusted) => {
      if (!trusted) return
      off()
      resolve()
    })
  })
}

function AuthorizeCard(props: {client: HubClient}): JSX.Element {
  const [form, setForm] = createStore({code: '', refused: false})
  onMount(() => void props.client.requestAuthCode().catch(reportFailure('requesting a login code failed')))
  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    const trusted = await props.client.requestTrustWithCode(form.code).catch(() => false)
    setForm('refused', !trusted)
  }
  return (
    <form
      aria-label="Authorize conciv"
      class="pointer-events-auto fixed bottom-6 right-6 z-10 flex w-80 flex-col gap-3 p-5 font-chat text-chat-text bg-chat-panel [border:1px_solid_var(--chat-line)] rounded-chat-surface-lg shadow-chat-lg"
      onSubmit={(event) => void submit(event)}
    >
      <h2 class="text-[0.9375rem] font-semibold">Authorize conciv</h2>
      <p class="text-[0.8125rem] leading-[1.45] text-chat-text-2">
        conciv can read your project, run tools and open your editor. Enter the 6-digit code printed in the terminal
        that runs your dev server.
      </p>
      <TextField
        label="Code"
        name="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxLength={CODE_LENGTH}
        value={form.code}
        aria-invalid={form.refused}
        onInput={(event) => setForm({code: event.currentTarget.value.replace(/\D/g, ''), refused: false})}
      />
      <Show when={form.refused}>
        <p role="alert" class="text-[0.8125rem] text-chat-danger">
          That code did not match. Check the terminal and try again.
        </p>
      </Show>
      <Button type="submit" disabled={form.code.length < CODE_LENGTH}>
        Authorize
      </Button>
      <Button
        variant="link"
        size="bare"
        class="self-start"
        onClick={() =>
          void props.client.requestAuthCode({reissue: true}).catch(reportFailure('reissuing a login code failed'))
        }
      >
        Send a new code
      </Button>
    </form>
  )
}

function unauthorizedOf(client: HubClient): () => boolean | undefined {
  return from<boolean>((set) => {
    set(client.status === 'unauthorized')
    return client.events.on('connection:status', (next) => set(next === 'unauthorized'))
  })
}

function AuthorizeGate(props: {client: HubClient; unauthorized: () => boolean | undefined}): JSX.Element {
  return (
    <Show when={props.unauthorized()}>
      <AuthorizeCard client={props.client} />
    </Show>
  )
}

async function loggedIn(mount: Node, client: HubClient): Promise<string> {
  const host = document.createElement('div')
  mount.appendChild(host)
  const dispose = render(() => <AuthorizeGate client={client} unauthorized={unauthorizedOf(client)} />, host)
  try {
    await untilTrusted(client)
  } finally {
    dispose()
    host.remove()
  }
  const token = client.connection.authToken
  if (!token) throw new Error('conciv: the hub trusted this tab without a login token')
  return token
}

export async function trustedApiBase(mount: Node, apiBase: string): Promise<TrustedLink> {
  const url = new URL(apiBase, window.location.href)
  const token = TOKEN_SEGMENT.exec(url.pathname)?.[1]
  const hub = browserClient({baseURL: `${resolveHubBase(url.origin)}${HUB_PATH}`, authToken: token})
  if (token !== undefined) {
    hub.ready().catch(reportFailure('the hub connection failed'))
    return {apiBase, hub}
  }
  return {apiBase: `${url.origin}/t/${await loggedIn(mount, await hub.ready())}`, hub}
}
