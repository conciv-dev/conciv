import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {CommentOpCard} from './card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from '../story.fixtures.js'

const meta: Meta = {title: 'extension-whiteboard/tool/comment/CommentOpCard'}
export default meta
type Story = StoryObj

export const ListResults: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <CommentOpCard
        part={storyPart('comment.list', {scope: 'session'})}
        result={storyResult({comments: [{cid: 'c1'}, {cid: 'c2'}, {cid: 'c3'}]})}
        ctx={storyCtx()}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getAllByText('3 comments')).toHaveLength(2))
    await waitFor(() => expect(canvas.getByText('list')).toBeVisible())
  },
}

export const ResolveConfirmed: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <CommentOpCard
        part={storyPart('comment.resolve', {cid: 'c1'})}
        result={storyResult({status: 'resolved'})}
        ctx={storyCtx()}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getAllByText('resolved')).toHaveLength(2))
    await waitFor(() => expect(canvas.getByText('resolve')).toBeVisible())
  },
}
