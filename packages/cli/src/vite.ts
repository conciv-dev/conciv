import {z} from 'zod'
import {defineCommand} from 'citty'
import {qs, runRequest, type CliRequest} from './request.js'

// `devgent tools vite <action>` — inspect & nudge the live ViteDevServer.
const ResolveArgs = z.object({spec: z.string(), importer: z.string().optional()})
const FileArg = z.object({file: z.string()})
const UrlArg = z.object({url: z.string()})
const RestartArgs = z.object({force: z.boolean().optional()})

// Pure: validated args → request. Reproduces the server's existing /__pw/tools/vite/* shapes.
export function viteRequest(action: string, raw: Record<string, unknown>): CliRequest {
  if (action === 'config') return {method: 'GET', path: '/__pw/tools/vite/config'}
  if (action === 'urls') return {method: 'GET', path: '/__pw/tools/vite/urls'}
  if (action === 'resolve') {
    const p = ResolveArgs.parse(raw)
    return {method: 'GET', path: `/__pw/tools/vite/resolve${qs(p)}`}
  }
  if (action === 'graph') return {method: 'GET', path: `/__pw/tools/vite/graph${qs(FileArg.parse(raw))}`}
  if (action === 'transform') return {method: 'GET', path: `/__pw/tools/vite/transform${qs(UrlArg.parse(raw))}`}
  if (action === 'reload')
    return {method: 'POST', path: '/__pw/tools/vite/reload', body: {file: FileArg.parse(raw).file}}
  if (action === 'restart') {
    return {method: 'POST', path: '/__pw/tools/vite/restart', body: {force: RestartArgs.parse(raw).force ?? false}}
  }
  throw new Error(`unknown vite action: ${action}`)
}

async function send(req: CliRequest): Promise<void> {
  process.stdout.write((await runRequest(req)) + '\n')
}

export const viteCommand = defineCommand({
  meta: {name: 'vite', description: 'inspect & nudge the live vite dev server'},
  subCommands: {
    config: defineCommand({
      meta: {name: 'config', description: 'resolved root, base, aliases, plugins'},
      run: () => send(viteRequest('config', {})),
    }),
    urls: defineCommand({
      meta: {name: 'urls', description: 'the dev server urls'},
      run: () => send(viteRequest('urls', {})),
    }),
    resolve: defineCommand({
      meta: {name: 'resolve', description: 'where an import resolves'},
      args: {
        spec: {type: 'positional', required: true, description: 'the import specifier'},
        importer: {type: 'string', description: 'resolve as if imported from this file'},
      },
      run: ({args}) => send(viteRequest('resolve', args as Record<string, unknown>)),
    }),
    graph: defineCommand({
      meta: {name: 'graph', description: 'importers + imported modules of a file'},
      args: {file: {type: 'positional', required: true, description: 'the file to inspect'}},
      run: ({args}) => send(viteRequest('graph', args as Record<string, unknown>)),
    }),
    transform: defineCommand({
      meta: {name: 'transform', description: 'the transformed code vite serves for a url'},
      args: {url: {type: 'positional', required: true, description: 'the module url'}},
      run: ({args}) => send(viteRequest('transform', args as Record<string, unknown>)),
    }),
    reload: defineCommand({
      meta: {name: 'reload', description: 'force-HMR a module'},
      args: {file: {type: 'positional', required: true, description: 'the file to reload'}},
      run: ({args}) => send(viteRequest('reload', args as Record<string, unknown>)),
    }),
    restart: defineCommand({
      meta: {name: 'restart', description: 'restart / re-bundle deps'},
      args: {force: {type: 'boolean', description: 'force a full restart'}},
      run: ({args}) => send(viteRequest('restart', args as Record<string, unknown>)),
    }),
  },
})
