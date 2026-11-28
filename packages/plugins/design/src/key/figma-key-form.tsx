import {For, Show, type JSX} from 'solid-js'
import Lock from 'lucide-solid/icons/lock'
import {usePlugin} from '@conciv/frontend-plugin-api'
import {createFigmaKey} from './figma-key-model.js'
import {FIGMA_KEY_PRIVATE, FIGMA_KEY_PRIVATE_DESCRIPTION} from './figma-key-text.js'

export function FigmaKeyForm(props: {afterSave?: string; children?: JSX.Element}): JSX.Element {
  const ctx = usePlugin()
  const ui = ctx.ui
  const key = createFigmaKey(ctx.client)
  return (
    <div class="flex flex-col gap-2">
      <ui.Callout tone="info" icon={<Lock />} title={FIGMA_KEY_PRIVATE}>
        {FIGMA_KEY_PRIVATE_DESCRIPTION}
      </ui.Callout>
      <form
        class="flex gap-2 items-end"
        onSubmit={(event) => {
          event.preventDefault()
          key.save()
        }}
      >
        <ui.TextInput
          class="flex-1"
          type="password"
          label="Figma API key"
          placeholder="figd_..."
          value={key.form.draft}
          onInput={key.type}
          invalid={key.failed() !== undefined}
        />
        <ui.Button type="submit" icon="lock" busy={key.saving()} disabled={key.form.draft.trim() === ''}>
          Save key
        </ui.Button>
      </form>
      <Show when={key.failed()}>{(failure) => <p role="alert">{failure()}</p>}</Show>
      <Show when={key.form.saved && props.afterSave !== undefined}>
        <p role="status">{props.afterSave}</p>
      </Show>
      {props.children}
    </div>
  )
}

export function FigmaKeys(): JSX.Element {
  const ctx = usePlugin()
  const ui = ctx.ui
  const key = createFigmaKey(ctx.client)
  return (
    <>
      <For each={key.saved()}>
        {(credential) => (
          <ui.SettingsRow title={credential.label} description="Saved key, hidden">
            <ui.IconButton
              icon="trash"
              label={`Remove ${credential.label}`}
              onClick={() => key.remove(credential.id)}
            />
          </ui.SettingsRow>
        )}
      </For>
      <Show when={key.fromEnv()}>
        <ui.SettingsRow
          title="FIGMA_API_KEY"
          description="The engine reads a key from its FIGMA_API_KEY environment variable; a saved key is used before it."
        />
      </Show>
    </>
  )
}
