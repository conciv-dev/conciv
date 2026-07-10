import {createFileRoute} from '@tanstack/solid-router'

export const Route = createFileRoute('/panel/$sessionId/')({component: ChatPane})

function ChatPane() {
  return null
}
