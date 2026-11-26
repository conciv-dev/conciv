import {createFileRoute, redirect} from '@tanstack/solid-router'
import {SETTINGS_TAB_ROUTES, readLastTab} from '../settings/last-tab.js'

export const Route = createFileRoute('/panel/$sessionId_/settings/')({
  beforeLoad: ({params}) => {
    throw redirect({to: SETTINGS_TAB_ROUTES[readLastTab()], params, replace: true})
  },
})
