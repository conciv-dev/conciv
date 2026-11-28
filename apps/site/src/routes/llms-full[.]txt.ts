import {createFileRoute} from '@tanstack/react-router'
import {getLlmsFullText} from '@/lib/docs.functions'

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => {
        return new Response(await getLlmsFullText())
      },
    },
  },
})
