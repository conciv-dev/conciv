import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {CompactSpinner, ConversationSkeleton, Divider, ThinkingBubble} from './indicators.js'

const meta: Meta = {title: 'conciv/pane/Indicators'}
export default meta
type Story = StoryObj

export const NewSessionDivider: Story = {render: () => <Divider kind="new" />}
export const CompactedDivider: Story = {render: () => <Divider kind="compact" />}
export const CompactingDivider: Story = {render: () => <Divider kind="compact" pending />}
export const CompactSpinnerStory: Story = {name: 'CompactSpinner', render: () => <CompactSpinner />}
export const Skeleton: Story = {render: () => <ConversationSkeleton />}
export const ThinkingBubbleStory: Story = {name: 'ThinkingBubble', render: () => <ThinkingBubble />}
