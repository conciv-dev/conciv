import {createFileRoute, redirect} from '@tanstack/solid-router'

export const Route = createFileRoute('/panel/$sessionId_/settings/')({
  beforeLoad: ({params}) => {
    throw redirect({to: '/panel/$sessionId/settings/appearance', params, replace: true})
  },
})
