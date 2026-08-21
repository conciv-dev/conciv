import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {TraceItem} from '../src/styled/trace/trace.js'
import {Trace} from '../src/styled/trace/trace.js'
import {TraceToolRow} from '../src/styled/trace/trace-row.js'
import {TraceActionRow} from '../src/styled/trace/action-row.js'
import {mountView} from './mount-view.js'

const SUMMARY = '2 files changed · +18 −4'
const COMPACT = '2 files · 4 tools · 12s'

const settledItems: TraceItem[] = [
  {
    key: 'read',
    render: (branch) => (
      <TraceToolRow
        projection={{mark: 'pass', label: 'read', target: 'src/app.tsx', meta: '120 lines'}}
        ring={branch.ring}
      />
    ),
  },
  {
    key: 'edit',
    render: (branch) => (
      <TraceToolRow
        projection={{mark: 'warn', label: 'edit', target: 'src/store/turn.ts', meta: '+9 −4'}}
        ring={branch.ring}
      />
    ),
  },
  {
    key: 'bash',
    render: (branch) => (
      <TraceToolRow
        projection={{mark: 'fail', label: 'bash', target: 'pnpm test', meta: 'exit 1'}}
        ring={branch.ring}
      />
    ),
  },
]

const liveItems: TraceItem[] = [
  {
    key: 'first-live',
    live: true,
    render: (branch) => (
      <TraceToolRow projection={{mark: 'run', label: 'run', target: 'installing dependencies'}} ring={branch.ring} />
    ),
  },
  {
    key: 'second-live',
    live: true,
    render: (branch) => (
      <TraceToolRow projection={{mark: 'run', label: 'tail', target: 'streaming the build log'}} ring={branch.ring} />
    ),
  },
]

it('renders one row per trace item with the mark that matches its outcome', async () => {
  mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={settledItems} defaultOpen />)

  await expect.element(page.getByRole('img', {name: 'succeeded'})).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'completed with warnings'})).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'failed'})).toBeVisible()
  await expect.element(page.getByText('src/app.tsx')).toBeVisible()
  await expect.element(page.getByText('pnpm test')).toBeVisible()
  await expect.element(page.getByText('exit 1')).toBeVisible()
})

it('draws the branch spine down every row and terminates it at the final one', async () => {
  mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={settledItems} defaultOpen />)

  await expect.element(page.getByRole('listitem').last()).toBeVisible()
  await expect.element(page.getByText('src/app.tsx')).toBeVisible()
  await page.screenshot({path: '__screenshots__/trace/branch-spine.png'})
})

it('gives at most one live step the running ring and dims every earlier live step', async () => {
  mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={liveItems} defaultOpen />)

  await expect.element(page.getByRole('img', {name: 'running'})).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'pending'})).toBeVisible()

  expect(document.querySelectorAll('[role="img"][aria-label="running"]')).toHaveLength(1)
  expect(document.querySelectorAll('[role="img"][aria-label="pending"]')).toHaveLength(1)
})

it('collapses to a single record line and restores the rows when toggled back', async () => {
  mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={settledItems} defaultOpen />)

  await expect.element(page.getByRole('button', {name: /Hide trace/})).toBeVisible()
  await expect.element(page.getByText(SUMMARY)).toBeVisible()

  await page.getByRole('button', {name: /Hide trace/}).click()

  await expect.element(page.getByRole('button', {name: /Show trace/})).toBeVisible()
  await expect.element(page.getByText(COMPACT)).toBeVisible()
  await expect.element(page.getByText('src/app.tsx')).not.toBeVisible()

  await page.getByRole('button', {name: /Show trace/}).click()

  await expect.element(page.getByText('src/app.tsx')).toBeVisible()
})

it('starts collapsed when the trace opens closed', async () => {
  mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={settledItems} />)

  await expect.element(page.getByRole('button', {name: /Show trace/})).toBeVisible()
  await expect.element(page.getByText('src/app.tsx')).not.toBeInTheDocument()
})

it('runs the action an action row offers and shows its hint and explainer', async () => {
  const runs: string[] = []
  const items: TraceItem[] = [
    {
      key: 'action',
      render: () => (
        <TraceActionRow
          label="Review the diff"
          hint="⌘⏎"
          explainer="18 lines across 2 files"
          onAction={() => runs.push('reviewed')}
        />
      ),
    },
  ]
  mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={items} defaultOpen />)

  await expect.element(page.getByText('18 lines across 2 files')).toBeVisible()
  await expect.element(page.getByText('⌘⏎')).toBeVisible()

  await page.getByRole('button', {name: 'Review the diff'}).click()

  await expect.element(page.getByRole('button', {name: 'Review the diff'})).toBeVisible()
  expect(runs).toEqual(['reviewed'])
})
