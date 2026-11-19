import {Match, Switch, type JSX} from 'solid-js'
import type {ToolProps} from '@conciv/plugin/experimental'
import {JsonTree, ResultImage} from '@conciv/ui-kit-chat/tools'
import {
  ChipRow,
  ELEMENT_TARGET_KEYS,
  PageTool,
  elementTarget,
  outputChips,
  outputImageUrl,
  outputPayload,
  pageTitle,
} from './shared.js'

function payloadIsStructured(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null
}

export function ReadValueCard(props: ToolProps): JSX.Element {
  const payload = () => outputPayload(props.output)
  const nested = () => payloadIsStructured(payload())
  const values = () => outputChips(props.output)
  const imageUrl = () => outputImageUrl(props.output)
  return (
    <PageTool
      {...props}
      subtitle={elementTarget(props.input)}
      skip={ELEMENT_TARGET_KEYS}
      hasContent={imageUrl() !== undefined || nested() || values().length > 0}
    >
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={imageUrl()}>{(url) => <ResultImage src={url()} alt={pageTitle(props.tool, false)} />}</Match>
          <Match when={nested()}>
            <JsonTree data={payload()} />
          </Match>
          <Match when={values().length > 0}>
            <ChipRow chips={values()} />
          </Match>
        </Switch>
      </div>
    </PageTool>
  )
}
