import {createMemo, Match, splitProps, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import {Dynamic} from 'solid-js/web'
import type {ToolComponent, ToolProps, ToolRegistry} from '@conciv/frontend-plugin-api'
import {BasicTool, GenericTool} from './basic-tool.js'
import {ToolErrorCard} from './tool-error-card.js'
import {ToolPartProvider} from './card-chrome.js'
import {toolErrorSubtitle, webSearchProviderLabel} from '../primitives/tool-error-subtitle.js'

export type ToolDisplayProps = ToolProps & {
  id: string
  render?: (name: string) => Pick<ToolRegistry, 'render' | 'errorComponent'> | undefined
  renderPending?: boolean
  durationMs?: number
  tag?: string
}

const ProviderSchema = z.string().optional().catch(undefined)

function PendingTool(props: {tool: string}): JSX.Element {
  return <BasicTool status="running" trigger={{title: props.tool}} hideDetails />
}

function toolDisplayError(status: string | undefined, error: string | undefined): string | undefined {
  if (status === 'error') return error ?? ''
  return undefined
}

export function ToolDisplay(props: ToolDisplayProps): JSX.Element {
  const [local, tool] = splitProps(props, ['id', 'render', 'renderPending', 'durationMs', 'tag'])
  const error = createMemo(() => toolDisplayError(tool.status, tool.error))
  const durationMs = (): number | undefined => local.durationMs
  const errorTitle = () =>
    tool.tool === 'websearch' ? webSearchProviderLabel(ProviderSchema.parse(tool.metadata.provider)) : undefined
  const errorSubtitle = createMemo(() => toolErrorSubtitle(tool))
  const entry = createMemo(() => local.render?.(tool.tool))
  const render = createMemo((): ToolComponent => entry()?.render ?? (local.renderPending ? PendingTool : GenericTool))
  return (
    <ToolPartProvider callId={local.id} tag={local.tag} duration={durationMs}>
      <div data-component="tool-part-wrapper" data-timeline-part-id={local.id} class="min-w-0 w-full">
        <Switch>
          <Match when={error() !== undefined && entry()?.errorComponent}>
            {(errorComponent) => <Dynamic component={errorComponent()} {...tool} error={error()} />}
          </Match>
          <Match when={error() !== undefined}>
            <ToolErrorCard
              tool={tool.tool}
              error={error() ?? ''}
              title={errorTitle()}
              subtitle={errorSubtitle()}
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
    </ToolPartProvider>
  )
}
