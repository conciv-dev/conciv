import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {mountToolCard} from '@conciv/extension-testkit/card-harness'
import type {ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {BuildErrorsCard} from '../src/tool/build-errors-card.js'
import {RouteManifestCard} from '../src/tool/route-manifest-card.js'
import {ServerFnTraceCard} from '../src/tool/server-fn-trace-card.js'
import {buildErrorsDef, routeManifestDef, serverFnTraceDef} from '../src/tool/def.js'

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
    await expect.element(page.getByText("Expected ';' but found '=' · /app/src/routes/about.tsx:12")).toBeVisible()
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
    await expect.element(page.getByText('bundler bridge unavailable')).toBeVisible()
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
    await expect.element(page.getByText('routeTree.gen not found')).toBeVisible()
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
    await expect.element(page.getByText('bundler bridge unavailable')).toBeVisible()
  })
})
