import {For, onCleanup, Show, splitProps, type JSX} from 'solid-js'
import {ManagedRuntime} from 'effect'
import {isPlainObject, keyBy, mapKeys, sumBy} from 'es-toolkit'
import {z} from 'zod'
import {
  Plugin,
  Slot,
  Style,
  ToolRegistry,
  type IconName,
  type ToolComponent,
  type ToolProps,
  type Ui,
} from '@conciv/frontend-plugin-api'
import {OpaqueUi, type InternalUi} from '@internal/frontend-app-api'
import {PageOperation, ReactTree} from '@conciv/frontend-plugin-api/page'
import {tanstackToolLabel, tanstackToolName, type TanstackToolName} from './tool-labels.js'
import {errorRingLayer} from './error-ring.js'
import {execute} from './operations.js'
import {
  AppError,
  CacheEntry,
  Operations,
  RouteInfo,
  RouteMatch,
  RouteNode,
  RouterCurrent,
  ServerFnTraces,
  type Method,
  type Operation,
} from './rpc.js'
import {tanstackLogo} from './tanstack-logo.js'
import pluginCss from 'virtual:uno.css?inline'

const LABEL = 'TanStack inspector active'

function InspectorChip(props: {readonly ui: Ui; readonly logo: IconName}): JSX.Element {
  return (
    <props.ui.Tooltip value={LABEL}>
      <span role="status" aria-label={LABEL} class="inline-flex gap-1.25 whitespace-nowrap items-center">
        <props.ui.Icon name={props.logo} size="small" class="block" />
        {LABEL}
      </span>
    </props.ui.Tooltip>
  )
}

type Card = (ui: InternalUi, logo: IconName) => ToolComponent

const COUNT_FORMAT = new Intl.NumberFormat()
const COUNT_PLURAL = new Intl.PluralRules('en')

function countLabel(count: number, one: string, other: string): string {
  return `${COUNT_FORMAT.format(count)} ${COUNT_PLURAL.select(count) === 'one' ? one : other}`
}

function tanstackOperation<const Name extends Operation['name']>(name: Name): Extract<Operation, {name: Name}> {
  const operation = Operations.find(
    (candidate): candidate is Extract<Operation, {name: Name}> => candidate.name === name,
  )
  if (operation === undefined) throw new Error(`no tanstack operation named ${name}`)
  return operation
}

const OkResult = z.looseObject({ok: z.literal(true)})

function parseOutput(output: string | undefined): unknown {
  if (!output) return undefined
  try {
    return JSON.parse(output)
  } catch {
    return undefined
  }
}

function readOutput<Schema extends z.ZodType>(schema: Schema, output: string | undefined): z.infer<Schema> | null {
  const parsed = schema.safeParse(parseOutput(output))
  return parsed.success ? parsed.data : null
}

function CardRows(props: {children: JSX.Element}): JSX.Element {
  return <div class="flex flex-col gap-0.5">{props.children}</div>
}

function CardRow(props: {children: JSX.Element}): JSX.Element {
  return <div class="text-chat-xs font-chat-mono flex gap-2 items-baseline">{props.children}</div>
}

function CardNote(props: {children: JSX.Element; class?: string}): JSX.Element {
  return <div class={`text-chat-xs text-chat-text-3 ${props.class ?? ''}`}>{props.children}</div>
}

function isRunning(status: ToolProps['status']): boolean {
  return status === 'pending' || status === 'running' || status === 'streaming'
}

function tanstackTitle(tool: string, status: ToolProps['status']): string {
  const label = tanstackToolLabel(tool)
  if (label === undefined) return tool
  return isRunning(status) ? label.running : label.done
}

function InspectionCard(
  props: ToolProps & {
    ui: InternalUi
    logo: IconName
    summary: string
    failed?: boolean
    hasContent?: boolean
    children?: JSX.Element
  },
): JSX.Element {
  const [local, tool] = splitProps(props, ['ui', 'logo', 'summary', 'failed', 'hasContent', 'children'])
  const running = () => isRunning(tool.status)
  return (
    <local.ui.BasicTool
      {...tool}
      icon={local.logo}
      title={tanstackTitle(tool.tool, tool.status)}
      subtitle={running() ? undefined : local.summary}
      failed={local.failed}
      expandable={!running() && (local.hasContent ?? false)}
    >
      {local.children}
    </local.ui.BasicTool>
  )
}

function summaryOnlyCard(summary: (props: ToolProps) => string): Card {
  return (ui, logo) => (props) => <InspectionCard {...props} ui={ui} logo={logo} summary={summary(props)} />
}

const NavigateResultSchema = z.object({to: z.string()}).loose()

function keyedCard(operation: 'query_invalidate' | 'query_refetch'): Card {
  const KeyInputSchema = tanstackOperation(operation).input.pick({key: true})
  return summaryOnlyCard((call) => {
    if (!OkResult.safeParse(parseOutput(call.output)).success) return ''
    const input = KeyInputSchema.safeParse(call.input)
    return input.success ? (input.data.key ?? '') : ''
  })
}

const MatchSchema = RouteMatch.pick({routeId: true, status: true})
  .partial({status: true})
  .extend({path: RouteMatch.shape.path.default('')})
  .loose()

const LocationSchema = RouterCurrent.shape.location
  .extend({
    search: RouterCurrent.shape.location.shape.search.default(''),
    hash: RouterCurrent.shape.location.shape.hash.default(''),
  })
  .loose()

const RouterStateSchema = RouterCurrent.extend({location: LocationSchema, matches: z.array(MatchSchema)}).loose()

const routerStateCard: Card = (ui, logo) => (props) => {
  const state = () => readOutput(RouterStateSchema, props.output)
  const summary = () => {
    const value = state()
    return value ? `${value.location.pathname} · ${countLabel(value.matches.length, 'match', 'matches')}` : ''
  }
  return (
    <InspectionCard {...props} ui={ui} logo={logo} summary={summary()} hasContent={state() !== null}>
      <Show when={state()}>
        {(value) => (
          <CardRows>
            <CardRow>
              <ui.TruncatedText
                class="text-chat-text-hi min-w-0"
                text={`${value().location.pathname}${value().location.search}${value().location.hash}`}
              />
            </CardRow>
            <For each={value().matches}>
              {(match) => (
                <CardRow>
                  <ui.TruncatedText class="text-chat-text-2 min-w-0" text={match.routeId} />
                  <Show when={match.path}>
                    <span class="text-chat-text-3 shrink-0">{match.path}</span>
                  </Show>
                  <Show when={match.status}>
                    {(status) => (
                      <ui.Chip value={status()} tone={status() === 'error' ? 'danger' : undefined} class="ms-auto" />
                    )}
                  </Show>
                </CardRow>
              )}
            </For>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}

const RouteBranchSchema = RouteNode.pick({id: true})
  .extend({
    hasLoader: RouteNode.shape.hasLoader.default(false),
    get children(): z.ZodDefault<z.ZodArray<typeof RouteBranchSchema>> {
      return z.array(RouteBranchSchema).default([])
    },
  })
  .loose()

type RouteBranchNode = z.infer<typeof RouteBranchSchema>

function countRoutes(node: RouteBranchNode): number {
  return 1 + sumBy(node.children, countRoutes)
}

function RouteBranch(props: {ui: InternalUi; node: RouteBranchNode; root: boolean}): JSX.Element {
  return (
    <>
      <CardRow>
        <Show when={!props.root}>
          <props.ui.Icon name="corner-down-right" size="small" class="text-chat-faint" />
        </Show>
        <props.ui.TruncatedText class="text-chat-text-2 min-w-0" text={props.node.id} />
        <Show when={props.node.hasLoader}>
          <span class="text-chat-text-3 tracking-wider shrink-0 uppercase">loader</span>
        </Show>
      </CardRow>
      <Show when={props.node.children.length > 0}>
        <div class={`flex flex-col gap-0.5 ${props.root ? '' : 'ps-3'}`}>
          <For each={props.node.children}>{(child) => <RouteBranch ui={props.ui} node={child} root={false} />}</For>
        </div>
      </Show>
    </>
  )
}

const routeTreeCard: Card = (ui, logo) => (props) => {
  const tree = () => readOutput(RouteBranchSchema, props.output)
  const summary = () => {
    const root = tree()
    return root ? countLabel(countRoutes(root), 'route', 'routes') : ''
  }
  return (
    <InspectionCard {...props} ui={ui} logo={logo} summary={summary()} hasContent={tree() !== null}>
      <Show when={tree()}>
        {(root) => (
          <CardRows>
            <RouteBranch ui={ui} node={root()} root={true} />
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}

type Entry = {key: string; preview: string; value: unknown}

const TruncatedMarker = z.looseObject({__conciv: z.string(), preview: z.string()})

function isTruncatedMarker(value: unknown): boolean {
  return TruncatedMarker.safeParse(value).success
}

function opensAsTree(value: unknown): boolean {
  return (Array.isArray(value) || isPlainObject(value)) && !isTruncatedMarker(value)
}

function keysPreview(value: object): string {
  const keys = Object.keys(value)
  return keys.length > 0 ? `{ ${keys.join(', ')} }` : '{}'
}

function preview(value: unknown): string {
  if (Array.isArray(value)) return `Array(${value.length})`
  const marker = TruncatedMarker.safeParse(value)
  if (marker.success) return marker.data.preview
  return isPlainObject(value) ? keysPreview(value) : String(value)
}

function toEntries(payload: unknown): Entry[] {
  if (isPlainObject(payload) && !isTruncatedMarker(payload)) {
    return Object.entries(payload).map(([key, value]) => ({key, preview: preview(value), value}))
  }
  if (Array.isArray(payload)) {
    return payload.map((value, index) => ({key: String(index), preview: preview(value), value}))
  }
  return [{key: 'value', preview: preview(payload), value: payload}]
}

const LoaderDataPayload = z.looseObject({routeId: z.string(), data: z.unknown()})

function loaderKeysSummary(count: number, routeId: string | undefined): string {
  const keys = countLabel(count, 'key', 'keys')
  return routeId ? `${keys} · ${routeId}` : keys
}

function emptyLoaderSummary(payload: z.infer<typeof LoaderDataPayload> | null): string {
  return payload?.data === null ? 'no loader data' : ''
}

const loaderDataCard: Card = (ui, logo) => (props) => {
  const payload = () => readOutput(LoaderDataPayload, props.output)
  const entries = () => {
    const value = payload()
    if (value === null || value.data === undefined || value.data === null) return null
    return toEntries(value.data)
  }
  const summary = () => {
    const list = entries()
    return list ? loaderKeysSummary(list.length, payload()?.routeId) : emptyLoaderSummary(payload())
  }
  return (
    <InspectionCard {...props} ui={ui} logo={logo} summary={summary()} hasContent={entries() !== null}>
      <Show when={entries()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(entry) => (
                <div class="flex flex-col gap-1">
                  <CardRow>
                    <ui.TruncatedText class="text-chat-text-2 min-w-0" text={entry.key} />
                    <Show when={!opensAsTree(entry.value)}>
                      <ui.TruncatedText class="text-chat-text-3 min-w-0" text={entry.preview} />
                    </Show>
                  </CardRow>
                  <Show when={opensAsTree(entry.value)}>
                    <ui.Json value={entry.value} />
                  </Show>
                </div>
              )}
            </For>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}

const CacheEntrySchema = CacheEntry.extend({
  state: CacheEntry.shape.state.default('fresh'),
  status: CacheEntry.shape.status.default(null),
  observers: CacheEntry.shape.observers.default(null),
  updatedAt: CacheEntry.shape.updatedAt.default(null),
  error: CacheEntry.shape.error.default(null),
}).loose()

const QueryCacheSchema = z.object({
  queries: z.array(CacheEntrySchema).default([]),
  mutations: z.array(CacheEntrySchema).default([]),
})

function CacheEntryRow(props: {ui: InternalUi; entry: z.infer<typeof CacheEntrySchema>}): JSX.Element {
  return (
    <div class="flex flex-col gap-1">
      <CardRow>
        <props.ui.TruncatedText class="text-chat-text-2 min-w-0" text={props.entry.key} />
        <props.ui.Chip value={props.entry.state} tone={props.entry.state === 'error' ? 'danger' : undefined} />
        <Show when={props.entry.observers !== null}>
          <span class="text-chat-text-3 shrink-0">{props.entry.observers} obs</span>
        </Show>
        <Show when={props.entry.updatedAt}>
          {(updatedAt) => (
            <span class="text-chat-text-3 ms-auto shrink-0">
              <props.ui.RelativeTime value={new Date(updatedAt())} />
            </span>
          )}
        </Show>
      </CardRow>
      <Show when={props.entry.error}>{(error) => <props.ui.ErrorMessage message={error()} />}</Show>
      <Show when={props.entry.value !== undefined && props.entry.value !== null}>
        <props.ui.Json value={props.entry.value} />
      </Show>
    </div>
  )
}

const queryCacheCard: Card = (ui, logo) => (props) => {
  const cache = () => readOutput(QueryCacheSchema, props.output)
  const summary = () => {
    const value = cache()
    if (!value) return ''
    const queries = countLabel(value.queries.length, 'query', 'queries')
    if (value.mutations.length === 0) return queries
    return `${queries} · ${countLabel(value.mutations.length, 'mutation', 'mutations')}`
  }
  return (
    <InspectionCard {...props} ui={ui} logo={logo} summary={summary()} hasContent={cache() !== null}>
      <Show when={cache()}>
        {(value) => (
          <CardRows>
            <Show when={value().queries.length === 0 && value().mutations.length === 0}>
              <CardNote>no cached queries</CardNote>
            </Show>
            <Show when={value().queries.length > 0}>
              <CardNote>queries</CardNote>
              <For each={value().queries}>{(entry) => <CacheEntryRow ui={ui} entry={entry} />}</For>
            </Show>
            <Show when={value().mutations.length > 0}>
              <CardNote class="pt-1">mutations</CardNote>
              <For each={value().mutations}>{(entry) => <CacheEntryRow ui={ui} entry={entry} />}</For>
            </Show>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}

const LOCATION_CLASS =
  'text-chat-xs text-chat-text-2 leading-[var(--chat-trace-gutter)] font-chat-mono m-0 min-w-0 block'

const AppErrorsSchema = z.array(AppError.pick({message: true, source: true}).partial({source: true}).loose())

const buildErrorsCard: Card = (ui, logo) => (props) => {
  const errors = () =>
    readOutput(AppErrorsSchema, props.output)?.map((error) => ({
      message: error.message,
      where: error.source ? `${error.source.file}:${error.source.line}` : null,
    })) ?? null
  const summary = () => {
    const list = errors()
    if (!list) return ''
    if (list.length === 0) return 'no errors'
    return countLabel(list.length, 'error', 'errors')
  }
  return (
    <InspectionCard
      {...props}
      ui={ui}
      logo={logo}
      summary={summary()}
      hasContent={true}
      failed={(errors()?.length ?? 0) > 0}
    >
      <Show when={errors()?.length} fallback={<CardNote>No build errors</CardNote>}>
        <div class="flex flex-col gap-1.5">
          <For each={errors()}>
            {(error) => (
              <div class="flex flex-col gap-1 min-w-0">
                <Show when={error.where}>{(where) => <ui.TruncatedText class={LOCATION_CLASS} text={where()} />}</Show>
                <ui.ErrorMessage message={error.message} />
              </div>
            )}
          </For>
        </div>
      </Show>
    </InspectionCard>
  )
}

const RouteManifestSchema = z.array(RouteInfo.pick({path: true, kind: true, dynamic: true}).loose())

const routeManifestCard: Card = (ui, logo) => (props) => {
  const routes = () => readOutput(RouteManifestSchema, props.output)
  const summary = () => {
    const list = routes()
    return list ? countLabel(list.length, 'route', 'routes') : ''
  }
  return (
    <InspectionCard {...props} ui={ui} logo={logo} summary={summary()} hasContent={routes() !== null}>
      <Show when={routes()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(route) => (
                <CardRow>
                  <ui.TruncatedText class="text-chat-text-2 flex-1 min-w-0" text={route.path} />
                  <span class="text-chat-accent tracking-wider shrink-0 w-16 uppercase">
                    {route.dynamic ? 'dynamic' : ''}
                  </span>
                  <span class="text-chat-xs text-chat-text-3 tracking-wider shrink-0 w-14 uppercase">{route.kind}</span>
                </CardRow>
              )}
            </For>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}

const TracePayloadSchema = ServerFnTraces.extend({
  traces: z.array(
    ServerFnTraces.shape.traces.element.pick({id: true, name: true, durationMs: true, status: true}).loose(),
  ),
  functions: z.array(ServerFnTraces.shape.functions.element.pick({id: true, file: true}).partial({file: true}).loose()),
})

const serverFnTraceCard: Card = (ui, logo) => (props) => {
  const traces = () => {
    const payload = readOutput(TracePayloadSchema, props.output)
    if (!payload) return null
    const functionById = keyBy(payload.functions, (serverFunction) => serverFunction.id)
    return payload.traces.map((trace) => ({
      name: trace.name,
      file: functionById[trace.id]?.file ?? null,
      durationMs: trace.durationMs,
      status: trace.status,
    }))
  }
  const summary = () => {
    const list = traces()
    if (!list) return ''
    if (list.length === 0) return 'no calls'
    return countLabel(list.length, 'call', 'calls')
  }
  return (
    <InspectionCard {...props} ui={ui} logo={logo} summary={summary()} hasContent={true}>
      <Show when={traces()?.length} fallback={<CardNote>No server-fn calls</CardNote>}>
        <CardRows>
          <For each={traces()}>
            {(trace) => (
              <CardRow>
                <ui.StatusDot tone={trace.status === 'error' ? 'danger' : 'success'} />
                <ui.TruncatedText class="text-chat-text-2 min-w-0" text={trace.name} />
                <Show when={trace.file}>
                  {(file) => <ui.TruncatedText class="text-chat-text-3 min-w-0" text={file()} />}
                </Show>
                <span class="text-chat-text-3 ms-auto shrink-0 tabular-nums">{trace.durationMs}ms</span>
                <ui.Chip value={trace.status} tone={trace.status === 'error' ? 'danger' : undefined} />
              </CardRow>
            )}
          </For>
        </CardRows>
      </Show>
    </InspectionCard>
  )
}

const plainCard = summaryOnlyCard(() => '')

const operationCards = {
  router_state: routerStateCard,
  route_tree: routeTreeCard,
  loader_data: loaderDataCard,
  query_cache: queryCacheCard,
  query_invalidate: keyedCard('query_invalidate'),
  query_refetch: keyedCard('query_refetch'),
  navigate: summaryOnlyCard((call) => readOutput(NavigateResultSchema, call.output)?.to ?? ''),
  router_invalidate: plainCard,
  back: plainCard,
} satisfies Partial<Record<Method, Card>>

const tanstackCards = {
  ...mapKeys(operationCards, (_card, operation) => tanstackToolName(operation)),
  tanstack_build_errors: buildErrorsCard,
  tanstack_route_manifest: routeManifestCard,
  tanstack_server_fn_trace: serverFnTraceCard,
} satisfies Record<TanstackToolName, Card>

const tanstack: Plugin.Definition = Plugin.define({
  icons: {logo: tanstackLogo},
  setup(ctx) {
    ctx.add(Style, pluginCss)
    const tree = ctx.use(ReactTree)
    const runtime = ManagedRuntime.make(errorRingLayer)
    runtime.runSync(runtime.contextEffect)
    onCleanup(() => void runtime.dispose())

    Operations.forEach((operation) =>
      ctx.add(PageOperation, {
        name: `tanstack.${operation.name}`,
        run: (input, signal) => runtime.runPromise(execute(operation.name, input, tree()), {signal}),
      }),
    )

    ctx.add(Slot, {at: 'session.status', render: () => <InspectorChip ui={ctx.ui} logo={ctx.icons.logo} />})

    Object.entries(tanstackCards).forEach(([name, card]) =>
      ctx.add(ToolRegistry, {name, render: card(OpaqueUi.toInternal(ctx.ui), ctx.icons.logo)}),
    )
  },
})

export default tanstack
