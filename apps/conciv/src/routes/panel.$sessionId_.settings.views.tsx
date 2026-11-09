import {createFileRoute} from '@tanstack/solid-router'
import {createMemo, type JSX} from 'solid-js'
import MessageSquare from 'lucide-solid/icons/message-square'
import {useInstances} from '../app/context.js'
import {collectViews} from '../extension/extension-views.js'
import {PreferencesForm} from '../settings/preferences-form.js'
import {Group, TEXT_LINK} from '../settings/settings-ui.js'
import {ViewRow, ViewsList} from '../settings/views-list.js'

const CHAT_VIEW = {id: 'chat', label: 'Chat', icon: MessageSquare}

export const Route = createFileRoute('/panel/$sessionId_/settings/views')({component: ViewsSettings})

function ViewsSettings(): JSX.Element {
  const instances = useInstances()
  const views = createMemo(() =>
    collectViews(instances).map((view) => ({
      id: view.id,
      label: view.label,
      icon: view.icon,
      badge: view.instance.extension.name,
    })),
  )
  return (
    <PreferencesForm label="Views">
      {(form) => (
        <form.AppField name="docksHidden">
          {(hidden) => (
            <form.AppField name="docksPinned">
              {(pinned) => (
                <form.AppField name="docksCustomOrder">
                  {(order) => (
                    <Group
                      title="Tab bar"
                      description="Drag, or Alt + arrow keys, to reorder."
                      action={
                        <button
                          type="button"
                          class={TEXT_LINK}
                          disabled={Object.keys(order().state.value).length === 0}
                          onClick={() => order().handleChange({})}
                        >
                          Reset order
                        </button>
                      }
                    >
                      <ViewRow view={CHAT_VIEW} shown pinned fixed />
                      <ViewsList views={views()} hidden={hidden()} pinned={pinned()} order={order()} />
                    </Group>
                  )}
                </form.AppField>
              )}
            </form.AppField>
          )}
        </form.AppField>
      )}
    </PreferencesForm>
  )
}
