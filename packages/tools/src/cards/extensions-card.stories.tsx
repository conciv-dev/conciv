import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {ExtensionsCard} from './extensions-card.js'

const meta: Meta = {title: 'tools/cards/ExtensionsCard'}
export default meta
type Story = StoryObj

function part(): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'e1',
    name: 'conciv_extensions',
    arguments: JSON.stringify({verb: 'catalog'}),
    state: 'complete',
  }
}

function result(payload: object): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'e1', content: JSON.stringify(payload), state: 'complete'}
}

const malformedCatalogResult = result({tokens: [], slots: []})

function frame(child: JSX.Element): JSX.Element {
  return <div class="p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
}

export const MalformedCatalog: Story = {
  render: () =>
    frame(
      <ExtensionsCard
        part={part()}
        result={malformedCatalogResult}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('waiting on the tool')).toBeVisible())
    await expect(c.queryByText('Tokens · 0')).toBeNull()
  },
}
