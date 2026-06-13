import {z} from 'zod'
import {defineCommand} from 'citty'
import {runRequest, type CliRequest} from './request.js'

// `devgent tools test <action>` — run & inspect the previewed app's test suite (runner-blind;
// the configured runner is resolved server-side). Legacy alias: `devgent tools vitest …`.
const RunArgs = z.object({
  patterns: z.array(z.string()).optional(),
  testNamePattern: z.string().optional(),
  failedOnly: z.boolean().optional(),
})

// Pure: validated args → request against the core /api/test-runner/* surface.
export function testRequest(action: string, raw: Record<string, unknown>): CliRequest {
  if (action === 'list') return {method: 'GET', path: `/api/test-runner/list${raw.failed ? '?failed=1' : ''}`}
  if (action === 'status') return {method: 'GET', path: '/api/test-runner/status'}
  if (action === 'stop') return {method: 'POST', path: '/api/test-runner/stop', body: {}}
  if (action === 'open') return {method: 'GET', path: '/api/test-runner/ui'}
  if (action === 'run') {
    const p = RunArgs.parse(raw)
    const body: Record<string, unknown> = {patterns: p.patterns ?? []}
    if (p.testNamePattern) body.testNamePattern = p.testNamePattern
    if (p.failedOnly) body.failedOnly = true
    return {method: 'POST', path: '/api/test-runner/run', body}
  }
  throw new Error(`unknown test action: ${action}`)
}

async function send(req: CliRequest): Promise<void> {
  process.stdout.write((await runRequest(req)) + '\n')
}

export const testCommand = defineCommand({
  meta: {name: 'test', description: "run & inspect the previewed app's test suite"},
  subCommands: {
    list: defineCommand({
      meta: {name: 'list', description: 'test files (+ last status)'},
      args: {failed: {type: 'boolean', description: 'only currently-failing files'}},
      run: ({args}) => send(testRequest('list', {failed: args.failed})),
    }),
    status: defineCommand({
      meta: {name: 'status', description: 'current snapshot, no run'},
      run: () => send(testRequest('status', {})),
    }),
    run: defineCommand({
      meta: {name: 'run', description: 'run all, or files matching <pattern>; blocks and prints a JSON summary'},
      args: {
        testNamePattern: {type: 'string', alias: 't', description: 'filter by test name'},
        failed: {type: 'boolean', description: 're-run only currently-failing files'},
      },
      run: ({args}) =>
        send(
          testRequest('run', {
            // positionals are unknown[]; narrow to strings with a guard, never `as string[]`.
            patterns: (args._ ?? []).filter((p): p is string => typeof p === 'string'),
            testNamePattern: args.testNamePattern,
            failedOnly: args.failed,
          }),
        ),
    }),
    open: defineCommand({
      meta: {name: 'open', description: 'open the full test-runner UI in a browser tab'},
      run: () => send(testRequest('open', {})),
    }),
    stop: defineCommand({
      meta: {name: 'stop', description: 'stop the watcher'},
      run: () => send(testRequest('stop', {})),
    }),
  },
})
