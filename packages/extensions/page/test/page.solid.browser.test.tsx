import {expect, it, test, describe} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import type {ChatPart, ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ActCard} from '../src/client/cards/act-card.js'
import {storyAddResult, storyCtx, storyPart, storyResult} from '../src/client/cards/story.fixtures.js'
import {ReactCard} from '../src/client/cards/react-card.js'
import {ReadBulkCard} from '../src/client/cards/read-bulk-card.js'
import {ReadValueCard} from '../src/client/cards/read-value-card.js'
import {GRAB_FILE_NAME, GRAB_MIME} from '@conciv/grab/grab-attachment'
import {GrabCard} from '../src/client/cards/grab-card.js'
import {mountAttachment} from './fixtures/attachment-harness.js'
import {GrabSnapshotFrame} from '../src/client/cards/grab-snapshot-frame.js'
import {createSignal, type JSX} from 'solid-js'
import {PAGE_SESSION_GROUP_KEY, type GroupNodeGroup, type PageSessionThinkingPart} from '@conciv/ui-kit-chat'
import {SessionCard} from '../src/client/cards/session-card.js'

describe('act card body nonempty', () => {
  function errorResult(toolCallId: string, message: string): ToolResultPart {
    return {type: 'tool-result', toolCallId, content: JSON.stringify({message}), state: 'error', error: message}
  }

  const NO_SCHEMA_META: ToolViewMeta = {
    summary: 'run a synthetic effect with no declared inputs',
    category: 'act',
    mutating: true,
    mirrors: false,
  }

  const FILL_META: ToolViewMeta = {
    summary: 'type a value into a form field',
    category: 'act',
    mutating: true,
    mirrors: false,
    inputSchema: {
      type: 'object',
      properties: {selector: {type: 'string'}, value: {type: 'string'}},
      required: ['value'],
    },
  }

  async function expandFirstCard(): Promise<void> {
    await page.getByRole('button').first().click()
  }

  it('shows a quiet no-input row instead of an empty strip for a zero-input act call', async () => {
    render(() => (
      <ActCard
        part={storyPart('page_effect', {})}
        result={undefined}
        ctx={storyCtx({page_effect: NO_SCHEMA_META})}
        addResult={storyAddResult}
      />
    ))

    await expandFirstCard()
    await expect.element(page.getByText('no input')).toBeVisible()
  })

  it('shows its input chips while running with no result yet', async () => {
    render(() => (
      <ActCard
        part={storyPart('page_fill', {selector: '#email', value: 'ada@example.com'}, 'input-complete')}
        result={undefined}
        ctx={storyCtx({page_fill: FILL_META})}
        addResult={storyAddResult}
      />
    ))

    await expandFirstCard()
    await expect.element(page.getByText('ada@example.com')).toBeVisible()
    await expect.element(page.getByText('#email')).toBeVisible()
  })

  it('shows the error block alongside its input chips for an error-only result', async () => {
    render(() => (
      <ActCard
        part={storyPart('page_fill', {selector: '#email', value: 'ada@example.com'})}
        result={errorResult('s1', 'element not found')}
        ctx={storyCtx({page_fill: FILL_META})}
        addResult={storyAddResult}
      />
    ))

    await expandFirstCard()
    await expect.element(page.getByText('ada@example.com')).toBeVisible()
    await expect.element(page.getByText('element not found')).toBeVisible()
  })
})

describe('card input chips', () => {
  const READ_VALUE_META: ToolViewMeta = {
    summary: 'read the visible text of an element',
    category: 'read',
    mutating: false,
    mirrors: false,
    inputSchema: {
      type: 'object',
      properties: {selector: {type: 'string'}, trim: {type: 'boolean'}},
      required: ['selector'],
    },
  }

  const READ_BULK_META: ToolViewMeta = {
    summary: 'read the markup of an element',
    category: 'read',
    mutating: false,
    mirrors: false,
    inputSchema: {
      type: 'object',
      properties: {selector: {type: 'string'}, maxChars: {type: 'number'}},
      required: ['selector'],
    },
  }

  const REACT_META: ToolViewMeta = {
    summary: 'locate the react source of an element',
    category: 'read',
    mutating: false,
    mirrors: false,
    inputSchema: {
      type: 'object',
      properties: {selector: {type: 'string'}, action: {type: 'string'}},
      required: ['selector'],
    },
  }

  async function expandCard(): Promise<void> {
    await page.getByRole('button').first().click()
  }

  function chipNames(): Array<string> {
    return page
      .getByRole('term')
      .elements()
      .map((element) => element.textContent ?? '')
  }

  it('read-value card leads its input row with the element chip and drops the raw selector key', async () => {
    render(() => (
      <ReadValueCard
        part={storyPart('page_text', {selector: '#headline', trim: true})}
        result={storyResult({text: 'Ship it on Friday'})}
        ctx={storyCtx({page_text: READ_VALUE_META})}
        addResult={storyAddResult}
      />
    ))

    await expandCard()
    await expect.element(page.getByText('#headline')).toBeVisible()

    expect(chipNames()[0]).toBe('element')
    expect(chipNames()).toContain('trim')
    expect(chipNames()).not.toContain('selector')
  })

  it('read-value card renders a root array result as a structured JSON tree, not a flat chip row', async () => {
    render(() => (
      <ReadValueCard
        part={storyPart('page_text', {selector: '.item'})}
        result={storyResult(['first-item-marker', 'second-item-marker'])}
        ctx={storyCtx({page_text: READ_VALUE_META})}
        addResult={storyAddResult}
      />
    ))

    await expandCard()
    await expect.element(page.getByRole('treeitem', {name: /Array\(2\)/})).toBeVisible()
    await expect.element(page.getByText(/first-item-marker.*second-item-marker/).first()).toBeVisible()
  })

  it('read-bulk card leads its input row with the element chip and keeps the declared detail chip', async () => {
    render(() => (
      <ReadBulkCard
        part={storyPart('page_html', {selector: 'form', maxChars: 2000})}
        result={storyResult({html: '<form></form>'})}
        ctx={storyCtx({page_html: READ_BULK_META})}
        addResult={storyAddResult}
      />
    ))

    await expandCard()
    await expect.element(page.getByText('form').first()).toBeVisible()

    expect(chipNames()[0]).toBe('element')
    expect(chipNames()).toContain('maxChars')
    expect(chipNames()).not.toContain('selector')
  })

  it('react card leads its input row with the element chip and keeps the declared detail chip', async () => {
    render(() => (
      <ReactCard
        part={storyPart('page_react', {selector: '#checkout', action: 'source'})}
        result={storyResult({component: 'CheckoutForm'})}
        ctx={storyCtx({page_react: REACT_META})}
        addResult={storyAddResult}
      />
    ))

    await expandCard()
    await expect.element(page.getByText('#checkout')).toBeVisible()

    expect(chipNames()[0]).toBe('element')
    expect(chipNames()).toContain('action')
    expect(chipNames()).not.toContain('selector')
  })
})

describe('grab card', () => {
  const PAYLOAD = JSON.stringify({
    text: '<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9',
    snippet: '<h1 class="title">Start simple</h1>',
    source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
    rect: {x: 0, y: 0, width: 320, height: 48},
    preview: {kind: 'dom', html: '<h1>Start simple</h1>', width: 320, height: 48},
  })

  function mount(payload: string = PAYLOAD) {
    return render(() => mountAttachment(new File([payload], GRAB_FILE_NAME, {type: GRAB_MIME}), () => <GrabCard />))
  }

  test('the card shows the snapshot and its source label', async () => {
    mount()

    await expect.element(page.getByTitle('Grabbed element snapshot')).toBeVisible()
    await expect.element(page.getByText('Hero at src/routes/index.tsx:12', {exact: false})).toBeVisible()
  })

  test('clicking the card opens a dialog that can reveal the agent text', async () => {
    mount()

    await userEvent.click(page.getByRole('button', {name: 'Open grabbed element'}))
    await expect.element(page.getByRole('dialog', {name: 'Grabbed element'})).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: 'What the agent sees'}))

    await expect
      .element(page.getByText('<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9'))
      .toBeVisible()
  })

  test('a payload with no preview falls back to the agent text', async () => {
    mount(JSON.stringify({text: 'grabbed thing at a.tsx:1:1', source: null, rect: null, preview: null}))

    await expect.element(page.getByText('grabbed thing at a.tsx:1:1')).toBeVisible()
  })

  test('an unreadable payload reports that the grab could not be read', async () => {
    mount('not a grab payload at all')

    await expect.element(page.getByRole('status')).toHaveTextContent('Grabbed element could not be read')
  })

  test('an image preview renders as the snapshot image', async () => {
    mount(
      JSON.stringify({
        text: 'grabbed thing at a.tsx:1:1',
        source: null,
        rect: null,
        preview: {
          kind: 'image',
          dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
          width: 40,
          height: 20,
        },
      }),
    )

    await expect.element(page.getByRole('img', {name: 'Grabbed element snapshot'})).toBeVisible()
  })
})

describe('grab snapshot frame', () => {
  function hostileMarkup(marker: string): string {
    return `<img src="x" onerror="window.parent.document.body.insertAdjacentHTML('beforeend', '<p>${marker}</p>')">`
  }

  test('the snapshot frame renders the markup in its own document', async () => {
    render(() => (
      <GrabSnapshotFrame html="<p>Payroll Deposit clone</p>" width={200} height={40} class="max-w-full block" />
    ))

    await expect.element(page.getByTitle('Grabbed element snapshot')).toBeVisible()
  })

  test('inline handlers in captured markup never run inside the widget', async () => {
    render(() => (
      <>
        <iframe title="Unsandboxed control" srcdoc={hostileMarkup('control escaped')} />
        <GrabSnapshotFrame html={hostileMarkup('snapshot escaped')} width={200} height={40} class="max-w-full block" />
      </>
    ))

    await expect.element(page.getByText('control escaped')).toBeVisible()
    await expect.element(page.getByText('snapshot escaped')).not.toBeInTheDocument()
  })
})

describe('read value card image', () => {
  const SCREENSHOT_META: ToolViewMeta = {
    summary: 'capture the visible viewport as a webp image',
    category: 'read',
    icon: 'read',
    label: {running: 'Taking a screenshot', done: 'Took a screenshot'},
    mutating: false,
    mirrors: false,
  }

  function webpBase64(): string {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 6
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no 2d context to paint the fixture image')
    context.fillStyle = 'rgb(0, 128, 255)'
    context.fillRect(0, 0, 8, 6)
    return canvas.toDataURL('image/webp').split(',')[1] ?? ''
  }

  it('shows an image result as the picture, not as a tree of its base64 parts', async () => {
    const image = webpBase64()
    render(() => (
      <ReadValueCard
        part={storyPart('page_screenshot', {})}
        result={storyResult([
          {type: 'image', source: {type: 'data', value: image, mimeType: 'image/webp'}},
          {type: 'text', content: JSON.stringify({width: 8, height: 6})},
        ])}
        ctx={storyCtx({page_screenshot: SCREENSHOT_META})}
        addResult={storyAddResult}
      />
    ))

    await page.getByRole('button').first().click()
    await expect.element(page.getByRole('img', {name: 'Took a screenshot'})).toBeVisible()
    await expect.element(page.getByRole('tree')).not.toBeInTheDocument()
  })
})

describe('session card', () => {
  function mount(view: () => JSX.Element): void {
    render(view)
  }

  function sessionNode(parts: readonly ChatPart[]): GroupNodeGroup {
    return {
      type: 'group',
      key: PAGE_SESSION_GROUP_KEY,
      nodeKey: '',
      idKey: undefined,
      indices: parts.map((_, index) => index),
      children: [],
    }
  }

  function toolCall(
    id: string,
    name: string,
    input: Record<string, unknown>,
    state: ToolCallPart['state'],
  ): ToolCallPart {
    return {type: 'tool-call', id, name, arguments: JSON.stringify(input), input, state}
  }

  function fillCall(id: string, selector: string, value: string): ToolCallPart {
    return toolCall(id, 'page_fill', {selector, value}, 'input-complete')
  }

  function okResult(id: string): ToolResultPart {
    return {type: 'tool-result', toolCallId: id, content: '{"ok":true}', state: 'complete'}
  }

  function errorResult(id: string, message: string): ToolResultPart {
    return {type: 'tool-result', toolCallId: id, content: JSON.stringify({message}), state: 'error', error: message}
  }

  function lookup(results: Record<string, ToolResultPart>): (id: string) => ToolResultPart | undefined {
    return (id) => results[id]
  }

  async function mountSettled(
    parts: readonly ChatPart[],
    results: Record<string, ToolResultPart>,
    title: RegExp,
  ): Promise<void> {
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
    ))
    await expect.element(page.getByRole('button', {name: title})).toHaveAttribute('aria-expanded', 'true')
  }

  test('streamed act appends and token growth keep the existing step-rail rows mounted', async () => {
    const [parts, setParts] = createSignal<ToolCallPart[]>([fillCall('f1', '#name', 'Ada')])
    const results = {f1: okResult('f1')}
    mount(() => <SessionCard node={sessionNode(parts())} parts={parts} resultFor={lookup(results)} streaming={true} />)

    const rows = () => page.getByRole('listitem').elements()
    await expect.element(page.getByText('#name')).toBeVisible()
    const firstRow = rows()[0]

    setParts((previous) => [...previous, fillCall('f2', '#email', 'ada@')])
    await expect.element(page.getByText('Typing #email…')).toBeVisible()
    expect(rows()[0]).toBe(firstRow)
    const secondRow = rows()[1]

    setParts((previous) => [...previous.slice(0, 1), fillCall('f2', '#email', 'ada@example.com')])
    await expect.element(page.getByText('“ada@example.com”')).toBeVisible()
    expect(rows()[0]).toBe(firstRow)
    expect(rows()[1]).toBe(secondRow)
  })

  test('a streaming act outside the shorthand verbs still reads as a running phrase', async () => {
    const parts: ToolCallPart[] = [toolCall('h1', 'page_hover', {selector: '#menu'}, 'input-complete')]
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={() => undefined} streaming={true} />
    ))

    await expect.element(page.getByText('Hovering #menu…')).toBeVisible()
  })

  const SCRIPT = "await external_page_settext({selector: '#prose', text: 'better prose'})"

  const codeRun = (id: string): ToolCallPart => toolCall(id, 'execute_typescript', {typescriptCode: SCRIPT}, 'complete')

  const THINKING: PageSessionThinkingPart[] = [{type: 'thinking', content: 'choose the field wisely'}]

  test('a settled session shows its folded reasoning and script in a collapsed flat section', async () => {
    const results = {p1: okResult('p1'), f1: okResult('f1')}
    const parts: ChatPart[] = [
      ...THINKING,
      codeRun('p1'),
      toolCall('f1', 'page_fill', {selector: '#prose', value: 'better prose'}, 'complete'),
    ]
    await mountSettled(parts, results, /Edited the page/)

    const section = page.getByRole('button', {name: 'Reasoning · script'})
    await expect.element(section).toBeVisible()
    await expect.element(page.getByText('choose the field wisely')).not.toBeInTheDocument()
    await section.click()
    await expect.element(page.getByText('choose the field wisely')).toBeVisible()
    await expect.element(page.getByText(/external_page_settext/).first()).toBeVisible()
  })

  test('an expanded session shows its step rail without a tool-input row of its own', async () => {
    const results = {f1: okResult('f1')}
    const parts: ToolCallPart[] = [toolCall('f1', 'page_fill', {selector: '#name', value: 'Ada'}, 'complete')]

    await mountSettled(parts, results, /Edited the page/)

    await expect.element(page.getByText('#name')).toBeVisible()
    await expect.element(page.getByText('no input')).not.toBeInTheDocument()
  })

  test('a session whose only error is the folded script run reports error status', async () => {
    const results = {p1: errorResult('p1', 'Script exploded'), f1: okResult('f1')}
    const parts: ToolCallPart[] = [
      codeRun('p1'),
      toolCall('f1', 'page_fill', {selector: '#prose', value: 'x'}, 'complete'),
    ]
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
    ))

    await expect.element(page.getByText('Edited the page')).toBeVisible()
    expect(page.getByRole('img', {name: 'error'}).elements().length).toBeGreaterThan(0)
    expect(page.getByRole('img', {name: 'complete'}).elements()).toHaveLength(0)
  })

  test('a settled session without a folded route result shows no location pill', async () => {
    const results = {f1: okResult('f1')}
    const parts: ToolCallPart[] = [toolCall('f1', 'page_fill', {selector: '#name', value: 'Ada'}, 'complete')]
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
    ))

    await expect.element(page.getByText('Edited the page')).toBeVisible()
    expect(document.body.textContent).not.toContain(location.host)
  })

  const SCRIPT_LINE = "const rows = document.querySelectorAll('tr')"

  test('a script step reads its own first code line, with no duplicate value pill beside it', async () => {
    const results = {s1: okResult('s1')}
    const parts: ToolCallPart[] = [
      toolCall('s1', 'page_eval', {code: `${SCRIPT_LINE}\nreturn rows.length`}, 'complete'),
    ]

    await mountSettled(parts, results, /Ran script on the page/)

    await expect.element(page.getByRole('listitem')).toMatchTextContent(SCRIPT_LINE)
    expect(page.getByText('script', {exact: true}).query()).toBeNull()
    expect(document.body.textContent).not.toContain(`“${SCRIPT_LINE}”`)
  })

  test('a streaming session without a route result shows the current location honestly', async () => {
    const parts: ToolCallPart[] = [toolCall('f1', 'page_fill', {selector: '#name', value: 'Ada'}, 'input-complete')]
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={() => undefined} streaming={true} />
    ))

    await expect.element(page.getByText('Editing the page')).toBeVisible()
    expect(document.body.textContent).toContain(location.host)
  })
})
