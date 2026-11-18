import {Show, type JSX} from 'solid-js'
import type {ToolProps} from '@conciv/plugin/experimental'
import {ElementPreview} from '@conciv/ui-kit-chat/tools'
import {useToolCapture} from '../session-captures.js'
import {ELEMENT_TARGET_KEYS, PageTool, elementTarget} from './shared.js'

export function ActCard(props: ToolProps): JSX.Element {
  const capture = useToolCapture()
  const after = () => capture()?.after
  return (
    <PageTool
      {...props}
      subtitle={after() === undefined ? elementTarget(props.input) : undefined}
      skip={ELEMENT_TARGET_KEYS}
      hasContent={after() !== undefined}
    >
      <Show when={after()}>
        {(value) => (
          <ElementPreview.Root capture={value()} css={capture()?.css}>
            <ElementPreview.Frame />
            <ElementPreview.Descriptor />
          </ElementPreview.Root>
        )}
      </Show>
    </PageTool>
  )
}
