import type {z} from 'zod'
import type {TestRunner} from '@conciv/plugin-test-runner/rpc'
import type {PlaygroundScript} from '../../script'

type RunResult = z.input<(typeof TestRunner)['methods']['run']['output']>

type TestRow = RunResult['tests'][number]

const FILE = '/workspace/src/App.test.tsx'

const failure = {
  file: FILE,
  name: 'the counter starts at zero',
  message: 'expected "Count is 5" to be "Count is 0"',
  stack: 'expected "Count is 5" to be "Count is 0"',
  line: 14,
}

const tests: TestRow[] = [
  {id: 't1', file: FILE, name: 'renders the heading', state: 'pass', durationMs: 12},
  {id: 't2', file: FILE, name: 'the counter goes up on click', state: 'pass', durationMs: 31},
  {id: 't3', file: FILE, name: 'the counter starts at zero', state: 'fail', durationMs: 9, error: failure},
]

const result: RunResult = {
  summary: {passed: 2, failed: 1, skipped: 0, durationMs: 412},
  failures: [failure],
  tests,
}

export default {
  title: 'Run the tests live',
  screen: 'panel',
  plugins: ['test-runner'],
  turns: [
    {
      prompt: 'Run the tests.',
      replies: [
        {
          kind: 'tool',
          name: 'test_runner_run',
          input: {},
          result,
          events: [
            {type: 'rpc.test-runner.event', data: {type: 'run-start', runId: 'run-1', files: [FILE]}},
            ...tests.map((test) => ({type: 'rpc.test-runner.event' as const, data: {type: 'test', ...test}})),
            {type: 'rpc.test-runner.event', data: {type: 'file-end', file: FILE, ok: false, durationMs: 412}},
            {type: 'rpc.test-runner.event', data: {type: 'run-end', runId: 'run-1', ...result}},
          ],
        },
        {
          kind: 'text',
          text: 'Two tests pass and one fails: **the counter starts at zero** expects 0 but the page starts at 5. Open the **Tests** tab to see the run.',
        },
      ],
      after: [{kind: 'click', role: 'tab', label: 'Tests'}],
    },
  ],
} satisfies PlaygroundScript
