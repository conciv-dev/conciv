import {describe, it, expect, afterEach} from 'vitest'
import {onMount} from 'solid-js'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import {defineExtension} from '@conciv/extension'
import {defineClient} from '@conciv/api-client'
import {ChatPanel} from '../src/chat/chat-panel.js'
import {sampleExtension} from './fixtures/sample-extension.js'
import {buildInstances} from './helpers/instances.js'
import type {AnyExtension} from '@conciv/extension'

const viewExtension = defineExtension({
  name: 'sample-view',
  views: [{id: 'sample-view', label: 'Sample View', Component: SampleViewBody, actions: SampleViewActions}],
})

function SampleViewBody() {
  return <div>sample view body</div>
}

function SampleViewActions() {
  return <button type="button">probe-action</button>
}

const insertedTexts: string[] = []

const insertViewExtension = defineExtension({
  name: 'insert-view',
  views: [{id: 'insert-view', label: 'Insert View', Component: InsertViewBody}],
})

function InsertViewBody() {
  const ctx = insertViewExtension.useContext()
  onMount(() => ctx.view.onInsert((text) => insertedTexts.push(text)))
  const stage = () => {
    const node = document.createElement('div')
    ctx.grab.stage({
      text: 'grabbed-element-text',
      snapshot: {node, width: 60, height: 20},
      source: null,
      rect: null,
    })
  }
  return (
    <button type="button" onClick={stage}>
      stage grab
    </button>
  )
}

const disposers: (() => void)[] = []

function mountPanel(extensions: AnyExtension[]): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  disposers.push(
    render(
      () => (
        <ChatPanel
          apiBase=""
          harnessId="claude"
          client={defineClient({apiBase: ''})}
          active={false}
          instances={buildInstances(extensions, '')}
        />
      ),
      host,
    ),
  )
  return host
}

const indicators = () => document.querySelectorAll('[data-scope="tabs"][data-part="indicator"]')

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

describe('panel views (real browser)', () => {
  it('renders no tablist when no extension contributes a view', async () => {
    mountPanel([sampleExtension])
    await expect.element(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(document.querySelector('[role="tablist"]')).toBeNull()
  })

  it('renders a tablist with Chat plus the contributed view', async () => {
    mountPanel([viewExtension])
    await expect.element(page.getByRole('tab', {name: 'Chat'})).toBeVisible()
    await expect.element(page.getByRole('tab', {name: 'Sample View'})).toBeVisible()
  })

  it('switching to the view renders its Component and hides the composer', async () => {
    mountPanel([viewExtension])
    await page.getByRole('tab', {name: 'Sample View'}).click()
    await expect.element(page.getByText('sample view body')).toBeVisible()
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('renders view actions in the tab row only while the view is active', async () => {
    mountPanel([viewExtension])
    await expect.element(page.getByRole('tab', {name: 'Chat'})).toBeVisible()
    expect(document.body.textContent ?? '').not.toContain('probe-action')
    await page.getByRole('tab', {name: 'Sample View'}).click()
    await expect.element(page.getByRole('button', {name: 'probe-action'})).toBeVisible()
    await page.getByRole('tab', {name: 'Chat'}).click()
    await expect.element(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(document.body.textContent ?? '').not.toContain('probe-action')
  })

  it('staged grabs render as tray cards above the view and Insert routes to the view handler', async () => {
    insertedTexts.splice(0)
    mountPanel([insertViewExtension])
    await page.getByRole('tab', {name: 'Insert View'}).click()
    await page.getByRole('button', {name: 'stage grab'}).click()
    await expect.element(page.getByRole('button', {name: 'Insert'})).toBeVisible()
    await page.getByRole('button', {name: 'Insert'}).click()
    expect(insertedTexts).toEqual(['grabbed-element-text'])
    expect(document.querySelector('[data-pw-grab]')).toBeNull()
  })

  it('keeps exactly one sliding indicator across switches', async () => {
    mountPanel([viewExtension])
    await expect.element(page.getByRole('tab', {name: 'Chat'})).toBeVisible()
    expect(indicators()).toHaveLength(1)
    await page.getByRole('tab', {name: 'Sample View'}).click()
    await expect.element(page.getByText('sample view body')).toBeVisible()
    expect(indicators()).toHaveLength(1)
  })
})
