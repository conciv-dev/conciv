import type {Router} from '@orpc/server'
import {Effect} from 'effect'
import type {contract} from '@conciv/protocol'
import type {RpcContext} from '@conciv/types/rpc-types'
import * as Job from '@conciv/backend-app-api/core/job'
import type {RpcDeps} from './mount.js'
import {os} from './mount.js'

const RESTARTED = 'Interrupted by server restart.'

type Waited = {id: string; status: Job.Status; output?: string; error?: string}

function readWaited(info: Job.Info): Waited {
  return {
    id: info.id,
    status: info.status,
    ...(info.output === undefined ? {} : {output: info.output}),
    ...(info.error === undefined ? {} : {error: info.error}),
  }
}

const waitOne = Effect.fn('JobsRpc.wait')(function* (jobs: Job.Interface, id: string, waitMs: number) {
  const live = yield* jobs.get(id)
  if (live !== undefined) {
    const {info} = yield* jobs.wait({id, timeout: waitMs})
    if (info === undefined) return []
    if (info.status !== 'running' && info.notificationID !== undefined)
      yield* jobs.completeBackground(info.notificationID)
    return [readWaited(info)]
  }
  const row = (yield* jobs.pendingBackground).find((background) => background.id === id)
  if (row === undefined) return []
  yield* jobs.completeBackground(row.notificationID)
  if (row.status === 'running') return [{id, status: 'cancelled' as const, error: RESTARTED}]
  return [
    {
      id,
      status: row.status,
      ...(row.output === undefined ? {} : {output: row.output}),
      ...(row.error === undefined ? {} : {error: row.error}),
    },
  ]
})

export function jobsRouter(deps: RpcDeps): Router<typeof contract.jobs, RpcContext> {
  const host = deps.pluginHost
  return {
    list: os.jobs.list.handler(({input, signal}) =>
      host.runPromise(
        Job.Service.use((jobs) =>
          Effect.gen(function* () {
            const owned = (yield* jobs.backgroundJobs).filter((item) => item.sessionID === input.sessionId)
            const called = input.toolCallIds
            if (called === undefined) return {data: owned}
            const data = yield* Effect.filter(owned, (item) =>
              jobs.get(item.id).pipe(
                Effect.map((info) => {
                  const toolCallId = info?.metadata?.toolCallId
                  return typeof toolCallId === 'string' && called.includes(toolCallId)
                }),
              ),
            )
            return {data}
          }),
        ),
        {signal},
      ),
    ),
    wait: os.jobs.wait.handler(({input, signal}) =>
      host.runPromise(
        Job.Service.use((jobs) =>
          Effect.forEach(input.ids, (id) => waitOne(jobs, id, input.waitMs), {concurrency: 'unbounded'}).pipe(
            Effect.map((waited) => ({data: waited.flat()})),
          ),
        ),
        {signal},
      ),
    ),
  }
}
