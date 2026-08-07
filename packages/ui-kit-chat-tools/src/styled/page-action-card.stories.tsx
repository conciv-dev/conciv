import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {INERT_TOOL_CTX} from '@conciv/ui-kit-chat'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import {PageActionCard} from './page-action-card.js'

const meta: Meta = {title: 'ui-kit-chat-tools/tools/PageActionCard'}
export default meta
type Story = StoryObj

const catalog: ToolCatalogView = {
  loaded: () => true,
  meta: (name) => {
    const declared = PAGE_TOOL_DEFS.find((def) => def.name === name)?.meta
    if (!declared) return undefined
    return {...declared, mutating: declared.mutating === true, mirrors: declared.mirrors === true}
  },
}

const ctx: ToolViewCtx = {...INERT_TOOL_CTX, catalog}

function part(args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'p1', name: 'conciv_page', arguments: JSON.stringify(args), state}
}
function result(payload: unknown, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'p1', content: JSON.stringify(payload), state}
}
function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Clicked: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <PageActionCard part={part({verb: 'click', selector: '#submit'})} result={undefined} ctx={ctx} />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Clicked')).toBeVisible()
  },
}

export const DomRead: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <PageActionCard part={part({verb: 'dom'})} result={result({html: '<main><h1>Hi</h1></main>'})} ctx={ctx} />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Read the DOM')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
  },
}

export const Tree: Story = {
  render: () =>
    frame(
      'chat-theme-conciv',
      <PageActionCard
        part={part({verb: 'tree'})}
        result={result({
          nodes: [
            {role: 'button', name: 'Submit', ref: 'e1'},
            {role: 'link', name: 'Home', ref: 'e2'},
          ],
        })}
        ctx={ctx}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('Submit')).toBeVisible())
  },
}

export const Errored: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <PageActionCard
        part={part({verb: 'click', selector: '#gone'})}
        result={result('element not found', 'error')}
        ctx={ctx}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('element not found')).toBeVisible())
  },
}
