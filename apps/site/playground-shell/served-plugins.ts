import type {z} from 'zod'
import {TestRunner} from '@conciv/plugin-test-runner/rpc'
import testRunnerCode from '@conciv/plugin-test-runner/plugin-experimental?raw'
import {Definition as Page} from '@conciv/plugin-page/rpc'
import type {FakeBundle} from '@internal/test-utils'
import type {PlaygroundRpc} from './play-script'

type RunResult = z.input<(typeof TestRunner)['methods']['run']['output']>

type CurrentRun = z.input<(typeof TestRunner)['methods']['current']['output']>

type TestEvent = NonNullable<CurrentRun['events']>[number]

type StoredGrab = z.output<(typeof Page)['methods']['grabs.save']['input']>['grab']

const NO_RUN: RunResult = {summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0}, failures: [], tests: []}

const TEST_EVENT = `rpc.${TestRunner.id}.event`

const TestEventSchema = TestRunner.events.event.schema

export const testRunnerBundle: FakeBundle = {
  info: {
    id: TestRunner.id,
    source: {type: 'package', target: TestRunner.id},
    features: {server: true, rpc: true, experimental: true},
    state: {status: 'active'},
  },
  experimental: async () => ({
    file: 'plugin-experimental.cjs',
    code: testRunnerCode,
    revision: `${TestRunner.id}-playground`,
    options: {},
    chunks: [],
  }),
}

export function builtinBundle(id: string): FakeBundle {
  return {info: {id, source: {type: 'builtin'}, features: {server: true, rpc: true}, state: {status: 'active'}}}
}

export function createTestRunnerRpc(): PlaygroundRpc {
  const run: {events: TestEvent[]; result: RunResult} = {events: [], result: NO_RUN}
  return {
    id: TestRunner.id,
    observe: (type, data) => {
      if (type !== TEST_EVENT) return
      const event = TestEventSchema.parse(data)
      if (event.type === 'run-start') run.events = []
      run.events.push(event)
      if (event.type === 'run-end') run.result = {summary: event.summary, failures: event.failures, tests: event.tests}
    },
    methods: {
      status: (): RunResult => run.result,
      current: (): CurrentRun => ({events: run.events.length === 0 ? null : [...run.events], unavailable: null}),
      list: () => ({files: []}),
      run: (): RunResult => run.result,
      stop: () => ({ok: true}),
    },
  }
}

export function createPageRpc(): PlaygroundRpc {
  const grabs = new Map<string, StoredGrab>()
  const SaveInput = Page.methods['grabs.save'].input
  const GetInput = Page.methods['grabs.get'].input
  return {
    id: Page.id,
    methods: {
      'grabs.save': (input) => {
        const id = `grab_${crypto.randomUUID()}`
        grabs.set(id, SaveInput.parse(input).grab)
        return {id}
      },
      'grabs.get': (input) => grabs.get(GetInput.parse(input).id) ?? null,
      'captures.list': () => ({captures: [], cssBundles: {}}),
      symbolicate: () => null,
    },
  }
}
