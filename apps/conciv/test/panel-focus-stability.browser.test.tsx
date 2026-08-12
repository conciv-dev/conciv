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
const SETTLED = {timeout: 1500}
const routerDisposers: (() => void)[] = []
let core: FakeCore | null = null

afterEach(() => {
  for (const dispose of routerDisposers.splice(0)) dispose()
  core?.restore()
  core = null
})

function openPanel(config: Parameters<typeof installFakeCore>[0] = {}): void {
  core = installFakeCore({sessions: [sessionRow({id: PANEL_SESSION})], ...config})
  const router = createConcivRouter({
    rpc: makeRpcClient(CORE_BASE),
    history: createMemoryHistory({initialEntries: [`/panel/${PANEL_SESSION}?open=true`]}),
    environment: {rootNode: document, document},
    settings: parseConcivSettings(''),
  })
  render(() => <RouterProvider router={router} />)
  routerDisposers.push(() => disposeConcivRouter(router))
}

const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

test('a composer that mounts after a slow draft load keeps the focus the panel gave it', async () => {
  openPanel({delays: {'/rpc/drafts/get': 250}})

  await expect.element(editor(), SETTLED).toBeVisible()
  const mountedNode = editor().element()
  await core?.idle()
  await expect.element(editor(), SETTLED).toHaveFocus()
  expect(editor().element().isSameNode(mountedNode)).toBe(true)
})

test('a composer that mounts while the harness metadata is still loading takes the focus the panel gave it', async () => {
  openPanel({delays: {'/rpc/meta/models': 400}})

  await expect.element(editor(), SETTLED).toBeVisible()
  const mountedNode = editor().element()
  await core?.idle()
  await expect.element(editor(), SETTLED).toHaveFocus()
  expect(editor().element().isSameNode(mountedNode)).toBe(true)
})

test('a composer that mounts while the transcript is still loading takes the focus the panel gave it', async () => {
  openPanel({delays: {'/rpc/markers/list': 400}})

  await expect.element(editor(), SETTLED).toBeVisible()
  const mountedNode = editor().element()
  await core?.idle()
  await expect.element(editor(), SETTLED).toHaveFocus()
  expect(editor().element().isSameNode(mountedNode)).toBe(true)
})
