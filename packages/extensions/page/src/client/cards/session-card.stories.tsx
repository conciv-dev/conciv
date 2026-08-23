import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createSignal} from 'solid-js'
import {Splitter} from '@conciv/ui-kit-system'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ElementCapture, ToolCaptureView} from '@conciv/protocol/element-capture-types'
import {PAGE_SESSION_GROUP_KEY, ToolProvider, type GroupNodeGroup} from '@conciv/ui-kit-chat'
import {ELEMENT_CAPTURE_FIXTURE_CSS, ELEMENT_CAPTURE_FIXTURE_FULL} from '@conciv/ui-kit-chat/tools'
import {SessionCard} from './session-card.js'
import {storyCtx, storyPart, storyResult} from './story.fixtures.js'

function sessionNode(parts: readonly ToolCallPart[]): GroupNodeGroup {
  return {
    type: 'group',
    key: PAGE_SESSION_GROUP_KEY,
    nodeKey: '',
    idKey: undefined,
    indices: parts.map((_, index) => index),
    children: [],
  }
}

const STAGE = 'p-4 w-[40rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'
const RESIZE_TRIGGER =
  'flex items-center justify-center w-4 shrink-0 cursor-col-resize [background:transparent] [border:none] p-0 rounded-[var(--chat-radius-sm)] focus-visible:[outline:0.125rem_solid_var(--chat-accent)]'
const RESIZE_INDICATOR = 'w-1 h-8 rounded-[var(--chat-radius-pill)] [background:var(--chat-line)]'

function splitOf(parameters: Record<string, unknown>): number[] {
  const value = parameters.cardSplit
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) return value
  return [100, 0]
}

const meta: Meta = {
  title: 'Extensions/Page/tool/SessionCard',
  decorators: [
    (Story, context) => {
      const [size, setSize] = createSignal(splitOf(context.parameters))
      return (
        <div class={STAGE}>
          <Splitter.Root
            panels={[
              {id: 'card', minSize: 40},
              {id: 'space', minSize: 0},
            ]}
            size={size()}
            onResize={(details) => setSize(details.size)}
            keyboardResizeBy={64}
            class="flex w-full"
          >
            <Splitter.Panel id="card" class="min-w-0">
              <Story />
            </Splitter.Panel>
            <Splitter.ResizeTrigger id="card:space" aria-label="Resize card" class={RESIZE_TRIGGER}>
              <Splitter.ResizeTriggerIndicator class={RESIZE_INDICATOR} />
            </Splitter.ResizeTrigger>
            <Splitter.Panel id="space" />
          </Splitter.Root>
        </div>
      )
    },
  ],
}
export default meta
type Story = StoryObj

function fieldCapture(accessibleName: string, value?: string): ToolCaptureView {
  const base: ElementCapture = ELEMENT_CAPTURE_FIXTURE_FULL
  return {
    after: {...base, descriptor: {...base.descriptor, accessibleName, value}},
    css: ELEMENT_CAPTURE_FIXTURE_CSS,
  }
}

const DONE_CAPTURES: Record<string, ToolCaptureView> = {
  c1: fieldCapture('Full name'),
  c3: fieldCapture('Email'),
  c4: fieldCapture('Role'),
}

const SESSION_CAPTURES: Record<string, ToolCaptureView> = {
  ...DONE_CAPTURES,
  c5: fieldCapture('Accept the terms of service'),
}

const ROUTE_RESULT = {pathname: '/form', search: '', href: 'http://localhost:3000/form'}

function sessionParts(lastCall: ToolCallPart): ToolCallPart[] {
  return [
    storyPart('page.fill', {selector: '#fullname', value: 'Omri Katz'}, 'complete', 'c1'),
    storyPart('page.route', {}, 'complete', 'c2'),
    storyPart('page.fill', {selector: '#email', value: 'omri@payzen.com'}, 'complete', 'c3'),
    storyPart('page.select', {selector: '#role', value: 'Full Stack'}, 'complete', 'c4'),
    lastCall,
  ]
}

function settledResults(lastResult: ToolResultPart): Record<string, ToolResultPart> {
  return {
    c1: storyResult({ok: true, value: 'Omri Katz'}, 'complete', 'c1'),
    c2: storyResult(ROUTE_RESULT, 'complete', 'c2'),
    c3: storyResult({ok: true, value: 'omri@payzen.com'}, 'complete', 'c3'),
    c4: storyResult({ok: true, value: 'Full Stack'}, 'complete', 'c4'),
    c5: lastResult,
  }
}

function sessionFrame(
  parts: ToolCallPart[],
  results: Record<string, ToolResultPart>,
  captures: Record<string, ToolCaptureView>,
  streaming: boolean,
) {
  return (
    <ToolProvider value={storyCtx({}, captures)}>
      <SessionCard
        node={sessionNode(parts)}
        parts={() => parts}
        resultFor={(id) => results[id]}
        streaming={streaming}
      />
    </ToolProvider>
  )
}

export const Streaming: Story = {
  render: () =>
    sessionFrame(
      sessionParts(storyPart('page.check', {selector: '#terms'}, 'input-streaming', 'c5')),
      {
        c1: storyResult({ok: true, value: 'Omri Katz'}, 'complete', 'c1'),
        c2: storyResult(ROUTE_RESULT, 'complete', 'c2'),
        c3: storyResult({ok: true, value: 'omri@payzen.com'}, 'complete', 'c3'),
        c4: storyResult({ok: true, value: 'Full Stack'}, 'complete', 'c4'),
      },
      DONE_CAPTURES,
      true,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Editing the page')).toBeVisible()
    await expect(canvas.getByText('acting')).toBeVisible()
    await expect(canvas.getByText('localhost:3000/form')).toBeVisible()
    await expect(canvas.getByText('Full name')).toBeVisible()
    await expect(canvas.getByText('Checking #terms…')).toBeVisible()
    await expect(canvas.getAllByRole('listitem')).toHaveLength(4)
  },
}

export const Settled: Story = {
  render: () =>
    sessionFrame(
      sessionParts(storyPart('page.check', {selector: '#terms'}, 'complete', 'c5')),
      settledResults(storyResult({ok: true}, 'complete', 'c5')),
      SESSION_CAPTURES,
      false,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Edited the page')).toBeVisible()
    await expect(canvas.getByText('4 actions')).toBeVisible()
    expect(canvas.queryByText('Full name')).toBeNull()
    await userEvent.click(canvas.getByRole('button', {name: /Edited the page/}))
    await waitFor(() => expect(canvas.getByText('Full name')).toBeVisible())
    await userEvent.click(canvas.getByRole('button', {name: /Edited the page/}))
    await waitFor(() => expect(canvas.queryByText('Full name')).not.toBeVisible())
    await expect(canvas.getByText('localhost:3000/form')).toBeVisible()
    await userEvent.click(canvas.getByRole('separator', {name: 'Resize card'}))
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    await waitFor(() => expect(canvas.queryByText('localhost:3000/form')).not.toBeVisible())
  },
}

export const Expanded: Story = {
  render: () =>
    sessionFrame(
      sessionParts(storyPart('page.check', {selector: '#terms'}, 'complete', 'c5')),
      settledResults(storyResult({ok: true}, 'complete', 'c5')),
      SESSION_CAPTURES,
      false,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: /Edited the page/}))
    await waitFor(() => expect(canvas.getByText('Accept the terms of service')).toBeVisible())
    await expect(canvas.getByText('localhost:3000/form')).toBeVisible()
    await expect(canvas.getAllByRole('listitem')).toHaveLength(4)
    await expect(canvas.getAllByText('fill')).toHaveLength(2)
    await expect(canvas.getByText('select')).toBeVisible()
    await expect(canvas.getByText('check')).toBeVisible()
    await expect(canvas.getByText('“Omri Katz”')).toBeVisible()
    await expect(canvas.getByText('“omri@payzen.com”')).toBeVisible()
  },
}

export const Aborted: Story = {
  render: () =>
    sessionFrame(
      sessionParts(storyPart('page.check', {selector: '#terms'}, 'complete', 'c5')),
      {
        c1: storyResult({ok: true, value: 'Omri Katz'}, 'complete', 'c1'),
        c2: storyResult(ROUTE_RESULT, 'complete', 'c2'),
        c3: storyResult({ok: true, value: 'omri@payzen.com'}, 'complete', 'c3'),
        c4: storyResult({ok: true, value: 'Full Stack'}, 'complete', 'c4'),
      },
      DONE_CAPTURES,
      false,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: /Edited the page/}))
    await waitFor(() => expect(canvas.getByText('#terms')).toBeVisible())
    await expect(canvas.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()
    await expect(canvas.queryByText('Checking #terms…')).not.toBeInTheDocument()
    await expect(canvas.getAllByRole('listitem')).toHaveLength(4)
  },
}

export const WithError: Story = {
  render: () =>
    sessionFrame(
      sessionParts(storyPart('page.check', {selector: '#terms'}, 'complete', 'c5')),
      settledResults({
        type: 'tool-result',
        toolCallId: 'c5',
        content: JSON.stringify({message: 'element not found: #terms'}),
        state: 'error',
        error: 'element not found: #terms',
      }),
      SESSION_CAPTURES,
      false,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: /Edited the page/}))
    await waitFor(() => expect(canvas.getByText('element not found: #terms')).toBeVisible())
    await expect(canvas.getAllByRole('img', {name: 'error'}).length).toBeGreaterThanOrEqual(1)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(4)
  },
}

const SCRIPT_STEPS: ToolCallPart[] = [
  storyPart('page.eval', {code: "const rows = document.querySelectorAll('tr')\nreturn rows.length"}, 'complete', 's1'),
  storyPart(
    'page.css',
    {text: '.cta, .cta-secondary, .cta-ghost { color: var(--brand); border-radius: 10px }'},
    'complete',
    's2',
  ),
  storyPart('page.eval', {code: 'window.scrollTo({top: 0, behavior: "smooth"})'}, 'complete', 's3'),
]

const SCRIPT_RESULTS: Record<string, ToolResultPart> = {
  s1: storyResult({result: 42}, 'complete', 's1'),
  s2: storyResult({ok: true}, 'complete', 's2'),
  s3: storyResult({result: null}, 'complete', 's3'),
}

export const Scripted: Story = {
  render: () => sessionFrame(SCRIPT_STEPS, SCRIPT_RESULTS, {}, false),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: /Ran script on the page/}))
    await waitFor(() => expect(canvas.getByText("const rows = document.querySelectorAll('tr')")).toBeVisible())
    await expect(canvas.getByText(/\.cta, \.cta-secondary/)).toBeVisible()
    await expect(canvas.queryByText('script')).toBeNull()
  },
}

export const ScriptedNarrow: Story = {
  parameters: {cardSplit: [68, 32]},
  render: () => sessionFrame(SCRIPT_STEPS, SCRIPT_RESULTS, {}, false),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: /Ran script on the page/}))
    await waitFor(() => expect(canvas.getByText("const rows = document.querySelectorAll('tr')")).toBeVisible())
    await expect(canvas.queryByText('script')).toBeNull()
  },
}

export const Narrow: Story = {
  parameters: {cardSplit: [46, 54]},
  render: () =>
    sessionFrame(
      sessionParts(storyPart('page.check', {selector: '#terms'}, 'input-streaming', 'c5')),
      {
        c1: storyResult({ok: true, value: 'Omri Katz'}, 'complete', 'c1'),
        c2: storyResult(ROUTE_RESULT, 'complete', 'c2'),
        c3: storyResult({ok: true, value: 'omri@payzen.com'}, 'complete', 'c3'),
        c4: storyResult({ok: true, value: 'Full Stack'}, 'complete', 'c4'),
      },
      DONE_CAPTURES,
      true,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Editing the page')).toBeVisible()
    await waitFor(() => expect(canvas.queryByText('localhost:3000/form')).not.toBeVisible())
    await expect(canvas.queryByText('4 actions')).not.toBeVisible()
    await expect(canvas.queryByText('“Omri Katz”')).not.toBeVisible()
    await expect(canvas.getByText('Full name')).toBeVisible()
  },
}

export const HeaderSummary: Story = {
  render: () =>
    sessionFrame(
      sessionParts(storyPart('page.check', {selector: '#terms'}, 'complete', 'c5')),
      settledResults(storyResult({ok: true}, 'complete', 'c5')),
      SESSION_CAPTURES,
      false,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByText('Edited the page'))
    await waitFor(() => expect(canvas.getByRole('tooltip')).toHaveTextContent('the AI drove the live page'), {
      timeout: 2000,
    })
  },
}
