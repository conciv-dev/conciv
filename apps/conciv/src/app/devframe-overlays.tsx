import {For, Show, createContext, createMemo, from, untrack, useContext, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {AsyncQueuer} from '@tanstack/pacer'
import {createDevframeClientRuntime, type DevframeClientRuntime} from '@devframes/hub/client'
import {HUB_EVENTS} from '@devframes/hub/constants'
import type {DevframeCommandEntry, DevframeDockEntry} from '@devframes/hub/types'
import type {SharedState} from 'devframe/utils/shared-state'
import {AnchoredListbox, Dialog, createListCollection} from '@conciv/ui-kit-system'
import {z} from 'zod'
import type {HubConnection} from './devframe-link.js'
import {useLayers} from './context.js'
import {useNotices} from '../shell/notice-context.js'
import type {NoticeTone, Notify} from '../shell/notices.js'

type HubClient = Awaited<ReturnType<HubConnection['ready']>>

export type HubLink = {runtime: DevframeClientRuntime; docks: SharedState<DevframeDockEntry[]>}

export type HubShell = {
  link: () => HubLink | undefined
  docks: () => readonly DevframeDockEntry[]
}

const MESSAGES_SCOPE = 'devframes:plugin:messages'

const MessageLevelSchema = z.enum(['info', 'warn', 'error', 'success', 'debug'])

const MessagesDeltaSchema = z.object({
  entries: z.array(
    z.object({id: z.string(), message: z.string(), level: MessageLevelSchema, notify: z.boolean().optional()}),
  ),
  version: z.number(),
  full: z.boolean(),
})

const NOTICE_TONE: Record<z.infer<typeof MessageLevelSchema>, NoticeTone> = {
  info: 'info',
  debug: 'info',
  warn: 'warn',
  error: 'danger',
  success: 'success',
}

const NO_DOCKS: readonly DevframeDockEntry[] = []

const EMPTY_SHELL: HubShell = {link: () => undefined, docks: () => NO_DOCKS}

const HubShellContext = createContext<HubShell>(EMPTY_SHELL)

export function useHubShell(): HubShell {
  return useContext(HubShellContext)
}

function reportFailure(what: string): (error: unknown) => void {
  return (error) => console.error(`conciv: ${what}`, error)
}

function watchMessages(client: HubClient, signal: AbortSignal, notify: Notify): void {
  const cursor: {version?: number} = {}
  const queue = new AsyncQueuer<'refresh'>(
    async () => {
      const delta = MessagesDeltaSchema.parse(await client.scope(MESSAGES_SCOPE).rpc.call('list', cursor.version))
      cursor.version = delta.version
      if (delta.full || signal.aborted) return
      delta.entries
        .filter((entry) => entry.notify === true)
        .forEach((entry) => notify(entry.message, {key: `hub-message:${entry.id}`, tone: NOTICE_TONE[entry.level]}))
    },
    {concurrency: 1, onError: reportFailure('reading the hub message feed failed')},
  )
  const refresh = (): void => {
    if (!signal.aborted) queue.addItem('refresh')
  }
  const existing = client.client.definitions.get(HUB_EVENTS.broadcast.messagesUpdated)
  if (existing) {
    const previous = existing.handler
    existing.handler = (...args: unknown[]) => {
      refresh()
      return previous?.(...args)
    }
  } else client.client.register({name: HUB_EVENTS.broadcast.messagesUpdated, type: 'action', handler: refresh})
  refresh()
}

async function openLink(client: HubClient, signal: AbortSignal, notify: Notify): Promise<HubLink | undefined> {
  if (!(await client.ensureTrusted(0)) || signal.aborted) return undefined
  const [runtime, docks] = await Promise.all([
    createDevframeClientRuntime({rpc: client, clientType: 'embedded', loadClientScripts: false}),
    client.sharedState.get<DevframeDockEntry[]>(HUB_EVENTS.sharedState.docks, {initialValue: []}),
  ])
  if (signal.aborted) {
    runtime.dispose()
    return undefined
  }
  signal.addEventListener('abort', runtime.dispose, {once: true})
  watchMessages(client, signal, notify)
  return {runtime, docks}
}

function watchLink(hub: HubConnection, notify: Notify, publish: (link: HubLink | undefined) => void): () => void {
  const linking = {current: new AbortController()}
  const offClient = hub.onClient((client) => {
    linking.current.abort()
    linking.current = new AbortController()
    const {signal} = linking.current
    publish(undefined)
    openLink(client, signal, notify)
      .then((link) => {
        if (link && !signal.aborted) publish(link)
      })
      .catch((error: unknown) => {
        if (!signal.aborted) reportFailure('the hub shell failed to start')(error)
      })
  })
  return () => {
    offClient()
    linking.current.abort()
  }
}

function liveDocks(state: SharedState<DevframeDockEntry[]>): () => readonly DevframeDockEntry[] | undefined {
  return from<readonly DevframeDockEntry[]>((set) => {
    set(state.value())
    return state.on('updated', (next) => set(next))
  })
}

function createHubShell(hub: Accessor<HubConnection> | undefined, notify: Notify): HubShell {
  if (!hub) return EMPTY_SHELL
  const linkOfConnection = createMemo(() => {
    const connection = hub()
    return from<HubLink>((set) => watchLink(connection, notify, (next) => set(() => next)))
  })
  const link = () => linkOfConnection()()
  const docks = createMemo(() => {
    const current = link()
    return current ? liveDocks(current.docks) : () => NO_DOCKS
  })
  return {link, docks: () => docks()() ?? NO_DOCKS}
}

export function HubShellProvider(props: {
  hub: Accessor<HubConnection> | undefined
  children: JSX.Element
}): JSX.Element {
  const notices = useNotices()
  const shell = createHubShell(
    untrack(() => props.hub),
    notices.notify,
  )
  return <HubShellContext.Provider value={shell}>{props.children}</HubShellContext.Provider>
}

function paletteLeaves(commands: readonly DevframeCommandEntry[]): DevframeCommandEntry[] {
  return commands
    .filter((command) => command.showInPalette !== false)
    .flatMap((command) => (command.children?.length ? paletteLeaves(command.children) : [command]))
}

function matchesQuery(command: DevframeCommandEntry, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return `${command.title} ${command.description ?? ''}`.toLowerCase().includes(needle)
}

export function CommandPalette(props: {enabled: boolean}): JSX.Element {
  const shell = useHubShell()
  const layers = useLayers()
  const notices = useNotices()
  const TrackedDialog = layers.track(Dialog)
  const [palette, setPalette] = createStore<{open: boolean; query: string; input?: HTMLInputElement}>({
    open: false,
    query: '',
  })

  createHotkey(
    'Mod+K',
    () => setPalette({open: !palette.open, query: ''}),
    () => ({enabled: props.enabled}),
  )

  const commands = createMemo(() => {
    const runtime = shell.link()?.runtime
    return palette.open && runtime ? paletteLeaves(runtime.context.commands.paletteCommands) : []
  })
  const collection = createMemo(() =>
    createListCollection({
      items: commands().filter((command) => matchesQuery(command, palette.query)),
      itemToValue: (command) => command.id,
      itemToString: (command) => command.title,
    }),
  )

  const run = (id: string): void => {
    const runtime = shell.link()?.runtime
    const command = commands().find((candidate) => candidate.id === id)
    setPalette({open: false, query: ''})
    if (!runtime || !command) return
    runtime.context.commands
      .execute(id)
      .catch(() => notices.notify(`Could not run ${command.title}.`, {key: `hub-command:${id}`, tone: 'danger'}))
  }

  return (
    <TrackedDialog
      label="Commands"
      layer="inline"
      open={palette.open}
      onOpenChange={(open) => setPalette({open, query: ''})}
      dismissable
      initialFocus={() => palette.input ?? null}
    >
      <AnchoredListbox.SearchRoot
        collection={collection()}
        label="Search commands"
        query={palette.query}
        onQueryChange={(query) => setPalette('query', query)}
        onSelect={run}
        inputRef={(element) => setPalette('input', element)}
      >
        <Show when={shell.link()} fallback={<AnchoredListbox.Message>Connecting to the hub</AnchoredListbox.Message>}>
          <AnchoredListbox.Content inline>
            <Show
              when={collection().size > 0}
              fallback={<AnchoredListbox.Message>No matching commands</AnchoredListbox.Message>}
            >
              <For each={collection().items}>
                {(command) => (
                  <AnchoredListbox.Item item={command} name={command.title} description={command.description}>
                    <AnchoredListbox.ItemText>{command.title}</AnchoredListbox.ItemText>
                  </AnchoredListbox.Item>
                )}
              </For>
            </Show>
          </AnchoredListbox.Content>
        </Show>
      </AnchoredListbox.SearchRoot>
    </TrackedDialog>
  )
}
