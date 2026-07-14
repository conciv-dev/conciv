import {createFileRoute} from '@tanstack/react-router'
import {pairText} from '@/lib/pair-text'

export const Route = createFileRoute('/pair/$token')({
  server: {
    handlers: {
      GET({params}) {
        return new Response(pairText(params.token, 'https://conciv.dev'), {
          headers: {'content-type': 'text/plain; charset=utf-8'},
        })
      },
    },
  },
})
