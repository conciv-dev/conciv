import {createFileRoute, redirect} from '@tanstack/solid-router'
import {SETTINGS_APPEARANCE_PATH} from '../settings/settings-sections.js'

export const Route = createFileRoute('/panel/settings/')({
  beforeLoad: () => {
    throw redirect({to: SETTINGS_APPEARANCE_PATH, replace: true})
  },
})
