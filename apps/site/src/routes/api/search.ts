import {createFileRoute} from '@tanstack/react-router'
import {source} from '@/lib/source'
import {docsEnabled} from '@/lib/shared'
import {createFromSource} from 'fumadocs-core/search/server'

const server = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: 'english',
})

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: async ({request}) => {
        if (!docsEnabled) return new Response(null, {status: 404})
        return server.GET(request)
      },
    },
  },
})
