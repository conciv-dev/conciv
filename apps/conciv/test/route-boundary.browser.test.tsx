import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
import {parseConcivSettings} from '../src/data/settings.js'
import {createConcivRouter, disposeConcivRouter} from '../src/router.js'
import {CORE_BASE, installFakeCore, sessionRow, type FakeCore} from './helpers/fake-core.js'

const PANEL_SESSION = 'conciv_1'
const HELD_ROUTE_MS = 1500
const WHILE_HELD = {timeout: 700}
const disposers: (() => void)[] = []
let core: FakeCore | null = null

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  core?.restore()
  core = null
})

const PANEL_ENTRY = `/panel/${PANEL_SESSION}?open=true`
const CLOSED_ENTRY = '/'

function mountShell(entry: string, config: Parameters<typeof installFakeCore>[0] = {}): void {
  core = installFakeCore({sessions: [sessionRow({id: PANEL_SESSION})], ...config})
  const router = createConcivRouter({
    rpc: makeRpcClient(CORE_BASE),
    history: createMemoryHistory({initialEntries: [entry]}),
    environment: {rootNode: document, document},
    settings: parseConcivSettings(''),
  })
  const mounted = render(() => <RouterProvider router={router} />)
  disposers.push(() => {
    mounted.unmount()
    disposeConcivRouter(router)
  })
}

const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const launcher = () => page.getByRole('button', {name: 'Open conciv chat'})
const routePending = () => page.getByRole('progressbar', {name: 'Loading conciv'})

test('the pane paints its composer while the element captures query is still in flight', async () => {
  mountShell(PANEL_ENTRY, {delays: {'/rpc/captures/list': HELD_ROUTE_MS}})

  await expect.element(editor(), WHILE_HELD).toBeVisible()
  await expect.element(routePending(), WHILE_HELD).not.toBeInTheDocument()
})

test('the shell keeps its launcher while the session list query is still in flight', async () => {
  mountShell(CLOSED_ENTRY, {delays: {'/rpc/sessions/list': HELD_ROUTE_MS}})

  await expect.element(launcher(), WHILE_HELD).toBeVisible()
  await expect.element(routePending(), WHILE_HELD).not.toBeInTheDocument()
})

test('a pane whose queries all answer immediately never shows the route pending loader', async () => {
  mountShell(PANEL_ENTRY)

  await expect.element(editor(), WHILE_HELD).toBeVisible()
  await core?.idle()
  await expect.element(routePending(), WHILE_HELD).not.toBeInTheDocument()
})

test('a slow beforeLoad reveals the route pending loader, then hands off to the pane', async () => {
  mountShell('/panel/latest?open=true', {delays: {'/rpc/sessions/resolve': 900}})

  await expect.element(routePending()).toBeVisible()
  await expect.element(editor(), {timeout: 2000}).toBeVisible()
  await expect.element(routePending()).not.toBeInTheDocument()
})
