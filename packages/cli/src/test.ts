import {defineCommand} from 'citty'
import {runAndPrint} from './request.js'

// `mandarax tools test <action>` — run & inspect the previewed app's test suite (runner-blind;
// the configured runner is resolved server-side). Legacy alias: `mandarax tools vitest …`.
// Each run builds its request against /api/test-runner/* directly.
export const testCommand = defineCommand({
  meta: {name: 'test', description: "run & inspect the previewed app's test suite"},
  subCommands: {
    list: defineCommand({
      meta: {name: 'list', description: 'test files (+ last status)'},
      args: {failed: {type: 'boolean', description: 'only currently-failing files'}},
      run: ({args}) => runAndPrint({method: 'GET', path: `/api/test-runner/list${args.failed ? '?failed=1' : ''}`}),
    }),
    status: defineCommand({
      meta: {name: 'status', description: 'current snapshot, no run'},
      run: () => runAndPrint({method: 'GET', path: '/api/test-runner/status'}),
    }),
    run: defineCommand({
      meta: {name: 'run', description: 'run all, or files matching <pattern>; blocks and prints a JSON summary'},
      args: {
        testNamePattern: {type: 'string', alias: 't', description: 'filter by test name'},
        failed: {type: 'boolean', description: 're-run only currently-failing files'},
      },
      run: ({args}) => {
        // positionals are unknown[]; narrow to strings with a guard, never `as string[]`.
        const patterns = (args._ ?? []).filter((p): p is string => typeof p === 'string')
        const body: Record<string, unknown> = {patterns}
        if (args.testNamePattern) body.testNamePattern = args.testNamePattern
        if (args.failed) body.failedOnly = true
        return runAndPrint({method: 'POST', path: '/api/test-runner/run', body})
      },
    }),
    open: defineCommand({
      meta: {name: 'open', description: 'open the full test-runner UI in a browser tab'},
      run: () => runAndPrint({method: 'GET', path: '/api/test-runner/ui'}),
    }),
    stop: defineCommand({
      meta: {name: 'stop', description: 'stop the watcher'},
      run: () => runAndPrint({method: 'POST', path: '/api/test-runner/stop', body: {}}),
    }),
  },
})
