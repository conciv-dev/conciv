import {Outlet, createFileRoute} from '@tanstack/solid-router'

export const Route = createFileRoute('/panel/$sessionId')({component: PanelSession})

function PanelSession() {
  return <Outlet />
}
