import {createFileRoute, redirect} from '@tanstack/solid-router'
import {SETTINGS_TAB_ROUTES, readLastTab} from '../settings/last-tab.js'

export const Route = createFileRoute('/panel/$sessionId_/settings/')({
  beforeLoad: ({params}) => {
    const last = readLastTab()
    if (typeof last === 'string') throw redirect({to: SETTINGS_TAB_ROUTES[last], params, replace: true})
    throw redirect({
      to: '/panel/$sessionId/settings/extensions/$name',
      params: {sessionId: params.sessionId, name: last.extension},
      replace: true,
    })
  },
})
