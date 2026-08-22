import {createFileRoute, redirect} from '@tanstack/solid-router'
import {SETTINGS_FIRST_SECTION} from '../settings/settings-sections.js'

export const Route = createFileRoute('/panel/settings/')({
  beforeLoad: () => {
    throw redirect({to: SETTINGS_FIRST_SECTION.path, replace: true})
  },
})
