import {createRoute, stripSearchParams} from '@tanstack/solid-router'
import {createEffect, createMemo, createResource, createSignal, For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {createTimer} from '@solid-primitives/timer'
import {z} from 'zod'
import {
  Button,
  createListCollection,
  Dialog,
  isSkinName,
  readStorage,
  ScrollArea,
  Select,
  SKIN_NAMES,
  skinClassName,
  skinDefinition,
  Slider,
  Switch,
  Tabs,
  writeStorage,
  type SkinName,
} from '@conciv/ui-kit-system'
import {
  aboveTolerance,
  diffCommand,
  loadXray,
  openInEditor,
  projectPath,
  reportRows,
  runDiff,
  sourceLabel,
  type Row,
  type XrayData,
} from '../data.js'
import {loadFixture} from '../dev-fixture.js'
import {Inspector} from '../inspector.js'
import {Kbd} from '../kbd.js'
import {FILTERS, filterRows, Rail, type Filter} from '../rail.js'
import {createShortcuts, SHORTCUT_HELP} from '../shortcuts.js'
import {MODES, Stage, type Mode, type StageView} from '../stage.js'
import {RunButton, Topbar} from '../topbar.js'
import {rootRoute} from './__root.js'

const XraySearchSchema = z.object({
  target: z.string().default('').catch(''),
  mode: z.enum(MODES).optional().catch(undefined),
  component: z.string().optional().catch(undefined),
  filter: z.enum(FILTERS).default('all').catch('all'),
  q: z.string().optional().catch(undefined),
  fixture: z.number().optional().catch(undefined),
})

type XraySearch = z.infer<typeof XraySearchSchema>

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: XraySearchSchema,
  search: {middlewares: [stripSearchParams({target: '', filter: 'all'})]},
  component: XrayPage,
})

const Route = indexRoute

const MODE_KEY = 'conciv.design.xray.mode'
const SKIN_KEY = 'conciv.design.xray.skin'
const STROBE_MS = 500
const DEFAULT_MODE: Mode = 'swipe'

const MODE_LABEL: Record<Mode, string> = {side: '2-up', swipe: 'Swipe', onion: 'Onion', toggle: 'Toggle', diff: 'Diff'}

const SKINS = createListCollection({
  items: SKIN_NAMES.map((name) => ({value: name, label: skinDefinition(name).label})),
})

type PageView = StageView & {strobe: boolean; shortcuts: boolean}
type Activity = {running: boolean; opening: boolean; failure: string | null; message: string}

function parseMode(raw: string): Mode | undefined {
  return MODES.find((mode) => mode === raw)
}

function parseSkin(raw: string): SkinName | undefined {
  return isSkinName(raw) ? raw : undefined
}

function loadData(key: {target: string; fixture: boolean}): Promise<XrayData> {
  if (import.meta.env.DEV && key.fixture) return Promise.resolve(loadFixture({id: key.target}))
  return loadXray({id: key.target})
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function Toggle(props: {label: string; checked: boolean; onChange: (checked: boolean) => void}) {
  return (
    <Switch.Root checked={props.checked} onCheckedChange={(details) => props.onChange(details.checked)}>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.Label class="text-[0.75rem]">{props.label}</Switch.Label>
      <Switch.HiddenInput />
    </Switch.Root>
  )
}

function Range(props: {label: string; value: number; onChange: (value: number) => void}) {
  return (
    <div class="shrink-0 w-20">
      <Slider.Root
        aria-label={[props.label]}
        value={[props.value]}
        onValueChange={(details) => props.onChange(details.value[0] ?? props.value)}
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumb index={0}>
            <Slider.HiddenInput />
          </Slider.Thumb>
        </Slider.Control>
      </Slider.Root>
    </div>
  )
}

function XrayPage(): JSX.Element {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const patch = (next: Partial<XraySearch>) => navigate({search: (previous) => ({...previous, ...next}), replace: true})

  const storedMode = readStorage<Mode>(MODE_KEY, parseMode, DEFAULT_MODE)
  const [skin, setSkin] = createSignal(readStorage<SkinName>(SKIN_KEY, parseSkin, 'conciv'))
  const [view, setView] = createStore<PageView>({
    boxes: true,
    rulers: true,
    swipe: 55,
    onion: 50,
    mask: 60,
    showing: 'live',
    missing: [],
    strobe: false,
    shortcuts: false,
  })
  const [activity, setActivity] = createStore<Activity>({running: false, opening: false, failure: null, message: ''})

  const [data, {refetch}] = createResource(() => ({target: search().target, fixture: search().fixture === 1}), loadData)
  const current = () => (data.state === 'ready' || data.state === 'refreshing' ? data.latest : undefined)
  const mode = () => search().mode ?? storedMode
  const rows = createMemo(() => reportRows(current()?.report ?? null))
  const visible = createMemo(() => filterRows({rows: rows(), filter: search().filter, query: search().q ?? ''}))
  const selected = createMemo<Row | null>(
    () => rows().find((row) => row.key === search().component) ?? visible()[0] ?? null,
  )
  const above = () => rows().filter(aboveTolerance).length

  createEffect(() => {
    const active = skin()
    SKIN_NAMES.forEach((name) =>
      document.documentElement.classList.toggle(skinClassName(name), name === active && name !== 'conciv'),
    )
  })

  createTimer(
    () => setView('showing', (showing) => (showing === 'live' ? 'target' : 'live')),
    () => (view.strobe && mode() === 'toggle' ? STROBE_MS : false),
    setInterval,
  )

  const chooseMode = (next: Mode) => {
    writeStorage(MODE_KEY, next)
    patch({mode: next})
  }
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
    runDiff(loaded.target).then(
      () => {
        setActivity({running: false, message: 'The diff finished'})
        setView('missing', [])
        void refetch()
      },
      (error: unknown) =>
        setActivity({
          running: false,
          failure: `The diff did not run: ${failure(error)}. Run \`${diffCommand(loaded.target)}\` in a terminal.`,
          message: 'The diff did not run',
        }),
    )
  }
  const open = () => {
    const source = selected()?.source
    if (source === undefined || source === null || activity.opening) return
    setActivity({opening: true, message: `Opening ${sourceLabel(source)}`})
    openInEditor(source).then(
      () => setActivity({opening: false, message: `Opened ${sourceLabel(source)} in the editor`}),
      (error: unknown) =>
        setActivity({opening: false, message: `Could not open ${sourceLabel(source)}: ${failure(error)}`}),
    )
  }

  createShortcuts({
    step,
    mode: chooseMode,
    boxes: () => setView('boxes', (on) => !on),
    rulers: () => setView('rulers', (on) => !on),
    run,
    open,
    flip: () => {
      if (mode() === 'toggle') setView('showing', (showing) => (showing === 'live' ? 'target' : 'live'))
    },
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
              <p role="status" class="text-chat-text-3 m-auto row-span-3">
                Loading the x-ray…
              </p>
            }
          >
            <div role="alert" class="text-chat-text-2 m-auto flex flex-col gap-3 row-span-3 items-center">
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
              above={above()}
              running={activity.running}
              onTarget={(id) => patch({target: id, component: undefined})}
              onAbove={() => patch({filter: 'above'})}
              onAll={() => patch({filter: 'all'})}
              onRun={run}
            />
            <div class="grid grid-cols-[17.5rem_minmax(0,1fr)_21.25rem] min-h-0 min-w-0 lt-lg:grid-cols-[15rem_minmax(0,1fr)] max-[89.99rem]:grid-cols-[17rem_minmax(0,1fr)_18rem]">
              <Rail
                rows={rows()}
                visible={visible()}
                selected={selected()?.key ?? null}
                filter={search().filter}
                query={search().q ?? ''}
                ran={loaded().report !== null}
                onFilter={(filter: Filter) => patch({filter})}
                onQuery={(q) => patch({q: q === '' ? undefined : q})}
                onSelect={select}
                runAction={<RunButton data={loaded()} running={activity.running} onRun={run} size="sm" />}
              />
              <Tabs.Root
                class="flex flex-col min-h-0 min-w-0"
                value={mode()}
                onValueChange={(details) => {
                  const next = parseMode(details.value)
                  if (next !== undefined) chooseMode(next)
                }}
              >
                <div class="px-3.5 border-b border-chat-line bg-chat-panel flex flex-wrap gap-x-2.5 min-h-14 items-center">
                  <Tabs.List aria-label="view" class="border-b-transparent self-stretch -mb-px">
                    <For each={MODES}>
                      {(item, index) => (
                        <Tabs.Trigger value={item} class="h-full whitespace-nowrap">
                          {MODE_LABEL[item]} <Kbd>{index() + 1}</Kbd>
                        </Tabs.Trigger>
                      )}
                    </For>
                    <Tabs.Indicator />
                  </Tabs.List>
                  <Show when={mode() === 'swipe'}>
                    <Range
                      label="swipe position, live to target"
                      value={view.swipe}
                      onChange={(value) => setView('swipe', value)}
                    />
                  </Show>
                  <Show when={mode() === 'onion'}>
                    <Range
                      label="onion opacity, live to target"
                      value={view.onion}
                      onChange={(value) => setView('onion', value)}
                    />
                  </Show>
                  <Show when={mode() === 'diff'}>
                    <Range label="mask opacity" value={view.mask} onChange={(value) => setView('mask', value)} />
                  </Show>
                  <Show when={mode() === 'toggle'}>
                    <span class="text-[0.75rem] text-chat-text-2">
                      showing <b class="font-chat-mono font-medium">{view.showing}</b>
                    </span>
                    <Switch.Root
                      checked={view.strobe}
                      onCheckedChange={(details) => setView('strobe', details.checked)}
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Switch.Label class="text-[0.75rem]">strobe</Switch.Label>
                      <Switch.HiddenInput />
                    </Switch.Root>
                  </Show>
                  <span class="flex-1" />
                  <Toggle label="boxes" checked={view.boxes} onChange={(on) => setView('boxes', on)} />
                  <Toggle label="rulers" checked={view.rulers} onChange={(on) => setView('rulers', on)} />
                </div>
                <Tabs.Content value={mode()} class="p-0 flex-1 min-h-0 relative">
                  <ScrollArea.Root class="h-full">
                    <ScrollArea.Viewport class="overscroll-contain bg-chat-sunken h-full">
                      <ScrollArea.Content class="p-5 flex flex-col gap-3 min-w-full w-max">
                        <Show when={activity.failure}>
                          {(text) => (
                            <p role="alert" class="text-[0.75rem] text-chat-danger m-0 max-w-160">
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
                          onMissing={(src) => setView('missing', (missing) => [...missing, src])}
                        />
                      </ScrollArea.Content>
                    </ScrollArea.Viewport>
                    <ScrollArea.Scrollbar orientation="vertical">
                      <ScrollArea.Thumb />
                    </ScrollArea.Scrollbar>
                    <ScrollArea.Scrollbar orientation="horizontal">
                      <ScrollArea.Thumb />
                    </ScrollArea.Scrollbar>
                  </ScrollArea.Root>
                  <p class="text-[0.6875rem] text-chat-text-3 m-0 flex gap-3.5 pointer-events-none inset-x-0 bottom-5 justify-center absolute">
                    <span>
                      <Kbd>J</Kbd> <Kbd>K</Kbd> next / prev component
                    </span>
                    <span>
                      <Kbd>↵</Kbd> open in editor
                    </span>
                    <span>
                      <Kbd>?</Kbd> all shortcuts
                    </span>
                  </p>
                </Tabs.Content>
              </Tabs.Root>
              <aside class="border-l border-chat-line bg-chat-panel flex flex-col min-h-0 min-w-0 lt-lg:hidden">
                <Inspector row={selected()} onOpen={open} opening={activity.opening} />
              </aside>
            </div>
            <footer class="text-[0.6875rem] text-chat-text-3 px-3.5 py-0 border-t border-chat-line bg-chat-panel flex gap-4 h-9.5 items-center">
              <span>
                target{' '}
                <span class="font-chat-mono">
                  {loaded().target.name ?? loaded().target.id} · {loaded().target.id}
                </span>
              </span>
              <span>captured through the hidden frame · scale {loaded().target.scale}</span>
              <Show when={loaded().report}>
                {(report) => <span class="font-chat-mono min-w-0 truncate">{projectPath(report().diffImage)}</span>}
              </Show>
              <div class="ms-auto flex gap-2 items-center">
                <Select.Root
                  collection={SKINS}
                  value={[skin()]}
                  onValueChange={(details) => {
                    const next = parseSkin(details.value[0] ?? '')
                    if (next === undefined) return
                    writeStorage(SKIN_KEY, next)
                    setSkin(next)
                  }}
                  positioning={{placement: 'top-end'}}
                  class="flex gap-1.5 items-center"
                >
                  <Select.Label class="text-[0.6875rem] text-chat-text-3">skin</Select.Label>
                  <Select.Control>
                    <Select.Trigger
                      asChild={(trigger) => (
                        <Button {...trigger()} variant="ghost" size="sm">
                          <Select.ValueText />
                        </Button>
                      )}
                    />
                  </Select.Control>
                  <Select.Positioner>
                    <Select.Content>
                      <For each={SKINS.items}>
                        {(item) => (
                          <Select.Item item={item}>
                            <Select.ItemText>{item.label}</Select.ItemText>
                          </Select.Item>
                        )}
                      </For>
                    </Select.Content>
                  </Select.Positioner>
                  <Select.HiddenSelect />
                </Select.Root>
                <span>
                  · <Kbd>↵</Kbd> opens the source in your editor
                </span>
              </div>
            </footer>
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
