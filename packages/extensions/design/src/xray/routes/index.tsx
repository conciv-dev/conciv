import {createRoute, stripSearchParams} from '@tanstack/solid-router'
import {createMemo, createResource, For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {uniq} from 'es-toolkit'
import {Button, Dialog, readStorage, writeStorage} from '@conciv/ui-kit-system'
import type {SourceLoc} from '../../shared/types.js'
import {
  diffCommand,
  filterRows,
  loadXray,
  openInEditor,
  reportRows,
  rowAboveTolerance,
  runDiff,
  sourceLabel,
  type Row,
  type XrayData,
} from '../data.js'
import {loadFixture} from '../dev-fixture.js'
import {ComponentList} from '../list.js'
import {createShortcuts, SHORTCUT_HELP} from '../shortcuts.js'
import {clampZoom, fitScale, MODES, Stage, StageToolbar, zoomStep, type Mode, type StageView} from '../stage.js'
import {RunButton, Topbar} from '../topbar.js'
import {XraySearchSchema, type XraySearch} from '../xray-schemas.js'
import {rootRoute} from './__root.js'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: XraySearchSchema,
  search: {middlewares: [stripSearchParams({target: '', filter: 'all'})]},
  component: XrayPage,
})

const Route = indexRoute

const MODE_KEY = 'conciv.design.xray.mode'
const BOXES_KEY = 'conciv.design.xray.boxes'
const SLIDER_START = 50

type PageView = StageView & {shortcuts: boolean}
type Activity = {running: boolean; opening: boolean; failure: string | null; message: string}

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

function XrayPage(): JSX.Element {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const patch = (next: Partial<XraySearch>) => navigate({search: (previous) => ({...previous, ...next}), replace: true})

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
  const [activity, setActivity] = createStore<Activity>({running: false, opening: false, failure: null, message: ''})

  const [data, {refetch}] = createResource(() => ({target: search().target, fixture: search().fixture === 1}), loadData)
  const current = () => (data.state === 'ready' || data.state === 'refreshing' ? data.latest : undefined)
  const ran = () => (current()?.report ?? null) !== null
  const mode = (): Mode => (ran() ? (search().mode ?? storedMode ?? 'slider') : 'design')
  const rows = createMemo(() => reportRows(current()?.report ?? null))
  const visible = createMemo(() => filterRows({rows: rows(), filter: search().filter, query: search().q ?? ''}))
  const selected = createMemo<Row | null>(
    () => rows().find((row) => row.key === search().component) ?? visible()[0] ?? null,
  )
  const off = () => rows().filter(rowAboveTolerance).length
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
  const select = (row: Row) => patch({component: row.key})
  const step = (by: number) => {
    const list = visible()
    const index = list.findIndex((row) => row.key === selected()?.key)
    const next = list[(index + by + list.length) % list.length]
    if (next !== undefined) select(next)
  }
  const run = () => {
    const loaded = current()
    if (loaded === undefined || activity.running) return
    setActivity({running: true, failure: null, message: 'Running the diff'})
    runDiff({target: loaded.target, session: search().session}).then(
      () => {
        setActivity({running: false, message: 'The diff finished'})
        void refetch()
      },
      (error: unknown) =>
        setActivity({
          running: false,
          failure: `The diff did not run: ${failure(error)}. Run ${diffCommand(loaded.target)} in a terminal.`,
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

  createShortcuts({
    step,
    mode: chooseMode,
    boxes: () => setBoxes(!view.boxes),
    run,
    open: () => open(selected()?.source ?? null),
    fit: () => zoom(null),
    zoom: (direction) => zoom(zoomStep({scale: scale(), direction})),
    help: () => setView('shortcuts', true),
  })

  return (
    <>
      <p role="status" aria-live="polite" class="sr-only">
        {activity.message}
      </p>
      <Show
        when={current()}
        fallback={
          <Show
            when={data.state === 'errored'}
            fallback={
              <p role="status" class="text-chat-text-3 m-auto row-span-2">
                Loading the x-ray…
              </p>
            }
          >
            <div role="alert" class="text-chat-text-2 m-auto flex flex-col gap-3 row-span-2 items-center">
              <p class="m-0">The x-ray could not load this target: {failure(data.error)}</p>
              <Button variant="outline" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          </Show>
        }
      >
        {(loaded) => (
          <>
            <Topbar
              data={loaded()}
              off={off()}
              running={activity.running}
              onTarget={(id) => patch({target: id, component: undefined})}
              onRun={run}
              onHelp={() => setView('shortcuts', true)}
            />
            <div class="grid grid-cols-[minmax(0,1fr)_22rem] min-h-0 min-w-0 lt-xl:grid-cols-[minmax(0,1fr)_18rem]">
              <div class="flex flex-col min-h-0 min-w-0">
                <StageToolbar
                  mode={mode()}
                  ran={ran()}
                  scale={scale()}
                  fitted={view.zoom === null}
                  boxes={view.boxes}
                  onMode={chooseMode}
                  onZoom={(direction) => zoom(zoomStep({scale: scale(), direction}))}
                  onToggleZoom={() => zoom(view.zoom === null ? 1 : null)}
                  onBoxes={setBoxes}
                />
                <Show when={activity.failure}>
                  {(text) => (
                    <p
                      role="alert"
                      class="text-[0.75rem] text-chat-danger m-0 px-3 py-2 border-b border-chat-line bg-chat-panel text-pretty"
                    >
                      {text()}
                    </p>
                  )}
                </Show>
                <Stage
                  mode={mode()}
                  rows={rows()}
                  selected={selected()}
                  images={loaded().images}
                  target={loaded().target}
                  view={view}
                  scale={scale()}
                  fitted={view.zoom === null}
                  actions={{
                    zoom,
                    slide: (value) => setView('slider', value),
                    measure: (canvas) => setView('canvas', canvas),
                    loaded: (src) => setView('loaded', (list) => uniq([...list, src])),
                    failed: (src) => setView('failed', (list) => uniq([...list, src])),
                  }}
                />
              </div>
              <ComponentList
                rows={rows()}
                visible={visible()}
                selected={selected()?.key ?? null}
                filter={search().filter}
                query={search().q ?? ''}
                ran={ran()}
                opening={activity.opening}
                runAction={<RunButton data={loaded()} running={activity.running} onRun={run} small />}
                onFilter={(filter) => patch({filter})}
                onQuery={(q) => patch({q: q === '' ? undefined : q})}
                onSelect={select}
                onHover={(key) => setView('hovered', key)}
                onOpen={open}
              />
            </div>
            <Show when={view.shortcuts}>
              <Dialog
                title="Shortcuts"
                open={view.shortcuts}
                onOpenChange={(shown) => setView('shortcuts', shown)}
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
          </>
        )}
      </Show>
    </>
  )
}
