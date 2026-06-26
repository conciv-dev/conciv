import {describe, it, expect, afterEach} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import {collectToolRenderers, type AnyExtension} from '@mandarax/extension'
import {defineClient} from '@mandarax/api-client'
import testRunnerClient from '@mandarax/extension-test-runner/client'
import {ChatPanel} from '../src/chat/chat-panel.js'

// End-to-end in a real browser: the real ChatPanel hydrates a settled turn (served same-origin by
// the chat-history-fixture vite middleware) whose chain carries a test_runner tool-call + result.
// The widget's tool-card pipeline (ToolCallCard → renderer-by-name) renders the extension's TestCard
// in the transcript. Proves "the user sees test results as a card in chat". Real Solid, no jsdom.

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
            extensions={extensions}
          />
        ),
        host,
      ),
    )

    // The hydrated turn renders text outside the chain; the tool card sits in the settled (collapsed)
    // chain, so expand it before asserting the card.
    await expect.element(page.getByText('Ran the tests.')).toBeVisible()
    await page.getByRole('button', {name: 'Thought process'}).click()

    await expect.element(page.getByText('this fails on purpose').first()).toBeVisible()
    await expect.element(page.getByText('1 passed')).toBeVisible()
    await expect.element(page.getByText('1 failed')).toBeVisible()
  })
})
