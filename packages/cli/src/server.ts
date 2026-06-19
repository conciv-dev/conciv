import {defineCommand} from 'citty'
import {qs, runAndPrint} from './request.js'

// `mandarax tools server <action>` — inspect & nudge the live dev server via the BundlerBridge.
// citty validates arg shape (required positionals, booleans); each run builds its own request
// against /api/server/* directly — no stringly-typed dispatcher in between.
export const serverCommand = defineCommand({
  meta: {name: 'server', description: 'inspect & nudge the live dev server'},
  subCommands: {
    config: defineCommand({
      meta: {name: 'config', description: 'resolved root, base, aliases, plugins'},
      run: () => runAndPrint({method: 'GET', path: '/api/server/config'}),
    }),
    urls: defineCommand({
      meta: {name: 'urls', description: 'the dev server urls'},
      run: () => runAndPrint({method: 'GET', path: '/api/server/urls'}),
    }),
    resolve: defineCommand({
      meta: {name: 'resolve', description: 'where an import resolves'},
      args: {
        spec: {type: 'positional', required: true, description: 'the import specifier'},
        importer: {type: 'string', description: 'resolve as if imported from this file'},
      },
      run: ({args}) =>
        runAndPrint({method: 'GET', path: `/api/server/resolve${qs({spec: args.spec, importer: args.importer})}`}),
    }),
    graph: defineCommand({
      meta: {name: 'graph', description: 'importers + imported modules of a file'},
      args: {file: {type: 'positional', required: true, description: 'the file to inspect'}},
      run: ({args}) => runAndPrint({method: 'GET', path: `/api/server/graph${qs({file: args.file})}`}),
    }),
    transform: defineCommand({
      meta: {name: 'transform', description: 'the transformed code the server serves for a url'},
      args: {url: {type: 'positional', required: true, description: 'the module url'}},
      run: ({args}) => runAndPrint({method: 'GET', path: `/api/server/transform${qs({url: args.url})}`}),
    }),
    reload: defineCommand({
      meta: {name: 'reload', description: 'force-HMR a module'},
      args: {file: {type: 'positional', required: true, description: 'the file to reload'}},
      run: ({args}) => runAndPrint({method: 'POST', path: '/api/server/reload', body: {file: args.file}}),
    }),
    restart: defineCommand({
      meta: {name: 'restart', description: 'restart / re-bundle deps'},
      args: {force: {type: 'boolean', description: 'force a full restart'}},
      run: ({args}) => runAndPrint({method: 'POST', path: '/api/server/restart', body: {force: args.force ?? false}}),
    }),
  },
})
