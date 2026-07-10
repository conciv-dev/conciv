import {Outlet, createFileRoute} from '@tanstack/solid-router'

export const Route = createFileRoute('/panel')({component: PanelLayout})

function PanelLayout() {
  return <Outlet />
}
