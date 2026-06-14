import {z} from 'zod'
import {defineCommand} from 'citty'
import {qs, runRequest, type CliRequest} from './request.js'

// `aidx tools server <action>` — inspect & nudge the live dev server via the BundlerBridge.
const ResolveArgs = z.object({spec: z.string(), importer: z.string().optional()})
const FileArg = z.object({file: z.string()})
const UrlArg = z.object({url: z.string()})
const RestartArgs = z.object({force: z.boolean().optional()})

// Pure: validated args → request against the core /api/server/* (BundlerBridge) surface.
export function serverRequest(action: string, raw: Record<string, unknown>): CliRequest {
  if (action === 'config') return {method: 'GET', path: '/api/server/config'}
  if (action === 'urls') return {method: 'GET', path: '/api/server/urls'}
  if (action === 'resolve') {
    const p = ResolveArgs.parse(raw)
    return {method: 'GET', path: `/api/server/resolve${qs(p)}`}
  }
  if (action === 'graph') return {method: 'GET', path: `/api/server/graph${qs(FileArg.parse(raw))}`}
  if (action === 'transform') return {method: 'GET', path: `/api/server/transform${qs(UrlArg.parse(raw))}`}
  if (action === 'reload') return {method: 'POST', path: '/api/server/reload', body: {file: FileArg.parse(raw).file}}
  if (action === 'restart') {
    return {method: 'POST', path: '/api/server/restart', body: {force: RestartArgs.parse(raw).force ?? false}}
  }
  throw new Error(`unknown server action: ${action}`)
}

async function send(req: CliRequest): Promise<void> {
  process.stdout.write((await runRequest(req)) + '\n')
}

export const serverCommand = defineCommand({
  meta: {name: 'server', description: 'inspect & nudge the live dev server'},
  subCommands: {
    config: defineCommand({
      meta: {name: 'config', description: 'resolved root, base, aliases, plugins'},
      run: () => send(serverRequest('config', {})),
    }),
    urls: defineCommand({
      meta: {name: 'urls', description: 'the dev server urls'},
      run: () => send(serverRequest('urls', {})),
    }),
    resolve: defineCommand({
      meta: {name: 'resolve', description: 'where an import resolves'},
      args: {
        spec: {type: 'positional', required: true, description: 'the import specifier'},
        importer: {type: 'string', description: 'resolve as if imported from this file'},
      },
      run: ({args}) => send(serverRequest('resolve', {spec: args.spec, importer: args.importer})),
    }),
    graph: defineCommand({
      meta: {name: 'graph', description: 'importers + imported modules of a file'},
      args: {file: {type: 'positional', required: true, description: 'the file to inspect'}},
      run: ({args}) => send(serverRequest('graph', {file: args.file})),
    }),
    transform: defineCommand({
      meta: {name: 'transform', description: 'the transformed code the server serves for a url'},
      args: {url: {type: 'positional', required: true, description: 'the module url'}},
      run: ({args}) => send(serverRequest('transform', {url: args.url})),
    }),
    reload: defineCommand({
      meta: {name: 'reload', description: 'force-HMR a module'},
      args: {file: {type: 'positional', required: true, description: 'the file to reload'}},
      run: ({args}) => send(serverRequest('reload', {file: args.file})),
    }),
    restart: defineCommand({
      meta: {name: 'restart', description: 'restart / re-bundle deps'},
      args: {force: {type: 'boolean', description: 'force a full restart'}},
      run: ({args}) => send(serverRequest('restart', {force: args.force})),
    }),
  },
})
