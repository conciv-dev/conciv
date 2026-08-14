import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
import {parseConcivSettings} from '../src/data/settings.js'
import {createConcivRouter} from '../src/router.js'
import {CORE_BASE, installFakeCore, sessionRow, type FakeCore} from './helpers/fake-core.js'

const PANEL_SESSION = 'conciv_1'
const STAGED = ['the grabbed hero section', 'the grabbed price row', 'the grabbed footer', 'the grabbed nav']
let core: FakeCore | null = null

afterEach(() => {
  core?.restore()
  core = null
})

function openPanel(): void {
  core = installFakeCore({
    sessions: [sessionRow({id: PANEL_SESSION})],
    draft: {
      sessionId: PANEL_SESSION,
      text: '',
      selectionStart: 0,
      selectionEnd: 0,
      grabs: STAGED,
      updatedAt: 1,
    },
  })
  const router = createConcivRouter({
    rpc: makeRpcClient(CORE_BASE),
    history: createMemoryHistory({initialEntries: [`/panel/${PANEL_SESSION}?open=true`]}),
    environment: {rootNode: document, document},
    settings: parseConcivSettings(''),
  })
  render(() => <RouterProvider router={router} />)
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

test('the composer stays reachable when the viewport clamps the panel below its minimum height', async () => {
  await page.viewport(1000, 400)
  openPanel()

  await expect.element(page.getByText('the grabbed hero section')).toBeVisible()

  await input().click()
  await input().fill('still typeable at the smallest panel')
  await page.getByRole('button', {name: 'Send message'}).click()

  await expect.element(page.getByText('still typeable at the smallest panel')).toBeVisible()
})

test('the staged grabs come back into the flow once the panel has room again', async () => {
  await page.viewport(1000, 400)
  openPanel()

  await expect.element(input()).toBeVisible()

  await page.viewport(1000, 900)

  await expect.element(page.getByText('the grabbed hero section')).toBeVisible()
  await expect.element(page.getByText('the grabbed nav')).toBeVisible()
  await page.getByRole('button', {name: 'Remove grabbed element'}).last().click()
  await expect.element(page.getByText('the grabbed nav')).not.toBeInTheDocument()
  await input().click()
  await input().fill('room to breathe')
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect.element(page.getByText('room to breathe')).toBeVisible()
})
