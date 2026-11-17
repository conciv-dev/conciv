import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {AppError} from '@conciv/plugin-tanstack/rpc'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {ErrorBlock, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardNote, InspectionCard, settledCardBody, countLabel} from './card-shared.js'

type BuildError = {message: string; where: string | null}

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
            {(error) => <ErrorBlock label={error.where ?? undefined} message={error.message} />}
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
