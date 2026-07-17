import {createFileRoute} from '@tanstack/react-router'
import {pairResponse} from '@/lib/pair-text'

export const Route = createFileRoute('/pair/$token')({
  server: {
    handlers: {
      GET({params}) {
        return pairResponse(params.token, 'https://conciv.dev')
      },
    },
  },
})
