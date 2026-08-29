import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import type {ToolCallPart} from '@tanstack/ai-client'
import {CardShell} from '../src/tools/styled/card-shell.js'
import {InlineShell} from '../src/tools/styled/inline-row.js'
import {CardChromeProvider} from '../src/tools/styled/card-chrome.js'

const EMPTY_PART: ToolCallPart = {
  type: 'tool-call',
  id: 't1',
  name: 'tanstack_query_cache',
  arguments: '{}',
  state: 'complete',
}

const KEYED_PART: ToolCallPart = {
  type: 'tool-call',
  id: 't2',
  name: 'tanstack_query_invalidate',
  arguments: JSON.stringify({key: 'posts'}),
  state: 'complete',
}

describe('CardShell embedded in a trace row', () => {
  it('drops the header and the empty-input placeholder, leaving only the body', async () => {
    render(() => (
      <CardChromeProvider value="embedded">
        <CardShell meta={undefined} title="Read the query cache" part={EMPTY_PART} result={undefined}>
          <p>2 cached queries</p>
        </CardShell>
      </CardChromeProvider>
    ))
    await expect.element(page.getByText('2 cached queries')).toBeVisible()
    expect(page.getByText('Read the query cache').query()).toBeNull()
    expect(page.getByText('no input').query()).toBeNull()
  })

  it('drops the input chip row too, because the trace row already names the target', async () => {
    render(() => (
      <CardChromeProvider value="embedded">
        <CardShell meta={undefined} title="Invalidate a query" part={KEYED_PART} result={undefined}>
          <p>invalidated</p>
        </CardShell>
      </CardChromeProvider>
    ))
    await expect.element(page.getByText('invalidated')).toBeVisible()
    expect(page.getByText('posts').query()).toBeNull()
  })

  it('keeps the subtitle as a body line instead of dropping it with the header', async () => {
    render(() => (
      <CardChromeProvider value="embedded">
        <CardShell
          meta={undefined}
          title="Read the router state"
          subtitle="/about · 2 matches"
          part={EMPTY_PART}
          result={undefined}
        >
          <p>router body</p>
        </CardShell>
      </CardChromeProvider>
    ))
    await expect.element(page.getByText('/about · 2 matches')).toBeVisible()
    expect(page.getByText('Read the router state').query()).toBeNull()
  })

  it('still renders the header, chips and the empty-input placeholder as a standalone card', async () => {
    render(() => (
      <CardShell meta={undefined} title="Read the query cache" part={EMPTY_PART} result={undefined} defaultOpen>
        <p>2 cached queries</p>
      </CardShell>
    ))
    await expect.element(page.getByText('Read the query cache')).toBeVisible()
    await expect.element(page.getByText('no input')).toBeVisible()
  })
})

describe('InlineShell embedded in a trace row', () => {
  it('drops the tool name and status glyph, leaving only the inline detail', async () => {
    render(() => (
      <CardChromeProvider value="embedded">
        <InlineShell name="element_reference" status="complete">
          <span>MissingWidget is not on the page</span>
        </InlineShell>
      </CardChromeProvider>
    ))
    await expect.element(page.getByText('MissingWidget is not on the page')).toBeVisible()
    expect(page.getByText('element_reference').query()).toBeNull()
  })

  it('keeps the name and glyph as a standalone inline row', async () => {
    render(() => (
      <InlineShell name="anchor_resolve" status="complete">
        <span>c1 · fresh</span>
      </InlineShell>
    ))
    await expect.element(page.getByText('anchor_resolve')).toBeVisible()
  })
})
