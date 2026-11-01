import {makeRpcClient} from '@conciv/contract'
import {makeExtRpcClient} from '@conciv/extension'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {z} from 'zod'
import {
  createRootRoute,
  Outlet,
  createRoute,
  stripSearchParams,
  useMatchRoute,
  redirect,
  createRouter,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/solid-router'
import {
  createContext,
  createMemo,
  createResource,
  For,
  Show,
  useContext,
  type Accessor,
  type JSX,
  Match,
  Switch,
} from 'solid-js'
import {createStore, type SetStoreFunction} from 'solid-js/store'
import {Dialog, readStorage, writeStorage} from '@conciv/ui-kit-system'
import {uniq} from 'es-toolkit'
import type {SourceLoc} from '../shared/types.js'
import type {XrayRouter} from '../server/xray-routes.js'
import {loadFixture} from '../../test/dev-fixture.js'
import {
  AbovePill,
  assemble,
  ComponentDetail,
  ComponentRows,
  FILTERS,
  filterRows,
  fixPrompt,
  reportRows,
  rowAboveTolerance,
  sourceLabel,
  stale,
  XrayPanel,
  type Filter,
  type ReportResponse,
  type Row,
  type View,
  type XrayData,
} from './panel.js'
import {clampZoom, fitScale, MODES, Stage, StageToolbar, zoomStep, type Mode, type StageView} from './stage.js'
import {AllMatch, createShortcuts, Loading, LoadError, NoRun, NothingShown, SHORTCUT_HELP} from './states.js'

const EXTENSION_SLUG = 'design'

const PAGE_SEGMENT = '/xray'

function pagePrefix(): string {
  const path = window.location.pathname
  const at = path.indexOf(PAGE_SEGMENT)
  return at === -1 ? '' : path.slice(0, at + PAGE_SEGMENT.length)
}

function pageUrl(): URL {
  return new URL(pagePrefix(), window.location.origin)
}

function engineApiBase(): string {
  return new URL('../../../', pageUrl()).href.slice(0, -1)
}

function fileUrl(path: string): string {
  return new URL(`files/${path}`, pageUrl()).href
}

function designClient() {
  return makeExtRpcClient<XrayRouter>(engineApiBase(), EXTENSION_SLUG)
}

async function loadXray(input: {id: string}): Promise<XrayData> {
  const client = designClient()
  const current: ReportResponse = await client.xray.report({id: input.id})
  const targets = await client.xray.targets({route: current.target.route})
  const siblings = await Promise.all(
    targets.map((target) => (target.id === current.target.id ? current : client.xray.report({id: target.id}))),
  )
  return assemble({current, siblings, image: fileUrl})
}

async function sessionClient(session: string | undefined) {
  const apiBase = engineApiBase()
  const sessionId = session ?? (await makeRpcClient(apiBase).sessions.resolve({})).sessionId
  return makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
}

async function runDiff(input: {session: string | undefined}): Promise<void> {
  const rpc = await sessionClient(input.session)
  await rpc.registry.call({name: 'design_diff', input: {}})
}

async function openInEditor(input: {source: SourceLoc; session: string | undefined}): Promise<void> {
  const rpc = await sessionClient(input.session)
  await rpc.editor.open({file: input.source.file, line: input.source.line})
}

const DIFF_COMMAND = 'conciv tools design diff'

const XraySearchSchema = z.object({
  target: z.coerce.string().default('').catch(''),
  session: z.coerce.string().optional().catch(undefined),
  mode: z.enum(MODES).optional().catch(undefined),
  component: z.coerce.string().optional().catch(undefined),
  filter: z
    .enum([...FILTERS, 'unmatched'])
    .transform((value): Filter => (value === 'unmatched' ? 'above' : value))
    .default('all')
    .catch('all'),
  q: z.coerce.string().optional().catch(undefined),
  fixture: z.coerce.number().optional().catch(undefined),
})

type XraySearch = z.infer<typeof XraySearchSchema>

const rootRoute = createRootRoute({component: Outlet})

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'xray',
  validateSearch: XraySearchSchema,
  search: {middlewares: [stripSearchParams({target: '', filter: 'all'})]},
  component: XrayLayout,
})

const MODE_KEY = 'conciv.design.xray.mode'
const BOXES_KEY = 'conciv.design.xray.boxes'
const SLIDER_START = 50
const NO_COMPONENT = ''

type PageView = StageView & {shortcuts: boolean}
type Activity = {
  running: boolean
  opening: boolean
  failure: string | null
  message: string
  aboveAtRun: string[]
}

type XrayPage = {
  loaded: Accessor<XrayData>
  rows: Accessor<Row[]>
  visible: Accessor<Row[]>
  selected: Accessor<Row | null>
  fixed: Accessor<Set<string>>
  above: Accessor<number>
  ran: Accessor<boolean>
  mode: Accessor<Mode>
  scale: Accessor<number>
  activity: Activity
  view: PageView
  setView: SetStoreFunction<PageView>
  run: () => void
  open: (source: SourceLoc | null) => void
  copied: (done: boolean) => void
  toggle: (key: string) => void
  chooseMode: (next: Mode) => void
  setBoxes: (on: boolean) => void
  zoom: (next: number | null) => void
}

const XrayPageContext = createContext<XrayPage>()

function useXrayPage(): XrayPage {
  const page = useContext(XrayPageContext)
  if (page === undefined) throw new Error('useXrayPage needs the x-ray layout')
  return page
}

function parseMode(raw: string): Mode | undefined {
  return MODES.find((mode) => mode === raw)
}

function parseBoxes(raw: string): boolean | undefined {
  if (raw === 'true') return true
  return raw === 'false' ? false : undefined
}

function loadData(key: {target: string; fixture: boolean}): Promise<XrayData> {
  if (import.meta.env.DEV && key.fixture) return Promise.resolve(loadFixture({id: key.target}))
  return loadXray({id: key.target})
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function aboveKeys(rows: Row[]): string[] {
  return rows.filter(rowAboveTolerance).map((row) => row.key)
}

function nextIndex(input: {index: number; by: number; length: number}): number {
  if (input.index === -1) return input.by > 0 ? 0 : input.length - 1
  return (input.index + input.by + input.length) % input.length
}

function viewPath(view: View): '/list' | '/capture' {
  return view === 'capture' ? '/capture' : '/list'
}

function XrayLayout(): JSX.Element {
  const search = layoutRoute.useSearch()
  const navigate = layoutRoute.useNavigate()
  const matchRoute = useMatchRoute()
  const inCapture = matchRoute({to: '/capture'})
  const capture = () => inCapture() !== false
  const patch = (next: Partial<XraySearch>) =>
    navigate({
      to: viewPath(capture() ? 'capture' : 'list'),
      search: (previous) => ({...previous, ...next}),
      replace: true,
    })

  const storedMode = readStorage<Mode | null>(MODE_KEY, parseMode, null)
  const [view, setView] = createStore<PageView>({
    boxes: readStorage<boolean>(BOXES_KEY, parseBoxes, false),
    zoom: null,
    slider: SLIDER_START,
    canvas: {width: 0, gap: 0, border: 0, overflow: false},
    loaded: [],
    failed: [],
    hovered: null,
    shortcuts: false,
  })
  const [activity, setActivity] = createStore<Activity>({
    running: false,
    opening: false,
    failure: null,
    message: '',
    aboveAtRun: [],
  })

  const dataKey = createMemo(() => ({target: search().target, fixture: search().fixture === 1}), undefined, {
    equals: (a, b) => a.target === b.target && a.fixture === b.fixture,
  })
  const [data, {refetch}] = createResource(dataKey, loadData)
  const current = () => (data.state === 'ready' || data.state === 'refreshing' ? data.latest : undefined)
  const ran = () => (current()?.report ?? null) !== null
  const mode = (): Mode => (ran() ? (search().mode ?? storedMode ?? 'slider') : 'design')
  const rows = createMemo(() => reportRows(current()?.report ?? null))
  const visible = createMemo(() => filterRows({rows: rows(), filter: search().filter, query: search().q ?? ''}))
  const above = () => rows().filter(rowAboveTolerance).length
  const fixed = createMemo(
    () =>
      new Set(activity.aboveAtRun.filter((key) => rows().some((row) => row.key === key && !rowAboveTolerance(row)))),
  )
  const selected = createMemo<Row | null>(() => {
    if (search().component === NO_COMPONENT) return null
    return rows().find((row) => row.key === search().component) ?? visible()[0] ?? null
  })
  const fit = createMemo(() => {
    const loaded = current()
    return loaded === undefined ? 1 : fitScale({canvas: view.canvas, target: loaded.target, mode: mode()})
  })
  const scale = () => view.zoom ?? fit()

  const chooseMode = (next: Mode) => {
    if (!ran()) return
    writeStorage(MODE_KEY, next)
    patch({mode: next})
  }
  const setBoxes = (on: boolean) => {
    writeStorage(BOXES_KEY, on)
    setView('boxes', on)
  }
  const zoom = (next: number | null) => setView('zoom', next === null ? null : clampZoom(next))
  const toggle = (key: string) => patch({component: selected()?.key === key ? NO_COMPONENT : key})
  const step = (by: number) => {
    const list = visible()
    const index = list.findIndex((row) => row.key === selected()?.key)
    const next = list[nextIndex({index, by, length: list.length})]
    if (next !== undefined) patch({component: next.key})
  }
  const run = () => {
    const loaded = current()
    if (loaded === undefined || activity.running) return
    setActivity({running: true, failure: null, message: 'Running the diff', aboveAtRun: aboveKeys(rows())})
    runDiff({session: search().session}).then(
      () => {
        setActivity({running: false, message: 'The diff finished'})
        void refetch()
      },
      (error: unknown) =>
        setActivity({
          running: false,
          failure: `The diff did not run: ${failure(error)}. Run ${DIFF_COMMAND} in a terminal.`,
          message: 'The diff did not run',
        }),
    )
  }
  const open = (source: SourceLoc | null) => {
    if (source === null || activity.opening) return
    setActivity({opening: true, message: `Opening ${sourceLabel(source)}`})
    openInEditor({source, session: search().session}).then(
      () => setActivity({opening: false, message: `Opened ${sourceLabel(source)} in the editor`}),
      (error: unknown) =>
        setActivity({opening: false, message: `Could not open ${sourceLabel(source)}: ${failure(error)}`}),
    )
  }
  const copied = (done: boolean) => setActivity('message', done ? 'Fix prompt copied' : 'Could not copy the fix prompt')
  const copy = () => {
    const row = selected()
    const text = row === null ? null : fixPrompt(row)
    if (text === null) return
    navigator.clipboard.writeText(text).then(
      () => copied(true),
      () => copied(false),
    )
  }
  const chooseView = (next: View) => navigate({to: viewPath(next), search: true})

  createShortcuts({
    capture,
    step,
    view: chooseView,
    mode: chooseMode,
    boxes: () => setBoxes(!view.boxes),
    run,
    open: () => open(selected()?.source ?? null),
    copy,
    fit: () => zoom(null),
    zoom: (direction) => zoom(zoomStep({scale: scale(), direction})),
    help: () => setView('shortcuts', true),
  })

  return (
    <main class="flex flex-col min-h-dvh">
      <p role="status" aria-live="polite" class="sr-only">
        {activity.message}
      </p>
      <Show
        when={current()}
        fallback={
          <div class="p-4 flex flex-1 flex-col">
            <Show when={data.state === 'errored'} fallback={<Loading />}>
              <LoadError message={failure(data.error)} onRetry={() => void refetch()} />
            </Show>
          </div>
        }
      >
        {(loaded) => (
          <XrayPageContext.Provider
            value={{
              loaded,
              rows,
              visible,
              selected,
              fixed,
              above,
              ran,
              mode,
              scale,
              activity,
              view,
              setView,
              run,
              open,
              copied,
              toggle,
              chooseMode,
              setBoxes,
              zoom,
            }}
          >
            <div class="px-4 pt-8 top-0 sticky z-60">
              <XrayPanel
                data={loaded()}
                filter={search().filter}
                query={search().q ?? ''}
                view={capture() ? 'capture' : 'list'}
                running={activity.running}
                onFilter={(filter) => patch({filter})}
                onQuery={(q) => patch({q: q === '' ? undefined : q})}
                onView={chooseView}
                onTarget={(id) => patch({target: id, component: undefined})}
                onRun={run}
              />
            </div>
            <Show when={activity.failure}>
              {(text) => (
                <p role="alert" class="text-sm text-red-700 m-0 px-8 pt-4 text-pretty dark:text-red-300">
                  {text()}
                </p>
              )}
            </Show>
            <div
              class={`px-4 flex flex-1 flex-col transition-opacity ${activity.running ? 'op-50 pointer-events-none' : ''}`}
              aria-busy={activity.running}
            >
              <Outlet />
            </div>
            <Show when={ran() && !capture()}>
              <AbovePill above={above()} total={rows().length} />
            </Show>
            <Show when={view.shortcuts}>
              <Dialog
                title="Shortcuts"
                open={view.shortcuts}
                onOpenChange={(showing) => setView('shortcuts', showing)}
                dismissable
              >
                <dl class="text-[0.8125rem] m-0 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr]">
                  <For each={SHORTCUT_HELP}>
                    {([keys, meaning]) => (
                      <>
                        <dt class="text-chat-text-hi font-chat-mono">{keys}</dt>
                        <dd class="text-chat-text-2 m-0">{meaning}</dd>
                      </>
                    )}
                  </For>
                </dl>
              </Dialog>
            </Show>
          </XrayPageContext.Provider>
        )}
      </Show>
    </main>
  )
}

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({to: '/list', search: true, replace: true})
  },
})

const listRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'list',
  component: XrayList,
})

function XrayList(): JSX.Element {
  const search = listRoute.useSearch()
  const navigate = listRoute.useNavigate()
  const clearQuery = () => navigate({search: (previous) => ({...previous, q: undefined}), replace: true})
  const page = useXrayPage()
  return (
    <Switch>
      <Match when={!page.ran()}>
        <NoRun
          route={page.loaded().target.route}
          width={page.loaded().target.width}
          running={page.activity.running}
          onRun={page.run}
        />
      </Match>
      <Match when={page.above() === 0 && page.fixed().size === 0}>
        <AllMatch
          width={page.loaded().target.width}
          total={page.rows().length}
          ranAt={page.loaded().ranAt}
          stale={stale(page.loaded())}
          running={page.activity.running}
          onRun={page.run}
        />
      </Match>
      <Match when={page.visible().length === 0}>
        <NothingShown query={search().q ?? ''} filter={search().filter} onClear={clearQuery} />
      </Match>
      <Match when={page.visible().length > 0}>
        <ComponentRows
          rows={page.visible()}
          selected={page.selected()?.key ?? null}
          fixed={page.fixed()}
          onSelect={page.toggle}
        >
          {(row) => (
            <ComponentDetail
              row={row}
              images={page.loaded().images}
              target={page.loaded().target}
              opening={page.activity.opening}
              onOpen={page.open}
              onCopied={page.copied}
            />
          )}
        </ComponentRows>
      </Match>
    </Switch>
  )
}

const captureRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'capture',
  component: XrayCapture,
})

function XrayCapture(): JSX.Element {
  const page = useXrayPage()
  return (
    <div class="mt-4 border border-base rounded-lg bg-base flex flex-col h-[calc(100dvh-13rem)] min-h-96 overflow-hidden">
      <StageToolbar
        mode={page.mode()}
        ran={page.ran()}
        scale={page.scale()}
        fitted={page.view.zoom === null}
        boxes={page.view.boxes}
        onMode={page.chooseMode}
        onZoom={(direction) => page.zoom(zoomStep({scale: page.scale(), direction}))}
        onToggleZoom={() => page.zoom(page.view.zoom === null ? 1 : null)}
        onBoxes={page.setBoxes}
      />
      <Stage
        mode={page.mode()}
        rows={page.rows()}
        nodes={page.loaded().nodes}
        selected={page.selected()}
        images={page.loaded().images}
        target={page.loaded().target}
        view={page.view}
        scale={page.scale()}
        fitted={page.view.zoom === null}
        actions={{
          zoom: page.zoom,
          slide: (value) => page.setView('slider', value),
          measure: (canvas) => page.setView('canvas', canvas),
          loaded: (src) => page.setView('loaded', (list) => uniq([...list, src])),
          failed: (src) => page.setView('failed', (list) => uniq([...list, src])),
        }}
      />
    </div>
  )
}

const routeTree = rootRoute.addChildren([layoutRoute.addChildren([indexRoute, listRoute, captureRoute])])

function withPath(input: {url: URL; path: string}): URL {
  return new URL(`${input.path}${input.url.search}${input.url.hash}`, input.url.origin)
}

function innerPath(input: {path: string; prefix: string}): string {
  const rest = input.path.startsWith(input.prefix) ? input.path.slice(input.prefix.length) : input.path
  return rest === '' ? '/' : rest
}

export function createXrayRouter() {
  const prefix = pagePrefix()
  return createRouter({
    routeTree,
    scrollRestoration: false,
    parseSearch: parseSearchWith((value) => value),
    stringifySearch: stringifySearchWith(JSON.stringify),
    rewrite: {
      input: ({url}) => withPath({url, path: innerPath({path: url.pathname, prefix})}),
      output: ({url}) => withPath({url, path: `${prefix}${url.pathname}`}),
    },
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createXrayRouter>
  }
}
