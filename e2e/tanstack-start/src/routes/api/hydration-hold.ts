import {createFileRoute} from '@tanstack/react-router'

let hold = Promise.withResolvers<void>()

export const Route = createFileRoute('/api/hydration-hold')({
  server: {
    handlers: {
      GET: async () => {
        await hold.promise
        return new Response(null, {status: 204})
      },
      POST: () => {
        hold.resolve()
        hold = Promise.withResolvers<void>()
        return new Response(null, {status: 204})
      },
    },
  },
})
