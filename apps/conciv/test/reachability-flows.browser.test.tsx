import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient} from '@conciv/contract'
import {parseConcivSettings} from '../src/data/settings.js'
import {createConcivRouter, disposeConcivRouter} from '../src/router.js'
import {CORE_BASE, installFakeCore, sessionRow, type FakeCore} from './helpers/fake-core.js'

const PANEL_SESSION = 'conciv_1'
let core: FakeCore | null = null
let mountedRouter: ReturnType<typeof createConcivRouter> | null = null

afterEach(() => {
  if (mountedRouter) disposeConcivRouter(mountedRouter)
  mountedRouter = null
  core?.restore()
  core = null
})

function mountShell(entry: string, config: Parameters<typeof installFakeCore>[0] = {}): void {
  core = installFakeCore({sessions: [sessionRow({id: PANEL_SESSION})], ...config})
  const router = createConcivRouter({
    rpc: makeBrowserRpcClient(CORE_BASE, {transport: 'fetch'}).rpc,
    history: createMemoryHistory({initialEntries: [entry]}),
    environment: {rootNode: document, document},
    settings: parseConcivSettings(''),
    apiBase: () => CORE_BASE,
  })
  mountedRouter = router
  render(() => <RouterProvider router={router} />)
}

const errorScreen = () => page.getByText(/couldn.t reach the engine/)
const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const genericBoundary = () => page.getByText('Something went wrong!')
const engineUnreachableNotice = () => page.getByText('conciv lost connection to the engine.')

test('a dead engine at boot shows our error screen, not the generic boundary, and Retry recovers it', async () => {
  mountShell('/panel/latest?open=true', {networkFail: true})

  await expect.element(errorScreen(), {timeout: 8000}).toBeVisible()
  await expect.element(genericBoundary()).not.toBeInTheDocument()

  core?.setNetworkFail(false)
  await page
    .getByRole('alert')
    .filter({hasText: /couldn.t reach the engine/})
    .getByRole('button', {name: 'Retry'})
    .click()

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
})

test('a healthy engine resolves /panel/latest straight to the warm session', async () => {
  mountShell('/panel/latest?open=true')

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(errorScreen()).not.toBeInTheDocument()
})

test('a sustained outage raises exactly one standing notice, and it clears once the engine returns', async () => {
  mountShell(`/panel/${PANEL_SESSION}?open=true`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  core?.setNetworkFail(true)
  await expect.element(engineUnreachableNotice(), {timeout: 8000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

  core?.setNetworkFail(false)
  await expect.element(engineUnreachableNotice(), {timeout: 8000}).not.toBeInTheDocument()
})

test('a 500 from an otherwise healthy engine never raises the unreachable notice', async () => {
  mountShell(`/panel/${PANEL_SESSION}?open=true`, {rejectSend: true})
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  await editor().fill('rename the widget package')
  await userEvent.keyboard('{Enter}')

  await expect
    .element(page.getByRole('region', {name: /Notifications/}))
    .toHaveTextContent(/Internal Server Error|could not be sent/)
  await expect.element(engineUnreachableNotice()).not.toBeInTheDocument()
})

test('the composer disables sending with a distinct message once the engine is unreachable', async () => {
  mountShell(`/panel/${PANEL_SESSION}?open=true`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await editor().fill('rename the widget package')

  core?.setNetworkFail(true)

  await expect
    .element(page.getByRole('button', {name: 'conciv lost connection to the engine'}), {timeout: 8000})
    .toBeVisible()
  await expect.element(page.getByRole('button', {name: 'conciv lost connection to the engine'})).toBeDisabled()
})
