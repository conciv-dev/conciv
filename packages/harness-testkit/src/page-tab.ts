import {createRpcClient} from 'devframe/rpc/client'
import {createWsRpcChannel} from 'devframe/rpc/transports/ws-client'
import {concivRpcOptions} from '@conciv/extension/devframe-function'
import {PAGE_QUERY_FUNCTION} from '@conciv/protocol/page-types'

type PageServerFunctions = {'conciv:page:join': (input: {sessionId: string}) => Promise<unknown>}

export type PageTabAnswer = (query: unknown) => unknown

export type PageTabOptions = {hubUrl: string; token: string; sessionId: string; answer: PageTabAnswer}

export type OpenPageTab = {close: () => void; closed: Promise<void>}

export function openPageTab(options: PageTabOptions): Promise<OpenPageTab> {
  const base = options.hubUrl.endsWith('/') ? options.hubUrl : `${options.hubUrl}/`
  const opened = Promise.withResolvers<() => void>()
  const closed = Promise.withResolvers<void>()
  const channel = createWsRpcChannel({
    url: `${base.replace(/^http/, 'ws')}__ws`,
    authToken: options.token,
    onConnected: () => {
      const rpc = createRpcClient<PageServerFunctions, object>(
        {[PAGE_QUERY_FUNCTION]: async (query: unknown) => options.answer(query)},
        {channel, rpcOptions: concivRpcOptions()},
      )
      rpc
        .$call('conciv:page:join', {sessionId: options.sessionId})
        .then(() => opened.resolve(() => rpc.$close()))
        .catch(opened.reject)
    },
    onError: opened.reject,
    onDisconnected: () => {
      opened.reject(new Error('the page tab disconnected before it joined'))
      closed.resolve()
    },
  })
  return opened.promise.then((closeRpc) => ({
    close: () => {
      closeRpc()
      channel.close()
    },
    closed: closed.promise,
  }))
}
