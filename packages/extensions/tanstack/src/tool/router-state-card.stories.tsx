import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {RouterStateCard} from './router-state-card.js'
import {routerStateDef} from './def.js'
import {
  STORY_FRAME_CLASS,
  storyAddResult,
  storyCtx,
  storyErrorResult,
  storyPart,
  storyResult,
} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/TanStack/tool/RouterStateCard'}
export default meta
type Story = StoryObj

const routerStateMeta: ToolViewMeta = {
  ...routerStateDef.meta,
  summary: routerStateDef.meta?.summary ?? '',
  mutating: routerStateDef.meta?.mutating ?? false,
  mirrors: false,
}

const ROUTER_STATE = {
  location: {pathname: '/about', search: '', hash: ''},
  matches: [
    {routeId: '__root__', path: ''},
    {routeId: '/about', path: '/about'},
  ],
}

export const Done: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <RouterStateCard
        part={storyPart('tanstack_router_state', {})}
        result={storyResult(ROUTER_STATE)}
        ctx={storyCtx({tanstack_router_state: routerStateMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the router state')).toBeVisible()
    await expect(canvas.getByText('/about · 2 matches')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('__root__')).toBeVisible())
  },
}

export const ErrorState: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <RouterStateCard
        part={storyPart('tanstack_router_state', {})}
        result={storyErrorResult('TanStack router not found on page')}
        ctx={storyCtx({tanstack_router_state: routerStateMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('TanStack router not found on page')).toBeVisible())
  },
}
