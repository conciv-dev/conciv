import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {ToolRowProjection} from '../../tools/primitives/tool-row.js'
import {Trace, type TraceItem} from './trace.js'
import {TraceToolRow} from './trace-row.js'
import {TraceActionRow} from './action-row.js'
import {TraceOutputBlock} from './output-block.js'

const meta: Meta = {title: 'ui-kit-chat/styled/trace/Trace'}
export default meta
type Story = StoryObj

const SUMMARY = '3 files changed · +42 −11'
const COMPACT = '3 files · 6 tools · 41s'

const TEST_OUTPUT = [
  'FAIL  src/store/turn-rollup.test.ts',
  '  ✕ folds a turn into a rollup',
  '',
  '1 failed | 12 passed',
].join('\n')

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="p-4 rounded-[var(--chat-radius-md)] w-[36rem] [background:var(--chat-panel)] [border:1px_solid_var(--chat-line)] [font-family:var(--chat-font)]">
      {child}
    </div>
  )
}

function toolItem(key: string, projection: ToolRowProjection, live?: boolean): TraceItem {
  return {
    key,
    ...(live === undefined ? {} : {live}),
    render: (branch) => <TraceToolRow projection={projection} ring={branch.ring} />,
  }
}

const allRowKinds: TraceItem[] = [
  toolItem('read', {mark: 'pass', label: 'read', target: 'src/store/turn-rollup.ts', meta: '96 lines'}),
  toolItem('edit', {mark: 'pass', label: 'edit', target: 'turn-rollup.ts', meta: '+42 −11'}),
  toolItem('warn', {mark: 'warn', label: 'plan', target: 'wiring the trace into the thread', meta: '4/6'}),
  toolItem('bash', {
    mark: 'fail',
    label: 'bash',
    target: 'pnpm vitest run turn-rollup',
    meta: 'exit 1',
    block: () => (
      <TraceOutputBlock tone="error" text={TEST_OUTPUT}>
        {TEST_OUTPUT}
      </TraceOutputBlock>
    ),
  }),
  {
    key: 'action',
    render: () => (
      <TraceActionRow label="Rerun the suite" hint="⌘⏎" explainer="1 failing test in turn-rollup.test.ts" />
    ),
  },
]

export const AllRowKinds: Story = {
  render: () => frame(<Trace summary={SUMMARY} compactLine={COMPACT} items={allRowKinds} defaultOpen />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('failed')).toBeVisible()
    await expect(canvas.getByRole('button', {name: 'Rerun the suite'})).toBeVisible()
  },
}

const twoLiveSteps: TraceItem[] = [
  toolItem('installing', {mark: 'run', label: 'run', target: 'installing the workspace dependencies'}, true),
  toolItem('building', {mark: 'run', label: 'run', target: 'building the embed bundle'}, true),
  toolItem('tailing', {mark: 'run', label: 'tail', target: 'streaming the build log'}, true),
]

export const OneRingInvariant: Story = {
  render: () =>
    frame(<Trace summary="running the build" compactLine="3 steps in flight" items={twoLiveSteps} defaultOpen />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByLabelText('running')).toHaveLength(1)
    await expect(canvas.getAllByLabelText('pending')).toHaveLength(2)
  },
}

const midProgressSteps: TraceItem[] = [
  toolItem('read', {mark: 'pass', label: 'read', target: 'src/store/turn-rollup.ts', meta: '96 lines'}),
  toolItem('building', {mark: 'run', label: 'run', target: 'building the embed bundle'}, true),
  toolItem('publish', {mark: 'run', label: 'run', target: 'publishing the release notes'}),
]

export const LiveAccentMidProgress: Story = {
  render: () =>
    frame(<Trace summary="running the release" compactLine="3 steps" items={midProgressSteps} defaultOpen />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('running')).toBeVisible()
    await expect(canvas.getByText('publishing the release notes')).toBeVisible()
  },
}

export const FoldedByNextPrompt: Story = {
  render: () => frame(<Trace summary={SUMMARY} compactLine={COMPACT} items={allRowKinds} folded />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', {name: /Show trace/})).toBeVisible()
    await expect(canvas.getByText(COMPACT)).toBeVisible()
  },
}

const longLabelRow: TraceItem[] = [
  toolItem('evaluate', {
    mark: 'pass',
    label: 'evaluate',
    target: 'grep -rn "usePlacement" packages/ui-kit-chat/src/primitives/composer/composer-actions.tsx',
    meta: 'exit 0',
  }),
]

export const LongLabelNoOverlap: Story = {
  render: () => frame(<Trace summary="1 tool ran" compactLine="1 tool" items={longLabelRow} defaultOpen />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('evaluate')).toBeVisible()
    await expect(canvas.getByText(/usePlacement/)).toBeVisible()
  },
}
