import {createFileRoute} from '@tanstack/solid-router'

export const Route = createFileRoute('/pip/$sessionId')({component: PipSession})

function PipSession() {
  return null
}
