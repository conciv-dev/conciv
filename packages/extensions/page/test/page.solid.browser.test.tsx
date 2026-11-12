import {expect, it, onTestFinished, test, describe} from 'vitest'
import {cdp, page, userEvent} from 'vitest/browser'
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
import {createStore} from 'solid-js/store'
import {PAGE_SESSION_GROUP_KEY, type GroupNodeGroup, type PageSessionThinkingPart} from '@conciv/ui-kit-chat'
import {SessionCard} from '../src/client/cards/session-card.js'
import {collectClientTools} from '@conciv/extension'
import {makeDomPageDriver, MASKED_VALUE, startPagePlane} from '@conciv/page'
import type {PageOutcome} from '@conciv/protocol/page-types'
import {Menu} from '@conciv/ui-kit-system'
import pageExtension from '../src/client.js'
import {endTask, mountSimulator, startTask} from '../src/client/simulator.js'
import {aimCursor, CursorLook, dropCursor, windowAt} from '../src/client/agent-cursor.js'

describe('act card body nonempty', () => {
  function errorResult(toolCallId: string, message: string): ToolResultPart {
    return {type: 'tool-result', toolCallId, content: JSON.stringify({message}), state: 'error', error: message}
  }

  const NO_SCHEMA_META: ToolViewMeta = {
    summary: 'run a synthetic effect with no declared inputs',
    category: 'act',
    mutating: true,
  }

  const FILL_META: ToolViewMeta = {
    summary: 'type a value into a form field',
    category: 'act',
    mutating: true,
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
          {type: 'text', content: JSON.stringify({width: 8, height: 6, path: 'tmp/screenshots/shot.webp'})},
        ])}
        ctx={storyCtx({page_screenshot: SCREENSHOT_META})}
        addResult={storyAddResult}
      />
    ))

    await page.getByRole('button').first().click()
    await expect.element(page.getByRole('img', {name: 'Took a screenshot'})).toBeVisible()
    await expect.element(page.getByRole('tree')).not.toBeInTheDocument()
  })

  describe('viewer', () => {
    const THUMBNAIL = 'Open Took a screenshot'
    const VIEWER = 'Took a screenshot'

    it('clicking the thumbnail opens a dialog with the full image', async () => {
      await mountExpandedCard()

      await page.getByRole('button', {name: THUMBNAIL}).click()

      const viewer = page.getByRole('dialog', {name: VIEWER})
      await expect.element(viewer).toBeVisible()
      await expect.element(viewer.getByRole('img', {name: VIEWER})).toBeVisible()
    })

    it('escape closes the viewer and puts a visible focus back on the thumbnail', async () => {
      await mountExpandedCard()
      const thumbnail = page.getByRole('button', {name: THUMBNAIL})
      await thumbnail.click()
      await expect.element(page.getByRole('dialog', {name: VIEWER})).toBeVisible()

      await userEvent.keyboard('{Escape}')

      await expect.element(page.getByRole('dialog', {name: VIEWER})).not.toBeInTheDocument()
      await expect.element(thumbnail).toHaveFocus()
      expect(document.activeElement?.matches(':focus-visible')).toBe(true)
    })

    it('enter on the focused thumbnail opens the viewer', async () => {
      await mountExpandedCard()
      const thumbnail = page.getByRole('button', {name: THUMBNAIL})
      await userEvent.tab()
      await expect.element(thumbnail).toHaveFocus()

      await userEvent.keyboard('{Enter}')

      await expect.element(page.getByRole('dialog', {name: VIEWER})).toBeVisible()
    })

    it('the close button closes the viewer', async () => {
      await mountExpandedCard()
      await page.getByRole('button', {name: THUMBNAIL}).click()

      await page.getByRole('button', {name: 'Close'}).click()

      await expect.element(page.getByRole('dialog', {name: VIEWER})).not.toBeInTheDocument()
    })

    it('clicking the image toggles actual size, and reopening starts fitted again', async () => {
      await mountExpandedCard()
      const thumbnail = page.getByRole('button', {name: THUMBNAIL})
      await thumbnail.click()

      await page.getByRole('button', {name: 'Show actual size'}).click()
      await page.getByRole('button', {name: 'Fit to window'}).click()
      await page.getByRole('button', {name: 'Show actual size'}).click()

      await userEvent.keyboard('{Escape}')
      await expect.element(page.getByRole('dialog', {name: VIEWER})).not.toBeInTheDocument()
      await thumbnail.click()
      await expect.element(page.getByRole('button', {name: 'Show actual size'})).toBeVisible()
    })

    it('an image that cannot load says so instead of offering a broken viewer', async () => {
      await mountExpandedCard({image: 'QUJD'})

      await expect.element(page.getByText('Could not load Took a screenshot')).toBeVisible()
      await expect.element(page.getByRole('button', {name: THUMBNAIL})).not.toBeInTheDocument()
    })

    it('a failed image recovers when its source changes to one that loads', async () => {
      const [source, setSource] = createStore({image: 'QUJD'})
      await mountExpandedCard(source)
      await expect.element(page.getByText('Could not load Took a screenshot')).toBeVisible()

      setSource('image', webpBase64())

      await expect.element(page.getByRole('button', {name: THUMBNAIL})).toBeVisible()
      await expect.element(page.getByText('Could not load Took a screenshot')).not.toBeInTheDocument()
    })

    async function mountExpandedCard(source: {image: string} = {image: webpBase64()}): Promise<void> {
      render(() => (
        <ReadValueCard
          part={storyPart('page_screenshot', {})}
          result={storyResult([
            {type: 'image', source: {type: 'data', value: source.image, mimeType: 'image/webp'}},
            {type: 'text', content: JSON.stringify({width: 8, height: 6, path: 'tmp/screenshots/shot.webp'})},
          ])}
          ctx={storyCtx({page_screenshot: SCREENSHOT_META})}
          addResult={storyAddResult}
        />
      ))
      await page.getByRole('button').first().click()
    }
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

describe('the agent acts on the page like a person', () => {
  const AGENT = 'agent-session'

  function AgentPage() {
    const [name, setName] = createSignal('')
    const [count, setCount] = createSignal(0)
    const [frozen, setFrozen] = createSignal(false)
    return (
      <div>
        <Menu.Root>
          <Menu.Trigger id="actions">Actions</Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content>
              <Menu.Item value="archive">Archive</Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
        <label>
          Name
          <input id="name" onInput={(event) => setName(event.currentTarget.value)} />
        </label>
        <p>Hello, {name()}</p>
        <button id="count" onClick={() => setCount((value) => value + 1)}>
          Count
        </button>
        <p>{count()} clicks</p>
        <button id="hidden" hidden>
          Hidden
        </button>
        <button id="disabled" disabled>
          Disabled
        </button>
        <label>
          <input id="locked" type="checkbox" disabled />
          Locked
        </label>
        <div
          id="frozen"
          role="checkbox"
          aria-label="Frozen"
          aria-checked={frozen()}
          aria-disabled="true"
          onClick={() => setFrozen((value) => !value)}
        />
      </div>
    )
  }

  it('opens a pointerdown menu, types into a focused field, shields the page, stops on two clicks, refuses what a person could not use', async () => {
    const [stopped, setStopped] = createSignal('')
    render(() => (
      <div>
        <AgentPage />
        <p>stopped {stopped()}</p>
      </div>
    ))
    const host = document.createElement('div')
    host.setAttribute('data-conciv-root', '')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const unmountSimulator = mountSimulator({
      root: host.attachShadow({mode: 'open'}),
      session: () => AGENT,
      onStop: (sessionId) => {
        setStopped(sessionId)
        endTask()
      },
    })
    const driver = makeDomPageDriver({tools: collectClientTools([pageExtension])})
    onTestFinished(() => driver.dispose())
    const act = (name: string, input: Record<string, unknown>) =>
      driver.execute({agentId: AGENT, name: `page_${name}`, input})

    expect(await act('click', {selector: '#actions'})).toMatchObject({ok: true})
    await expect.element(page.getByRole('menuitem', {name: 'Archive'})).toBeVisible()
    await expect.element(page.getByRole('menu')).toHaveFocus()

    expect(await act('fill', {selector: '#name', value: 'Ada'})).toMatchObject({ok: true})
    await expect.element(page.getByRole('textbox', {name: 'Name'})).toHaveFocus()
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(page.getByText('Hello, Ada')).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: 'Count'}), {force: true})
    await expect.element(page.getByText('Click again to stop me')).toBeVisible()
    await expect.element(page.getByText('0 clicks')).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: 'Count'}), {force: true})
    await expect.element(page.getByText(`stopped ${AGENT}`)).toBeVisible()
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', {name: 'Count'}))
    await expect.element(page.getByText('1 clicks')).toBeVisible()

    expect(await act('click', {selector: '#hidden'})).toMatchObject({
      ok: false,
      error: {code: 'invalid-args', message: 'That element is not visible.'},
    })
    expect(await act('click', {selector: '#disabled'})).toMatchObject({
      ok: false,
      error: {code: 'invalid-args', message: 'That element is disabled.'},
    })
    expect(await act('check', {selector: '#locked'})).toMatchObject({
      ok: false,
      error: {code: 'invalid-args', message: 'That element is disabled.'},
    })
    expect(await act('check', {selector: '#frozen'})).toMatchObject({
      ok: false,
      error: {code: 'invalid-args', message: 'That element is disabled.'},
    })
    await expect.element(page.getByRole('checkbox', {name: 'Frozen'})).not.toBeChecked()

    unmountSimulator()
    host.remove()
    const remounted = document.createElement('div')
    remounted.setAttribute('data-conciv-root', '')
    document.body.append(remounted)
    onTestFinished(() => remounted.remove())
    onTestFinished(
      mountSimulator({root: remounted.attachShadow({mode: 'open'}), session: () => AGENT, onStop: endTask}),
    )
    expect(await act('fill', {selector: '#name', value: 'Grace'})).toMatchObject({ok: true})
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).toBeVisible()
  })
})

describe('the agent cursor always arrives', () => {
  const AGENT = 'cursor-session'

  function mountedAgent(): void {
    const host = document.createElement('div')
    host.setAttribute('data-conciv-root', '')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const unmount = mountSimulator({root: host.attachShadow({mode: 'open'}), session: () => AGENT, onStop: endTask})
    onTestFinished(unmount)
    startTask(AGENT)
    onTestFinished(endTask)
  }

  it('an aim replaced by a newer one settles instead of hanging', async () => {
    mountedAgent()
    const first = aimCursor({id: AGENT, at: windowAt({x: 10, y: 10}), look: CursorLook.AGENT})
    const second = aimCursor({id: AGENT, at: windowAt({x: 200, y: 200}), look: CursorLook.AGENT})
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
  })

  it('an aim whose cursor is dropped settles', async () => {
    mountedAgent()
    const aimed = aimCursor({id: AGENT, at: windowAt({x: 300, y: 40}), look: CursorLook.AGENT})
    dropCursor(AGENT)
    await expect(aimed).resolves.toBeUndefined()
  })

  it('an aim at a point off the screen settles at once', async () => {
    mountedAgent()
    await expect(
      aimCursor({id: AGENT, at: windowAt({x: -500, y: -500}), look: CursorLook.AGENT}),
    ).resolves.toBeUndefined()
  })
})

describe('page action queue', () => {
  const AGENT = 'queue-session'
  const FIELDS = ['first', 'last', 'email', 'phone', 'city', 'zip']

  type Frame = {requestId: string; query: unknown}

  async function* streamed(frames: Frame[], wake: {now: () => void}, signal: AbortSignal): AsyncGenerator<Frame> {
    while (!signal.aborted) {
      const frame = frames.shift()
      if (frame !== undefined) {
        yield frame
        continue
      }
      await new Promise<void>((resolve) => {
        wake.now = resolve
        signal.addEventListener('abort', () => resolve(), {once: true})
      })
    }
  }

  function QueueForm(props: {heard: (event: string) => void}) {
    const field = (name: string) => (
      <label>
        {name}
        <input name={name} onInput={() => props.heard(name)} />
      </label>
    )
    return (
      <form onSubmit={(event) => event.preventDefault()}>
        {FIELDS.map(field)}
        <label>
          card
          <input name="card" autocomplete="cc-number" onInput={() => props.heard('card')} />
        </label>
        <label>
          locked
          <input name="locked" readOnly value="fixed" />
        </label>
        <label>
          <input type="checkbox" name="agree" onChange={() => props.heard('agree')} />
          agree
        </label>
        <button type="button" onKeyDown={(event) => props.heard(`key ${event.key}`)}>
          Send
        </button>
        <div id="notes" contenteditable="true" role="textbox" aria-label="Notes">
          <p id="notes-line">old note</p>
        </div>
      </form>
    )
  }

  function queuePage(delivered: (requestId: string) => Promise<void> = () => Promise.resolve()) {
    const heard: string[] = []
    render(() => <QueueForm heard={(event) => heard.push(event)} />)
    const host = document.createElement('div')
    host.setAttribute('data-conciv-root', '')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const unmount = mountSimulator({root: host.attachShadow({mode: 'open'}), session: () => AGENT, onStop: endTask})
    onTestFinished(unmount)
    onTestFinished(endTask)
    const replied: string[] = []
    const replies = new Map<string, PromiseWithResolvers<PageOutcome>>()
    const replyTo = (requestId: string): PromiseWithResolvers<PageOutcome> => {
      const known = replies.get(requestId)
      if (known !== undefined) return known
      const made = Promise.withResolvers<PageOutcome>()
      replies.set(requestId, made)
      return made
    }
    const served = () => {
      const frames: Frame[] = []
      const wake = {now: () => {}}
      const plane = startPagePlane({
        source: {
          queries: (signal) => streamed(frames, wake, signal ?? new AbortController().signal),
          reply: async ({requestId, outcome}) => {
            await delivered(requestId)
            replied.push(requestId)
            replyTo(requestId).resolve(outcome)
          },
        },
        tools: collectClientTools([pageExtension]),
      })
      onTestFinished(plane.dispose)
      const send = (requestId: string, query: Record<string, unknown>): Promise<PageOutcome> => {
        frames.push({requestId, query: {agentId: AGENT, ...query}})
        wake.now()
        return replyTo(requestId).promise
      }
      const queue = (id: string, actions: Record<string, unknown>[]) => {
        const ids = actions.map((_, index) => `${id}-${index}`)
        const accepted = send(`${id}-accept`, {name: 'page_queue', input: {actions}, queue: {id, replies: ids}})
        return {
          accepted,
          each: ids.map((requestId) => replyTo(requestId).promise),
          played: Promise.all(ids.map((requestId) => replyTo(requestId).promise)),
        }
      }
      return {send, queue, dispose: plane.dispose}
    }
    const first = served()
    const leave = () => {
      first.dispose()
      unmount()
    }
    const switchSession = () => {
      first.dispose()
      return served()
    }
    return {heard, replied, send: first.send, queue: first.queue, leave, switchSession}
  }

  const fill = (name: string, value: string) => ({tool: 'page_fill', selector: `[name=${name}]`, value})

  it('answers at once, then plays fill, check and press in order, each landing after the one before', async () => {
    const {heard, queue} = queuePage()
    const played = queue('q-order', [
      fill('first', 'Ada'),
      fill('last', 'Lovelace'),
      {tool: 'page_check', selector: '[name=agree]'},
      {tool: 'page_press', selector: 'button', key: 'Enter'},
    ])
    expect(await played.accepted).toEqual({ok: true, result: {queueId: 'q-order', status: 'playing', done: 0, of: 4}})
    expect(heard).toEqual([])
    const outcomes = await played.played
    expect(heard).toEqual(['first', 'last', 'agree', 'key Enter'])
    expect(outcomes).toEqual([
      {ok: true, result: {ok: true, value: 'Ada'}},
      {ok: true, result: {ok: true, value: 'Lovelace'}},
      {ok: true, result: {ok: true, checked: true}},
      {ok: true, result: {ok: true}},
    ])
  })

  it('a missing target and a read-only field fail on their own and the rest still play', async () => {
    const {heard, queue} = queuePage()
    const outcomes = await queue('q-skip', [
      fill('first', 'Ada'),
      fill('nope', 'x'),
      fill('locked', 'y'),
      fill('email', 'ada@example.com'),
    ]).played
    expect(outcomes).toMatchObject([
      {ok: true},
      {ok: false, error: {code: 'invalid-args', message: 'no element for selector [name=nope]'}},
      {ok: false, error: {code: 'invalid-args', message: 'That field is read-only.'}},
      {ok: true, result: {value: 'ada@example.com'}},
    ])
    expect(heard).toEqual(['first', 'email'])
  })

  it('an outside queue with no in-page run takes the mask down once it finishes', async () => {
    const {queue} = queuePage()
    const played = queue('q-outside', [fill('first', 'Ada'), fill('last', 'Byron')])
    await played.accepted
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).toBeInTheDocument()
    await played.played
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
  })

  it("a queue cut off by an unmount does not keep a later mount's mask up", async () => {
    const before = queuePage()
    const cut = before.queue('q-cut', [fill('first', 'Ada'), fill('last', 'Lovelace'), fill('email', 'a@b.c')])
    await cut.accepted
    before.leave()
    const after = queuePage()
    await after.queue('q-next', [fill('city', 'Paris')]).played
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
    expect(before.heard).not.toContain('first')
  })

  it('a session switch mid-queue lands nothing more of the old queue, reports none of it, and takes the mask down', async () => {
    const before = queuePage()
    const cut = before.queue('q-switched', [fill('first', 'Ada'), fill('last', 'Lovelace')])
    await cut.accepted
    const after = before.switchSession()
    expect(await after.queue('q-other', [fill('city', 'Paris')]).played).toEqual([
      {ok: true, result: {ok: true, value: 'Paris'}},
    ])
    expect(before.heard).toEqual(['city'])
    expect(before.replied).toEqual(['q-switched-accept', 'q-other-accept', 'q-other-0'])
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
  })

  it('a queue whose acceptance never reached the engine plays nothing', async () => {
    const {heard, queue} = queuePage(async (requestId) => {
      if (requestId === 'q-unsent-accept') throw new Error(`the socket closed before ${requestId} was sent`)
    })
    const outcomes = await queue('q-unsent', [fill('first', 'Ada'), fill('last', 'Byron')]).played
    expect(outcomes).toMatchObject([
      {ok: false, error: {message: expect.stringContaining('did not run')}},
      {ok: false, error: {message: expect.stringContaining('did not run')}},
    ])
    expect(heard).toEqual([])
  })

  it('a queued fill types into a contenteditable editor', async () => {
    const {queue} = queuePage()
    expect(
      await queue('q-editor', [
        fill('first', 'Ada'),
        {tool: 'page_fill', selector: '#notes-line', value: 'Hello editor'},
      ]).played,
    ).toEqual([
      {ok: true, result: {ok: true, value: 'Ada'}},
      {ok: true, result: {ok: true, value: 'Hello editor'}},
    ])
    await expect.element(page.getByRole('textbox', {name: 'Notes'})).toMatchTextContent(/^\s*Hello editor\s*$/)
  })

  it('masks a card number in the result', async () => {
    const {queue} = queuePage()
    expect(await queue('q-mask', [fill('card', '4242424242424242')]).played).toEqual([
      {ok: true, result: {ok: true, value: MASKED_VALUE}},
    ])
  })

  it('two clicks on the mask stop the queue: no action after the stop runs and the mask comes down', async () => {
    const sent = Promise.withResolvers<void>()
    const {heard, queue} = queuePage((requestId) => (requestId === 'q-stop-accept' ? sent.promise : Promise.resolve()))
    const played = queue(
      'q-stop',
      FIELDS.map((name) => fill(name, `${name} value`)),
    )
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).toBeInTheDocument()
    await userEvent.click(page.getByRole('button', {name: 'Send'}), {force: true})
    await userEvent.click(page.getByRole('button', {name: 'Send'}), {force: true})
    sent.resolve()
    const outcomes = await played.played
    expect(outcomes).toEqual(
      FIELDS.map(() =>
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({
            message: 'stopped by the user before this action',
            raised: expect.objectContaining({code: 'QUEUE_STOPPED'}),
          }),
        }),
      ),
    )
    expect(heard).toEqual([])
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
  })

  it('still finishes under reduced motion', async () => {
    const {queue} = queuePage()
    await cdp().send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]})
    onTestFinished(async () => {
      await cdp().send('Emulation.setEmulatedMedia', {features: []})
    })
    expect(await queue('q-reduced', [fill('first', 'Ada'), fill('last', 'Byron')]).played).toMatchObject([
      {ok: true},
      {ok: true},
    ])
  })

  it('a single act call sent while a queue plays lands after the last queued action', async () => {
    const {heard, queue, send} = queuePage()
    const played = queue('q-before', [fill('first', 'Ada'), fill('last', 'Byron'), fill('email', 'ada@example.com')])
    const single = send('single', {name: 'page_fill', input: {selector: '[name=phone]', value: '555'}, mutating: true})
    expect(await single).toMatchObject({ok: true})
    await played.played
    expect(heard).toEqual(['first', 'last', 'email', 'phone'])
  })
})
