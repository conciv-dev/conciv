import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {ExtensionsCard} from './extensions-card.js'
import {OpenCard} from './open-card.js'

const meta: Meta = {title: 'tools/cards/InlineCards'}
export default meta
type Story = StoryObj

function part(name: string, args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: name, name, arguments: JSON.stringify(args), state}
}
const done: ToolResultPart = {type: 'tool-result', toolCallId: 'x', content: 'ok', state: 'complete'}

function frame(theme: string, child: JSX.Element): JSX.Element {
  return (
    <div
      class={`${theme} p-4 flex flex-col gap-1 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}
    >
      {child}
    </div>
  )
}

export const Extensions: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <>
        <ExtensionsCard
          part={part('conciv_extensions', {verb: 'catalog'})}
          result={done}
          ctx={INERT_TOOL_CTX}
          addResult={INERT_ADD_RESULT}
        />
        <ExtensionsCard
          part={part('conciv_extensions', {verb: 'scaffold', kind: 'tool-renderer', name: 'weather'})}
          result={done}
          ctx={INERT_TOOL_CTX}
          addResult={INERT_ADD_RESULT}
        />
        <ExtensionsCard
          part={part('conciv_extensions', {verb: 'validate', source: 'export default defineExtension({})'})}
          result={done}
          ctx={INERT_TOOL_CTX}
          addResult={INERT_ADD_RESULT}
        />
      </>,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Extension catalog')).toBeVisible()
    await expect(c.getByText('Extension scaffold')).toBeVisible()
    await expect(c.getByText('tool-renderer weather')).toBeVisible()
    await expect(c.getByText('Extension check')).toBeVisible()
  },
}

export const Open: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <>
        <OpenCard
          part={part('open', {file: 'packages/ui-kit-chat/src/styled/thread.tsx', line: 42})}
          result={done}
          ctx={INERT_TOOL_CTX}
          addResult={INERT_ADD_RESULT}
        />
        <OpenCard
          part={part('open', {file: 'src/composer/model-selector.tsx'}, 'input-complete')}
          result={undefined}
          ctx={INERT_TOOL_CTX}
          addResult={INERT_ADD_RESULT}
        />
      </>,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('packages/ui-kit-chat/src/styled/thread.tsx:42')).toBeVisible()
    await expect(c.getByText('src/composer/model-selector.tsx')).toBeVisible()
  },
}
