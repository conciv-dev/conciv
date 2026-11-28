import {createFileRoute} from '@tanstack/react-router'
import {readStarCount} from '@/lib/star-count.server'

const SUCCESS_CACHE_CONTROL = 'public, max-age=1800, stale-while-revalidate=86400'
const FAILURE_CACHE_CONTROL = 'public, max-age=60'

export const Route = createFileRoute('/api/stars')({
  server: {
    handlers: {
      GET: async () => {
        const stars = await readStarCount()
        return Response.json(
          {stars},
          {
            headers: {
              'cache-control': stars === null ? FAILURE_CACHE_CONTROL : SUCCESS_CACHE_CONTROL,
            },
          },
        )
      },
    },
  },
})
