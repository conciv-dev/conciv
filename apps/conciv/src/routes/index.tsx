import {createFileRoute} from '@tanstack/solid-router'

export const Route = createFileRoute('/')({component: Closed})

function Closed() {
  return null
}
