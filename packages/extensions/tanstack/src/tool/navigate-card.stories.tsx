import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {NavigateCard} from './navigate-card.js'
import {navigateDef} from './def.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'extension-tanstack/tool/NavigateCard'}
export default meta
type Story = StoryObj

const navigateMeta: ToolViewMeta = {
  ...navigateDef.meta,
  summary: navigateDef.meta?.summary ?? '',
  mutating: navigateDef.meta?.mutating ?? false,
  mirrors: false,
}

export const Done: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <NavigateCard
        part={storyPart('tanstack_navigate', {to: '/form'})}
        result={storyResult({ok: true, to: '/form'})}
        ctx={storyCtx({tanstack_navigate: navigateMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Navigated')).toBeVisible()
    await waitFor(() => expect(canvas.getByText('→ /form')).toBeVisible())
  },
}
