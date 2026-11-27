import {defineErrorCatalog} from 'evlog'

export const serveErrors = defineErrorCatalog('serve', {
  SPLIT_ADAPTER: {
    message:
      'the rpc websocket upgrade was refused by the hono node-server adapter: the upgradeWebSocket passed to rpcWebsocketRoute comes from a different @hono/node-server module instance than the running server.',
    fix: 'Import upgradeWebSocket from @conciv/serve so both come from one instance.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    serve: typeof serveErrors
  }
}
