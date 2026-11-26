import {Navigate, createFileRoute} from '@tanstack/solid-router'
import {Show} from 'solid-js'
import {useConnected} from '../app/context.js'

export const Route = createFileRoute('/')({component: Closed})

function Closed() {
  const search = Route.useSearch()
  const connected = useConnected()
  return (
    <Show when={search().open === true && connected()}>
      <Navigate to="/panel/latest" search={{open: true}} replace />
    </Show>
  )
}
