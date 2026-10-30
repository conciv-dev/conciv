import {describe, expect, it, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ComposerActions, ComposerActionsHost} from '@conciv/ui-kit-chat'
import {type ExtensionSlot} from '@conciv/extension'
import {HostApiProvider} from '@conciv/extension/host'
import {mountToolCard} from '@conciv/extension-testkit/card-harness'
import type {ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {CONCIV_TANSTACK_CLIENT_LABEL} from '../src/client-sentinel.js'
import {InspectorChip} from '../src/client/inspector-chip.js'
import {tanstack} from '../src/client.js'
import {BackCard} from '../src/tool/back-card.js'
import {BuildErrorsCard} from '../src/tool/build-errors-card.js'
import {LoaderDataCard} from '../src/tool/loader-data-card.js'
import {NavigateCard} from '../src/tool/navigate-card.js'
import {QueryCacheCard} from '../src/tool/query-cache-card.js'
import {QueryInvalidateCard} from '../src/tool/query-invalidate-card.js'
import {QueryRefetchCard} from '../src/tool/query-refetch-card.js'
import {RouteManifestCard} from '../src/tool/route-manifest-card.js'
import {RouterInvalidateCard} from '../src/tool/router-invalidate-card.js'
import {RouterStateCard} from '../src/tool/router-state-card.js'
import {RouteTreeCard} from '../src/tool/route-tree-card.js'
import {ServerFnTraceCard} from '../src/tool/server-fn-trace-card.js'
import {
  backDef,
  buildErrorsDef,
  loaderDataDef,
  navigateDef,
  queryCacheDef,
  queryInvalidateDef,
  queryRefetchDef,
  routeManifestDef,
  routerInvalidateDef,
  routerStateDef,
  routeTreeDef,
  serverFnTraceDef,
} from '../src/tool/def.js'

describe('inspector chip', () => {
  function mountChip(): void {
    render(() => <InspectorChip />)
  }

  function ExtensionSlotContent(props: {slot: ExtensionSlot}): JSX.Element {
    return (
      <HostApiProvider slot={props.slot}>
        <Show when={tanstack.Component}>{(component) => <Dynamic component={component()} />}</Show>
      </HostApiProvider>
    )
  }

  function mountSlot(slot: ExtensionSlot): void {
    render(() => <ExtensionSlotContent slot={slot} />)
  }

  test('the inspector chip stays out of the composer row', async () => {
    render(() => (
      <ComposerActionsHost maxInlineAuto={0}>
        <ComposerActions.Trigger>
          <span>more</span>
        </ComposerActions.Trigger>
        <ComposerActions.Trailing>
          <button type="button">Send</button>
        </ComposerActions.Trailing>
        <ExtensionSlotContent slot="composer" />
      </ComposerActionsHost>
    ))
    await expect.element(page.getByRole('button', {name: 'Send'})).toBeVisible()
    await expect.element(page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})).not.toBeInTheDocument()
  })

  test('the inspector chip rides the status surface above the composer', async () => {
    mountSlot('status')
    await expect.element(page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})).toBeVisible()
  })

  test('the composer chip is a labeled passive status indicator, not a button', async () => {
    mountChip()
    await expect.element(page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})).toBeVisible()
    await expect.element(page.getByRole('button')).not.toBeInTheDocument()
  })

  test('hovering the chip opens its tooltip', async () => {
    mountChip()
    const chip = page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})
    await chip.hover()
    await expect.element(page.getByRole('tooltip')).toHaveTextContent(CONCIV_TANSTACK_CLIENT_LABEL)
  })
})

describe('router card', () => {
  const DEFS = [
    backDef,
    loaderDataDef,
    navigateDef,
    queryCacheDef,
    queryInvalidateDef,
    queryRefetchDef,
    routerInvalidateDef,
    routerStateDef,
    routeTreeDef,
  ]

  function toViewMeta(meta: (typeof DEFS)[number]['meta']): ToolViewMeta {
    if (!meta) throw new Error('def is missing meta')
    return {...meta, summary: meta.summary ?? '', mutating: meta.mutating ?? false, mirrors: meta.mirrors ?? false}
  }

  const metaByName = new Map<string, ToolViewMeta>(DEFS.map((def) => [def.name, toViewMeta(def.meta)]))

  const catalogCtx: ToolViewCtx = {
    apiBase: '',
    harnessId: 'claude',
    sendMessage: () => {},
    addResult: () => {},
    catalog: {loaded: () => true, meta: (name) => metaByName.get(name)},
  }

  const ROUTER_STATE = JSON.stringify({
    location: {pathname: '/about', search: '', hash: ''},
    matches: [
      {routeId: '__root__', path: ''},
      {routeId: '/about', path: '/about', status: 'success'},
    ],
  })

  const ROUTE_TREE = JSON.stringify({
    id: '__root__',
    hasLoader: false,
    children: [
      {id: '/', hasLoader: false, children: []},
      {id: '/about', hasLoader: true, children: []},
    ],
  })

  const LOADER_DATA = JSON.stringify({
    routeId: '/about',
    data: {
      server: {greeting: 'hello'},
      local: {n: 42},
      deep: {__conciv: 'object', size: 1, preview: '{…}'},
    },
  })

  const LOADER_DATA_WITH_ORDINARY_PREVIEW_FIELD = JSON.stringify({
    routeId: '/articles',
    data: {article: {title: 'Ship the trace redesign', preview: 'short excerpt', author: 'Omri'}},
  })

  function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function doneTitleOf(name: string): RegExp {
    const meta = metaByName.get(name)
    if (!meta?.label) throw new Error(`no label registered for ${name}`)
    return new RegExp(escapeRegExp(meta.label.done))
  }

  function runningTitleOf(name: string): RegExp {
    const meta = metaByName.get(name)
    if (!meta?.label) throw new Error(`no label registered for ${name}`)
    return new RegExp(escapeRegExp(meta.label.running))
  }

  async function expectErrorCard(
    Card: Parameters<typeof mountToolCard>[0],
    name: string,
    message: string,
    options: {code?: string; args?: unknown} = {},
  ): Promise<void> {
    mountToolCard(Card, {
      name,
      args: options.args,
      content: JSON.stringify({code: options.code ?? 'handler-error', message}),
      state: 'error',
      ctx: catalogCtx,
    })
    await page.getByRole('button', {name: doneTitleOf(name)}).click()
    await expect.element(page.getByText(message)).toBeVisible()
  }

  describe('RouterStateCard (real browser)', () => {
    it('renders a loading affordance while the tool is running', async () => {
      mountToolCard(RouterStateCard, {name: 'tanstack_router_state', ctx: catalogCtx})
      await expect.element(page.getByText(runningTitleOf('tanstack_router_state'))).toBeVisible()
    })

    it('shows the current route path and match count on success', async () => {
      mountToolCard(RouterStateCard, {name: 'tanstack_router_state', content: ROUTER_STATE, ctx: catalogCtx})
      await expect.element(page.getByText('/about · 2 matches')).toBeVisible()
      await page.getByRole('button', {name: doneTitleOf('tanstack_router_state')}).click()
      await expect.element(page.getByText('__root__')).toBeVisible()
      await expect.element(page.getByText('success')).toBeVisible()
    })

    it('renders the error message when the verb fails', async () => {
      await expectErrorCard(RouterStateCard, 'tanstack_router_state', 'TanStack router not found on page')
    })
  })

  describe('RouteTreeCard (real browser)', () => {
    it('renders a loading affordance while the tool is running', async () => {
      mountToolCard(RouteTreeCard, {name: 'tanstack_route_tree', ctx: catalogCtx})
      await expect.element(page.getByText(runningTitleOf('tanstack_route_tree'))).toBeVisible()
    })

    it('shows the route ids on success', async () => {
      mountToolCard(RouteTreeCard, {name: 'tanstack_route_tree', content: ROUTE_TREE, ctx: catalogCtx})
      await expect.element(page.getByText('3 routes')).toBeVisible()
      await page.getByRole('button', {name: doneTitleOf('tanstack_route_tree')}).click()
      await expect.element(page.getByText('__root__')).toBeVisible()
      await expect.element(page.getByText('/about', {exact: true})).toBeVisible()
    })

    it('renders the error message when the verb fails', async () => {
      await expectErrorCard(RouteTreeCard, 'tanstack_route_tree', 'page verb timed out', {code: 'timeout'})
    })
  })

  const QUERY_CACHE = JSON.stringify({
    queries: [
      {
        key: '["spike","demo"]',
        state: 'fresh',
        status: 'success',
        observers: 1,
        updatedAt: Date.now() - 5 * 60_000,
        value: {fetched: true},
        error: null,
      },
      {
        key: '["users"]',
        state: 'stale',
        status: 'success',
        observers: 0,
        updatedAt: Date.now(),
        value: [],
        error: null,
      },
    ],
    mutations: [],
  })

  describe('QueryCacheCard (real browser)', () => {
    it('renders a loading affordance while the tool is running', async () => {
      mountToolCard(QueryCacheCard, {name: 'tanstack_query_cache', ctx: catalogCtx})
      await expect.element(page.getByText(runningTitleOf('tanstack_query_cache'))).toBeVisible()
    })

    it('shows the cached query keys and states on success', async () => {
      mountToolCard(QueryCacheCard, {name: 'tanstack_query_cache', content: QUERY_CACHE, ctx: catalogCtx})
      await expect.element(page.getByText('2 queries')).toBeVisible()
      await page.getByRole('button', {name: doneTitleOf('tanstack_query_cache')}).click()
      await expect.element(page.getByText('["spike","demo"]')).toBeVisible()
      await expect.element(page.getByText('fresh')).toBeVisible()
      await expect.element(page.getByText('stale')).toBeVisible()
      await expect.element(page.getByText(/5m ago/)).toBeVisible()
      await expect.element(page.getByText('fetched', {exact: true})).toBeVisible()
    })

    it('renders the error message when the verb fails', async () => {
      await expectErrorCard(QueryCacheCard, 'tanstack_query_cache', 'TanStack QueryClient not found on page')
    })
  })

  describe('LoaderDataCard (real browser)', () => {
    it('renders a loading affordance while the tool is running', async () => {
      mountToolCard(LoaderDataCard, {name: 'tanstack_loader_data', ctx: catalogCtx})
      await expect.element(page.getByText(runningTitleOf('tanstack_loader_data'))).toBeVisible()
    })

    it('shows the loader keys and truncation marker on success', async () => {
      mountToolCard(LoaderDataCard, {name: 'tanstack_loader_data', content: LOADER_DATA, ctx: catalogCtx})
      await expect.element(page.getByText('3 keys · /about')).toBeVisible()
      await page.getByRole('button', {name: doneTitleOf('tanstack_loader_data')}).click()
      await expect.element(page.getByText('server')).toBeVisible()
      await expect.element(page.getByText('deep')).toBeVisible()
      await expect.element(page.getByText('{…}')).toBeVisible()
      await expect.element(page.getByText('n', {exact: true})).toBeVisible()
    })

    it('renders the error message when the verb fails', async () => {
      await expectErrorCard(LoaderDataCard, 'tanstack_loader_data', 'TanStack router not found on page')
    })

    it('does not suppress JSON details for a loader value whose own preview field is not the truncation marker', async () => {
      mountToolCard(LoaderDataCard, {
        name: 'tanstack_loader_data',
        content: LOADER_DATA_WITH_ORDINARY_PREVIEW_FIELD,
        ctx: catalogCtx,
      })
      await page.getByRole('button', {name: doneTitleOf('tanstack_loader_data')}).click()
      await expect.element(page.getByText('author', {exact: true})).toBeVisible()
    })
  })

  describe('NavigateCard (real browser)', () => {
    it('renders a loading affordance while the action runs', async () => {
      mountToolCard(NavigateCard, {name: 'tanstack_navigate', args: {to: '/form'}, ctx: catalogCtx})
      await expect.element(page.getByText(runningTitleOf('tanstack_navigate'))).toBeVisible()
    })

    it('confirms the target route on success', async () => {
      mountToolCard(NavigateCard, {
        name: 'tanstack_navigate',
        args: {to: '/form'},
        content: JSON.stringify({ok: true, to: '/form'}),
        ctx: catalogCtx,
      })
      await expect.element(page.getByText('→ /form')).toBeVisible()
    })

    it('renders the error message when the action fails', async () => {
      await expectErrorCard(NavigateCard, 'tanstack_navigate', 'TanStack router not found on page', {
        args: {to: '/form'},
      })
    })
  })

  describe('RouterInvalidateCard (real browser)', () => {
    it('renders a loading affordance while the action runs', async () => {
      mountToolCard(RouterInvalidateCard, {name: 'tanstack_router_invalidate', ctx: catalogCtx})
      await expect.element(page.getByText(runningTitleOf('tanstack_router_invalidate'))).toBeVisible()
    })

    it('confirms invalidation on success', async () => {
      mountToolCard(RouterInvalidateCard, {
        name: 'tanstack_router_invalidate',
        content: JSON.stringify({ok: true}),
        ctx: catalogCtx,
      })
      await expect.element(page.getByText('invalidated', {exact: true})).toBeVisible()
    })

    it('renders the error message when the action fails', async () => {
      await expectErrorCard(
        RouterInvalidateCard,
        'tanstack_router_invalidate',
        'TanStack router invalidate is not available',
      )
    })
  })

  describe('BackCard (real browser)', () => {
    it('confirms navigation back on success', async () => {
      mountToolCard(BackCard, {name: 'tanstack_back', content: JSON.stringify({ok: true}), ctx: catalogCtx})
      await expect.element(page.getByText('went back', {exact: true})).toBeVisible()
    })
  })

  describe('QueryInvalidateCard (real browser)', () => {
    it('renders a loading affordance while the action runs', async () => {
      mountToolCard(QueryInvalidateCard, {
        name: 'tanstack_query_invalidate',
        args: {key: '["spike","demo"]'},
        ctx: catalogCtx,
      })
      await expect.element(page.getByText(runningTitleOf('tanstack_query_invalidate'))).toBeVisible()
    })

    it('confirms the invalidated key on success', async () => {
      mountToolCard(QueryInvalidateCard, {
        name: 'tanstack_query_invalidate',
        args: {key: '["spike","demo"]'},
        content: JSON.stringify({ok: true}),
        ctx: catalogCtx,
      })
      await expect.element(page.getByText('invalidated ["spike","demo"]')).toBeVisible()
    })

    it('renders the error message when the action fails', async () => {
      await expectErrorCard(
        QueryInvalidateCard,
        'tanstack_query_invalidate',
        'TanStack QueryClient not found on page',
        {
          args: {key: '["spike","demo"]'},
        },
      )
    })
  })

  describe('QueryRefetchCard (real browser)', () => {
    it('confirms the refetched key on success', async () => {
      mountToolCard(QueryRefetchCard, {
        name: 'tanstack_query_refetch',
        args: {key: '["spike","demo"]'},
        content: JSON.stringify({ok: true}),
        ctx: catalogCtx,
      })
      await expect.element(page.getByText('refetched ["spike","demo"]')).toBeVisible()
    })
  })
})

describe('server card', () => {
  const DEFS = [buildErrorsDef, routeManifestDef, serverFnTraceDef]

  function toViewMeta(meta: (typeof DEFS)[number]['meta']): ToolViewMeta {
    if (!meta) throw new Error('def is missing meta')
    return {...meta, summary: meta.summary ?? '', mutating: meta.mutating ?? false, mirrors: meta.mirrors ?? false}
  }

  const metaByName = new Map<string, ToolViewMeta>(DEFS.map((def) => [def.name, toViewMeta(def.meta)]))

  const catalogCtx: ToolViewCtx = {
    apiBase: '',
    harnessId: 'claude',
    sendMessage: () => {},
    addResult: () => {},
    catalog: {loaded: () => true, meta: (name) => metaByName.get(name)},
  }

  function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function doneTitleOf(name: string): RegExp {
    const meta = metaByName.get(name)
    if (!meta?.label) throw new Error(`no label registered for ${name}`)
    return new RegExp(escapeRegExp(meta.label.done))
  }

  function runningTitleOf(name: string): RegExp {
    const meta = metaByName.get(name)
    if (!meta?.label) throw new Error(`no label registered for ${name}`)
    return new RegExp(escapeRegExp(meta.label.running))
  }

  const BUILD_ERRORS = JSON.stringify([
    {
      id: 'build:/app/src/routes/about.tsx:12:8:1',
      kind: 'build',
      message: "Expected ';' but found '='",
      stack: null,
      source: {file: '/app/src/routes/about.tsx', line: 12, column: 8},
      digest: null,
      at: 1,
    },
  ])

  const ROUTE_MANIFEST = JSON.stringify([
    {path: '/', kind: 'layout', dynamic: false, file: '/app/src/routes/__root'},
    {path: '/', kind: 'page', dynamic: false, file: '/app/src/routes/index'},
    {path: '/posts/$postId', kind: 'page', dynamic: true, file: '/app/src/routes/posts.$postId'},
  ])

  const SERVER_FN_TRACES = JSON.stringify({
    traces: [
      {id: 'aWQx', name: 'getGreeting_createServerFn_handler', durationMs: 4, status: 'ok', at: 1},
      {id: 'aWQy', name: 'saveThing_createServerFn_handler', durationMs: 120, status: 'error', at: 2},
    ],
    functions: [
      {id: 'aWQx', name: 'getGreeting_createServerFn_handler', route: null, file: '/src/lib/server-fns.ts'},
      {id: 'aWQy', name: 'saveThing_createServerFn_handler', route: null, file: '/src/lib/mutations.ts'},
    ],
  })

  describe('BuildErrorsCard (real browser)', () => {
    it('renders a loading affordance while the tool is running', async () => {
      mountToolCard(BuildErrorsCard, {name: 'tanstack_build_errors', ctx: catalogCtx})
      await expect.element(page.getByText(runningTitleOf('tanstack_build_errors'))).toBeVisible()
    })

    it('lists the build error message and location on success', async () => {
      mountToolCard(BuildErrorsCard, {name: 'tanstack_build_errors', content: BUILD_ERRORS, ctx: catalogCtx})
      await expect.element(page.getByText('1 error')).toBeVisible()
      await page.getByRole('button', {name: doneTitleOf('tanstack_build_errors')}).click()
      await expect.element(page.getByText('/app/src/routes/about.tsx:12')).toBeVisible()
      await expect.element(page.getByText("Expected ';' but found '='")).toBeVisible()
    })

    it('shows a clean state when there are no build errors', async () => {
      mountToolCard(BuildErrorsCard, {name: 'tanstack_build_errors', content: JSON.stringify([]), ctx: catalogCtx})
      await expect.element(page.getByText('no errors')).toBeVisible()
      await page.getByRole('button', {name: doneTitleOf('tanstack_build_errors')}).click()
      await expect.element(page.getByText('No build errors')).toBeVisible()
    })

    it('renders the error message when the tool fails', async () => {
      mountToolCard(BuildErrorsCard, {
        name: 'tanstack_build_errors',
        content: JSON.stringify({code: 'handler-error', message: 'bundler bridge unavailable'}),
        state: 'error',
        ctx: catalogCtx,
      })
      await page.getByRole('button', {name: doneTitleOf('tanstack_build_errors')}).click()
      await expect.element(page.getByText('bundler bridge unavailable', {exact: true})).toBeVisible()
    })
  })

  describe('RouteManifestCard (real browser)', () => {
    it('renders a loading affordance while the tool is running', async () => {
      mountToolCard(RouteManifestCard, {name: 'tanstack_route_manifest', ctx: catalogCtx})
      await expect.element(page.getByText(runningTitleOf('tanstack_route_manifest'))).toBeVisible()
    })

    it('lists the routes with kind and dynamic markers on success', async () => {
      mountToolCard(RouteManifestCard, {name: 'tanstack_route_manifest', content: ROUTE_MANIFEST, ctx: catalogCtx})
      await expect.element(page.getByText('3 routes')).toBeVisible()
      await page.getByRole('button', {name: doneTitleOf('tanstack_route_manifest')}).click()
      await expect.element(page.getByText('/posts/$postId')).toBeVisible()
      await expect.element(page.getByText('layout')).toBeVisible()
      await expect.element(page.getByText('dynamic')).toBeVisible()
    })

    it('renders the error message when the tool fails', async () => {
      mountToolCard(RouteManifestCard, {
        name: 'tanstack_route_manifest',
        content: JSON.stringify({code: 'handler-error', message: 'routeTree.gen not found'}),
        state: 'error',
        ctx: catalogCtx,
      })
      await page.getByRole('button', {name: doneTitleOf('tanstack_route_manifest')}).click()
      await expect.element(page.getByText('routeTree.gen not found', {exact: true})).toBeVisible()
    })
  })

  describe('ServerFnTraceCard (real browser)', () => {
    it('renders a loading affordance while the tool is running', async () => {
      mountToolCard(ServerFnTraceCard, {name: 'tanstack_server_fn_trace', ctx: catalogCtx})
      await expect.element(page.getByText(runningTitleOf('tanstack_server_fn_trace'))).toBeVisible()
    })

    it('lists server-fn calls with name, file, duration and status on success', async () => {
      mountToolCard(ServerFnTraceCard, {name: 'tanstack_server_fn_trace', content: SERVER_FN_TRACES, ctx: catalogCtx})
      await expect.element(page.getByText('2 calls')).toBeVisible()
      await page.getByRole('button', {name: doneTitleOf('tanstack_server_fn_trace')}).click()
      await expect.element(page.getByText('getGreeting_createServerFn_handler')).toBeVisible()
      await expect.element(page.getByText('/src/lib/server-fns.ts')).toBeVisible()
      await expect.element(page.getByText('4ms')).toBeVisible()
      await expect.element(page.getByText('error')).toBeVisible()
    })

    it('shows a clean state when there are no server-fn calls', async () => {
      mountToolCard(ServerFnTraceCard, {
        name: 'tanstack_server_fn_trace',
        content: JSON.stringify({traces: [], functions: []}),
        ctx: catalogCtx,
      })
      await expect.element(page.getByText('no calls')).toBeVisible()
      await page.getByRole('button', {name: doneTitleOf('tanstack_server_fn_trace')}).click()
      await expect.element(page.getByText('No server-fn calls')).toBeVisible()
    })

    it('renders the error message when the tool fails', async () => {
      mountToolCard(ServerFnTraceCard, {
        name: 'tanstack_server_fn_trace',
        content: JSON.stringify({code: 'handler-error', message: 'bundler bridge unavailable'}),
        state: 'error',
        ctx: catalogCtx,
      })
      await page.getByRole('button', {name: doneTitleOf('tanstack_server_fn_trace')}).click()
      await expect.element(page.getByText('bundler bridge unavailable', {exact: true})).toBeVisible()
    })
  })
})
