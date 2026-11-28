import {Show, type JSX} from 'solid-js'
import {usePlugin, type ToolProps} from '@conciv/frontend-plugin-api'
import {FigmaKeyForm, FigmaKeys} from './figma-key-form.js'
import {FIGMA_KEY_SETTINGS} from './figma-key-model.js'
import {readFigmaKeyAsk} from './figma-key-text.js'

export function FigmaKeySettings(): JSX.Element {
  const ui = usePlugin().ui
  return (
    <ui.SettingsLayout title="Figma" description="The key design_get reads Figma frames with.">
      <ui.SettingsSection title="Key">
        <ui.SettingsRow title="New key" description="A Figma personal access token." />
        <div class="p-3">
          <FigmaKeyForm afterSave="Key saved." />
        </div>
        <FigmaKeys />
      </ui.SettingsSection>
    </ui.SettingsLayout>
  )
}

export function DesignGetFailed(props: ToolProps): JSX.Element {
  const ctx = usePlugin()
  const ui = ctx.ui
  const asked = () => readFigmaKeyAsk(props.error ?? '')
  return (
    <section aria-label="Read the design" class="p-3 flex flex-col gap-2">
      <p role="alert">{asked() ?? props.error}</p>
      <Show when={asked() !== undefined}>
        <FigmaKeyForm afterSave="Key saved. Ask the agent to try again.">
          <ui.Button variant="ghost" icon="settings" onClick={() => ctx.layout.settings(FIGMA_KEY_SETTINGS)}>
            Open settings
          </ui.Button>
        </FigmaKeyForm>
      </Show>
    </section>
  )
}
