import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {AppError} from '@conciv/plugin-tanstack/rpc'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {ErrorBlock, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {TruncatedText} from '@conciv/ui-kit-system'
import {CardNote, InspectionCard, settledCardBody} from './card-shared.js'
import {countLabel} from '../page/cards/shared.js'

type BuildError = {message: string; where: string | null}

const LOCATION_CLASS =
  'text-chat-xs text-chat-text-2 leading-[var(--chat-trace-gutter)] font-chat-mono m-0 min-w-0 block'

const AppErrorSchema = AppError.pick({message: true, source: true}).partial({source: true}).loose()

const AppErrorsSchema = z.array(AppErrorSchema)

function formatLocation(source: {file: string; line: number} | null | undefined): string | null {
  if (!source) return null
  return `${source.file}:${source.line}`
}

function parseErrors(result: ToolCardProps['result']): BuildError[] | null {
  const parsed = AppErrorsSchema.safeParse(parseResultPayload(result))
  if (!parsed.success) return null
  return parsed.data.map((error) => ({message: error.message, where: formatLocation(error.source)}))
}

function BuildErrorsCard(props: ToolCardProps): JSX.Element {
  const errors = () => parseErrors(props.result)
  const summary = () => {
    const list = errors()
    if (!list) return ''
    if (list.length === 0) return 'no errors'
    return countLabel(list.length, 'error', 'errors')
  }
  const failed = () => (errors()?.length ?? 0) > 0
  return (
    <InspectionCard {...props} summary={summary()} failed={failed()}>
      <Show when={errors()?.length} fallback={<CardNote>No build errors</CardNote>}>
        <div class="flex flex-col gap-1.5">
          <For each={errors()}>
            {(error) => (
              <div class="flex flex-col gap-1 min-w-0">
                <Show when={error.where}>{(where) => <TruncatedText class={LOCATION_CLASS} text={where()} />}</Show>
                <ErrorBlock message={error.message} />
              </div>
            )}
          </For>
        </div>
      </Show>
    </InspectionCard>
  )
}

export const buildErrorsCard: ToolCardView = {
  render: BuildErrorsCard,
  hasEmbeddedBody: (part, result) => settledCardBody(part, result, true),
}
