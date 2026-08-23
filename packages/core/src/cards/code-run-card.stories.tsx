import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX, Trace, ToolTraceRow} from '@conciv/ui-kit-chat/tools'
import {CodeRunCard, codeRunTool} from './code-run-card.js'

const meta: Meta = {title: 'core/cards/CodeRunCard'}
export default meta
type Story = StoryObj

const CODE = `const drawn = await external_canvas_draw({elements})\nconsole.log('committed', drawn.ids)\nreturn drawn.ids`

function part(state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'c1',
    name: 'execute_typescript',
    arguments: JSON.stringify({typescriptCode: CODE}),
    state,
  }
}

function result(payload: object): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'c1', content: JSON.stringify(payload), state: 'complete'}
}

const okResult = result({success: true, result: ['el_9f2'], logs: ['committed ["el_9f2"]']})
const failResult = result({
  success: false,
  error: {message: "Unexpected token '.'", name: 'SyntaxError', line: 2},
})

function transportFailResult(message: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'c1', content: '{not json', state: 'error', error: message}
}

const garbageFailResult = transportFailResult('sandbox process crashed')

function frame(child: JSX.Element): JSX.Element {
  return <div class="p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
}

async function codeText(root: HTMLElement): Promise<string> {
  return Array.from(root.querySelectorAll('diffs-container'))
    .map((host) => host.shadowRoot?.textContent ?? '')
    .join('\n')
}

export const Running: Story = {
  render: () =>
    frame(
      <CodeRunCard
        part={part('input-complete')}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('exec')).toBeVisible()
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('external_canvas_draw'))
    await expect(await codeText(canvasElement)).toContain('drawn')
    await expect(c.queryByText('console')).toBeNull()
    await expect(c.queryByText(/SyntaxError/)).toBeNull()
    await expect(c.getByLabelText('running')).toBeInTheDocument()
  },
}

export const Success: Story = {
  render: () =>
    frame(<CodeRunCard part={part()} result={okResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('committed ["el_9f2"]'), {timeout: 5000})
    await waitFor(() => expect(c.getByText('result')).toBeVisible())
    await waitFor(() => expect(c.getAllByText(/el_9f2/).length).toBeGreaterThan(0))
    await expect(c.queryByText(/SyntaxError/)).toBeNull()
    await expect(c.queryByLabelText('error')).toBeNull()
    await expect(c.getByLabelText('complete')).toBeInTheDocument()
  },
}

export const Failure: Story = {
  render: () =>
    frame(<CodeRunCard part={part()} result={failResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText(/SyntaxError/)).toBeVisible())
    await expect(c.getByText(/line 2/)).toBeVisible()
    await expect(c.queryByText('result')).toBeNull()
    await expect(c.queryByText('console')).toBeNull()
    await expect(c.getByLabelText('error')).toBeInTheDocument()
  },
}

export const TransportFailure: Story = {
  render: () =>
    frame(<CodeRunCard part={part()} result={garbageFailResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('sandbox process crashed')).toBeVisible())
    await expect(c.queryByText('result')).toBeNull()
    await expect(c.getByLabelText('error')).toBeInTheDocument()
  },
}

const objectResult = result({
  success: true,
  logs: ['audited 3 lanes'],
  result: {status: 'ok', lanes: [{id: 'el_9f2', title: 'Widget shell', open: 2}], checkedAt: '2026-08-23T09:12:00Z'},
})

const stringResult = result({success: true, result: 'the "quoted" bay is clear, all 3 lanes reported in'})

export const ObjectResult: Story = {
  render: () =>
    frame(<CodeRunCard part={part()} result={objectResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getAllByText('status').length).toBeGreaterThan(0))
    await expect(c.getAllByText('lanes').length).toBeGreaterThan(0)
    await expect(canvasElement.textContent).not.toContain('{"status":"ok"')
  },
}

export const StringResult: Story = {
  render: () =>
    frame(<CodeRunCard part={part()} result={stringResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('the "quoted" bay is clear'))
    await expect(canvasElement.textContent).not.toContain('\\"quoted\\"')
    await expect(c.queryByText('console')).toBeNull()
  },
}

export const Themed: Story = {
  render: () =>
    frame(<CodeRunCard part={part()} result={okResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />),
}

function traceGallery(summary: string, callPart: ToolCallPart, callResult: ToolResultPart | undefined): JSX.Element {
  return (
    <div class="p-4 w-[28rem] [background:var(--chat-panel)] [font-family:var(--chat-font)]">
      <Trace
        summary={summary}
        compactLine={summary}
        defaultOpen
        items={[
          {
            key: callPart.id,
            render: (branch) => (
              <ToolTraceRow
                part={callPart}
                result={callResult}
                ctx={INERT_TOOL_CTX}
                tools={() => [codeRunTool]}
                ring={branch.ring}
              />
            ),
          },
        ]}
      />
    </div>
  )
}

export const EmbeddedSuccess: Story = {
  render: () => traceGallery('1 exec', part(), okResult),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('exec')).toBeVisible()
    await expect(c.getByText('ok')).toBeVisible()
    await expect(c.getByText('const drawn = await external_canvas_draw({elements})')).toBeVisible()
    await expect(c.getByRole('button', {name: /external_canvas_draw/})).toBeVisible()
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('committed'))
  },
}

const voidResult = result({success: true, logs: []})

export const EmbeddedVoidResult: Story = {
  render: () => traceGallery('1 exec', part(), voidResult),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('exec')).toBeVisible()
    await expect(c.getByText('ok')).toBeVisible()
    await expect(c.queryByRole('button', {name: /external_canvas_draw/})).toBeNull()
    await expect(c.queryByRole('group', {name: 'Output'})).toBeNull()
  },
}

export const EmbeddedFailure: Story = {
  render: () => traceGallery('1 failed', part(), failResult),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('error')).toBeVisible()
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('Unexpected token'))
  },
}
