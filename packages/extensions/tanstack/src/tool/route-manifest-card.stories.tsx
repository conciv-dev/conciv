import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {RouteManifestCard} from './route-manifest-card.js'
import {routeManifestDef} from './def.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'extension-tanstack/tool/RouteManifestCard'}
export default meta
type Story = StoryObj

const routeManifestMeta: ToolViewMeta = {
  ...routeManifestDef.meta,
  summary: routeManifestDef.meta?.summary ?? '',
  mutating: routeManifestDef.meta?.mutating ?? false,
  mirrors: false,
}

const ROUTE_MANIFEST = [
  {path: '/', kind: 'layout', dynamic: false, file: '/app/src/routes/__root'},
  {path: '/', kind: 'page', dynamic: false, file: '/app/src/routes/index'},
  {path: '/posts/$postId', kind: 'page', dynamic: true, file: '/app/src/routes/posts.$postId'},
]

export const Done: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <RouteManifestCard
        part={storyPart('tanstack_route_manifest', {})}
        result={storyResult(ROUTE_MANIFEST)}
        ctx={storyCtx({tanstack_route_manifest: routeManifestMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the route manifest')).toBeVisible()
    await expect(canvas.getByText('3 routes')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('/posts/$postId')).toBeVisible())
    await expect(canvas.getByText('dynamic')).toBeVisible()
  },
}
