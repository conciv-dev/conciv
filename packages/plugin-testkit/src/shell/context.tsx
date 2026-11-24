import {createMemo, createRoot, For, getOwner, runWithOwner, type JSX} from 'solid-js'
import {createStore, produce, reconcile} from 'solid-js/store'
import {
  LinkHandler,
  type BaseContext,
  type Cleanup,
  type ComposerFile,
  type ComposerNote,
  type ComposerQuote,
  type Context,
  type Contract,
  type Live,
  type MountedSession,
  type Persisted,
  type PluginOptions,
  type Registry,
  type ServerRef,
  type SessionRef,
  type Token,
  type TokenValue,
} from '@conciv/plugin/experimental'
import {liveAccessor} from '@conciv/plugin/experimental/host'
import {useQuery} from '@conciv/client'
import {createUi} from '@internal/plugin/ui'
import {shellClient, type ShellEngine} from './client.js'

type ComposerPart = ComposerFile | ComposerNote | ComposerQuote

type EntryFor<T> = {key: string; registry: Registry<T>; value: () => T | undefined}

type Entry = EntryFor<unknown>

type Provided = {token: Token; value: unknown; generation: number}

export type ShellDialog = {key: string; render: () => JSX.Element; close: () => void}

export type ShellState = {
  entries: Entry[]
  contracts: Provided[]
  toasts: {key: string; title: string; description?: string}[]
  dialogs: ShellDialog[]
  composer: {text: string; parts: ComposerPart[]}
  open: string[]
  widget: boolean
}

export interface Shell {
  readonly context: Context
  readonly state: ShellState
  readonly session: MountedSession
  readonly server: ServerRef
  dispose(): void
}

function isAccessor<T>(item: T | (() => T | undefined)): item is () => T | undefined {
  return typeof item === 'function'
}

function isRegistryEntry<T>(entry: Entry, registry: Registry<T>): entry is EntryFor<T> {
  return entry.registry.id === registry.id
}

function isProvidedFor<T extends Token>(provided: Provided, token: T): provided is Provided & {value: TokenValue<T>} {
  return provided.token.id === token.id
}

function readLive<T extends Token>(contracts: readonly Provided[], token: T): Live<TokenValue<T>> {
  const provided = contracts.find((item) => isProvidedFor(item, token))
  if (provided === undefined || !isProvidedFor(provided, token)) return {status: 'pending'}
  return {status: 'active', value: provided.value, generation: provided.generation}
}

export function persistedCell<T extends object>(initial: T): Persisted<T, T> {
  const [cell, setCell] = createStore({value: initial})
  return {
    get value() {
      return cell.value
    },
    ready: () => true,
    update: () => {
      throw new Error('the fake app shell has no Persisted.update: use set(next)')
    },
    set: (next) => setCell('value', reconcile(next)),
  }
}

const APP = {name: 'conciv', version: '0.0.0', channel: 'local', platform: 'web', packaged: false} as const

const ui = createUi({
  SettingsHeader: (props) => (
    <header class="flex flex-col gap-1">
      <h2>{props.title}</h2>
      {props.description}
      {props.actions}
    </header>
  ),
  Group: (props) => (
    <section class="flex flex-col gap-2">
      {props.title === undefined ? undefined : <h3>{props.title}</h3>}
      {props.children}
      {props.footer}
    </section>
  ),
  ActionRow: (props) => (
    <div id={props.id} class="flex gap-2 items-center">
      <span>{props.label}</span>
      {props.hint}
      {props.children}
    </div>
  ),
  useLayers: () => ({register: () => () => {}}),
})

export function createShell(input: {id: string; options: PluginOptions; engine: ShellEngine | undefined}): Shell {
  return createRoot((dispose) => {
    const root = getOwner()
    const [state, setState] = createStore<ShellState>({
      entries: [],
      contracts: [],
      toasts: [],
      dialogs: [],
      composer: {text: '', parts: []},
      open: [],
      widget: true,
    })
    const controller = new AbortController()
    const sequence = {next: 0}
    const nextKey = () => {
      sequence.next += 1
      return `${input.id}/${sequence.next}`
    }
    const client = shellClient(input.engine)
    const server: ServerRef = {
      id: 'engine',
      name: 'conciv',
      url: 'http://engine.test',
      client,
      local: true,
      builtin: true,
      compatible: true,
      connected: input.engine !== undefined,
      data: {
        meta: {
          models: (sessionId) =>
            useQuery(() => ({
              queryKey: ['meta', 'models', sessionId()],
              queryFn: () => client.meta.models({sessionId: sessionId() ?? ''}),
            })),
        },
      },
    }
    const sessionRef: SessionRef = {
      key: 'engine:session',
      id: input.engine?.sessionId ?? 'session',
      tab: 'tab',
      server,
      pending: false,
      location: undefined,
    }
    const session: MountedSession = {
      ...sessionRef,
      visit: {},
      directory: '/workspace',
      local: true,
      run: {status: () => 'idle', interrupt: async () => ({interrupted: false})},
    }
    const add = <T,>(registry: Registry<T>, item: T | (() => T | undefined)): Cleanup => {
      const read = isAccessor(item) ? runWithOwner(root, () => createMemo(item)) : () => item
      const key = nextKey()
      setState('entries', (entries) => [...entries, {key, registry, value: read ?? (() => undefined)}])
      return () => setState('entries', (entries) => entries.filter((entry) => entry.key !== key))
    }
    const list = <T,>(registry: Registry<T>): readonly T[] =>
      state.entries.flatMap((entry): T[] => {
        if (!isRegistryEntry(entry, registry)) return []
        const value = entry.value()
        return value === undefined ? [] : [value]
      })
    const provide = <C extends Contract<unknown>>(token: C, impl: TokenValue<C>): Cleanup => {
      const generation = sequence.next + 1
      sequence.next = generation
      const provided: Provided = {token, value: impl, generation}
      setState('contracts', (contracts) => [...contracts.filter((item) => item.token.id !== token.id), provided])
      return () => setState('contracts', (contracts) => contracts.filter((item) => item !== provided))
    }
    const base: BaseContext = {
      id: input.id,
      options: input.options,
      client,
      signal: controller.signal,
      add,
      list,
    }
    const dialog = (render: (close: () => void) => JSX.Element): (() => void) => {
      const key = nextKey()
      const close = () => setState('dialogs', (dialogs) => dialogs.filter((item) => item.key !== key))
      setState('dialogs', (dialogs) => [...dialogs, {key, render: () => render(close), close}])
      return close
    }
    const answer = <T,>(render: (settle: (value: T) => void) => JSX.Element): Promise<T> =>
      new Promise((resolve) => {
        const close = dialog(() =>
          render((value) => {
            close()
            resolve(value)
          }),
        )
      })
    const use = <T extends Token>(token: T) =>
      liveAccessor(
        runWithOwner(root, () => createMemo(() => readLive(state.contracts, token))) ?? (() => ({status: 'pending'})),
      )
    const context: Context = {
      ...base,
      provide,
      use,
      layout: {
        narrow: undefined,
        ready: () => true,
        open: (key) => setState('open', (open) => (open.includes(key) ? open : [...open, key])),
        close: (key) => setState('open', (open) => open.filter((item) => item !== key)),
        hide: (key) => setState('open', (open) => open.filter((item) => item !== key)),
        toggle: (key) =>
          setState('open', (open) => (open.includes(key) ? open.filter((item) => item !== key) : [...open, key])),
        state: (key) => (state.open.includes(key) ? 'active' : 'closed'),
        stored: () => state.open,
        scroll: undefined,
        settings: () => undefined,
        draft: () => undefined,
      },
      sessions: {list: () => [sessionRef], current: () => session},
      screen: {
        current: () => ({
          composer: {
            text: () => state.composer.text,
            insert: (text) => setState('composer', 'text', (current) => current + text),
            setText: (text) => setState('composer', 'text', text),
            model: () => undefined,
            setModel: () => false,
            setVariant: () => false,
            attach: (part) => setState('composer', 'parts', (parts) => [...parts, part]),
            quotable: undefined,
            focus: () => undefined,
            update: () => undefined,
            detach: (id) =>
              setState('composer', 'parts', (parts) =>
                parts.filter((part) => part.type === 'file' || part.commentId !== id),
              ),
            focused: undefined,
          },
        }),
      },
      storage: {
        store: (_key, options) => persistedCell(options.initial),
        memory: (key, options) => {
          const [memory, setMemory] = createStore(options.initial)
          return [memory, (mutation) => setMemory(produce(mutation))]
        },
        remove: () => undefined,
      },
      system: {
        copy: (text) => navigator.clipboard.writeText(text),
        save: async () => false,
        openExternal: () => undefined,
      },
      desktop: undefined,
      dialogs: {
        open: (render) => {
          const close = dialog((done) => render({close: done}))
          return {close}
        },
        active: () => state.dialogs.length > 0,
        confirm: (options) =>
          answer<boolean>((settle) => (
            <div role="alertdialog" aria-label={options.title}>
              <p>{options.description}</p>
              <button type="button" onClick={() => settle(true)}>
                {options.confirm ?? 'Confirm'}
              </button>
              <button type="button" onClick={() => settle(false)}>
                {options.cancel ?? 'Cancel'}
              </button>
            </div>
          )),
        alert: (options) =>
          answer<void>((settle) => (
            <div role="alertdialog" aria-label={options.title}>
              <p>{options.description}</p>
              <button type="button" onClick={() => settle()}>
                {options.ok ?? 'OK'}
              </button>
            </div>
          )),
        prompt: (options) =>
          answer<string | undefined>((settle) => (
            <form
              role="dialog"
              aria-label={options.title}
              onSubmit={(event) => {
                event.preventDefault()
                settle(new FormData(event.currentTarget).get('value')?.toString())
              }}
            >
              <input name="value" aria-label={options.title} value={options.value ?? ''} />
              <button type="submit">{options.submit ?? 'Submit'}</button>
              <button type="button" onClick={() => settle(undefined)}>
                Cancel
              </button>
            </form>
          )),
        select: (options) =>
          answer((settle) => (
            <div role="dialog" aria-label={options.title}>
              <For each={options.options}>
                {(option) => (
                  <button type="button" onClick={() => settle(option.value)}>
                    {option.title}
                  </button>
                )}
              </For>
              <button type="button" onClick={() => settle(undefined)}>
                Cancel
              </button>
            </div>
          )),
      },
      toast: {
        show: (options) => {
          const key = nextKey()
          setState('toasts', (toasts) => [...toasts, {key, title: options.title, description: options.description}])
          return {dismiss: () => setState('toasts', (toasts) => toasts.filter((toast) => toast.key !== key))}
        },
      },
      tabs: {
        list: () => [{key: sessionRef.tab, session: sessionRef, active: true}],
        open: () => undefined,
        focus: () => undefined,
        move: undefined,
        close: () => undefined,
      },
      attention: undefined,
      commands: undefined,
      links: {
        open: (link) => {
          const handler = list(LinkHandler).find((candidate) => candidate.match(link))
          handler?.open(link)
          return handler !== undefined
        },
        exists: (link) =>
          list(LinkHandler)
            .find((candidate) => candidate.match(link))
            ?.exists?.(link) ?? false,
      },
      ui,
      app: APP,
      appearance: {font: () => 'monospace', mode: () => 'light'},
      overlay: () => {
        const element = document.createElement('div')
        document.body.append(element)
        return {element, dispose: () => element.remove()}
      },
      router: {routing: () => false, path: () => '/'},
      widget: {
        open: () => setState('widget', true),
        close: () => setState('widget', false),
        isOpen: () => state.widget,
      },
      keybinds: {keybind: () => [], keys: (bind) => [bind], matches: () => false},
      servers: {list: () => [server.id], get: (id) => (id === server.id ? server : undefined)},
    }
    return {
      context,
      state,
      session,
      server,
      dispose: () => {
        controller.abort()
        dispose()
      },
    }
  })
}
