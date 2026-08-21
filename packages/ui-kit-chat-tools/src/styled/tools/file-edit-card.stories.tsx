import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {FileEditCard} from './file-edit-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/FileEditCard'}
export default meta
type Story = StoryObj

function part(name: string, args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'e1', name, arguments: JSON.stringify(args), state}
}
const doneResult: ToolResultPart = {type: 'tool-result', toolCallId: 'e1', content: 'ok', state: 'complete'}

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

async function diffText(root: HTMLElement): Promise<string> {
  return Array.from(root.querySelectorAll('diffs-container'))
    .map((host) => host.shadowRoot?.textContent ?? '')
    .join('\n')
}

export const Edited: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <FileEditCard
        part={part('Edit', {file_path: 'src/math/sum.ts', old_string: 'return a - b', new_string: 'return a + b'})}
        result={doneResult}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Edited sum.ts')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(async () => expect(await diffText(canvasElement)).toContain('return a + b'))
  },
}

export const Wrote: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <FileEditCard
        part={part('Write', {file_path: 'src/new.ts', content: 'export const zero = 0'})}
        result={doneResult}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Wrote new.ts')).toBeVisible()
  },
}

export const Running: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <FileEditCard
        part={part('Edit', {file_path: 'src/slow.ts'}, 'input-complete')}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
}
