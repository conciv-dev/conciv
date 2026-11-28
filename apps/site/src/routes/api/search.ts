import {createFileRoute} from '@tanstack/react-router'
import {searchDocs} from '@/lib/docs.functions'

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: async ({request}) => {
        const params = new URL(request.url).searchParams
        const query = params.get('query')
        if (!query) return Response.json([])
        const limit = Number(params.get('limit'))
        return Response.json(
          await searchDocs({
            data: {
              query,
              tag: params.get('tag')?.split(','),
              limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
            },
          }),
        )
      },
    },
  },
})
