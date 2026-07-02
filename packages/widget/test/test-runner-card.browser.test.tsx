import {describe, it, expect, afterEach} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import {collectToolRenderers, type AnyExtension} from '@conciv/extension'
import {defineClient} from '@conciv/api-client'
import testRunnerClient from '@conciv/extension-test-runner/client'
import {ChatPanel} from '../src/chat/chat-panel.js'
import {buildInstances} from './helpers/instances.js'

const extensions: AnyExtension[] = [testRunnerClient]
const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

describe('test-runner result in the chat transcript (real browser)', () => {
  it('renders the TestCard with pass/fail inside the assistant turn', async () => {
    const client = defineClient({apiBase: ''})
    const {sessionId} = await client.resolve()
    client.setSessionId(sessionId)

    const host = document.createElement('div')
    document.body.appendChild(host)
    disposers.push(
      render(
        () => (
          <ChatPanel
            apiBase=""
            harnessId="claude"
            client={client}
            active={true}
            tools={() => collectToolRenderers(extensions)}
            instances={buildInstances(extensions, '')}
          />
        ),
        host,
      ),
    )

    await expect.element(page.getByText('Ran the tests.')).toBeVisible()
    await page.getByRole('button', {name: 'Chain of Thought'}).click()

    await expect.element(page.getByText('this fails on purpose').first()).toBeVisible()
    await expect.element(page.getByText('1 passed')).toBeVisible()
    await expect.element(page.getByText('1 failed')).toBeVisible()
  })
})
