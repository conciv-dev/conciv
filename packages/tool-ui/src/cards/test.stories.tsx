import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, fn, userEvent, within} from 'storybook/test'
import type {TestRunResult} from '@opendui/aidx-protocol/test-types'
import {TestCard} from './test.js'
import {callPart, resultPart, noopCtx} from '../fixtures.js'

const meta: Meta<typeof TestCard> = {title: 'tool-ui/Test', component: TestCard}
export default meta
type Story = StoryObj<typeof TestCard>

const passing: TestRunResult = {
  summary: {passed: 3, failed: 0, skipped: 0, durationMs: 412},
  failures: [],
  tests: [
    {file: 'src/a.test.ts', name: 'adds', state: 'pass', durationMs: 4},
    {file: 'src/a.test.ts', name: 'subtracts', state: 'pass', durationMs: 3},
    {file: 'src/b.test.ts', name: 'renders', state: 'pass', durationMs: 9},
  ],
}

const divideError = {
  file: 'src/calc.test.ts',
  line: 12,
  name: 'divides',
  message: 'expected 2 but got Infinity',
  stack: 'at src/calc.test.ts:12',
}

const failing: TestRunResult = {
  summary: {passed: 1, failed: 1, skipped: 0, durationMs: 388},
  failures: [divideError],
  tests: [
    {file: 'src/calc.test.ts', name: 'adds', state: 'pass', durationMs: 5},
    {file: 'src/calc.test.ts', name: 'divides', state: 'fail', durationMs: 6, error: divideError},
  ],
}

const testResult = (data: TestRunResult) => resultPart(JSON.stringify(data))

export const Passing: Story = {
  args: {part: callPart({name: 'aidx_test', input: {action: 'run'}}), result: testResult(passing), ctx: noopCtx()},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    // The pill renders "{n} passed" as two text nodes, so assert on the card's text content.
    await expect(canvasElement.textContent).toContain('3 passed')
    await expect(c.getByText('renders')).toBeInTheDocument()
  },
}

// Interaction test: expand a failing test to reveal its error, then "Fix this" sends a message.
export const Failing: Story = {
  args: {
    part: callPart({name: 'aidx_test', input: {action: 'run'}}),
    result: testResult(failing),
    ctx: noopCtx({sendMessage: fn()}),
  },
  play: async ({canvasElement, args}) => {
    const c = within(canvasElement)
    await expect(canvasElement.textContent).toContain('1 failed')
    // The error block is collapsed until the failing row is clicked.
    await expect(c.queryByText(/expected 2 but got Infinity/)).not.toBeInTheDocument()
    await userEvent.click(c.getByText('divides'))
    await expect(c.getByText(/expected 2 but got Infinity/)).toBeInTheDocument()
    await userEvent.click(c.getByText('✦ Fix this'))
    await expect(args.ctx.sendMessage).toHaveBeenCalledWith(expect.stringContaining('divides'))
  },
}
