import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {SearchCard} from './search-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/SearchCard'}
export default meta
type Story = StoryObj

function part(name: string, args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 's1', name, arguments: JSON.stringify(args), state}
}
function result(text: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 's1', content: text, state: 'complete'}
}

function frame(child: JSX.Element): JSX.Element {
  return <div class="p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
}

async function codeText(root: HTMLElement): Promise<string> {
  return Array.from(root.querySelectorAll('diffs-container'))
    .map((host) => host.shadowRoot?.textContent ?? '')
    .join('\n')
}

export const Matches: Story = {
  render: () =>
    frame(
      <SearchCard
        part={part('Grep', {pattern: 'useChat'})}
        result={result('src/a.ts:1:useChat()\nsrc/b.ts:9:useChat(opts)')}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Searched')).toBeVisible()
    await expect(c.getByText('“useChat”')).toBeVisible()
    await expect(c.getByText('2 matches')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('src/a.ts'))
  },
}

export const NoMatches: Story = {
  render: () =>
    frame(
      <SearchCard
        part={part('Grep', {pattern: 'nope'})}
        result={result('')}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('0 matches')).toBeVisible()
  },
}

export const Globbed: Story = {
  render: () =>
    frame(
      <SearchCard
        part={part('Glob', {glob: '**/*.tsx'})}
        result={result('src/a.tsx\nsrc/b.tsx')}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Globbed')).toBeVisible()
    await expect(c.getByText('“**/*.tsx”')).toBeVisible()
  },
}

export const Running: Story = {
  render: () =>
    frame(
      <SearchCard
        part={part('Grep', {pattern: 'slow'}, 'input-complete')}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
}

function failedResult(text: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 's1', content: text, state: 'error'}
}

export const Failed: Story = {
  render: () =>
    frame(
      <SearchCard
        part={part('Grep', {pattern: '('})}
        result={failedResult('regex parse error: unclosed group')}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('failed')).toBeVisible()
    await expect(c.getByLabelText('error')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button'))
    await waitFor(async () => expect(await codeText(canvasElement)).toContain('regex parse error: unclosed group'))
  },
}
