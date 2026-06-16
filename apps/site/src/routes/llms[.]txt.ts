import {source} from '@/lib/source'
import {docsEnabled} from '@/lib/shared'
import {createFileRoute} from '@tanstack/react-router'
import {llms} from 'fumadocs-core/source'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET() {
        if (!docsEnabled) return new Response(null, {status: 404})
        return new Response(llms(source).index())
      },
    },
  },
})
