import {os} from '@orpc/server'
import {z} from 'zod'
import type {RpcContext} from '@conciv/protocol/rpc-types'

const pingOs = os.$context<RpcContext>()

export function makePingRouter() {
  return pingOs.router({
    ping: pingOs
      .input(z.object({value: z.string()}))
      .output(z.object({pong: z.string()}))
      .handler(({input}) => ({pong: input.value})),
  })
}

export type PingRouter = ReturnType<typeof makePingRouter>
