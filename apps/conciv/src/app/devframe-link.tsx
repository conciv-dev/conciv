import {from, onCleanup, onMount, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {render} from 'solid-js/web'
import {browserClient} from '@conciv/extension/devframe-connection'
import {Button, Dialog, EnvironmentProvider, TextField} from '@conciv/ui-kit-system'
import {resolveHubBase} from '../lib/api-base.js'

export type HubConnection = ReturnType<typeof browserClient>
type HubClient = Awaited<ReturnType<HubConnection['ready']>>

const HUB_PATH = '/__conciv/'
const TOKEN_SEGMENT = /\/t\/([^/]+)/
const CODE_LENGTH = 6

function reportFailure(what: string): (error: unknown) => void {
  return (error) => console.error(`conciv: ${what}`, error)
}

function tokenOf(apiBase: string): string | undefined {
  return TOKEN_SEGMENT.exec(new URL(apiBase, window.location.href).pathname)?.[1]
}

export function hasLoginToken(apiBase: string): boolean {
  return tokenOf(apiBase) !== undefined
}

function AuthorizeCard(props: {client: HubClient; onTrusted: (token: string) => void}): JSX.Element {
  const [form, setForm] = createStore({code: '', refused: false})
  onMount(() => void props.client.requestAuthCode().catch(reportFailure('requesting a login code failed')))
  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    const trusted = await props.client.requestTrustWithCode(form.code).catch(() => false)
    setForm('refused', !trusted)
    const token = props.client.connection.authToken
    if (trusted && token) props.onTrusted(token)
  }
  return (
    <Dialog title="Authorize conciv" open>
      <form aria-label="Authorize conciv" class="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <p class="text-sm text-chat-text-2 m-0">
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
          <p role="alert" class="text-sm text-chat-danger m-0">
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
    </Dialog>
  )
}

function unauthorizedOf(client: HubClient): () => boolean | undefined {
  return from<boolean>((set) => {
    set(client.status === 'unauthorized')
    return client.events.on('connection:status', (next) => set(next === 'unauthorized'))
  })
}

function watchTrust(client: HubClient, onTrusted: (token: string) => void): () => void {
  const trust = (trusted: boolean | null): void => {
    const token = client.connection.authToken
    if (trusted && token) onTrusted(token)
  }
  trust(client.isTrusted)
  return client.events.on('rpc:is-trusted:updated', trust)
}

function AuthorizeGate(props: {
  client: HubClient
  unauthorized: () => boolean | undefined
  onTrusted: (token: string) => void
}): JSX.Element {
  onMount(() => onCleanup(watchTrust(props.client, props.onTrusted)))
  return (
    <Show when={props.unauthorized()}>
      <AuthorizeCard client={props.client} onTrusted={props.onTrusted} />
    </Show>
  )
}

function connectedClientOf(hub: HubConnection): () => HubClient | undefined {
  return from<HubClient>((set) => hub.onClient((next) => set(() => next)))
}

function HubLogin(props: {client: () => HubClient | undefined; onTrusted: (token: string) => void}): JSX.Element {
  return (
    <Show when={props.client()} keyed>
      {(ready) => <AuthorizeGate client={ready} unauthorized={unauthorizedOf(ready)} onTrusted={props.onTrusted} />}
    </Show>
  )
}

export function hubBaseOf(apiBase: string): string {
  return `${resolveHubBase(new URL(apiBase, window.location.href).origin)}${HUB_PATH}`
}

export function hubFor(apiBase: string): HubConnection {
  return browserClient({baseURL: hubBaseOf(apiBase), authToken: tokenOf(apiBase)})
}

export function renderLogin(
  mount: Node,
  hub: HubConnection,
  apiBase: string,
  onTrusted: (trustedApiBase: string) => void,
): () => void {
  hub.ready().catch(reportFailure('the hub connection failed'))
  if (hasLoginToken(apiBase)) {
    onTrusted(apiBase)
    return () => {}
  }
  const origin = new URL(apiBase, window.location.href).origin
  const host = document.createElement('div')
  host.className = 'font-chat text-chat-text'
  mount.appendChild(host)
  const rootNode = host.getRootNode()
  const dispose = render(() => {
    const client = connectedClientOf(hub)
    return (
      <EnvironmentProvider value={() => rootNode}>
        <HubLogin client={client} onTrusted={(token) => onTrusted(`${origin}/t/${token}`)} />
      </EnvironmentProvider>
    )
  }, host)
  return () => {
    dispose()
    host.remove()
  }
}
