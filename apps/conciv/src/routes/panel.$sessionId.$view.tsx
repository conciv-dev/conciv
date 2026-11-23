import {Outlet, createFileRoute, redirect} from '@tanstack/solid-router'
import {For, Show, createUniqueId, type JSX} from 'solid-js'
import {AttachmentByMime, AttachmentProvider, type AttachmentState} from '@conciv/ui-kit-chat'
import type {Grab} from '@conciv/grab'
import {GRAB_MIME, grabToFile} from '@conciv/grab/grab-attachment'
import {usePane} from '../app/pane-context.js'
import {guardPluginAttachmentCard} from '../runtime/plugin/plugin-boundary.js'
import {isPluginView} from '../runtime/plugin/panel-keys.js'
import {PluginTabContent} from '../shell/plugin-surfaces.js'
import {pageAttachmentCards} from '@conciv/plugin-page/client'

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

const STAGED_GRAB_CARDS = pageAttachmentCards.map((card) => guardPluginAttachmentCard('conciv.page', 'chip', card))

function stagedGrabAttachment(grab: Grab): AttachmentState {
  const file = grabToFile(grab)
  return {
    id: `staged-grab-${createUniqueId()}`,
    type: 'document',
    name: file.name,
    contentType: GRAB_MIME,
    file,
    status: {type: 'requires-action', reason: 'composer-send'},
  }
}

function StagedGrabStrip(): JSX.Element {
  const pane = usePane()
  return (
    <Show when={pane.grabStaging.staged().length > 0}>
      <div class="px-3 pt-2 flex flex-wrap gap-1">
        <For each={pane.grabStaging.staged()}>
          {(grab) => (
            <AttachmentProvider value={stagedGrabAttachment(grab)}>
              <AttachmentByMime cards={STAGED_GRAB_CARDS} onRemove={() => pane.grabStaging.remove(grab)} />
            </AttachmentProvider>
          )}
        </For>
      </div>
    </Show>
  )
}

function PanelView(): JSX.Element {
  return (
    <>
      <StagedGrabStrip />
      <PluginTabContent />
      <Outlet />
    </>
  )
}
