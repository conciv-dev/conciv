import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor, within} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {INERT_TOOL_CTX, Trace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {concivToolCards} from '../cards.js'

const meta: Meta = {title: 'tools/cards/InlineCards'}
export default meta
type Story = StoryObj

function call(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: name, name, arguments: JSON.stringify(input), input, state}
}

function result(content: unknown, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {
    type: 'tool-result',
    toolCallId: 'g1',
    content: typeof content === 'string' ? content : JSON.stringify(content),
    state,
  }
}

function row(
  part: ToolCallPart,
  toolResult: ToolResultPart | undefined,
  key: string,
  ctx: ToolViewCtx = INERT_TOOL_CTX,
): TraceItem {
  return {
    key,
    render: (branch) => (
      <ToolTraceRow part={part} result={toolResult} ctx={ctx} tools={() => concivToolCards} ring={branch.ring} />
    ),
  }
}

async function codeText(root: HTMLElement): Promise<string> {
  return Array.from(root.querySelectorAll('diffs-container'))
    .map((host) => host.shadowRoot?.textContent ?? '')
    .join('\n')
}

function gallery(summary: string, items: TraceItem[]): JSX.Element {
  return (
    <div class="p-4 max-w-[28rem] w-full [background:var(--chat-panel)] [font-family:var(--chat-font)]">
      <Trace summary={summary} compactLine={summary} items={items} defaultOpen />
    </div>
  )
}

const CATALOG_RESULT = {
  conventions: {location: 'conciv/extensions/*.{ts,tsx}', entry: 'export default defineExtension({name})'},
  tokens: [
    {name: 'chat-accent', cssVar: '--chat-accent', default: '#2563eb', description: 'accent color'},
    {name: 'chat-radius', cssVar: '--chat-radius', default: '10px', description: 'corner radius'},
  ],
  slots: [
    {name: 'header', description: 'Above the message list (panel header region).'},
    {name: 'composer', description: 'Inside the input toolbar.'},
  ],
  clientSurfaces: [{method: 'defineExtension({name, Component})', description: 'Mount a SolidJS Component.'}],
  serverSurfaces: [{method: 'defineTool({...}).server(...)', description: 'Define a tool once.'}],
}

export const OpenComplete: Story = {
  render: () =>
    gallery('1 open', [
      row(
        call('open', {file: 'packages/ui-kit-chat/src/styled/thread.tsx', line: 42}),
        result({ok: true, file: 'x', line: 42}),
        'open',
      ),
    ]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('…/styled/thread.tsx:42')).toBeVisible()
    await expect(c.getByText('open')).toBeVisible()
  },
}

export const OpenPending: Story = {
  render: () =>
    gallery('1 open', [
      row(call('open', {file: 'src/composer/model-selector.tsx'}, 'input-complete'), undefined, 'open'),
    ]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('…/composer/model-selector.tsx')).toBeVisible()
  },
}

export const OpenFailed: Story = {
  render: () =>
    gallery('1 failed', [row(call('open', {file: 'missing/file.ts'}), result('file not found', 'error'), 'open')]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('missing/file.ts')).toBeVisible()
    await expect(c.getByText('Could not open the file.')).toBeVisible()
  },
}

export const ExtensionsCatalog: Story = {
  render: () =>
    gallery('1 catalog', [row(call('conciv_extensions', {verb: 'catalog'}), result(CATALOG_RESULT), 'ext')]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('extensions')).toBeVisible()
    await expect(c.getByText('chat-accent')).toBeVisible()
    await expect(c.getByText('composer')).toBeVisible()
  },
}

export const ExtensionsScaffold: Story = {
  render: () =>
    gallery('1 scaffold', [
      row(
        call('conciv_extensions', {verb: 'scaffold', kind: 'tool-renderer', name: 'weather'}),
        result({code: "export default defineExtension({name: 'weather'})\n"}),
        'ext',
      ),
    ]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('weather')).toBeVisible()
    await expect(c.getByText('tool-renderer')).toBeVisible()
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('defineExtension'))
  },
}

export const ExtensionsValidateFailed: Story = {
  render: () =>
    gallery('1 failed', [
      row(
        call('conciv_extensions', {verb: 'validate', source: 'const x = 1'}),
        result({ok: false, issues: [{level: 'error', message: 'No `export default defineExtension({name})` found.'}]}),
        'ext',
      ),
    ]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('1 issue')).toBeVisible()
    await expect(c.getByText(/No `export default defineExtension/)).toBeVisible()
  },
}

export const ExtensionsValidateClean: Story = {
  render: () =>
    gallery('1 check', [
      row(
        call('conciv_extensions', {verb: 'validate', source: "export default defineExtension({name: 'ok'})"}),
        result({ok: true, issues: []}),
        'ext',
      ),
    ]),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('ok')).toBeVisible()
    await expect(c.getByText('no issues found')).toBeVisible()
  },
}
