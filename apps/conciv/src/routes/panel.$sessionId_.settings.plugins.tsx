import {Outlet, createFileRoute} from '@tanstack/solid-router'
import {writeLastTab} from '../settings/last-tab.js'

export const Route = createFileRoute('/panel/$sessionId_/settings/plugins')({
  onEnter: () => writeLastTab('plugins'),
  component: Outlet,
})
