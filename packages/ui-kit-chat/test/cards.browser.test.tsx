import 'virtual:uno.css'
import {expect, it, describe} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {ToolResultPart, ToolCallPart} from '@conciv/protocol/chat-message-types'
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
import {cardPart, cardResult, makeCatalog, ctxWith, mountView} from './helpers.js'
import {render} from '@solidjs/testing-library'
import {CardShell} from '../src/tools/styled/card-shell.js'
import {CollapsibleCard} from '../src/tools/styled/collapsible-card.js'
import {CollapsibleSection} from '../src/tools/styled/collapsible-section.js'
import {InlineShell} from '../src/tools/styled/inline-row.js'
import {CardChromeProvider} from '../src/tools/styled/card-chrome.js'
import type {PermissionScope} from '@conciv/protocol/chat-types'
import {PermissionCard} from '../src/tools/styled/permission-card.js'
import {ToolCallCard, ToolTraceRow} from '../src/tools/styled/tool-call-card.js'
import {createSignal, type JSX} from 'solid-js'
import {ToolCard} from '../src/tools/styled/tool-card.js'
import {ToolDisplay} from '../src/tools/styled/tool-display.js'
import {ToolPartRow, type ToolDisclosure} from '../src/styled/tool-part-row.js'
import {TraceOutputBlock} from '../src/styled/trace/output-block.js'
import {TracePermissionBlock} from '../src/styled/trace/permission-block.js'

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
        ctx={ctxWith(makeCatalog({page_noop: NO_SCHEMA_META}))}
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
        ctx={ctxWith(makeCatalog({page_fill: FILL_META}))}
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
        ctx={ctxWith(makeCatalog({page_noop: NO_SCHEMA_META}))}
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
        ctx={ctxWith(makeCatalog({page_fill: FILL_META}))}
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

describe('a generic card', () => {
  const saveMeta: ToolViewMeta = {
    summary: 'save the form the user filled',
    label: {running: 'Saving the form', done: 'Saved the form'},
    positional: 'selector',
    mutating: true,
    inputSchema: {
      type: 'object',
      properties: {selector: {type: 'string'}, value: {type: 'string'}},
      required: ['selector', 'value'],
    },
    outputSchema: {type: 'string'},
  }
  const savePart = cardPart('page_save', {selector: '#signup', value: 'Ada'})
  const saveResult = cardResult('saved to drafts', 'complete')
  const pingPart: ToolCallPart = {
    type: 'tool-call',
    id: 'p1',
    name: 'ping',
    arguments: '{"host":"example.org"}',
    state: 'complete',
  }
  const pingResult: ToolResultPart = {
    type: 'tool-result',
    toolCallId: 'p1',
    content: 'pong from example.org',
    state: 'complete',
  }
  const catalogCtx = ctxWith(makeCatalog({page_save: saveMeta}))
  const region = (name: string) => page.getByRole('region', {name, exact: true})

  it('draws its own body under its header', async () => {
    mountView(() => (
      <>
        <section aria-label="catalog card">
          <MetaToolCard part={savePart} result={saveResult} ctx={catalogCtx} addResult={INERT_ADD_RESULT} />
        </section>
        <section aria-label="fallback card">
          <ToolFallback part={pingPart} result={pingResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />
        </section>
      </>
    ))

    const catalog = region('catalog card')
    await expect.element(catalog.getByText('Saved the form #signup', {exact: true})).toBeVisible()
    await userEvent.click(catalog.getByRole('button').first())
    await expect.element(catalog.getByText('saved to drafts')).toBeVisible()
    await expect.element(catalog.getByText('Ada', {exact: true})).toBeVisible()

    const fallback = region('fallback card')
    await expect.element(fallback.getByRole('button', {name: /Called ping/})).toBeVisible()
    await userEvent.click(fallback.getByRole('button', {name: /Called ping/}))
    await expect.element(fallback.getByText('pong from example.org')).toBeVisible()
  })

  it('keeps the result of an unclaimed call folded until its row opens, and a call with no result has no body', async () => {
    mountView(() => (
      <>
        <section aria-label="answered call">
          <ToolDisplay
            id="ping-1"
            tool="ping"
            input={{host: 'example.org'}}
            metadata={{}}
            status="completed"
            output="pong from example.org"
          />
        </section>
        <section aria-label="silent call">
          <ToolDisplay id="ping-2" tool="ping" input={{host: 'example.net'}} metadata={{}} status="completed" />
        </section>
      </>
    ))

    const answered = region('answered call')
    const answeredRow = answered.getByRole('button', {name: /Called ping/})
    await expect.element(answeredRow).toBeVisible()
    await userEvent.click(answeredRow)
    await expect.element(answered.getByText('pong from example.org')).toBeVisible()

    const silent = region('silent call')
    await expect.element(silent.getByRole('button', {name: /Called ping/})).toBeDisabled()
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
        ctx={ctxWith(makeCatalog({page_fill: fillMeta}))}
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
        ctx={ctxWith(makeCatalog({page_fill: fillMeta}))}
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
        ctx={ctxWith(makeCatalog({page_fill: fillMeta}))}
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
        ctx={ctxWith(makeCatalog({page_fill: fillMeta}))}
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
        ctx={ctxWith(makeCatalog({page_ship: shipMeta}))}
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
          ctx={ctxWith(makeCatalog({page_fill: fillMeta}))}
          tools={() => []}
        />
      ))

      await expect.element(page.getByText(`The tool call was ${outcome}.`)).toBeVisible()
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
        ctx={ctxWith(makeCatalog({page_measure: measureMeta}))}
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
        ctx={ctxAsking(makeCatalog({page_ship: shipMeta}))}
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
        ctx={ctxAsking(makeCatalog({page_ship: shipMeta}))}
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
        ctx={ctxAsking(makeCatalog({page_ship: shipMeta}))}
        tools={() => []}
      />
    ))

    await expect.element(page.getByText('Shipped the page')).toBeVisible()
    expect(document.body.textContent).not.toContain('Called page_ship')
  })

  it('a tool the catalog knows nothing about still reaches the raw fallback', async () => {
    mountView(() => (
      <ToolCallCard
        part={part('mcp__weather__forecast')}
        result={undefined}
        ctx={ctxAsking(makeCatalog({}))}
        tools={() => []}
      />
    ))

    await expect.element(page.getByText('mcp__weather__forecast')).toBeVisible()
    expect(document.body.textContent).toContain('Called mcp__weather__forecast')
  })

  it('a call waiting on approval draws its card with no approval prompt, the ask lives in the dock', async () => {
    const approval: ToolCallPart = {
      ...part('page_ship', 'approval-requested'),
      approval: {id: 'ap1', needsApproval: true},
    }
    mountView(() => (
      <ToolCallCard
        part={approval}
        result={undefined}
        ctx={ctxAsking(makeCatalog({page_ship: shipMeta}))}
        tools={() => []}
      />
    ))

    await expect.element(page.getByText('Shipping the page')).toBeVisible()
    await expect.element(page.getByText('Run this action?')).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', {name: 'Allow'})).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', {name: 'Deny'})).not.toBeInTheDocument()
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
    return {...ctxWith(makeCatalog({})), respondApproval: (id, approved) => decisions.push({id, approved})}
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

  it('clamps a long body and reveals the rest from the block header', async () => {
    mountView(() => <ToolTraceRow part={bashCall()} result={undefined} ctx={noCtx} tools={() => [longOutputTool]} />)
    const reveal = page.getByRole('button', {name: '24 more lines'})
    const collapse = page.getByRole('button', {name: 'Show less'})

    await expect.element(page.getByText(LONG_OUTPUT), {timeout: 3000}).toBeVisible()
    await expect.element(reveal).toHaveAttribute('aria-expanded', 'false')

    await reveal.click()
    await expect.element(collapse).toHaveAttribute('aria-expanded', 'true')
    await expect.element(page.getByText(LONG_OUTPUT)).toBeVisible()

    await collapse.click()
    await expect.element(reveal).toHaveAttribute('aria-expanded', 'false')
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

  it('a call waiting on approval keeps its row free of the ask, which the dock block answers', async () => {
    const decisions: Array<{id: string; approved: boolean}> = []
    const asking: ToolCallPart = {
      ...call('Bash', {command: 'rm -rf dist'}, 'approval-requested'),
      approval: {id: 'ap-1', needsApproval: true},
    }
    const row = render(() => (
      <ToolTraceRow part={asking} result={undefined} ctx={ctxRecording(decisions)} tools={() => []} />
    ))

    await expect.element(page.getByText('rm -rf dist').first()).toBeVisible()
    await expect.element(page.getByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
    row.unmount()

    mountView(() => <TracePermissionBlock part={asking} ctx={ctxRecording(decisions)} target="Bash" />)
    await expect.element(page.getByRole('group', {name: 'Permission request'})).toBeVisible()

    await page.getByRole('button', {name: 'Approve'}).click()

    await expect.element(page.getByText('Approved', {exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Approve'})).not.toBeInTheDocument()
    expect(decisions).toEqual([{id: 'ap-1', approved: true}])
  })
})

describe('trace row card header', () => {
  const ctx = ctxWith(makeCatalog({}))

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

describe('a failed tool row', () => {
  const closedRows: ToolDisclosure = {open: () => undefined, setOpen: () => {}}
  const legacyBash: ToolCardEntry = {
    names: ['Bash'],
    render: () => <p>the legacy bash card</p>,
    hasEmbeddedBody: () => true,
  }

  it('reads its title, subtitle and error summary, and opens to the error with its copy button', async () => {
    mountView(() => (
      <>
        <section aria-label="failed bash">
          <ToolPartRow
            part={{...cardPart('Bash', {command: 'make'}), id: 'bash-1'}}
            result={{type: 'tool-result', toolCallId: 'bash-1', content: 'make: no rule', state: 'error'}}
            ctx={INERT_TOOL_CTX}
            entries={[legacyBash]}
            render={undefined}
            renderPending={false}
            disclosure={closedRows}
            chain={false}
          />
        </section>
        <section aria-label="failed lookup">
          <ToolPartRow
            part={{...cardPart('lookup', {}), id: 'lookup-1'}}
            result={{
              type: 'tool-result',
              toolCallId: 'lookup-1',
              content: '',
              state: 'error',
              error: 'the lookup timed out',
            }}
            ctx={INERT_TOOL_CTX}
            entries={[]}
            render={undefined}
            renderPending={false}
            disclosure={closedRows}
            chain={false}
          />
        </section>
        <section aria-label="failed shell">
          <ToolDisplay
            id="shell-1"
            tool="shell"
            input={{command: 'cargo build'}}
            metadata={{}}
            status="error"
            error="Error: exit code 1: two crates failed"
          />
        </section>
        <section aria-label="failed search">
          <ToolDisplay
            id="search-1"
            tool="websearch"
            input={{query: 'solid stores'}}
            metadata={{provider: 'tinyfish'}}
            status="error"
            error="rate limited"
          />
        </section>
      </>
    ))

    const shell = page.getByRole('region', {name: 'failed shell', exact: true})
    const shellRow = shell.getByRole('button', {name: /Shell cargo build Exit code 1/})
    await expect.element(shellRow).toBeVisible()
    await expect.element(shell.getByRole('img', {name: 'error'})).toBeVisible()
    await expect.element(shell.getByRole('button', {name: 'Copy error'})).not.toBeInTheDocument()
    await userEvent.click(shellRow)
    await expect.element(shell.getByText('exit code 1: two crates failed', {exact: true})).toBeVisible()
    await expect.element(shell.getByText('Exit code 1', {exact: true})).not.toBeInTheDocument()
    await expect.element(shell.getByRole('button', {name: 'Copy error'})).toBeVisible()

    const search = page.getByRole('region', {name: 'failed search', exact: true})
    await expect
      .element(search.getByRole('button', {name: /TinyFish Web Search solid stores Rate limited/}))
      .toBeVisible()

    const bash = page.getByRole('region', {name: 'failed bash', exact: true})
    await expect.element(bash.getByRole('img', {name: 'error'})).toBeVisible()
    await expect.element(bash.getByText('the legacy bash card')).not.toBeInTheDocument()

    const lookup = page.getByRole('region', {name: 'failed lookup', exact: true})
    await expect.element(lookup.getByRole('button', {name: /lookup The lookup timed out/})).toBeVisible()
  })
})
