import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'
import * as Rpc from '@conciv/protocol/schema/rpc'
import {SessionId} from '@conciv/types/chat-types'

const QueueJobs = Rpc.define({
  id: 'queue-jobs',
  methods: {
    queue: {
      input: z.object({sessionId: SessionId, queueId: z.string()}),
      output: z.object({id: z.string(), status: z.string()}),
    },
  },
  events: {},
})

export default Plugin.define({
  id: 'queue-jobs',
  async setup(ctx) {
    await ctx.rpc.register(QueueJobs, {
      queue: async ({sessionId, queueId}) => {
        const started = await ctx.job.start({
          id: queueId,
          type: 'page-queue',
          background: true,
          recovery: {kind: 'page-queue', sessionID: sessionId, queueId},
          run: () => new Promise<string>(() => undefined),
        })
        return {id: started.id, status: started.status}
      },
    })
  },
})
