import {defineCommand} from 'citty'
import {runRpc} from './request.js'

export const serverCommand = defineCommand({
  meta: {name: 'server', description: 'inspect & nudge the live dev server'},
  subCommands: {
    config: defineCommand({
      meta: {name: 'config', description: 'resolved root, base, aliases, plugins'},
      run: () => runRpc((rpc) => rpc.server.config(undefined)),
    }),
    urls: defineCommand({
      meta: {name: 'urls', description: 'the dev server urls'},
      run: () => runRpc((rpc) => rpc.server.urls(undefined)),
    }),
    resolve: defineCommand({
      meta: {name: 'resolve', description: 'where an import resolves'},
      args: {
        spec: {type: 'positional', required: true, description: 'the import specifier'},
        importer: {type: 'string', description: 'resolve as if imported from this file'},
      },
      run: ({args}) => runRpc((rpc) => rpc.server.resolve({spec: args.spec, importer: args.importer})),
    }),
    graph: defineCommand({
      meta: {name: 'graph', description: 'importers + imported modules of a file'},
      args: {file: {type: 'positional', required: true, description: 'the file to inspect'}},
      run: ({args}) => runRpc((rpc) => rpc.server.graph({file: args.file})),
    }),
    transform: defineCommand({
      meta: {name: 'transform', description: 'the transformed code the server serves for a url'},
      args: {url: {type: 'positional', required: true, description: 'the module url'}},
      run: ({args}) => runRpc((rpc) => rpc.server.transform({url: args.url})),
    }),
    reload: defineCommand({
      meta: {name: 'reload', description: 'force-HMR a module'},
      args: {file: {type: 'positional', required: true, description: 'the file to reload'}},
      run: ({args}) => runRpc((rpc) => rpc.server.reload({file: args.file})),
    }),
    restart: defineCommand({
      meta: {name: 'restart', description: 'restart / re-bundle deps'},
      args: {force: {type: 'boolean', description: 'force a full restart'}},
      run: ({args}) => runRpc((rpc) => rpc.server.restart({force: args.force ?? false})),
    }),
  },
})
