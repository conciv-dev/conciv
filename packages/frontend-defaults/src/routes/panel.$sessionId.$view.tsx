import {Outlet, createFileRoute, redirect} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {isPluginView} from '@internal/frontend-app-api/plugin/panel-keys'
import {PluginTabContent} from '../shell/plugin-surfaces.js'

export const Route = createFileRoute('/panel/$sessionId/$view')({
  beforeLoad: ({context, params}) => {
    if (
      isPluginView(params.view) &&
      context.pluginPanels.status({sessionId: params.sessionId, key: params.view}) !== 'unlisted'
    )
      return
    throw redirect({to: '/panel/$sessionId', params: {sessionId: params.sessionId}, replace: true})
  },
  component: PanelView,
})

function PanelView(): JSX.Element {
  return (
    <>
      <PluginTabContent />
      <Outlet />
    </>
  )
}
