import {createMemo, Match, splitProps, Switch, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {GenericTool} from './basic-tool.js'
import {ToolErrorCard} from './tool-error-card.js'
import {ToolDurationProvider} from './card-chrome.js'

export type ToolDisplayProps = ToolProps & {
  id: string
  render?: (name: string) => ToolComponent | undefined
  durationMs?: number
}

function toolDisplayError(status: string | undefined, error: string | undefined): string | undefined {
  if (status === 'error') return error ?? ''
  return undefined
}

export function ToolDisplay(props: ToolDisplayProps): JSX.Element {
  const [local, tool] = splitProps(props, ['id', 'render', 'durationMs'])
  const error = createMemo(() => toolDisplayError(tool.status, tool.error))
  const durationMs = (): number | undefined => local.durationMs
  const render = createMemo((): ToolComponent => local.render?.(tool.tool) ?? GenericTool)
  return (
    <ToolDurationProvider value={durationMs}>
      <div data-component="tool-part-wrapper" data-timeline-part-id={local.id} class="min-w-0 w-full">
        <Switch>
          <Match when={error() !== undefined}>
            <ToolErrorCard
              tool={tool.tool}
              error={error() ?? ''}
              defaultOpen={tool.defaultOpen}
              open={tool.open}
              onOpenChange={tool.onOpenChange}
            />
          </Match>
          <Match when={true}>
            <Dynamic component={render()} {...tool} />
          </Match>
        </Switch>
      </div>
    </ToolDurationProvider>
  )
}
