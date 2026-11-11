import 'virtual:uno.css'
import {expect, it, describe, onTestFinished} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {ChatMessage, ToolResultPart, ToolCallPart} from '@conciv/protocol/chat-message-types'
import type {
  ToolViewMeta,
  ToolViewCtx,
  ToolCardEntry,
  ToolCatalogView,
  ToolUIComponent,
  ToolCardProps,
} from '@conciv/protocol/tool-view-types'
import {MetaToolCard} from '../src/tools/styled/meta-tool-card.js'
import {ToolFallback} from '../src/tools/styled/tool-fallback.js'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '../src/store/tool-context.js'
import {HARNESS_MODELS, cardPart, cardResult, catalogOf, ctxWith, mountView} from './helpers.js'
import {render} from '@solidjs/testing-library'
import {CardShell} from '../src/tools/styled/card-shell.js'
import {CollapsibleCard} from '../src/tools/styled/collapsible-card.js'
import {CollapsibleSection} from '../src/tools/styled/collapsible-section.js'
import {InlineShell} from '../src/tools/styled/inline-row.js'
import {CardChromeProvider} from '../src/tools/styled/card-chrome.js'
import type {ChatSessionMeta, PermissionScope} from '@conciv/protocol/chat-types'
import {PermissionCard} from '../src/tools/styled/permission-card.js'
import {ToolCallCard, ToolTraceRow} from '../src/tools/styled/tool-call-card.js'
import {createSignal, onMount, type JSX} from 'solid-js'
import {ToolCard} from '../src/tools/styled/tool-card.js'
import {TraceOutputBlock} from '../src/styled/trace/output-block.js'
import {createChat} from '@conciv/ai/client'
import {storyConnection} from '@conciv/ai/testkit'
import * as main from '../src/index.js'
import * as tools from '../src/tools.js'
import type {CompleteAttachment} from '../src/primitives/attachment/attachment-adapter.js'

describe('card body nonempty', () => {
  const NO_SCHEMA_META: ToolViewMeta = {
    summary: 'run a bare tool with no declared inputs',
    mutating: false,
  }

  const FILL_META: ToolViewMeta = {
    summary: 'type a value into a form field',
    mutating: true,
    inputSchema: {
      type: 'object',
      properties: {selector: {type: 'string'}, value: {type: 'string'}},
      required: ['selector', 'value'],
    },
  }

  function errorResult(message: string): ToolResultPart {
    return cardResult(JSON.stringify({error: message}), 'error')
  }

  async function expandFirst(): Promise<void> {
    await page.getByRole('button').first().click()
  }

  it('MetaToolCard shows a quiet no-input row instead of an empty strip for a zero-input tool', async () => {
    mountView(() => (
      <MetaToolCard
        part={cardPart('page_noop', {})}
        result={undefined}
        ctx={ctxWith(catalogOf({page_noop: NO_SCHEMA_META}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expandFirst()
    await expect.element(page.getByText('no input')).toBeVisible()
  })

  it('MetaToolCard shows an input key the schema never declared', async () => {
    mountView(() => (
      <MetaToolCard
        part={cardPart('page_fill', {selector: '#name', value: 'Ada', timeoutMs: 250})}
        result={undefined}
        ctx={ctxWith(catalogOf({page_fill: FILL_META}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expandFirst()
    await expect.element(page.getByText('timeoutMs')).toBeVisible()
    await expect.element(page.getByText('250')).toBeVisible()
  })

  it('MetaToolCard shows the input of a declared tool that has no input schema', async () => {
    mountView(() => (
      <MetaToolCard
        part={cardPart('page_noop', {reason: 'warming the cache'})}
        result={undefined}
        ctx={ctxWith(catalogOf({page_noop: NO_SCHEMA_META}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expandFirst()
    await expect.element(page.getByText('warming the cache')).toBeVisible()
    await expect.element(page.getByText('no input')).not.toBeInTheDocument()
  })

  it('MetaToolCard shows the error block alongside its input chips for an error-only result', async () => {
    mountView(() => (
      <MetaToolCard
        part={cardPart('page_fill', {selector: '#name', value: 'Ada'})}
        result={errorResult('element not found')}
        ctx={ctxWith(catalogOf({page_fill: FILL_META}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expandFirst()
    await expect.element(page.getByText('Ada')).toBeVisible()
    await expect.element(page.getByText('element not found')).toBeVisible()
  })

  it('ToolFallback shows a quiet no-input row for a zero-argument call', async () => {
    mountView(() => (
      <ToolFallback
        part={{type: 'tool-call', id: 'z1', name: 'ping', arguments: '', state: 'complete'}}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expect.element(page.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button').click()
    await expect.element(page.getByText('no input')).toBeVisible()
  })
})

describe('collapsible card shape', () => {
  it('expands to reveal the body content on click', async () => {
    mountView(() => (
      <CollapsibleCard header={<span>Ran a command</span>}>
        <span>streamed output</span>
      </CollapsibleCard>
    ))

    const trigger = page.getByRole('button')
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect.element(page.getByText('streamed output')).not.toBeInTheDocument()

    await trigger.click()

    await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect.element(page.getByText('streamed output')).toBeVisible()
  })

  it('keeps the title tooltip on the trigger row', async () => {
    mountView(() => (
      <CollapsibleCard header={<span>Rendered choices</span>} tooltip="lets the user pick a value">
        <span>details</span>
      </CollapsibleCard>
    ))

    await expect.element(page.getByText('Rendered choices')).toBeVisible()
    await userEvent.hover(page.getByText('Rendered choices'))
    await expect.element(page.getByRole('tooltip')).toHaveTextContent('lets the user pick a value')
  })
})

describe('collapsible section', () => {
  it('toggles open and closed on trigger click', async () => {
    mountView(() => (
      <CollapsibleSection header={<span>nested-section</span>}>
        <span>nested detail content</span>
      </CollapsibleSection>
    ))

    const trigger = page.getByRole('button', {name: 'nested-section'})
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect.element(page.getByText('nested detail content')).toBeVisible()

    await userEvent.click(trigger)
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect.element(page.getByText('nested detail content')).not.toBeVisible()
  })
})

describe('embedded card chrome', () => {
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
})

describe('meta tool card error', () => {
  const fillMeta: ToolViewMeta = {
    summary: 'type a value into a form field',
    category: 'act',
    icon: 'keyboard',
    label: {running: 'Filling the field', done: 'Filled the field'},
    positional: 'selector',
    mutating: true,
    inputSchema: {
      type: 'object',
      properties: {selector: {type: 'string'}, value: {type: 'string'}},
      required: ['selector', 'value'],
    },
    outputSchema: {type: 'object', properties: {ok: {type: 'boolean'}}},
    errors: [{code: 'NO_MATCH', message: 'nothing on the page matches that selector'}],
  }

  const shipMeta: ToolViewMeta = {
    summary: 'ship the page the user is looking at',
    category: 'act',
    icon: 'pointer',
    label: {running: 'Shipping the page', done: 'Shipped the page'},
    positional: 'selector',
    mutating: false,
    inputSchema: {type: 'object', properties: {selector: {type: 'string'}}, required: ['selector']},
    outputSchema: {type: 'string'},
  }

  function errorResult(content: string): ToolResultPart {
    return cardResult(content, 'error')
  }

  function successResult(content: string): ToolResultPart {
    return cardResult(content, 'complete')
  }

  it('a structured payload whose code matches a declared error renders the declared message', async () => {
    mountView(() => (
      <MetaToolCard
        part={cardPart('page_fill', {selector: '#ghost', value: 'nobody'})}
        result={errorResult('{"error":{"message":"page_fill failed","code":"NO_MATCH"}}')}
        ctx={ctxWith(catalogOf({page_fill: fillMeta}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await userEvent.click(page.getByRole('button'))
    await expect.element(page.getByText('nothing on the page matches that selector')).toBeVisible()
    expect(document.body.textContent).not.toContain('page_fill failed')
  })

  it('a structured payload with an unknown code falls through to the payload message', async () => {
    mountView(() => (
      <MetaToolCard
        part={cardPart('page_fill', {selector: '#ghost', value: 'nobody'})}
        result={errorResult('{"error":{"message":"the sandbox blew up","code":"SOMETHING_ELSE"}}')}
        ctx={ctxWith(catalogOf({page_fill: fillMeta}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await userEvent.click(page.getByRole('button'))
    await expect.element(page.getByText('the sandbox blew up', {exact: true})).toBeVisible()
    expect(document.body.textContent).not.toContain('nothing on the page matches that selector')
  })

  it('a non-JSON result body that merely looks like a declared-error prefix falls through to the raw text', async () => {
    mountView(() => (
      <MetaToolCard
        part={cardPart('page_fill', {selector: '#ghost', value: 'nobody'})}
        result={errorResult('NO_MATCH: the field vanished')}
        ctx={ctxWith(catalogOf({page_fill: fillMeta}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await userEvent.click(page.getByRole('button'))
    await expect.element(page.getByText('NO_MATCH: the field vanished', {exact: true})).toBeVisible()
    expect(document.body.textContent).not.toContain('nothing on the page matches that selector')
  })

  it('a code-mode string error envelope decodes the declared code and shows the catalog message', async () => {
    mountView(() => (
      <MetaToolCard
        part={cardPart('page_fill', {selector: '#ghost', value: 'nobody'})}
        result={errorResult('{"error":"NO_MATCH: the field vanished"}')}
        ctx={ctxWith(catalogOf({page_fill: fillMeta}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await userEvent.click(page.getByRole('button'))
    await expect.element(page.getByText('nothing on the page matches that selector')).toBeVisible()
    expect(document.body.textContent).not.toContain('{"error"')
    expect(document.body.textContent).not.toContain('NO_MATCH: the field vanished')
  })

  it("a JSON.stringify'd string result renders the plain string, not raw quotes", async () => {
    mountView(() => (
      <MetaToolCard
        part={cardPart('page_ship', {selector: '#hero'})}
        result={successResult(JSON.stringify('shipped-42'))}
        ctx={ctxWith(catalogOf({page_ship: shipMeta}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await userEvent.click(page.getByRole('button'))
    await expect.element(page.getByText('shipped-42', {exact: true})).toBeVisible()
    expect(document.body.textContent).not.toContain('"shipped-42"')
  })

  for (const [outcome, label] of [
    ['denied', 'Denied'],
    ['cancelled', 'Cancelled'],
  ] as const) {
    it(`a catalog-backed tool that was ${outcome} reads as ${outcome} in its trace row body, not as an error`, async () => {
      mountView(() => (
        <ToolTraceRow
          part={cardPart('page_fill', {selector: '#email', value: 'ada@example.com'})}
          result={{
            type: 'tool-result',
            toolCallId: 'e1',
            content: '',
            state: 'error',
            outcome,
            error: `The tool call was ${outcome}.`,
          }}
          ctx={ctxWith(catalogOf({page_fill: fillMeta}))}
          tools={() => []}
        />
      ))

      await expect.element(page.getByText(`The tool call was ${outcome}.`)).toBeVisible()
      await page.screenshot({path: `__screenshots__/tool-outcomes/catalog-${outcome}.png`})
      await expect.element(page.getByText(label, {exact: true})).toBeVisible()
      await expect.element(page.getByText('Error', {exact: true})).not.toBeInTheDocument()
    })
  }
})

describe('meta tool card object result', () => {
  const JSON_TREE_ROOT = '[data-scope="json-tree-view"][data-part="root"]'

  const measureMeta: ToolViewMeta = {
    summary: 'measure an element on the page',
    category: 'read',
    icon: 'pointer',
    label: {running: 'Measuring the element', done: 'Measured the element'},
    positional: 'selector',
    mutating: false,
    inputSchema: {type: 'object', properties: {selector: {type: 'string'}}, required: ['selector']},
    outputSchema: {type: 'object', properties: {width: {type: 'number'}, height: {type: 'number'}}},
  }

  it('an object-shaped result opens as a json tree instead of a raw text block', async () => {
    const container = mountView(() => (
      <MetaToolCard
        part={cardPart('page_measure', {selector: '#hero'})}
        result={cardResult('{"width":320,"height":48}', 'complete')}
        ctx={ctxWith(catalogOf({page_measure: measureMeta}))}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await userEvent.click(page.getByRole('button'))

    await expect.element(page.getByText('width', {exact: true})).toBeVisible()
    expect(container.querySelectorAll(JSON_TREE_ROOT).length).toBe(1)
    expect(container.textContent).not.toContain('{"width":320,"height":48}')
  })
})

describe('permission card session', () => {
  type Decision = {id: string; approved: boolean; scope: PermissionScope | undefined}

  function askingPart(input: Record<string, unknown>): ToolCallPart {
    return {
      type: 'tool-call',
      id: 'p1',
      name: 'Bash',
      arguments: JSON.stringify(input),
      state: 'approval-requested',
      approval: {id: 'appr-1', needsApproval: true},
    }
  }

  function ctxRecording(decisions: Decision[]): ToolViewCtx {
    return {
      ...INERT_TOOL_CTX,
      respondApproval: (id, approved, scope) => decisions.push({id, approved, scope}),
    }
  }

  it('reports a one-shot allow for the plain Allow action', async () => {
    const decisions: Decision[] = []
    mountView(() => <PermissionCard part={askingPart({command: 'pnpm run build'})} ctx={ctxRecording(decisions)} />)

    await page.getByRole('button', {name: 'Allow', exact: true}).click()

    expect(decisions).toEqual([{id: 'appr-1', approved: true, scope: 'once'}])
  })
})

describe('tool call card dispatch', () => {
  const shipMeta: ToolViewMeta = {
    summary: 'ship the page the user is looking at',
    label: {running: 'Shipping the page', done: 'Shipped the page'},
    category: 'act',
    icon: 'pointer',
    mutating: false,
    inputSchema: {type: 'object', properties: {note: {type: 'string'}}},
  }

  function ctxAsking(catalog: ToolCatalogView): ToolViewCtx {
    return {...ctxWith(catalog), respondApproval: () => {}}
  }

  function part(name: string, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
    const input = {note: 'after review'}
    return {type: 'tool-call', id: 'c1', name, arguments: JSON.stringify(input), input, state}
  }

  function cardSaying(text: string): ToolUIComponent {
    return () => <p>{text}</p>
  }

  const extensionEntry: ToolCardEntry = {
    names: ['page_ship'],
    render: cardSaying('the extension card'),
    hasEmbeddedBody: () => true,
  }
  const builtinEntry: ToolCardEntry = {
    names: ['page_ship'],
    render: cardSaying('the builtin card'),
    hasEmbeddedBody: () => true,
  }

  it('an extension-supplied card wins over the builtin card for the same tool', async () => {
    mountView(() => (
      <ToolCallCard
        part={part('page_ship')}
        result={undefined}
        ctx={ctxAsking(catalogOf({page_ship: shipMeta}))}
        tools={() => [extensionEntry, builtinEntry]}
      />
    ))

    await expect.element(page.getByText('the extension card')).toBeVisible()
    expect(document.body.textContent).not.toContain('the builtin card')
  })

  it('a builtin card wins over the meta-driven default card', async () => {
    mountView(() => (
      <ToolCallCard
        part={part('page_ship')}
        result={undefined}
        ctx={ctxAsking(catalogOf({page_ship: shipMeta}))}
        tools={() => [builtinEntry]}
      />
    ))

    await expect.element(page.getByText('the builtin card')).toBeVisible()
    expect(document.body.textContent).not.toContain('Shipped the page')
  })

  it('the meta-driven default card wins over the raw fallback whenever the tool declares meta', async () => {
    mountView(() => (
      <ToolCallCard
        part={part('page_ship')}
        result={undefined}
        ctx={ctxAsking(catalogOf({page_ship: shipMeta}))}
        tools={() => []}
      />
    ))

    await expect.element(page.getByText('Shipped the page')).toBeVisible()
    expect(document.body.textContent).not.toContain('Used tool:')
  })

  it('a tool the catalog knows nothing about still reaches the raw fallback', async () => {
    mountView(() => (
      <ToolCallCard
        part={part('mcp__weather__forecast')}
        result={undefined}
        ctx={ctxAsking(catalogOf({}))}
        tools={() => []}
      />
    ))

    await expect.element(page.getByText('mcp__weather__forecast')).toBeVisible()
    expect(document.body.textContent).toContain('Used tool:')
  })

  it('a tool that only reaches the meta-driven default still renders its inline approval prompt', async () => {
    const approval: ToolCallPart = {
      ...part('page_ship', 'approval-requested'),
      approval: {id: 'ap1', needsApproval: true},
    }
    mountView(() => (
      <ToolCallCard
        part={approval}
        result={undefined}
        ctx={ctxAsking(catalogOf({page_ship: shipMeta}))}
        tools={() => []}
      />
    ))

    await expect.element(page.getByText('Run this action?')).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Allow'})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Deny'})).toBeVisible()
  })
})

describe('tool card auto collapse', () => {
  function part(state: ToolCallPart['state']): ToolCallPart {
    return {type: 'tool-call', id: 't1', name: 'demo', arguments: '{}', input: {}, state}
  }

  const Icon = () => <span>i</span>

  it('auto-opens while streaming and collapses when the stream settles', async () => {
    const [streaming, setStreaming] = createSignal(true)
    mountView(() => (
      <ToolCard
        Icon={Icon}
        title="Edited the page"
        part={part('input-complete')}
        result={undefined}
        autoOpen={streaming()}
      >
        <span>step rail</span>
      </ToolCard>
    ))

    await expect.element(page.getByText('step rail')).toBeVisible()
    setStreaming(false)
    await expect.element(page.getByText('step rail')).not.toBeVisible()
  })

  it('keeps the card open after settle when the user opened it', async () => {
    const [streaming, setStreaming] = createSignal(false)
    mountView(() => (
      <ToolCard Icon={Icon} title="Edited the page" part={part('complete')} result={undefined} autoOpen={streaming()}>
        <span>step rail</span>
      </ToolCard>
    ))

    await expect.element(page.getByRole('button', {name: /Edited the page/})).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', {name: /Edited the page/}).click()
    await expect.element(page.getByText('step rail')).toBeVisible()
    setStreaming(true)
    setStreaming(false)
    await expect.element(page.getByText('step rail')).toBeVisible()
  })

  it('keeps the card closed while streaming when the user collapsed it', async () => {
    const [streaming, setStreaming] = createSignal(true)
    mountView(() => (
      <ToolCard
        Icon={Icon}
        title="Edited the page"
        part={part('input-complete')}
        result={undefined}
        autoOpen={streaming()}
      >
        <span>step rail</span>
      </ToolCard>
    ))

    await expect.element(page.getByText('step rail')).toBeVisible()
    await page.getByRole('button', {name: /Edited the page/}).click()
    await expect.element(page.getByText('step rail')).not.toBeVisible()
    setStreaming(false)
    await expect.element(page.getByText('step rail')).not.toBeVisible()
  })

  it('opens for a pending approval and collapses once it resolves', async () => {
    const [state, setState] = createSignal<ToolCallPart['state']>('approval-requested')
    mountView(() => (
      <ToolCard Icon={Icon} title="Run a command" part={part(state())} result={undefined}>
        <span>approval detail</span>
      </ToolCard>
    ))

    await expect.element(page.getByText('approval detail')).toBeVisible()
    setState('complete')
    await expect.element(page.getByText('approval detail')).not.toBeVisible()
  })
})

describe('tool card title reveal', () => {
  const LONG_TITLE = 'Filled the field #email on the long profile form that keeps going well past the card'
  const SUMMARY = 'type a value into a form field'

  function part(): ToolCallPart {
    return {type: 'tool-call', id: 't1', name: 'demo', arguments: '{}', input: {}, state: 'complete'}
  }

  function titleIn(host: Element, text: string): HTMLElement {
    for (const node of host.querySelectorAll('[data-scope="tooltip"][data-part="trigger"], span')) {
      if (node instanceof HTMLElement && node.textContent === text) return node
    }
    throw new Error(`no headline reads "${text}"`)
  }

  it('lets the card summary own the hover when the card carries one', async () => {
    const host = mountView(() => (
      <div class="w-70">
        <ToolCard title={LONG_TITLE} titleTooltip={SUMMARY} part={part()} result={undefined}>
          <span>step rail</span>
        </ToolCard>
      </div>
    ))

    await page.elementLocator(titleIn(host, LONG_TITLE)).hover()

    await expect.element(page.getByRole('tooltip')).toHaveTextContent(SUMMARY)
  })

  it('reveals a clipped card title when no summary claims the hover', async () => {
    mountView(() => (
      <ul class="m-0 p-0 list-none">
        <li class="w-70" aria-label="clipped card title">
          <ToolCard title={LONG_TITLE} part={part()} result={undefined}>
            <span>step rail</span>
          </ToolCard>
        </li>
      </ul>
    ))

    await page.getByRole('listitem', {name: 'clipped card title'}).hover()

    await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG_TITLE)
  })
})

describe('tool fallback json', () => {
  const ctx = {...INERT_TOOL_CTX, respondApproval: () => {}}

  function part(args: Record<string, unknown>): ToolCallPart {
    return {
      type: 'tool-call',
      id: 'f1',
      name: 'mcp__weather__forecast',
      arguments: JSON.stringify(args),
      state: 'complete',
    }
  }

  async function openBody(): Promise<void> {
    await userEvent.click(page.getByRole('button'))
  }

  it('renders an object payload as an expandable JSON tree, not a shiki code block', async () => {
    const container = mountView(() => (
      <ToolFallback part={part({city: 'Berlin'})} result={undefined} ctx={ctx} addResult={INERT_ADD_RESULT} />
    ))

    await openBody()

    await expect.element(page.getByText('city', {exact: true})).toBeVisible()
    expect(container.querySelectorAll('[data-scope="json-tree-view"][data-part="root"]').length).toBe(1)
    expect(container.querySelectorAll('diffs-container').length).toBe(0)
  })
})

describe('tool trace row', () => {
  function ctxRecording(decisions: Array<{id: string; approved: boolean}>): ToolViewCtx {
    return {...ctxWith(catalogOf({})), respondApproval: (id, approved) => decisions.push({id, approved})}
  }

  const noCtx = ctxRecording([])

  function call(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
    return {type: 'tool-call', id: 'c1', name, arguments: JSON.stringify(input), input, state}
  }

  it('falls back to a generic projection for a tool that supplies no row', async () => {
    mountView(() => (
      <ToolTraceRow
        part={call('mcp__weather__forecast', {location: 'Tel Aviv'})}
        result={undefined}
        ctx={noCtx}
        tools={() => []}
      />
    ))

    await expect.element(page.getByRole('img', {name: 'succeeded'})).toBeVisible()
    await expect.element(page.getByText('forecast')).toBeVisible()
    await expect.element(page.getByText('Tel Aviv', {exact: true})).toBeVisible()
  })

  function forecastResult(): ToolResultPart {
    return {type: 'tool-result', toolCallId: 'c1', content: 'clear skies over the bay', state: 'complete'}
  }

  it('mounts the generic tool body under the row as a JSON tree plus shiki result, with no extra click', async () => {
    const container = mountView(() => (
      <ToolTraceRow
        part={call('mcp__weather__forecast', {location: 'Tel Aviv'})}
        result={forecastResult()}
        ctx={noCtx}
        tools={() => []}
      />
    ))

    await expect.element(page.getByText('clear skies over the bay')).toBeVisible()
    await expect.element(page.getByText('location', {exact: true})).toBeVisible()
    expect(container.querySelectorAll('diffs-container').length).toBe(1)
    await page.screenshot({path: '__screenshots__/tool-trace-row/generic-body-shiki.png'})
  })

  it('folds a mounted body away and back from the row control', async () => {
    mountView(() => (
      <ToolTraceRow
        part={call('mcp__weather__forecast', {location: 'Tel Aviv'})}
        result={forecastResult()}
        ctx={noCtx}
        tools={() => []}
      />
    ))

    const fold = page.getByRole('button', {name: /Tel Aviv/})
    await expect.element(fold).toHaveAttribute('aria-expanded', 'true')

    await fold.click()

    await expect.element(fold).toHaveAttribute('aria-expanded', 'false')

    await fold.click()

    await expect.element(fold).toHaveAttribute('aria-expanded', 'true')
  })

  const LONG_OUTPUT = Array.from({length: 35}, (_, index) => `src/file-${index}.ts:${index}: a matching line`).join(
    '\n',
  )

  function bashCall(): ToolCallPart {
    return {type: 'tool-call', id: 'c1', name: 'Bash', arguments: '{"command":"grep -rn match src"}', state: 'complete'}
  }

  function outputTool(text: string): ToolCardEntry {
    return {
      names: ['Bash'],
      render: () => <TraceOutputBlock text={text}>{text}</TraceOutputBlock>,
      hasEmbeddedBody: () => true,
    }
  }

  const longOutputTool = outputTool(LONG_OUTPUT)
  const shortOutputTool = outputTool('one\ntwo')

  function revealControl(container: HTMLElement): HTMLElement {
    const match = [...container.querySelectorAll('button')].find((button) =>
      (button.textContent ?? '').includes('more lines'),
    )
    if (!match) throw new Error('expected a clamp reveal control')
    return match
  }

  it('clamps a long body and reveals the rest from the frame footer', async () => {
    const container = mountView(() => (
      <ToolTraceRow part={bashCall()} result={undefined} ctx={noCtx} tools={() => [longOutputTool]} />
    ))

    await expect.element(page.getByText(LONG_OUTPUT), {timeout: 3000}).toBeVisible()

    const control = revealControl(container)
    expect(control.getAttribute('aria-expanded')).toBe('false')
    expect(control.textContent).toContain('24 more lines')

    await userEvent.click(control)
    await expect.element(page.getByText(LONG_OUTPUT), {timeout: 3000}).toBeVisible()

    expect(control.getAttribute('aria-expanded')).toBe('true')
    expect(control.textContent).toBe('show less')

    await userEvent.click(control)
    await expect.element(page.getByText(LONG_OUTPUT), {timeout: 3000}).toBeVisible()

    expect(control.getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves a body that already fits without any clamp footer', async () => {
    const container = mountView(() => (
      <ToolTraceRow part={bashCall()} result={undefined} ctx={noCtx} tools={() => [shortOutputTool]} />
    ))

    await expect.element(page.getByText('one\ntwo'), {timeout: 3000}).toBeVisible()
    expect([...container.querySelectorAll('button')].map((button) => button.textContent ?? '')).not.toContain(
      expect.stringContaining('more lines'),
    )
  })

  const silentTool: ToolCardEntry = {
    names: ['Bash'],
    render: () => null,
    hasEmbeddedBody: () => false,
  }

  it('leaves the row inert when the card declares it renders no embedded body', async () => {
    mountView(() => <ToolTraceRow part={bashCall()} result={undefined} ctx={noCtx} tools={() => [silentTool]} />)

    await expect.element(page.getByText('grep -rn match src')).toBeVisible()
    await expect.element(page.getByRole('button')).toBeDisabled()
  })

  const speakingTool: ToolCardEntry = {
    names: ['ping'],
    render: () => <TraceOutputBlock text="pong">pong</TraceOutputBlock>,
    hasEmbeddedBody: () => true,
  }

  it('mounts the body a card declares even when the call carries no arguments and no result', async () => {
    mountView(() => (
      <ToolTraceRow part={call('ping', {})} result={undefined} ctx={noCtx} tools={() => [speakingTool]} />
    ))

    await expect.element(page.getByText('pong')).toBeVisible()
  })

  it('leaves a row with nothing to show inert rather than offering an empty fold', async () => {
    mountView(() => <ToolTraceRow part={call('ping', {})} result={undefined} ctx={noCtx} tools={() => []} />)

    await expect.element(page.getByText('ping').first()).toBeVisible()
    await expect.element(page.getByRole('button')).toBeDisabled()
  })

  it('routes a call waiting on approval to the permission block', async () => {
    const decisions: Array<{id: string; approved: boolean}> = []
    const asking: ToolCallPart = {
      ...call('Bash', {command: 'rm -rf dist'}, 'approval-requested'),
      approval: {id: 'ap-1', needsApproval: true},
    }
    mountView(() => <ToolTraceRow part={asking} result={undefined} ctx={ctxRecording(decisions)} tools={() => []} />)

    await expect.element(page.getByRole('group', {name: 'Permission request'})).toBeVisible()

    await page.getByRole('button', {name: 'Approve'}).click()

    await expect.element(page.getByText('Approved', {exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Approve'})).not.toBeInTheDocument()
    expect(decisions).toEqual([{id: 'ap-1', approved: true}])
  })
})

describe('trace row card header', () => {
  const ctx = ctxWith(catalogOf({}))

  function call(name: string, input: Record<string, unknown>): ToolCallPart {
    return {type: 'tool-call', id: 'c1', name, arguments: JSON.stringify(input), input, state: 'complete'}
  }

  function failedResult(): ToolResultPart {
    return {type: 'tool-result', toolCallId: 'c1', content: 'the query client was not found', state: 'complete'}
  }

  function headerCard(props: ToolCardProps): JSX.Element {
    return (
      <CardShell
        meta={undefined}
        title="Read the query cache"
        metaBadge="2 queries"
        status="error"
        part={props.part}
        result={props.result}
      >
        <p>the query client was not found</p>
      </CardShell>
    )
  }

  const headerTool: ToolCardEntry = {
    names: ['tanstack_query_cache'],
    render: headerCard,
    hasEmbeddedBody: () => true,
  }

  it('projects the embedded card header onto the trace row, marking an in-band failure as failed', async () => {
    mountView(() => (
      <ToolTraceRow
        part={call('tanstack_query_cache', {scope: 'all'})}
        result={failedResult()}
        ctx={ctx}
        tools={() => [headerTool]}
      />
    ))

    await expect.element(page.getByText('Read the query cache')).toBeVisible()
    await expect.element(page.getByText('2 queries')).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'failed'})).toBeVisible()
  })

  function searchCard(props: ToolCardProps): JSX.Element {
    return (
      <CardShell
        meta={undefined}
        title="Searched TODO"
        metaBadge="failed"
        status="error"
        part={props.part}
        result={props.result}
      >
        <p>{props.result?.error}</p>
      </CardShell>
    )
  }

  const searchTool: ToolCardEntry = {names: ['Grep'], render: searchCard, hasEmbeddedBody: () => true}

  it('a denied result names the outcome on the row instead of the card header failed badge', async () => {
    mountView(() => (
      <ToolTraceRow
        part={call('Grep', {pattern: 'TODO'})}
        result={{
          type: 'tool-result',
          toolCallId: 'c1',
          content: '',
          state: 'error',
          outcome: 'denied',
          error: 'The tool call was denied.',
        }}
        ctx={ctx}
        tools={() => [searchTool]}
      />
    ))

    await expect.element(page.getByRole('img', {name: 'denied'})).toBeVisible()
    await expect.element(page.getByText('denied', {exact: true})).toBeVisible()
    await expect.element(page.getByText('failed', {exact: true})).not.toBeInTheDocument()
  })

  function subtitleCard(props: ToolCardProps): JSX.Element {
    return (
      <CardShell
        meta={undefined}
        title="Read the router state"
        subtitle="/about"
        part={props.part}
        result={props.result}
      >
        <p>two matched routes</p>
      </CardShell>
    )
  }

  const subtitleTool: ToolCardEntry = {
    names: ['tanstack_route_tree'],
    render: subtitleCard,
    hasEmbeddedBody: () => true,
  }

  it('carries the card title on the row line while the subtitle stays in the body', async () => {
    mountView(() => (
      <ToolTraceRow
        part={call('tanstack_route_tree', {scope: 'all'})}
        result={failedResult()}
        ctx={ctx}
        tools={() => [subtitleTool]}
      />
    ))

    await expect.element(page.getByText('two matched routes')).toBeVisible()
    await expect.element(page.getByRole('button', {name: /Read the router state/})).toBeVisible()
    await expect.element(page.getByText('/about')).toBeVisible()
    expect(page.getByText('/about').elements()).toHaveLength(1)
    expect(page.getByRole('button', {name: /\/about/}).query()).toBeNull()
  })

  function streamingCard(props: ToolCardProps): JSX.Element {
    const done = () => props.result !== undefined
    return (
      <CardShell
        meta={undefined}
        title={done() ? 'Ran the suite' : 'Running the suite'}
        metaBadge={done() ? '3 passed' : undefined}
        part={props.part}
        result={props.result}
      >
        <p>suite body</p>
      </CardShell>
    )
  }

  const streamingTool: ToolCardEntry = {
    names: ['test_runner_run'],
    render: streamingCard,
    hasEmbeddedBody: () => true,
  }

  it('tracks header changes as the card result streams in', async () => {
    const [result, setResult] = createSignal<ToolResultPart>()
    mountView(() => (
      <ToolTraceRow
        part={call('test_runner_run', {filter: 'unit'})}
        result={result()}
        ctx={ctx}
        tools={() => [streamingTool]}
      />
    ))

    await expect.element(page.getByText('Running the suite')).toBeVisible()

    setResult({type: 'tool-result', toolCallId: 'c1', content: '3 passed', state: 'complete'})

    await expect.element(page.getByText('Ran the suite')).toBeVisible()
    await expect.element(page.getByText('3 passed').first()).toBeVisible()
  })

  function commandCard(props: ToolCardProps): JSX.Element {
    return (
      <CardShell meta={undefined} title="Run a command" metaBadge="page edit" part={props.part} result={props.result}>
        <p>the command output</p>
      </CardShell>
    )
  }

  const commandTool: ToolCardEntry = {names: ['bash'], render: commandCard, hasEmbeddedBody: () => true}

  it('keeps a named tool argument as the target and takes only the badge from the header', async () => {
    mountView(() => (
      <ToolTraceRow
        part={call('bash', {command: 'rm -rf tmp'})}
        result={failedResult()}
        ctx={ctx}
        tools={() => [commandTool]}
      />
    ))

    await expect.element(page.getByText('the command output')).toBeVisible()
    await expect.element(page.getByText('rm -rf tmp')).toBeVisible()
    await expect.element(page.getByText('page edit')).toBeVisible()
  })
})

const {
  ActionHandlersProvider,
  ActionBarMore,
  ActionBarPrimitive,
  Activity,
  AssistantActionBar,
  AssistantModal,
  Attachment,
  AttachmentByMime,
  AttachmentProvider,
  AttachmentUI,
  BranchPicker,
  BranchPickerPrimitive,
  BranchProvider,
  ChatProvider,
  Composer,
  ComposerActions,
  ComposerActionsHost,
  ComposerHandlersProvider,
  ComposerPrimitive,
  ComposerProvider,
  ErrorPrimitive,
  FollowUpSuggestions,
  Group,
  Markdown,
  MessagePart,
  MessagePrimitive,
  ModelSelector,
  ModelSelectorPrimitive,
  MorphLabel,
  NowLine,
  Primitive,
  QueueItem,
  QueueItemProvider,
  Reasoning,
  ReasoningText,
  SelectionToolbar,
  Suggestion,
  SuggestionProvider,
  Thread,
  ThreadList,
  ThreadListItem,
  ThreadListItemMore,
  ThreadListItemProvider,
  ThreadListProvider,
  ThreadPrimitive,
  UserActionBar,
  VirtualLines,
} = main

const {
  ActionButton,
  ActionRow,
  CardHeadline,
  Chip,
  ChipGroup,
  ChipRow,
  CodeBlock,
  DiffBlock,
  ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY,
  ELEMENT_CAPTURE_FIXTURE_FULL,
  ElementPreview,
  ErrorBlock,
  InlineRow,
  JsonTree,
  NoteRow,
  ResultImage,
  ShapedValue,
  StatusVisual,
  ToolFallbackPrimitive,
  Trace,
  TraceActionRow,
  TraceBodyFrame,
  TraceMark,
  TracePermissionBlock,
  TraceRing,
  TraceRunRow,
  TraceToolRow,
} = tools

const kit: Record<string, unknown> = {...main, ...tools}

const PROBE = 'data-probe="x"'

const FUNCTION_NAMESPACE_PARTS: Record<string, string[]> = {
  ThreadPrimitive: [
    'Root',
    'Viewport',
    'ViewportFooter',
    'Messages',
    'MessageByIndex',
    'Unstable_MessageById',
    'ScrollToBottom',
    'Suggestion',
    'Suggestions',
    'Empty',
    'If',
  ],
  MessagePrimitive: [
    'Root',
    'Parts',
    'PartByIndex',
    'Attachments',
    'AttachmentByIndex',
    'Unstable_PartsGrouped',
    'If',
    'Error',
  ],
  ComposerPrimitive: [
    'Root',
    'Input',
    'Send',
    'Cancel',
    'AddAttachment',
    'Attachments',
    'AttachmentDropzone',
    'If',
    'Quote',
    'QuoteDismiss',
    'Dictate',
    'StopDictation',
    'DictationTranscript',
    'Queue',
  ],
  ActionBarPrimitive: [
    'Root',
    'Copy',
    'Reload',
    'Edit',
    'ExportMarkdown',
    'Speak',
    'StopSpeaking',
    'FeedbackPositive',
    'FeedbackNegative',
  ],
  ActionBarMore: ['Root', 'Trigger', 'Content', 'Item', 'Separator'],
  ThreadListItemMore: ['Root', 'Trigger', 'Content', 'Item', 'Separator'],
  AssistantModal: ['Root', 'Trigger', 'Anchor', 'Content'],
  Attachment: ['Root', 'Name', 'Thumb', 'Remove'],
  BranchPickerPrimitive: ['Root', 'Previous', 'Next', 'Count', 'Number'],
  ErrorPrimitive: ['Root', 'Message'],
  ThreadList: ['Root', 'New', 'Items', 'LoadMore'],
  ThreadListItem: ['Root', 'Trigger', 'Title', 'Archive', 'Unarchive', 'Delete'],
  SelectionToolbar: ['Root', 'Quote'],
  ModelSelectorPrimitive: [
    'Root',
    'Trigger',
    'Value',
    'Content',
    'Search',
    'List',
    'Empty',
    'Group',
    'Separator',
    'Item',
    'Effort',
  ],
  ModelSelector: ['Root', 'Trigger', 'Value', 'Content', 'Search', 'List', 'Item', 'Group', 'Separator', 'Effort'],
  Thread: ['Root', 'Viewport', 'Welcome', 'Messages', 'Composer'],
  Group: ['Root', 'Trigger', 'Content'],
  Activity: ['Root', 'Timeline'],
  ToolFallback: ['Root', 'Trigger', 'Content', 'Args', 'Result', 'Error', 'Approval'],
  ToolFallbackPrimitive: ['Root'],
  Permission: ['Root'],
}

const ROOTLESS = [
  'ActionHandlersProvider',
  'AttachmentProvider',
  'BranchProvider',
  'CardChromeProvider',
  'ChatProvider',
  'ComposerHandlersProvider',
  'ComposerProvider',
  'MarkdownHighlightProvider',
  'MessageProvider',
  'PartProvider',
  'QueueItemProvider',
  'SuggestionProvider',
  'ThreadListItemProvider',
  'ThreadListProvider',
  'ToolDurationProvider',
  'ToolProvider',
  'ViewportProvider',
  'ActivityPrimitive.Root',
  'Permission',
  'Permission.Root',
  'ToolFallbackPrimitive',
  'ToolFallbackPrimitive.Root',
  'ElementPreview.Root',
  'MessagePart.InProgress',
  'ComposerActions.Action',
  'ComposerActions.ActionMenuItem',
  'ComposerActions.Inline',
  'ComposerActions.Leading',
  'ComposerActions.Trailing',
  'ComposerActions.Trigger',
  'ActionBarMore',
  'ActionBarMore.Root',
  'ThreadListItemMore',
  'ThreadListItemMore.Root',
  'AssistantModal',
  'AssistantModal.Root',
  'ThreadPrimitive.Messages',
  'ThreadPrimitive.MessageByIndex',
  'ThreadPrimitive.Unstable_MessageById',
  'ThreadPrimitive.Suggestions',
  'ThreadPrimitive.Empty',
  'ThreadPrimitive.If',
  'MessagePrimitive.Parts',
  'MessagePrimitive.PartByIndex',
  'MessagePrimitive.Attachments',
  'MessagePrimitive.AttachmentByIndex',
  'MessagePrimitive.Unstable_PartsGrouped',
  'MessagePrimitive.If',
  'MessagePrimitive.Error',
  'ComposerPrimitive.Attachments',
  'ComposerPrimitive.If',
  'ComposerPrimitive.Queue',
  'ThreadList.Items',
  'Thread.Welcome',
  'Thread.Messages',
  'BranchPickerPrimitive.Count',
  'BranchPickerPrimitive.Number',
  'ThreadListItem.Title',
]

const PART: ToolCallPart = {
  type: 'tool-call',
  id: 'e1',
  name: 'probe_tool',
  arguments: '{}',
  input: {},
  state: 'complete',
}
const RESULT: ToolResultPart = {type: 'tool-result', toolCallId: 'e1', content: 'done', state: 'complete'}
const CTX = ctxWith(catalogOf({}))
const CARD = {part: PART, result: RESULT, ctx: CTX}
const ASKING: ToolCallPart = {...PART, state: 'approval-requested', approval: {id: 'ap1', needsApproval: true}}
const ANSWERING = {...CTX, respondApproval: () => {}}
const FAILED: ToolResultPart = {...RESULT, content: JSON.stringify({error: 'failed'}), state: 'error'}
const MESSAGES: ChatMessage[] = [
  {id: 'u1', role: 'user', parts: [{type: 'text', content: 'go'}]},
  {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'hi'}]},
]
const IMAGE_MESSAGES: ChatMessage[] = [
  {id: 'u1', role: 'user', parts: [{type: 'image', source: {type: 'url', value: 'data:,'}}]},
]
const SESSION: ChatSessionMeta = {
  id: 's1',
  title: 'probe',
  updatedAt: 0,
  messageCount: 1,
  running: false,
  origin: 'conciv',
  usage: null,
}
const ATTACHMENT: CompleteAttachment = {
  id: 'a',
  type: 'document',
  name: 'notes.pdf',
  content: [{type: 'document', source: {type: 'data', value: '', mimeType: 'application/pdf'}}],
  status: {type: 'complete'},
}
const MODEL = {id: 'probe-model', name: 'Probe'}
const THINKING_MODELS = [{...MODEL, efforts: true}]
const PROJECTION = {mark: 'pass' as const, label: 'Read', target: 'file.ts'}

const RECIPES: Record<string, () => JSX.Element> = {
  ActionBarPrimitive: () => inMessage(() => <ActionBarPrimitive data-probe="x" />),
  'ActionBarPrimitive.Root': () => inMessage(() => <ActionBarPrimitive.Root data-probe="x" />),
  'ActionBarPrimitive.Copy': () => actionBar(() => <ActionBarPrimitive.Copy data-probe="x" />),
  'ActionBarPrimitive.Reload': () => actionBar(() => <ActionBarPrimitive.Reload data-probe="x" />),
  'ActionBarPrimitive.Edit': () => handled(() => <ActionBarPrimitive.Edit data-probe="x" />),
  'ActionBarPrimitive.ExportMarkdown': () => actionBar(() => <ActionBarPrimitive.ExportMarkdown data-probe="x" />),
  'ActionBarPrimitive.Speak': () => handled(() => <ActionBarPrimitive.Speak data-probe="x" />),
  'ActionBarPrimitive.StopSpeaking': () => handled(() => <ActionBarPrimitive.StopSpeaking data-probe="x" />),
  'ActionBarPrimitive.FeedbackPositive': () => handled(() => <ActionBarPrimitive.FeedbackPositive data-probe="x" />),
  'ActionBarPrimitive.FeedbackNegative': () => handled(() => <ActionBarPrimitive.FeedbackNegative data-probe="x" />),
  'ActionBarMore.Trigger': () => more(() => <ActionBarMore.Trigger data-probe="x" />),
  'ActionBarMore.Content': () => more(() => <ActionBarMore.Content data-probe="x" />),
  'ActionBarMore.Item': () => more(() => <ActionBarMore.Item value="one" data-probe="x" />),
  'ActionBarMore.Separator': () => more(() => <ActionBarMore.Separator data-probe="x" />),
  'ThreadListItemMore.Trigger': () => more(() => <ThreadListItemMore.Trigger data-probe="x" />),
  'ThreadListItemMore.Content': () => more(() => <ThreadListItemMore.Content data-probe="x" />),
  'ThreadListItemMore.Item': () => more(() => <ThreadListItemMore.Item value="one" data-probe="x" />),
  'ThreadListItemMore.Separator': () => more(() => <ThreadListItemMore.Separator data-probe="x" />),
  'AssistantModal.Trigger': () => modal(() => <AssistantModal.Trigger data-probe="x" />),
  'AssistantModal.Anchor': () => modal(() => <AssistantModal.Anchor data-probe="x" />),
  'AssistantModal.Content': () => modal(() => <AssistantModal.Content data-probe="x" />),
  ActionButton: () => <ActionButton data-probe="x">go</ActionButton>,
  ActionRow: () => <ActionRow data-probe="x">{null}</ActionRow>,
  Activity: () => chat(() => <Activity messages={MESSAGES} data-probe="x" />),
  'Activity.Root': () => chat(() => <Activity.Root messages={MESSAGES} data-probe="x" />),
  'Activity.Timeline': () =>
    chat(() => (
      <Activity.Root messages={MESSAGES}>
        <Activity.Timeline data-probe="x" />
      </Activity.Root>
    )),
  AssistantActionBar: () => inMessage(() => <AssistantActionBar data-probe="x" />),
  Attachment: () => attachment(() => <Attachment data-probe="x" />),
  'Attachment.Root': () => attachment(() => <Attachment.Root data-probe="x" />),
  'Attachment.Name': () => attachment(() => <Attachment.Name data-probe="x" />),
  'Attachment.Thumb': () => attachment(() => <Attachment.Thumb data-probe="x" />),
  'Attachment.Remove': () => attachment(() => <Attachment.Remove data-probe="x" />),
  AttachmentByMime: () => attachment(() => <AttachmentByMime cards={[]} data-probe="x" />),
  AttachmentUI: () => attachment(() => <AttachmentUI data-probe="x" />),
  BranchPicker: () => branch(() => <BranchPicker data-probe="x" />),
  BranchPickerPrimitive: () => branch(() => <BranchPickerPrimitive data-probe="x" />),
  'BranchPickerPrimitive.Root': () => branch(() => <BranchPickerPrimitive.Root data-probe="x" />),
  'BranchPickerPrimitive.Previous': () => branch(() => <BranchPickerPrimitive.Previous data-probe="x" />),
  'BranchPickerPrimitive.Next': () => branch(() => <BranchPickerPrimitive.Next data-probe="x" />),
  CardHeadline: () => <CardHeadline data-probe="x">headline</CardHeadline>,
  CardShell: () => <CardShell meta={undefined} title="probe" part={PART} result={RESULT} data-probe="x" />,
  Chip: () => <Chip value="probe" data-probe="x" />,
  ChipGroup: () => <ChipGroup data-probe="x">{null}</ChipGroup>,
  ChipRow: () => <ChipRow data-probe="x">{null}</ChipRow>,
  CodeBlock: () => <CodeBlock file={{name: 'a.ts', contents: 'const a = 1'}} data-probe="x" />,
  CollapsibleSection: () => (
    <CollapsibleSection header="head" data-probe="x">
      {null}
    </CollapsibleSection>
  ),
  Composer: () => chat(() => <Composer data-probe="x" />),
  ComposerPrimitive: () => chat(() => <ComposerPrimitive data-probe="x" />),
  'ComposerPrimitive.Root': () => chat(() => <ComposerPrimitive.Root data-probe="x" />),
  'ComposerPrimitive.Input': () => composer(() => <ComposerPrimitive.Input data-probe="x" />),
  'ComposerPrimitive.Send': () => composer(() => <ComposerPrimitive.Send data-probe="x" />),
  'ComposerPrimitive.Cancel': () => running(() => <ComposerPrimitive.Cancel data-probe="x" />),
  'ComposerPrimitive.AddAttachment': () => composer(() => <ComposerPrimitive.AddAttachment data-probe="x" />),
  'ComposerPrimitive.AttachmentDropzone': () =>
    composer(() => <ComposerPrimitive.AttachmentDropzone data-probe="x">{null}</ComposerPrimitive.AttachmentDropzone>),
  'ComposerPrimitive.Quote': () => drafted(() => <ComposerPrimitive.Quote data-probe="x" />),
  'ComposerPrimitive.QuoteDismiss': () => drafted(() => <ComposerPrimitive.QuoteDismiss data-probe="x" />),
  'ComposerPrimitive.Dictate': () => drafted(() => <ComposerPrimitive.Dictate data-probe="x" />),
  'ComposerPrimitive.StopDictation': () => drafted(() => <ComposerPrimitive.StopDictation data-probe="x" />),
  'ComposerPrimitive.DictationTranscript': () =>
    drafted(() => <ComposerPrimitive.DictationTranscript data-probe="x" />),
  ComposerActionsHost: () => <ComposerActionsHost data-probe="x">{null}</ComposerActionsHost>,
  'ComposerActions.ActionButton': () => (
    <ComposerActionsHost>
      <ComposerActions.ActionButton tooltip="go" onClick={() => {}} visible="always" data-probe="x">
        go
      </ComposerActions.ActionButton>
    </ComposerActionsHost>
  ),
  DiffBlock: () => <DiffBlock file={{name: 'a.ts', before: 'a', after: 'b'}} data-probe="x" />,
  'ElementPreview.Frame': () => preview(() => <ElementPreview.Frame data-probe="x" />),
  'ElementPreview.Descriptor': () => (
    <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY}>
      <ElementPreview.Descriptor data-probe="x" />
    </ElementPreview.Root>
  ),
  ErrorBlock: () => <ErrorBlock message="failed" data-probe="x" />,
  ErrorPrimitive: () => failed(() => <ErrorPrimitive data-probe="x" />),
  'ErrorPrimitive.Root': () => failed(() => <ErrorPrimitive.Root data-probe="x" />),
  'ErrorPrimitive.Message': () => failed(() => <ErrorPrimitive.Message data-probe="x" />),
  FollowUpSuggestions: () =>
    chat(() => <FollowUpSuggestions suggestions={[{title: 't', label: 'l', prompt: 'p'}]} data-probe="x" />),
  Group: () => <Group data-probe="x">{null}</Group>,
  'Group.Root': () => <Group.Root data-probe="x">{null}</Group.Root>,
  'Group.Trigger': () => (
    <Group.Root>
      <Group.Trigger label="group" data-probe="x" />
    </Group.Root>
  ),
  'Group.Content': () => (
    <Group.Root defaultOpen>
      <Group.Content data-probe="x">{null}</Group.Content>
    </Group.Root>
  ),
  InlineRow: () => <InlineRow label="probe" status="complete" value="v" data-probe="x" />,
  InlineShell: () => <InlineShell name="probe" status="complete" data-probe="x" />,
  JsonTree: () => <JsonTree data={{a: 1}} data-probe="x" />,
  Markdown: () => <Markdown content="hello" data-probe="x" />,
  'MessagePart.Text': () => inPart(() => <MessagePart.Text data-probe="x" />),
  'MessagePart.Image': () => inPart(() => <MessagePart.Image data-probe="x" />, IMAGE_MESSAGES),
  MessagePrimitive: () => inMessage(() => <MessagePrimitive data-probe="x" />),
  'MessagePrimitive.Root': () => inMessage(() => <MessagePrimitive.Root data-probe="x" />),
  MetaToolCard: () => <MetaToolCard {...CARD} addResult={INERT_ADD_RESULT} data-probe="x" />,
  ModelSelector: () => <ModelSelector models={HARNESS_MODELS} data-probe="x" />,
  'ModelSelector.Root': () => <ModelSelector.Root models={HARNESS_MODELS} data-probe="x" />,
  'ModelSelector.Trigger': () => selector(() => <ModelSelector.Trigger data-probe="x" />),
  'ModelSelector.Value': () => selector(() => <ModelSelector.Value data-probe="x" />),
  'ModelSelector.Content': () => selector(() => <ModelSelector.Content data-probe="x" />),
  'ModelSelector.Search': () => selector(() => <ModelSelector.Search data-probe="x" />),
  'ModelSelector.List': () => selector(() => <ModelSelector.List data-probe="x" />),
  'ModelSelector.Item': () => selector(() => <ModelSelector.Item model={MODEL} data-probe="x" />),
  'ModelSelector.Group': () => selector(() => <ModelSelector.Group label="group" data-probe="x" />),
  'ModelSelector.Separator': () => selector(() => <ModelSelector.Separator data-probe="x" />),
  'ModelSelector.Effort': () => selector(() => <ModelSelector.Effort data-probe="x" />),
  ModelSelectorPrimitive: () => <ModelSelectorPrimitive models={HARNESS_MODELS} data-probe="x" />,
  'ModelSelectorPrimitive.Root': () => <ModelSelectorPrimitive.Root models={HARNESS_MODELS} data-probe="x" />,
  'ModelSelectorPrimitive.Trigger': () => selector(() => <ModelSelectorPrimitive.Trigger data-probe="x" />),
  'ModelSelectorPrimitive.Value': () => selector(() => <ModelSelectorPrimitive.Value data-probe="x" />),
  'ModelSelectorPrimitive.Content': () => selector(() => <ModelSelectorPrimitive.Content data-probe="x" />),
  'ModelSelectorPrimitive.Search': () => selector(() => <ModelSelectorPrimitive.Search data-probe="x" />),
  'ModelSelectorPrimitive.List': () => selector(() => <ModelSelectorPrimitive.List data-probe="x" />),
  'ModelSelectorPrimitive.Empty': () => (
    <ModelSelectorPrimitive.Root models={[]} defaultOpen>
      <ModelSelectorPrimitive.Empty data-probe="x" />
    </ModelSelectorPrimitive.Root>
  ),
  'ModelSelectorPrimitive.Group': () => selector(() => <ModelSelectorPrimitive.Group data-probe="x" />),
  'ModelSelectorPrimitive.Separator': () => selector(() => <ModelSelectorPrimitive.Separator data-probe="x" />),
  'ModelSelectorPrimitive.Item': () => selector(() => <ModelSelectorPrimitive.Item model={MODEL} data-probe="x" />),
  'ModelSelectorPrimitive.Effort': () => selector(() => <ModelSelectorPrimitive.Effort data-probe="x" />),
  MorphLabel: () => <MorphLabel text="probe" data-probe="x" />,
  NoteRow: () => (
    <NoteRow icon={null} tone="accent" data-probe="x">
      note
    </NoteRow>
  ),
  NowLine: () => <NowLine title="probe" data-probe="x" />,
  PermissionCard: () => <PermissionCard part={ASKING} ctx={ANSWERING} data-probe="x" />,
  'Primitive.button': () => <Primitive.button data-probe="x" />,
  'Primitive.div': () => <Primitive.div data-probe="x" />,
  'Primitive.form': () => <Primitive.form data-probe="x" />,
  'Primitive.img': () => <Primitive.img data-probe="x" />,
  'Primitive.span': () => <Primitive.span data-probe="x" />,
  'QueueItem.Text': () => queued(() => <QueueItem.Text data-probe="x" />),
  'QueueItem.Steer': () => queued(() => <QueueItem.Steer data-probe="x" />),
  'QueueItem.Remove': () => queued(() => <QueueItem.Remove data-probe="x" />),
  Reasoning: () => <Reasoning text="thinking" data-probe="x" />,
  ReasoningText: () => <ReasoningText text="thinking" data-probe="x" />,
  ResultImage: () => <ResultImage src="data:," alt="probe" data-probe="x" />,
  SelectionToolbar: () => selected(() => <SelectionToolbar data-probe="x" />),
  'SelectionToolbar.Root': () => selected(() => <SelectionToolbar.Root data-probe="x" />),
  'SelectionToolbar.Quote': () => composer(() => <SelectionToolbar.Quote data-probe="x" />),
  ShapedValue: () => <ShapedValue name="probe" value={{a: 1}} data-probe="x" />,
  StatusVisual: () => <StatusVisual status="complete" form="dot" data-probe="x" />,
  'Suggestion.Title': () => suggestion(() => <Suggestion.Title data-probe="x" />),
  'Suggestion.Description': () => suggestion(() => <Suggestion.Description data-probe="x" />),
  'Suggestion.Trigger': () => suggestion(() => <Suggestion.Trigger data-probe="x" />),
  Thread: () => chat(() => <Thread data-probe="x" />),
  'Thread.Root': () => chat(() => <Thread.Root data-probe="x" />),
  'Thread.Viewport': () =>
    chat(() => (
      <Thread.Root>
        <Thread.Viewport data-probe="x" />
      </Thread.Root>
    )),
  'Thread.Composer': () => chat(() => <Thread.Composer data-probe="x" />),
  ThreadList: () => threads(() => <ThreadList data-probe="x" />),
  'ThreadList.Root': () => threads(() => <ThreadList.Root data-probe="x" />),
  'ThreadList.New': () => threads(() => <ThreadList.New data-probe="x" />),
  'ThreadList.LoadMore': () => threads(() => <ThreadList.LoadMore data-probe="x" />),
  ThreadListItem: () => item(() => <ThreadListItem data-probe="x" />),
  'ThreadListItem.Root': () => item(() => <ThreadListItem.Root data-probe="x" />),
  'ThreadListItem.Trigger': () => item(() => <ThreadListItem.Trigger data-probe="x" />),
  'ThreadListItem.Archive': () => item(() => <ThreadListItem.Archive data-probe="x" />),
  'ThreadListItem.Unarchive': () => item(() => <ThreadListItem.Unarchive data-probe="x" />),
  'ThreadListItem.Delete': () => item(() => <ThreadListItem.Delete data-probe="x" />),
  ThreadPrimitive: () => chat(() => <ThreadPrimitive data-probe="x" />),
  'ThreadPrimitive.Root': () => chat(() => <ThreadPrimitive.Root data-probe="x" />),
  'ThreadPrimitive.Viewport': () => thread(() => <ThreadPrimitive.Viewport data-probe="x" />),
  'ThreadPrimitive.ViewportFooter': () => thread(() => <ThreadPrimitive.ViewportFooter data-probe="x" />),
  'ThreadPrimitive.ScrollToBottom': () => thread(() => <ThreadPrimitive.ScrollToBottom data-probe="x" />),
  'ThreadPrimitive.Suggestion': () => chat(() => <ThreadPrimitive.Suggestion prompt="p" data-probe="x" />),
  ToolCallCard: () => <ToolCallCard {...CARD} data-probe="x" />,
  ToolCard: () => <ToolCard title="probe" part={PART} result={RESULT} data-probe="x" />,
  ToolFallback: () => <ToolFallback {...CARD} addResult={INERT_ADD_RESULT} data-probe="x" />,
  'ToolFallback.Root': () => fallback(() => <ToolFallback.Root data-probe="x">{null}</ToolFallback.Root>),
  'ToolFallback.Trigger': () => fallback(() => <ToolFallback.Trigger data-probe="x" />),
  'ToolFallback.Content': () => (
    <ToolFallbackPrimitive.Root part={ASKING} result={undefined} ctx={ANSWERING}>
      <ToolFallback.Root>
        <ToolFallback.Content data-probe="x">{null}</ToolFallback.Content>
      </ToolFallback.Root>
    </ToolFallbackPrimitive.Root>
  ),
  'ToolFallback.Args': () => fallback(() => <ToolFallback.Args data-probe="x" />),
  'ToolFallback.Result': () => fallback(() => <ToolFallback.Result data-probe="x" />),
  'ToolFallback.Error': () => (
    <ToolFallbackPrimitive.Root {...CARD} result={FAILED}>
      <ToolFallback.Error data-probe="x" />
    </ToolFallbackPrimitive.Root>
  ),
  'ToolFallback.Approval': () => (
    <ToolFallbackPrimitive.Root part={ASKING} result={undefined} ctx={ANSWERING}>
      <ToolFallback.Approval data-probe="x" />
    </ToolFallbackPrimitive.Root>
  ),
  ToolTraceRow: () => <ToolTraceRow {...CARD} data-probe="x" />,
  Trace: () => <Trace summary="s" compactLine="c" items={[]} data-probe="x" />,
  TraceActionRow: () => <TraceActionRow label="act" data-probe="x" />,
  TraceBodyFrame: () => <TraceBodyFrame data-probe="x">{null}</TraceBodyFrame>,
  TraceMark: () => <TraceMark mark="pass" data-probe="x" />,
  TraceOutputBlock: () => <TraceOutputBlock data-probe="x">{null}</TraceOutputBlock>,
  TracePermissionBlock: () => <TracePermissionBlock part={ASKING} ctx={ANSWERING} target="file.ts" data-probe="x" />,
  TraceRing: () => <TraceRing data-probe="x" />,
  TraceRunRow: () => <TraceRunRow label="run" text="t" data-probe="x" />,
  TraceToolRow: () => <TraceToolRow projection={PROJECTION} data-probe="x" />,
  UserActionBar: () => inMessage(() => <UserActionBar data-probe="x" />),
  VirtualLines: () => <VirtualLines lines={['a']} data-probe="x" />,
}

describe('every kit component forwards its rest props to its root', () => {
  it('has a recipe or a rootless entry for each exported component', () => {
    expect(ownComponents()).toEqual([...Object.keys(RECIPES), ...ROOTLESS].toSorted())
  })

  it.each(Object.entries(RECIPES).toSorted(([one], [other]) => one.localeCompare(other)))('%s', async (_, recipe) => {
    const {unmount} = render(recipe)
    onTestFinished(unmount)
    await expect.element(page.elementLocator(document.body)).toContainHTML(PROBE)
  })
})

function ownComponents(): string[] {
  return Object.entries(kit)
    .flatMap(([name, value]) => (pascal(name) ? [...rootOf(name, value), ...partsOf(name, value)] : []))
    .toSorted()
}

function rootOf(name: string, value: unknown): string[] {
  return typeof value === 'function' ? [name] : []
}

function partsOf(name: string, value: unknown): string[] {
  const listed = FUNCTION_NAMESPACE_PARTS[name]
  if (listed) return listed.map((member) => `${name}.${member}`)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value)
    .filter(
      ([member, entry]) => typeof entry === 'function' && !member.startsWith('use') && !member.startsWith('create'),
    )
    .map(([member]) => `${name}.${member}`)
}

function pascal(name: string): boolean {
  return name.charAt(0) === name.charAt(0).toUpperCase() && name !== name.toUpperCase()
}

function chat(view: () => JSX.Element, messages: ChatMessage[] = MESSAGES): JSX.Element {
  const value = createChat({threadId: 'probe', connection: storyConnection()})
  onMount(() => value.setMessages(messages))
  return <ChatProvider chat={value}>{view()}</ChatProvider>
}

function running(view: () => JSX.Element): JSX.Element {
  const value = createChat({threadId: 'probe', connection: storyConnection({chunks: [], runsUntilStopped: true})})
  onMount(() => void value.sendMessage('go'))
  return (
    <ChatProvider chat={value}>
      <ComposerPrimitive.Root>{view()}</ComposerPrimitive.Root>
    </ChatProvider>
  )
}

function failed(view: () => JSX.Element): JSX.Element {
  const value = createChat({
    threadId: 'probe',
    connection: storyConnection({shouldError: true, error: new globalThis.Error('Stream failed')}),
  })
  onMount(() => void value.sendMessage('go'))
  return <ChatProvider chat={value}>{view()}</ChatProvider>
}

function thread(view: () => JSX.Element): JSX.Element {
  return chat(() => <ThreadPrimitive.Root>{view()}</ThreadPrimitive.Root>)
}

function handled(view: () => JSX.Element): JSX.Element {
  return inMessage(() => (
    <ActionHandlersProvider
      value={{onEdit: () => {}, onSpeak: () => {}, onStopSpeaking: () => {}, onFeedback: () => {}}}
    >
      <ActionBarPrimitive.Root>{view()}</ActionBarPrimitive.Root>
    </ActionHandlersProvider>
  ))
}

function drafted(view: () => JSX.Element): JSX.Element {
  return (
    <ComposerHandlersProvider value={{onStartDictation: () => {}, transcript: () => 'said'}}>
      <ComposerProvider
        value={{
          attachments: () => [],
          attachmentAdapter: () => undefined,
          addAttachment: async () => null,
          hasAttachment: () => false,
          replaceAttachment: async () => null,
          removeAttachment: async () => {},
          sendingAttachments: () => false,
          snapshotDraft: () => ({draft: '', attachments: [], quote: null}),
          restoreDraft: () => {},
          clearDraft: () => {},
          quote: () => 'quoted',
          setQuote: () => {},
          editing: () => false,
          setEditing: () => {},
          dictating: () => true,
          setDictating: () => {},
        }}
      >
        {view()}
      </ComposerProvider>
    </ComposerHandlersProvider>
  )
}

function selected(view: () => JSX.Element): JSX.Element {
  return composer(() => (
    <>
      <p
        ref={(node) => {
          onMount(() => document.getSelection()?.selectAllChildren(node))
        }}
      >
        selected text
      </p>
      {view()}
    </>
  ))
}

function inMessage(view: () => JSX.Element): JSX.Element {
  return chat(() => (
    <ThreadPrimitive.Root>
      <ThreadPrimitive.Messages components={{UserMessage: view, AssistantMessage: view}} />
    </ThreadPrimitive.Root>
  ))
}

function inPart(view: () => JSX.Element, messages: ChatMessage[] = MESSAGES): JSX.Element {
  return chat(
    () => (
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: () => <MessagePrimitive.Parts components={{Text: view, Image: view}} />,
            AssistantMessage: () => <MessagePrimitive.Parts components={{Text: view, Image: view}} />,
          }}
        />
      </ThreadPrimitive.Root>
    ),
    messages,
  )
}

function actionBar(view: () => JSX.Element): JSX.Element {
  return inMessage(() => <ActionBarPrimitive.Root>{view()}</ActionBarPrimitive.Root>)
}

function composer(view: () => JSX.Element): JSX.Element {
  return chat(() => <ComposerPrimitive.Root>{view()}</ComposerPrimitive.Root>)
}

function attachment(view: () => JSX.Element): JSX.Element {
  return composer(() => <AttachmentProvider value={ATTACHMENT}>{view()}</AttachmentProvider>)
}

function branch(view: () => JSX.Element): JSX.Element {
  return inMessage(() => (
    <BranchProvider value={{count: 2, index: 0, previous: () => {}, next: () => {}}}>{view()}</BranchProvider>
  ))
}

function more(view: () => JSX.Element): JSX.Element {
  return inMessage(() => (
    <ActionBarPrimitive.Root>
      <ActionBarMore defaultOpen>{view()}</ActionBarMore>
    </ActionBarPrimitive.Root>
  ))
}

function modal(view: () => JSX.Element): JSX.Element {
  return chat(() => <AssistantModal defaultOpen>{view()}</AssistantModal>)
}

function preview(view: () => JSX.Element): JSX.Element {
  return <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_FULL}>{view()}</ElementPreview.Root>
}

function selector(view: () => JSX.Element): JSX.Element {
  return (
    <ModelSelectorPrimitive.Root models={THINKING_MODELS} defaultValue={MODEL.id} defaultOpen>
      {view()}
    </ModelSelectorPrimitive.Root>
  )
}

function queued(view: () => JSX.Element): JSX.Element {
  return chat(() => <QueueItemProvider value={{id: 'q', content: 'later', createdAt: 0}}>{view()}</QueueItemProvider>)
}

function suggestion(view: () => JSX.Element): JSX.Element {
  return composer(() => (
    <SuggestionProvider value={() => ({title: 't', label: 'l', prompt: 'p'})}>{view()}</SuggestionProvider>
  ))
}

function threads(view: () => JSX.Element): JSX.Element {
  return (
    <ThreadListProvider
      value={{
        sessions: () => [SESSION],
        activeId: () => null,
        select: () => {},
        create: () => {},
        loadMore: () => {},
        hasMore: () => true,
        archive: () => {},
        unarchive: () => {},
        remove: () => {},
      }}
    >
      {view()}
    </ThreadListProvider>
  )
}

function item(view: () => JSX.Element): JSX.Element {
  return threads(() => <ThreadListItemProvider value={SESSION}>{view()}</ThreadListItemProvider>)
}

function fallback(view: () => JSX.Element): JSX.Element {
  return (
    <ToolFallbackPrimitive.Root {...CARD}>
      <ToolFallback.Root>{view()}</ToolFallback.Root>
    </ToolFallbackPrimitive.Root>
  )
}
