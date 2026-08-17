import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {For} from 'solid-js'
import {ConcivMark} from './solid/index.js'

const meta: Meta = {title: 'brand/Usage'}
export default meta
type Story = StoryObj

const RULES = [
  {ok: true, text: 'Keep clear space around the mark of at least one antenna-height on every side.'},
  {ok: false, text: "Don't recolor the mark. It stays crimson #D7263D."},
  {ok: false, text: "Don't add an outline or stroke around the bubble."},
  {ok: false, text: "Don't stretch or skew the lockup off its aspect ratio."},
  {ok: false, text: "Don't rebuild the geometry by hand. Use the provided assets or components."},
  {ok: true, text: 'Let the wordmark inherit currentColor from its surrounding text.'},
]

export const Rules: Story = {
  render: () => (
    <ul class="flex flex-col gap-2 max-w-md">
      <For each={RULES}>
        {(rule) => (
          <li class="text-sm flex gap-2 items-start">
            <span aria-hidden="true">{rule.ok ? '✅' : '🚫'}</span>
            <span>{rule.text}</span>
          </li>
        )}
      </For>
    </ul>
  ),
}

export const Reference: Story = {
  render: () => (
    <div class="flex gap-4 items-center">
      <ConcivMark class="h-16 w-16" />
      <p class="text-sm max-w-xs">
        The mark is a rounded-rect chat bubble with a bottom-left tail, a knocked-out {'>'}_ prompt face, a ball
        antenna, and two detached ear pills.
      </p>
    </div>
  ),
}
