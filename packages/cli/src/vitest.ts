import {z} from 'zod'
import {defineCommand} from 'citty'
import {runRequest, type CliRequest} from './request.js'

// `devgent tools vitest <action>` — run & inspect the previewed app's vitest suite.
const RunArgs = z.object({
  patterns: z.array(z.string()).optional(),
  testNamePattern: z.string().optional(),
  failedOnly: z.boolean().optional(),
})

// Pure: validated args → request. Reproduces the server's existing /__pw/tools/vitest/* shapes.
export function vitestRequest(action: string, raw: Record<string, unknown>): CliRequest {
  if (action === 'list') return {method: 'GET', path: `/__pw/tools/vitest/list${raw.failed ? '?failed=1' : ''}`}
  if (action === 'status') return {method: 'GET', path: '/__pw/tools/vitest/status'}
  if (action === 'stop') return {method: 'POST', path: '/__pw/tools/vitest/stop', body: {}}
  if (action === 'open') return {method: 'GET', path: '/__pw/tools/vitest/ui'}
  if (action === 'run') {
    const p = RunArgs.parse(raw)
    const body: Record<string, unknown> = {patterns: p.patterns ?? []}
    if (p.testNamePattern) body.testNamePattern = p.testNamePattern
    if (p.failedOnly) body.failedOnly = true
    return {method: 'POST', path: '/__pw/tools/vitest/run', body}
  }
  throw new Error(`unknown vitest action: ${action}`)
}

async function send(req: CliRequest): Promise<void> {
  process.stdout.write((await runRequest(req)) + '\n')
}

export const vitestCommand = defineCommand({
  meta: {name: 'vitest', description: "run & inspect the previewed app's vitest suite"},
  subCommands: {
    list: defineCommand({
      meta: {name: 'list', description: 'test files (+ last status)'},
      args: {failed: {type: 'boolean', description: 'only currently-failing files'}},
      run: ({args}) => send(vitestRequest('list', {failed: args.failed})),
    }),
    status: defineCommand({
      meta: {name: 'status', description: 'current snapshot, no run'},
      run: () => send(vitestRequest('status', {})),
    }),
    run: defineCommand({
      meta: {name: 'run', description: 'run all, or files matching <pattern>; blocks and prints a JSON summary'},
      args: {
        testNamePattern: {type: 'string', alias: 't', description: 'filter by test name'},
        failed: {type: 'boolean', description: 're-run only currently-failing files'},
      },
      run: ({args}) =>
        send(
          vitestRequest('run', {
            patterns: (args._ ?? []) as string[],
            testNamePattern: args.testNamePattern,
            failedOnly: args.failed,
          }),
        ),
    }),
    open: defineCommand({
      meta: {name: 'open', description: 'open the full @vitest/ui in a browser tab'},
      run: () => send(vitestRequest('open', {})),
    }),
    stop: defineCommand({
      meta: {name: 'stop', description: 'stop the watcher'},
      run: () => send(vitestRequest('stop', {})),
    }),
  },
})
