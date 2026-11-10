import {createFileRoute, redirect} from '@tanstack/solid-router'
import {Show, type JSX} from 'solid-js'
import {ExtensionSettingsForm} from '../settings/extension-settings-form.js'
import {writeLastTab} from '../settings/last-tab.js'

export const Route = createFileRoute('/panel/$sessionId_/settings/extensions/$name')({
  beforeLoad: ({context, params}) => {
    const extension = context.extensions.find((candidate) => candidate.name === params.name && candidate.settings)
    if (!extension)
      throw redirect({to: '/panel/$sessionId/settings/general', params: {sessionId: params.sessionId}, replace: true})
    return {settingsExtension: extension}
  },
  onEnter: ({params}) => writeLastTab({extension: params.name}),
  component: ExtensionSettings,
})

function ExtensionSettings(): JSX.Element {
  const context = Route.useRouteContext()
  return (
    <Show when={context().settingsExtension} keyed>
      <ExtensionSettingsForm />
    </Show>
  )
}
