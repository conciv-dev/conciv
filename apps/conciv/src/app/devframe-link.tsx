import {createContext, createResource, createSignal, from, Show, useContext, type JSX} from 'solid-js'
import {createDevframeClientRuntime, type DevframeClientRuntime} from '@devframes/hub/client'
import {terminalDockRenderer} from '@conciv/extension-terminal/dock'
import {DevframeOverlays} from './devframe-overlays.js'
import {getDevframeRpcClient, type DevframeRpcClient} from 'devframe/client'
import type {QueryClient} from '@tanstack/solid-query'
import {Button} from '@conciv/ui-kit-system'
import type {AppData} from '../data/app-data.js'

const SESSIONS_STATE = 'conciv:sessions'
const CODE_LENGTH = 6

type DevframeLinkProps = {apiBase: () => string; queryClient: QueryClient; data: AppData; children?: JSX.Element}

const DevframeRuntimeContext = createContext<() => DevframeClientRuntime | undefined>(() => undefined)

export function useDevframeRuntime(): () => DevframeClientRuntime | undefined {
  return useContext(DevframeRuntimeContext)
}

function trustedOf(client: DevframeRpcClient): () => boolean | undefined {
  return from<boolean>((set) => {
    set(client.isTrusted === true)
    return client.events.on('rpc:is-trusted:updated', (isTrusted) => set(isTrusted))
  })
}

function startRuntime(client: DevframeRpcClient): Promise<DevframeClientRuntime> {
  return createDevframeClientRuntime({
    rpc: client,
    clientType: 'embedded',
    loadClientScripts: true,
    renderers: {'conciv-terminal': terminalDockRenderer},
  })
}

function syncSessions(client: DevframeRpcClient, props: DevframeLinkProps): void {
  void client.sharedState.get(SESSIONS_STATE).then((state) => {
    const write = (value: {sessions: unknown[]}): void => {
      props.queryClient.setQueriesData({queryKey: props.data.utils.sessions.list.key()}, value.sessions)
    }
    write(state.value())
    state.on('updated', write)
  })
}

function unauthorizedOf(client: DevframeRpcClient): () => boolean | undefined {
  return from<boolean>((set) => {
    set(client.status === 'unauthorized')
    return client.events.on('connection:status', (status) => set(status === 'unauthorized'))
  })
}

function AuthorizeCard(props: {client: DevframeRpcClient}): JSX.Element {
  const [code, setCode] = createSignal('')
  const [failed, setFailed] = createSignal(false)
  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault()
    setFailed(!(await props.client.requestTrustWithCode(code())))
  }
  return (
    <form
      class="pointer-events-auto fixed bottom-6 right-6 z-10 flex w-80 flex-col gap-3 p-5 font-chat text-chat-text [background:var(--chat-bg)] [border:1px_solid_var(--chat-line)] [border-radius:var(--chat-radius-lg)] shadow-chat-lg"
      onSubmit={(event) => void submit(event)}
      aria-label="Authorize conciv"
    >
      <h2 class="text-[0.9375rem] font-semibold">Authorize conciv</h2>
      <p class="text-[0.8125rem] leading-[1.45] text-chat-text-2">
        conciv can read your project, run tools and open your editor. Enter the 6-digit code from your terminal.
      </p>
      <input
        name="code"
        aria-label="Authorization code"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxLength={CODE_LENGTH}
        pattern="[0-9]{6}"
        value={code()}
        onInput={(event) => setCode(event.currentTarget.value.replace(/\D/g, ''))}
        aria-invalid={failed()}
        class="h-11 w-full text-center font-mono text-[1.25rem] tracking-[0.6em] [background:var(--chat-bg-2)] [border:1px_solid_var(--chat-line)] [border-radius:var(--chat-radius)] aria-[invalid=true]:[border-color:var(--chat-danger)]"
      />
      <Show when={failed()}>
        <p class="text-[0.8125rem] text-chat-danger" role="alert">
          That code didn't match. Check your terminal and try again.
        </p>
      </Show>
      <Button type="submit" disabled={code().length < CODE_LENGTH}>
        Authorize
      </Button>
      <button
        type="button"
        class="self-start text-[0.75rem] text-chat-text-3 underline"
        onClick={() => void props.client.requestAuthCode({reissue: true})}
      >
        Re-issue one-time password
      </button>
    </form>
  )
}

async function connect(apiBase: string, props: DevframeLinkProps): Promise<DevframeRpcClient> {
  const client = await getDevframeRpcClient({baseURL: `${apiBase}/__conciv/`, simpleAuth: false})
  client.events.on('rpc:is-trusted:updated', (isTrusted) => {
    if (isTrusted) syncSessions(client, props)
  })
  client.events.on('connection:status', (status) => {
    if (status === 'unauthorized') void client.requestAuthCode()
  })
  if (client.isTrusted) syncSessions(client, props)
  if (client.status === 'unauthorized') void client.requestAuthCode()
  return client
}

function Gate(props: {
  client: DevframeRpcClient
  unauthorized: () => boolean | undefined
  trusted: () => boolean | undefined
  children?: JSX.Element
}): JSX.Element {
  const [runtime] = createResource(
    () => (props.trusted() ? props.client : false),
    (client) => startRuntime(client),
  )
  return (
    <DevframeRuntimeContext.Provider value={() => runtime()}>
      {props.children}
      <Show when={runtime()}>{(ready) => <DevframeOverlays runtime={ready()} />}</Show>
      <Show when={props.unauthorized()}>
        <AuthorizeCard client={props.client} />
      </Show>
    </DevframeRuntimeContext.Provider>
  )
}

export function DevframeLink(props: DevframeLinkProps): JSX.Element {
  const [client] = createResource(
    () => props.apiBase(),
    (apiBase) => connect(apiBase, props),
  )
  return (
    <Show when={client()} fallback={props.children}>
      {(ready) => (
        <Gate client={ready()} unauthorized={unauthorizedOf(ready())} trusted={trustedOf(ready())}>
          {props.children}
        </Gate>
      )}
    </Show>
  )
}
