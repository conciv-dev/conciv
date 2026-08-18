import {createSignal, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {UiCard} from './ui-card.js'

const meta: Meta = {title: 'tools/cards/UiCard'}
export default meta
type Story = StoryObj

function part(args: Record<string, unknown>): ToolCallPart {
  return {type: 'tool-call', id: 'u1', name: 'conciv_ui', arguments: JSON.stringify(args), state: 'input-complete'}
}
function answered(value: UiAnswerValue): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'u1', content: JSON.stringify({answered: true, value}), state: 'complete'}
}
function unanswered(note: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'u1', content: JSON.stringify({answered: false, note}), state: 'complete'}
}
function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Choices: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <UiCard
        part={part({kind: 'choices', question: 'Ship it or hold?', options: ['ship', 'hold']})}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Ship it or hold?')).toBeVisible()
    await expect(c.getByRole('button', {name: 'ship'})).toBeEnabled()
  },
}

export const Confirm: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <UiCard
        part={part({kind: 'confirm', question: 'Delete the staging database?', detail: 'DROP DATABASE staging;'})}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Delete the staging database?')).toBeVisible()
    await expect(c.getByRole('button', {name: 'Approve'})).toBeEnabled()
    await expect(c.getByRole('button', {name: 'Deny'})).toBeEnabled()
  },
}

export const Diff: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <UiCard
        part={part({
          kind: 'diff',
          question: 'Apply this rename?',
          file: 'src/app.ts',
          before: 'const a = 1\nexport {a}\n',
          after: 'const answer = 1\nexport {answer}\n',
        })}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Apply this rename?')).toBeVisible()
    await expect(c.getByRole('button', {name: 'Apply'})).toBeEnabled()
    await expect(c.getByRole('button', {name: 'Reject'})).toBeEnabled()
  },
}

export const Form: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <UiCard
        part={part({
          kind: 'form',
          title: 'Deploy settings',
          fields: [
            {name: 'tag', label: 'Release tag', type: 'text'},
            {name: 'env', label: 'Environment', type: 'select', options: ['staging', 'production']},
          ],
        })}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Deploy settings')).toBeVisible()
    await expect(c.getByRole('textbox', {name: 'Release tag'})).toBeEnabled()
    await expect(c.getByRole('combobox', {name: 'Environment'})).toBeEnabled()
  },
}

export const Answered: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <UiCard
        part={part({kind: 'choices', question: 'Ship it or hold?', options: ['ship', 'hold']})}
        result={answered('ship')}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('status')).toHaveTextContent('ship')
    await expect(c.queryByRole('button', {name: 'hold'})).toBeNull()
  },
}

export const Unanswered: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <UiCard
        part={part({kind: 'confirm', question: 'Delete the staging database?'})}
        result={unanswered('nobody answered in time')}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('status')).toHaveTextContent('nobody answered in time')
    await expect(c.queryByRole('button', {name: 'Approve'})).toBeNull()
  },
}

export const AnswersAChoice: Story = {
  render: () => {
    const [recorded, setRecorded] = createSignal<UiAnswerValue[]>([])
    return frame(
      'chat-theme-terminal',
      <>
        <UiCard
          part={part({kind: 'choices', question: 'Ship it or hold?', options: ['ship', 'hold']})}
          result={undefined}
          ctx={INERT_TOOL_CTX}
          addResult={(value) => setRecorded((seen) => [...seen, value])}
        />
        <p>host recorded: {JSON.stringify(recorded())}</p>
      </>,
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', {name: 'ship'}))
    await expect(c.getByText('host recorded: ["ship"]')).toBeVisible()
    await expect(c.getByRole('button', {name: 'ship'})).toBeDisabled()
    await expect(c.getByRole('button', {name: 'hold'})).toBeDisabled()
  },
}

export const AwaitingSpec: Story = {
  render: () =>
    frame(
      'chat-theme-terminal',
      <UiCard
        part={{type: 'tool-call', id: 'u1', name: 'conciv_ui', arguments: '{"kind":', state: 'input-streaming'}}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('waiting for the form')).toBeVisible()
  },
}
