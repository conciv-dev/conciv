import {render} from '@solidjs/testing-library'
import {onCleanup} from 'solid-js'
import {createStore} from 'solid-js/store'
import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {makeRpcClient} from '@conciv/contract'
import {PluginContext} from '../src/experimental/host.js'
import {
  bindPlugin,
  createKeyed,
  createLatest,
  createVisitState,
  usePlugin,
  type Context,
  type Sessions,
} from '../src/experimental/index.js'
import type {ServerRef} from '../src/experimental/index.js'
import {Conciv} from '../src/promise/index.js'

function unused(): never {
  throw new Error('not used by this test')
}

const url = 'http://127.0.0.1:5173/t/token'

const server: ServerRef = {
  id: 'sidecar',
  name: 'engine',
  url,
  client: Conciv.make(makeRpcClient(url)),
  local: true,
  builtin: true,
  compatible: true,
  connected: true,
}

function pluginContext(id: string, sessions: Sessions = {list: () => [], current: () => undefined}): Context {
  return {
    options: {},
    client: server.client,
    id,
    signal: new AbortController().signal,
    add: unused,
    list: unused,
    provide: unused,
    use: unused,
    layout: {
      narrow: undefined,
      ready: unused,
      open: unused,
      close: unused,
      toggle: unused,
      hide: unused,
      state: unused,
      stored: unused,
      scroll: undefined,
      settings: unused,
      draft: unused,
    },
    sessions,
    screen: {current: unused},
    storage: {store: unused, memory: unused, remove: unused},
    system: {copy: unused, save: unused, openExternal: unused},
    desktop: undefined,
    dialogs: {
      open: unused,
      active: unused,
      confirm: undefined,
      alert: undefined,
      prompt: undefined,
      select: undefined,
    },
    toast: {show: unused},
    tabs: {list: unused, open: unused, focus: unused, move: undefined, close: unused},
    attention: undefined,
    commands: undefined,
    links: {open: unused, exists: undefined},
    ui: {
      Icon: unused,
      Button: unused,
      IconButton: unused,
      Tooltip: unused,
      Menu: unused,
      MenuItem: unused,
      MenuSeparator: unused,
      MenuGroup: unused,
      MenuSub: unused,
      Loader: unused,
      Dialog: unused,
      Switch: unused,
      TextInput: unused,
      Select: unused,
      Keybind: unused,
      Markdown: unused,
      Code: unused,
      SettingsLayout: unused,
      SettingsSection: unused,
      SettingsRow: unused,
    },
    app: {name: 'conciv', version: '0.0.0', channel: 'local', platform: 'web', packaged: false},
    appearance: {font: unused, mode: unused},
    router: {routing: unused, path: unused},
    keybinds: {keybind: unused, keys: unused, matches: unused},
    servers: {list: unused, get: unused},
  }
}

function logText(entries: readonly string[]) {
  return `log: ${entries.join(', ')}`
}

describe('createKeyed', () => {
  it('reruns per key and disposes the previous run', async () => {
    const [state, setState] = createStore<{key: string | undefined; log: string[]}>({key: 'a', log: []})
    const note = (entry: string) => setState('log', (log) => [...log, entry])

    function Keyed() {
      createKeyed(
        () => state.key,
        (key) => {
          note(`run ${key}`)
          onCleanup(() => note(`end ${key}`))
        },
        {otherwise: () => note('none')},
      )

      return (
        <>
          <button type="button" onClick={() => setState('key', 'b')}>
            key b
          </button>
          <button type="button" onClick={() => setState('key', undefined)}>
            no key
          </button>
          <p>{logText(state.log)}</p>
        </>
      )
    }

    render(() => <Keyed />)
    await expect.element(page.getByText('log: run a', {exact: true})).toBeInTheDocument()

    await page.getByRole('button', {name: 'key b'}).click()
    await expect.element(page.getByText('log: run a, end a, run b', {exact: true})).toBeInTheDocument()

    await page.getByRole('button', {name: 'no key'}).click()
    await expect.element(page.getByText('log: run a, end a, run b, end b, none', {exact: true})).toBeInTheDocument()
  })

  it('keeps the run for an object source whose compared fields are unchanged', async () => {
    const [state, setState] = createStore<{directory: string; tick: number; log: string[]}>({
      directory: '/repo',
      tick: 0,
      log: [],
    })

    function Keyed() {
      createKeyed(
        () => ({directory: state.directory, tick: state.tick}),
        (key) => setState('log', (log) => [...log, `list ${key.directory} at ${key.tick}`]),
        {equals: (previous, next) => previous.directory === next.directory},
      )

      return (
        <>
          <button type="button" onClick={() => setState('tick', (tick) => tick + 1)}>
            tick
          </button>
          <button type="button" onClick={() => setState('directory', '/other')}>
            move
          </button>
          <p>{logText(state.log)}</p>
        </>
      )
    }

    render(() => <Keyed />)
    await page.getByRole('button', {name: 'tick'}).click()
    await page.getByRole('button', {name: 'move'}).click()

    await expect.element(page.getByText('log: list /repo at 0, list /other at 1', {exact: true})).toBeInTheDocument()
  })
})

describe('createLatest', () => {
  it('drops the reply of a request the source moved past', async () => {
    const [state, setState] = createStore({query: 'a'})
    const replies = new Map<string, PromiseWithResolvers<string>>([
      ['a', Promise.withResolvers<string>()],
      ['b', Promise.withResolvers<string>()],
    ])
    const reply = (query: string) => replies.get(query) ?? Promise.withResolvers<string>()

    function Latest() {
      const latest = createLatest(
        () => state.query,
        (query) => reply(query).promise,
      )

      return (
        <>
          <button type="button" onClick={() => setState('query', 'b')}>
            search b
          </button>
          <p>latest: {latest.latest ?? 'none'}</p>
          <p>error: {latest.error instanceof Error ? latest.error.message : 'none'}</p>
        </>
      )
    }

    render(() => <Latest />)
    await page.getByRole('button', {name: 'search b'}).click()
    reply('a').resolve('reply a')
    reply('b').reject(new Error('b failed'))

    await expect.element(page.getByText('error: b failed')).toBeInTheDocument()
    await expect.element(page.getByText('latest: none')).toBeInTheDocument()
  })
})

describe('createVisitState', () => {
  it('returns to its initial value on every visit of the session', async () => {
    const [state, setState] = createStore({visit: {}})
    const sessions: Sessions = {
      list: () => [],
      current: () => ({
        key: 'sidecar\nchat',
        id: 'chat',
        tab: 'tab',
        server,
        pending: false,
        location: undefined,
        visit: state.visit,
        directory: '/repo',
        local: undefined,
      }),
    }

    function Expander() {
      const [expanded, setExpanded] = createVisitState(false)

      return (
        <>
          <button type="button" onClick={() => setExpanded(true)}>
            expand
          </button>
          <button type="button" onClick={() => setState({visit: {}})}>
            visit again
          </button>
          <p>expanded: {String(expanded())}</p>
        </>
      )
    }

    render(() => (
      <PluginContext.Provider value={pluginContext('acme', sessions)}>
        <Expander />
      </PluginContext.Provider>
    ))
    await page.getByRole('button', {name: 'expand'}).click()
    await expect.element(page.getByText('expanded: true')).toBeInTheDocument()

    await page.getByRole('button', {name: 'visit again'}).click()
    await expect.element(page.getByText('expanded: false')).toBeInTheDocument()
  })
})

describe('usePlugin', () => {
  it('throws outside a plugin contribution', () => {
    expect(() => usePlugin()).toThrow('usePlugin must run inside a plugin contribution')
  })
})

describe('bindPlugin', () => {
  it("renders the component under the provider's context", async () => {
    function Owner() {
      return <span>owner: {usePlugin().id}</span>
    }

    function Provider() {
      const Bound = bindPlugin(Owner)

      return (
        <PluginContext.Provider value={pluginContext('consumer')}>
          <Bound />
        </PluginContext.Provider>
      )
    }

    render(() => (
      <PluginContext.Provider value={pluginContext('provider')}>
        <Provider />
      </PluginContext.Provider>
    ))

    await expect.element(page.getByText('owner: provider')).toBeInTheDocument()
  })
})
