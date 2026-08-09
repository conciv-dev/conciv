import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat'
import {ApplyPatchDiff} from './apply-patch-diff.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/ApplyPatchDiff'}
export default meta
type Story = StoryObj

const PATCH = `*** Begin Patch
*** Update File: src/math/sum.ts
@@ export function sum(a: number, b: number) { @@
 export function sum(a: number, b: number) {
-  return a - b
+  return a + b
 }
+
+export const ZERO = 0
*** End Patch`

function part(state: ToolCallPart['state']): ToolCallPart {
  return {type: 'tool-call', id: 't1', name: 'apply_patch', arguments: JSON.stringify({patchText: PATCH}), state}
}
const doneResult: ToolResultPart = {type: 'tool-result', toolCallId: 't1', content: 'Applied', state: 'complete'}

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

export const Complete: Story = {
  render: () =>
    frame(
      'chat-theme-dark',
      <ApplyPatchDiff part={part('complete')} result={doneResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />,
    ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('apply_patch')).toBeVisible()
    await expect(c.getByText('sum.ts')).toBeVisible()
    await expect(c.getByText('+3')).toBeVisible()
    await expect(c.getByText('−1')).toBeVisible()
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByRole('button')).toHaveAttribute('data-state', 'open'))
  },
}

export const Running: Story = {
  render: () =>
    frame(
      'chat-theme-conciv',
      <ApplyPatchDiff
        part={part('input-streaming')}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />,
    ),
}

export const Neutral: Story = {
  render: () =>
    frame(
      '',
      <ApplyPatchDiff part={part('complete')} result={doneResult} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />,
    ),
}
