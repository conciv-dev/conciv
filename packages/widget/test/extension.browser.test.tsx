import {describe, it, expect, afterEach} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import {ChatPanel} from '../src/chat/chat-panel.js'
import {defineClient} from '@conciv/api-client'
import {sampleExtension} from './fixtures/sample-extension.js'
import {buildInstances} from './helpers/instances.js'

const disposers: (() => void)[] = []

function mountPanel(): HTMLElement {
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
          instances={buildInstances([sampleExtension], '')}
        />
      ),
      host,
    ),
  )
  return host
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

describe('extension rendering (real browser)', () => {
  it('renders the Component into the header, status and composer slots', async () => {
    mountPanel()
    await expect.element(page.getByText('sample header for claude')).toBeVisible()
    await expect.element(page.getByText('sample status ready')).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Sample Draw'})).toBeVisible()
  })

  it('useContext(select) gives the composer button a working insert into THIS panel', async () => {
    mountPanel()
    await page.getByRole('button', {name: 'Sample Draw'}).click()
    await expect.element(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveValue('drew a square')
  })

  it('keeps insert isolated between two concurrent panels', async () => {
    mountPanel()
    mountPanel()

    const textboxes = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await page.getByRole('button', {name: 'Sample Draw'}).nth(1).click()
    await expect.element(textboxes.nth(1)).toHaveValue('drew a square')
    await expect.element(textboxes.nth(0)).toHaveValue('')
  })
})
