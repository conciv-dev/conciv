import {createFileRoute} from '@tanstack/solid-router'

export const Route = createFileRoute('/panel/$sessionId/$view')({component: PanelView})

function PanelView() {
  return null
}
